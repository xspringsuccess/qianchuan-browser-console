const json=(value,status,headers)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const actions=new Set(['increase_budget','enable','disable']);
const scopes=new Set(['account','plan']);

export function createLocalApi({db,token,allowedOrigins,getBrowserState,syncSnapshot=async()=>({accounts:0,plans:0,live_writes:false})}){
  const cors=origin=>({'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'});
  return async request=>{
    const origin=request.headers.get('Origin')||'',allowed=allowedOrigins.has(origin),headers=allowed?cors(origin):{};
    if(request.method==='OPTIONS')return allowed?new Response(null,{status:204,headers}):json({error:'来源未授权'},403,headers);
    if(!allowed)return json({error:'来源未授权'},403,headers);
    if(request.headers.get('Authorization')!==`Bearer ${token}`)return json({error:'本机会话无效，请重新启动执行器'},401,headers);
    const path=new URL(request.url).pathname;
    if(request.method==='GET'&&path==='/api/state'){
      const execution=db.raw.prepare("SELECT value FROM settings WHERE key='execution'").get();
      const rules=db.raw.prepare('SELECT * FROM browser_rules ORDER BY updated_at DESC').all().map(rule=>({...rule,config:JSON.parse(rule.config_json)}));
      const recent=db.raw.prepare('SELECT * FROM browser_actions ORDER BY created_at DESC LIMIT 50').all();
      const accounts=db.raw.prepare('SELECT * FROM browser_accounts ORDER BY captured_at DESC').all();
      const plans=db.raw.prepare('SELECT * FROM browser_plans ORDER BY account_id,name').all();
      const evaluations=db.raw.prepare('SELECT * FROM browser_rule_evaluations ORDER BY created_at DESC LIMIT 100').all().map(item=>({...item,proposed_action:item.proposed_action?JSON.parse(item.proposed_action):null}));
      return json({product:'browser_executor',execution:JSON.parse(execution.value),browser_state:await getBrowserState(),rules,actions:recent,accounts,plans,evaluations,live_writes:false,storage:'local_sqlite'},200,headers);
    }
    if(request.method==='POST'&&path==='/api/sync')return json(await syncSnapshot(),200,headers);
    if(request.method==='POST'&&path==='/api/rules'){
      const text=await request.text();if(text.length>8192)return json({error:'请求过大'},413,headers);
      let data;try{data=JSON.parse(text);}catch{return json({error:'请求不是有效 JSON'},400,headers);}
      const name=String(data.name||'').trim(),targetId=String(data.target_id||'').trim(),scope=String(data.target_scope||''),action=String(data.action||'');
      if(!name||name.length>100||!targetId||targetId.length>40||!scopes.has(scope)||!actions.has(action))return json({error:'规则内容无效'},400,headers);
      const now=new Date().toISOString(),id=String(data.id||crypto.randomUUID());
      const config={progress:Number(data.progress??95),roi:Number(data.roi??2.5),increment:Number(data.increment??1000),cooldown_minutes:Number(data.cooldown_minutes??5)};
      if(!Number.isFinite(config.progress)||config.progress<=0||config.progress>100||!Number.isFinite(config.roi)||config.roi<0||!Number.isFinite(config.increment)||config.increment<=0||!Number.isFinite(config.cooldown_minutes)||config.cooldown_minutes<1)return json({error:'规则阈值无效'},400,headers);
      db.raw.prepare('INSERT INTO browser_rules(id,name,enabled,target_scope,target_id,action,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,enabled=excluded.enabled,target_scope=excluded.target_scope,target_id=excluded.target_id,action=excluded.action,config_json=excluded.config_json,updated_at=excluded.updated_at').run(id,name,data.enabled?1:0,scope,targetId,action,JSON.stringify(config),now,now);
      return json({ok:true,id,live_writes:false},200,headers);
    }
    return json({error:'接口不存在'},404,headers);
  };
}
