import { CdpClient } from '../scripts/cdp.mjs';

const origin='https://qianchuan.jinritemai.com';
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format();
const number=value=>value==null||!['string','number'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))?null:Number(value);
const yuan=value=>{const parsed=number(value);return parsed===null?null:parsed/100000;};
const metric=(metrics,key)=>number(metrics?.[key]?.value??metrics?.[key]?.Value);
const dateOf=value=>{
  if(typeof value==='string'&&/^\d{4}-\d\d-\d\d/.test(value))return value.slice(0,10);
  if(/^\d{10}(?:\d{3})?$/.test(String(value)))return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Number(value)*(String(value).length===10?1000:1)));
  return null;
};
const homeLabels={total_spend:'账户整体',overall_spend:'乘方计划',standard_spend:'标准投放',universal_spend:'全域投放',brand_spend:'品牌投放'};
const homeDatasets=new Set(['home_cost_total_prom','overall_home_cost_total_prom']);
const boards={overall:'/overall-prom',universal:'/uni-prom'};
const pageLimit=25;

export function parseHomeSpend(text){
  const lines=text.split(/\r?\n/).map(line=>line.trim());
  return Object.fromEntries(Object.entries(homeLabels).map(([key,label])=>{
    const index=lines.findIndex(line=>line===`${label}消耗(元)`||line===`${label}消耗（元）`);
    if(index<0)return [key,null];
    const whole=lines[index+1]||'',fraction=lines[index+2]||'';
    if(!/^\d[\d,]*(?:\.\d{1,2})?$/.test(whole))return [key,null];
    const value=/^\.\d{2}$/.test(fraction)&&!whole.includes('.')?whole+fraction:whole;
    return [key,number(value.replaceAll(',',''))];
  }));
}

