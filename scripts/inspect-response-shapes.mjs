import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CdpClient } from './cdp.mjs';

const profileRoot=resolve(process.env.LOCALAPPDATA||'','QianchuanBrowserConsole','chrome-profile');
const [port]=String(await readFile(resolve(profileRoot,'DevToolsActivePort'),'utf8')).split(/\r?\n/);
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page=targets.find(target=>target.type==='page'&&new URL(target.url).hostname==='qianchuan.jinritemai.com'&&new URL(target.url).pathname==='/overall-prom');
if(!page)throw new Error('plan page not found');
const client=await new CdpClient(page.webSocketDebuggerUrl).connect();
const watched=new Map(),bodies=[];
const wanted=/daily-budget\/get-account-budget|uni-promotion\/ad\/(list-summary|list-required)|data\/v1\/common\/statQuery/;
client.on('Network.requestWillBeSent',event=>{try{const url=new URL(event.request.url);if(url.hostname==='qianchuan.jinritemai.com'&&wanted.test(url.pathname))watched.set(event.requestId,{method:event.request.method,path:url.pathname});}catch{}});
client.on('Network.loadingFinished',async event=>{const request=watched.get(event.requestId);if(!request)return;try{const result=await client.send('Network.getResponseBody',{requestId:event.requestId});bodies.push({...request,body:JSON.parse(result.body)});}catch{}});
await client.send('Network.enable');
await client.send('Page.reload',{ignoreCache:false});
await new Promise(done=>setTimeout(done,10000));
client.close();
function shape(value,depth=0){if(depth>5)return typeof value;if(value===null)return'null';if(Array.isArray(value))return{type:'array',length:value.length,item:value.length?shape(value[0],depth+1):null};if(typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,100).map(([key,item])=>[key,shape(item,depth+1)]));return typeof value;}
if(process.argv.includes('--values')){
  const responses=bodies.map(item=>{const data=item.body?.data||{},first=Array.isArray(data.adInfos)?data.adInfos[0]:null,firstStat=Object.values(data.adStatsMap||{})[0]?.metrics||null;return {path:item.path,accountBudget:data.accountBudget||null,plan:first?{budget:first.budget,ecpRoi2Goal:first.ecpRoi2Goal,operation:first.operation,adDeliveryType:first.adDeliveryType,budgetMode:first.budgetMode}:null,metrics:firstStat};}).filter(item=>item.accountBudget||item.plan);
  console.log(JSON.stringify({responses},null,2));
}else if(process.argv.includes('--compact')){
  const responses=bodies.map(item=>{const data=item.body?.data||{},stats=data.StatsData||{},statValues=Object.values(data.adStatsMap||{}),dimensionValues=Object.values(data.adDimensionsMap||{});return {method:item.method,path:item.path,accountBudgetKeys:Object.keys(data.accountBudget||{}),adInfoLength:Array.isArray(data.adInfos)?data.adInfos.length:null,adInfoKeys:Array.isArray(data.adInfos)&&data.adInfos.length?Object.keys(data.adInfos[0]):[],adStatsCount:statValues.length,adStatsKeys:statValues.length?Object.keys(statValues[0]):[],adMetricKeys:statValues.length?Object.keys(statValues[0]?.metrics||{}):[],dimensionCount:dimensionValues.length,dimensionKeys:dimensionValues.length?Object.keys(dimensionValues[0]):[],adDimensionKeys:dimensionValues.length?Object.keys(dimensionValues[0]?.dimensions||{}):[],totalNumType:data.totalNum===undefined?null:typeof data.totalNum,rowCount:Array.isArray(stats.Rows)?stats.Rows.length:null,metricKeys:Object.keys(stats.Totals||data.totalMetrics?.metrics||{})};});
  console.log(JSON.stringify({responses},null,2));
}else console.log(JSON.stringify({responses:bodies.map(item=>({method:item.method,path:item.path,shape:shape(item.body)}))},null,2));
