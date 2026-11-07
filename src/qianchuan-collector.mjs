import { CdpClient } from '../scripts/cdp.mjs';

const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const watchedPath=/daily-budget\/get-account-budget|uni-promotion\/ad\/list-required|data\/v1\/common\/statQuery/;
const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const yuan=value=>{const parsed=number(value);return parsed===null?null:parsed/100000;};
const metric=(metrics,key)=>number(metrics?.[key]?.value??metrics?.[key]?.Value);

async function targets(debugPort){return await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();}
async function ensurePlanTarget(debugPort,accountId){let list=await targets(debugPort),page=list.find(target=>target.type==='page'&&new URL(target.url).hostname==='qianchuan.jinritemai.com'&&new URL(target.url).pathname==='/overall-prom');if(page)return page;const url=`https://qianchuan.jinritemai.com/overall-prom?aavid=${encodeURIComponent(accountId)}`;await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`,{method:'PUT'});await sleep(1500);list=await targets(debugPort);page=list.find(target=>target.type==='page'&&new URL(target.url).pathname==='/overall-prom');if(!page)throw new Error('无法打开千川计划页');return page;}

function buildSnapshot(accountId,responses){
  const capturedAt=new Date().toISOString();
  const budgetBody=responses.find(item=>item.path.endsWith('/daily-budget/get-account-budget'))?.body;
  const accountBudget=budgetBody?.data?.accountBudget||{};
  const statBodies=responses.filter(item=>item.path.endsWith('/data/v1/common/statQuery')).map(item=>item.body?.data?.StatsData?.Totals).filter(Boolean);
  const accountTotals=statBodies.find(totals=>totals.total_prepay_and_pay_settle_overall_roi2_1h&&totals.stat_cost_for_overall_roi2)||{};
  const budget=yuan(accountBudget.budget),spend=metric(accountTotals,'stat_cost_for_overall_roi2'),netRoi=metric(accountTotals,'total_prepay_and_pay_settle_overall_roi2_1h');
  const account={account_id:accountId,label:`千川账户 ···${accountId.slice(-4)}`,budget,spend,net_roi:netRoi,progress:budget&&spend!==null?spend/budget*100:null,delivery_status:String(accountBudget.deliveryStatus??''),captured_at:capturedAt};
  const plans=new Map();
  for(const response of responses.filter(item=>item.path.endsWith('/uni-promotion/ad/list-required'))){
    const data=response.body?.data||{};
    for(const info of data.adInfos||[]){
      const id=String(info.id),current=plans.get(id)||{info:null,metrics:{}};
      current.info={...(current.info||{}),...info};
      const nextMetrics=data.adStatsMap?.[id]?.metrics||{};
      if(Object.keys(nextMetrics).length>Object.keys(current.metrics).length)current.metrics=nextMetrics;
      plans.set(id,current);
    }
  }
  return {account,plans:[...plans].map(([id,item])=>{const info=item.info||{},metrics=item.metrics||{},planBudget=yuan(info.budget),planSpend=metric(metrics,'statCostForOverallRoi2')??metric(metrics,'statCostForRoi2'),planRoi=metric(metrics,'totalPrepayAndPaySettleOverallRoi21H');return {plan_id:id,account_id:accountId,name:String(info.name||`计划 ···${id.slice(-4)}`),budget:planBudget,spend:planSpend,net_roi:planRoi,progress:planBudget&&planSpend!==null?planSpend/planBudget*100:null,status:String(info.adOptType??info.adDeliveryType??''),budget_editable:info.operation?.budgetEditOperation?.editable?1:0,status_editable:info.operation?.optStatusOperation?.editable?1:0,captured_at:capturedAt};})};
}

async function captureAccount(debugPort,page,accountId){
  const client=await new CdpClient(page.webSocketDebuggerUrl).connect(),requests=new Map(),responses=[],bodyTasks=[];
  client.on('Network.requestWillBeSent',event=>{try{const url=new URL(event.request.url);if(url.hostname==='qianchuan.jinritemai.com'&&watchedPath.test(url.pathname))requests.set(event.requestId,url.pathname);}catch{}});
  client.on('Network.loadingFinished',event=>{const path=requests.get(event.requestId);if(!path)return;bodyTasks.push(client.send('Network.getResponseBody',{requestId:event.requestId}).then(result=>{try{responses.push({path,body:JSON.parse(result.body)});}catch{}}).catch(()=>{}));});
  await client.send('Network.enable');
  await client.send('Page.navigate',{url:`https://qianchuan.jinritemai.com/overall-prom?aavid=${encodeURIComponent(accountId)}`});
  await sleep(5000);
  const point=await client.evaluate(`(()=>{const node=[...document.querySelectorAll('[role=tab]')].find(item=>(item.innerText||item.textContent||'').trim()==='商品自选');if(!node)return null;const rect=node.getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`);
  if(point){await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});}
  await sleep(7000);await Promise.allSettled(bodyTasks);client.close();
  return buildSnapshot(accountId,responses);
}

export async function collectQianchuanSnapshots(debugPort){
  const list=await targets(debugPort),accountIds=[...new Set(list.filter(target=>target.type==='page'&&new URL(target.url).hostname==='qianchuan.jinritemai.com').map(target=>new URL(target.url).searchParams.get('aavid')).filter(Boolean))];
  if(!accountIds.length)throw new Error('未检测到已登录的千川账户页');
  const page=await ensurePlanTarget(debugPort,accountIds[0]),snapshots=[];
  for(const accountId of accountIds)snapshots.push(await captureAccount(debugPort,page,accountId));
  return snapshots;
}