async function devtools(debugPort,path,method='GET'){
  const response=await fetch(`http://127.0.0.1:${debugPort}${path}`,{method,signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('专用浏览器暂时无法读取');
  return response;
}

function productMode(board,dataset){
  if(board==='overall'&&/^overall_roi_unishop_promotion_list_for_product(?:_v2)?$/.test(dataset))return '全店托管';
  if(board==='overall'&&/^overall_roi_promotion_list_for_product(?:_v2)?$/.test(dataset))return '商品自选';
  if(board==='universal'&&dataset==='site_promotion_allshop_list')return '全店托管';
  if(board==='universal'&&dataset==='product_roi2_promotion')return '商品自选';
  return null;
}

function boardPlans(accountId,board,responses,capturedAt,reportDate){
  const plans=new Map();
  let read=false;
  for(const {body,dataset,start,end} of responses){
    const mode=productMode(board,dataset);
    if(!mode||dateOf(start)!==reportDate||dateOf(end)!==reportDate||!Array.isArray(body.data?.adInfos))continue;
    read=true;
    for(const info of body.data.adInfos){
      if(info.id==null||typeof info.id==='number'&&!Number.isSafeInteger(info.id))continue;
      const id=String(info.id),previous=plans.get(id);
      const metrics=body.data.adStatsMap?.[id]?.metrics||{};
      const spend=metric(metrics,board==='overall'?'statCostForOverallRoi2':'statCostForRoi2');
      const roi=metric(metrics,board==='overall'?'totalPrepayAndPaySettleOverallRoi21H':'totalPrepayAndPaySettleRoi21H');
      const budget=yuan(info.budget)??previous?.budget??null;
      // A spend and ROI pair must come from the same metric response.
      const pair=spend!==null&&roi!==null?{spend,roi}:previous?.net_roi!=null?{spend:previous.spend,roi:previous.net_roi}:{spend:spend??metric(metrics,'statCostForRoi2')??previous?.spend??null,roi:null};
      const product_mode=previous&&previous.product_mode!==mode?null:mode;
      plans.set(id,{plan_id:id,account_id:accountId,name:String(info.name??previous?.name??`计划 ···${id.slice(-4)}`),budget,spend:pair.spend,net_roi:pair.roi,progress:budget>0&&pair.spend!==null?pair.spend/budget*100:null,status:String(info.adOptType??info.adDeliveryType??previous?.status??''),budget_editable:info.operation?.budgetEditOperation?Number(Boolean(info.operation.budgetEditOperation.editable)):previous?.budget_editable??0,status_editable:info.operation?.optStatusOperation?Number(Boolean(info.operation.optStatusOperation.editable)):previous?.status_editable??0,captured_at:capturedAt,board,product_mode});
    }
  }
  return {board,plan_count:read?plans.size:null,plans:[...plans.values()]};
}

async function readNextPage(client,board,accountId){
  return client.evaluate(`(() => {
    const url=new URL(location.href);
    if(url.origin!==${JSON.stringify(origin)}||url.pathname!==${JSON.stringify(boards[board])}||url.searchParams.get('aavid')!==${JSON.stringify(accountId)})return null;
    const visible=node=>node.getClientRects().length>0;
    const overall=${board==='overall'};
    const pagination=[...document.querySelectorAll(overall?'.aurora-qc-pagination':'.ovui-pagination')].filter(visible);
    if(pagination.length!==1)return null;
    const scope=pagination[0];
    const active=scope.querySelector(overall?'.aurora-qc-pagination-item-active':'.ovui-page-turner__item--active');
    const page=Number(active?.textContent.trim());
    if(!Number.isInteger(page)||page<1)return null;
    const next=overall?scope.querySelector('[title="下一页"]'):[...scope.querySelectorAll('li.ovui-page-turner__item')].at(-1);
    if(!next||!visible(next)||next.getAttribute('aria-disabled')==='true'||/disabled/.test(next.className))return null;
    if(!overall&&(next.textContent.trim()||!next.querySelector('svg')))return null;
    next.click();return page+1;
  })()`);
}

async function readPage(client,accountId,path,board){
  const requests=new Map(),responses=[],pending=[];
  const offRequest=client.on('Network.requestWillBeSent',event=>{
    try{
      const url=new URL(event.request.url);
      if(url.origin!==origin||!/\/get-account-budget$|\/statQuery$|\/ad\/list-required$/.test(url.pathname))return;
      const body=JSON.parse(event.request.postData||'{}');
      const requestAccount=body.aavid??url.searchParams.get('aavid');
      if(requestAccount!=null&&String(requestAccount)!==accountId)return;
      const params=body.Params||body,range=params.AdFilter?.DataTimeRange||params;
      requests.set(event.requestId,{path:url.pathname,dataset:body.DataSetKey??params.SophonxDataSetKey??params.dataSetKey??'',start:range.StartTime??range.start_time,end:range.EndTime??range.end_time,page:Number(params.PageParams?.Page??params.page)});
    }catch{}
  });
  const offResponse=client.on('Network.loadingFinished',event=>{
    const request=requests.get(event.requestId);
    if(request)pending.push(client.send('Network.getResponseBody',{requestId:event.requestId}).then(result=>responses.push({...request,body:JSON.parse(result.body)})).catch(()=>{}));
  });
  try{
    const url=new URL(path,origin);url.searchParams.set('aavid',accountId);
    await client.send('Page.navigate',{url:url.href});
    await sleep(6500);
    const page=await client.evaluate('({url:location.href,text:document.body?.innerText||""})');
    const current=new URL(page.url);
    if(current.origin!==origin||current.pathname!==path||current.searchParams.get('aavid')!==accountId)return {text:'',responses:[]};
    await Promise.allSettled(pending);
    if(board){
      for(let i=1;i<pageLimit;i++){
        const before=responses.length;
        const next=await readNextPage(client,board,accountId);
        if(!next)break;
        const end=Date.now()+4000;
        while(Date.now()<end&&!responses.slice(before).some(r=>r.page===next&&productMode(board,r.dataset)&&r.body.data?.adInfos?.length))await sleep(180);
        if(!responses.slice(before).some(r=>r.page===next&&productMode(board,r.dataset)&&r.body.data?.adInfos?.length))break;
        await sleep(450);
      }
      await Promise.allSettled(pending);
    }
    return {text:page.text,responses};
  }finally{offRequest();offResponse();}
}

async function captureAccount(client,accountId){
  const reportDate=today();
  const home=await readPage(client,accountId,'/home');
  const sources=new Set(home.responses.filter(r=>homeDatasets.has(r.dataset)&&dateOf(r.start)===reportDate&&dateOf(r.end)===reportDate&&r.body.data?.StatsData).map(r=>r.dataset));
  const homeSpend=sources.size===homeDatasets.size?parseHomeSpend(home.text):null;
  const reads=[],responses=[...home.responses];
  // Query both known boards even at zero spend so plans that have yet to spend are visible.
  for(const [board,path] of Object.entries(boards)){
    const result=await readPage(client,accountId,path,board);
    reads.push({board,responses:result.responses});
    responses.push(...result.responses);
  }
  const capturedAt=new Date().toISOString();
  const accountBudget=responses.find(r=>r.path.endsWith('/get-account-budget')&&r.body.data?.accountBudget)?.body.data.accountBudget||{};
  const budget=yuan(accountBudget.budget);
  const account={account_id:accountId,label:`千川账户 ···${accountId.slice(-4)}`,budget,spend:null,net_roi:null,progress:null,delivery_status:String(accountBudget.deliveryStatus??''),captured_at:capturedAt};
  const boardReads=reads.map(({board,responses})=>boardPlans(accountId,board,responses,capturedAt,reportDate));
  const counts=new Map();
  for(const plan of boardReads.flatMap(item=>item.plans))counts.set(plan.plan_id,(counts.get(plan.plan_id)||0)+1);
  const plans=boardReads.flatMap(item=>item.plans).filter(plan=>counts.get(plan.plan_id)===1);
  return {account,home_spend:homeSpend&&{...homeSpend,report_date:reportDate,captured_at:capturedAt},boards:boardReads.map(item=>({board:item.board,plan_count:item.plan_count===null?null:item.plans.filter(plan=>counts.get(plan.plan_id)===1).length})),plans};
}

export async function collectQianchuanSnapshots(debugPort){
  const tabs=await(await devtools(debugPort,'/json/list')).json();
  const accountIds=[...new Set(tabs.filter(tab=>tab.type==='page'&&URL.canParse(tab.url)&&new URL(tab.url).origin===origin).map(tab=>new URL(tab.url).searchParams.get('aavid')).filter(id=>/^\d+$/.test(id||'')))];
  if(!accountIds.length)throw new Error('未检测到已登录的千川账户页');
  const tab=await(await devtools(debugPort,'/json/new?about:blank','PUT')).json();
  let client;
  try{
    client=await new CdpClient(tab.webSocketDebuggerUrl).connect();
    await client.send('Network.enable');
    const snapshots=[];
    for(const accountId of accountIds)snapshots.push(await captureAccount(client,accountId));
    return snapshots;
  }finally{
    client?.close();
    await devtools(debugPort,`/json/close/${tab.id}`).catch(()=>{});
  }
}
