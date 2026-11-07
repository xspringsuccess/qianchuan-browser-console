import {ACCOUNT_SCOPE_UNVERIFIED,evaluateRule,findRuleTarget,SNAPSHOT_MAX_AGE_MS} from './rule-engine.mjs';
const json=(value,status,headers)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const actions=new Set(['increase_budget','enable','disable']);
const scopes=new Set(['account','plan']);

export function createLocalApi({db,token,allowedOrigins,getBrowserState,syncSnapshot=async()=>({accounts:0,plans:0,live_writes:false})}){
  let syncing=null;
  const sync=()=>syncing||(syncing=Promise.resolve().then(syncSnapshot).finally(()=>{syncing=null;}));
  const cors=origin=>({'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'});
  return async request=>{
    const origin=request.headers.get('Origin')||'',allowed=allowedOrigins.has(origin),headers=allowed?cors(origin):{};
    if(request.method==='OPTIONS')return allowed?new Response(null,{status:204,headers}):json({error:'来源未授权'},403,headers);
    if(!allowed)return json({error:'来源未授权'},403,headers);
    if(request.headers.get('Authorization')!==`Bearer ${token}`)return json({error:'本机会话无效，请重新启动执行器'},401,headers);
    const path=new URL(request.url).pathname;
    if(request.method==='POST'&&(path==='/api/sync'||path==='/api/previews')&&await getBrowserState()==='login_required')return json({error:'千川登录已失效，请在专用浏览器中重新登录后再同步',live_writes:false},409,headers);
    if(request.method==='GET'&&path==='/api/state'){
      const execution=db.raw.prepare("SELECT value FROM settings WHERE key='execution'").get();
      const rules=db.raw.prepare('SELECT * FROM browser_rules ORDER BY updated_at DESC').all().map(rule=>({...rule,config:JSON.parse(rule.config_json)}));
      const recent=db.raw.prepare('SELECT * FROM browser_actions ORDER BY created_at DESC LIMIT 50').all();
      const accounts=db.raw.prepare('SELECT * FROM browser_accounts_with_scope ORDER BY captured_at DESC').all();
      const plans=db.raw.prepare('SELECT * FROM browser_plans ORDER BY account_id,name').all();
      const evaluations=db.raw.prepare('SELECT * FROM browser_rule_evaluations ORDER BY created_at DESC LIMIT 100').all().map(item=>{
        const account=accounts.find(account=>account.account_id===item.target_id);
        if(item.target_scope==='account'&&account?.metrics_scope!=='whole_account')return {...item,matched:0,reason:ACCOUNT_SCOPE_UNVERIFIED,proposed_action:null};
        return {...item,proposed_action:item.proposed_action?JSON.parse(item.proposed_action):null};
      });
      const previews=db.raw.prepare('SELECT * FROM browser_previews ORDER BY created_at DESC LIMIT 50').all().map(item=>{
        const rule=rules.find(rule=>rule.id===item.rule_id),payload=JSON.parse(item.payload_json),target=rule&&findRuleTarget(db,rule);
        let effective_state=item.state;
        if(item.state==='pending_review'){
          if(Date.parse(item.expires_at)<=Date.now())effective_state='expired';
          else if(!rule||rule.updated_at!==item.rule_updated_at||target?.captured_at!==payload.captured_at)effective_state='superseded';
          else if(rule.target_scope==='account'&&target.metrics_scope!=='whole_account')effective_state='scope_unverified';
        }
        return {...item,payload_json:undefined,payload,effective_state};
      });
      return json({product:'browser_executor',execution:JSON.parse(execution.value),browser_state:await getBrowserState(),rules,actions:recent,accounts,plans,evaluations,previews,live_writes:false,storage:'local_sqlite'},200,headers);
    }
    if(request.method==='POST'&&path==='/api/sync')return json(await sync(),200,headers);
    if(request.method==='POST'&&(path==='/api/previews'||path==='/api/previews/cancel')){
      let data;try{const text=await request.text();if(text.length>8192)return json({error:'请求过大'},413,headers);data=JSON.parse(text);if(!data||typeof data!=='object')throw new Error();}catch{return json({error:'请求不是有效 JSON'},400,headers);}
      if(path.endsWith('/cancel')){
        const result=db.raw.prepare("UPDATE browser_previews SET state='cancelled' WHERE id=? AND state='pending_review'").run(String(data.id||''));
        return json({ok:Boolean(result.changes),live_writes:false},200,headers);
      }
      const rule=db.raw.prepare('SELECT * FROM browser_rules WHERE id=?').get(String(data.rule_id||''));
      if(!rule)return json({error:'规则不存在'},404,headers);
      await sync();
      const currentRule=db.raw.prepare('SELECT * FROM browser_rules WHERE id=?').get(rule.id);
      if(!currentRule||currentRule.updated_at!==rule.updated_at)return json({error:'规则已修改，请重新生成预览'},409,headers);
      const target=findRuleTarget(db,rule),evaluation=evaluateRule(rule,target);
      if(!evaluation.matched)return json({error:evaluation.reason,matched:false,live_writes:false},409,headers);
      const existing=db.raw.prepare("SELECT * FROM browser_previews WHERE rule_id=? AND rule_updated_at=? AND state='pending_review' AND expires_at>? ORDER BY created_at DESC").all(rule.id,rule.updated_at,new Date().toISOString()).find(item=>JSON.parse(item.payload_json).captured_at===target.captured_at);
      if(existing)return json({ok:true,id:existing.id,live_writes:false},200,headers);
      const now=new Date().toISOString(),id=crypto.randomUUID(),accountId=rule.target_scope==='account'?rule.target_id:target.account_id;
      const payload={...evaluation.proposed_action,rule_name:rule.name,target_scope:rule.target_scope,target_id:rule.target_id,account_id:accountId,target_name:target.name||target.label,spend:target.spend,net_roi:target.net_roi,progress:target.spend/target.budget*100,reason:evaluation.reason,captured_at:target.captured_at,impact:'将修改千川后台原生日预算；实际消耗仍由投放情况决定。'};
      db.raw.prepare("INSERT INTO browser_previews(id,rule_id,rule_updated_at,state,payload_json,created_at,expires_at) VALUES(?,?,?,'pending_review',?,?,?)").run(id,rule.id,rule.updated_at,JSON.stringify(payload),now,new Date(Date.parse(target.captured_at)+SNAPSHOT_MAX_AGE_MS).toISOString());
      return json({ok:true,id,live_writes:false},200,headers);
    }
    if(request.method==='POST'&&path==='/api/rules'){
      const text=await request.text();if(text.length>8192)return json({error:'请求过大'},413,headers);
      let data;try{data=JSON.parse(text);}catch{return json({error:'请求不是有效 JSON'},400,headers);}
      const name=String(data.name||'').trim(),targetId=String(data.target_id||'').trim(),scope=String(data.target_scope||''),action=String(data.action||'');
      if(!name||name.length>100||!targetId||targetId.length>40||!scopes.has(scope)||!actions.has(action))return json({error:'规则内容无效'},400,headers);
      const now=new Date().toISOString(),id=String(data.id||crypto.randomUUID());
      const config={progress:Number(data.progress??95),roi:Number(data.roi??2.5),increment:Number(data.increment??1000),cooldown_minutes:Number(data.cooldown_minutes??5)};
      if(!Number.isFinite(config.progress)||config.progress<=0||config.progress>100||!Number.isFinite(config.roi)||config.roi<0||!Number.isFinite(config.increment)||config.increment<=0||!Number.isFinite(config.cooldown_minutes)||config.cooldown_minutes<1)return json({error:'规则阈值无效'},400,headers);
      db.raw.prepare('INSERT INTO browser_rules(id,name,enabled,target_scope,target_id,action,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,enabled=excluded.enabled,target_scope=excluded.target_scope,target_id=excluded.target_id,action=excluded.action,config_json=excluded.config_json,updated_at=excluded.updated_at').run(id,name,0,scope,targetId,action,JSON.stringify(config),now,now);
      return json({ok:true,id,live_writes:false},200,headers);
    }
    return json({error:'接口不存在'},404,headers);
  };
}
