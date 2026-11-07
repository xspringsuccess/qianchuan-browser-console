import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {LocalD1} from '../scripts/sqlite.mjs';
import {createLocalApi} from '../src/local-api.mjs';
import {evaluateRule} from '../src/rule-engine.mjs';

const now=Date.now();
const rule={id:'rule',name:'追加预算',target_scope:'account',target_id:'account-1',action:'increase_budget',config:{progress:95,roi:2.5,increment:1000,cooldown_minutes:5}};
const target={budget:3000,spend:2850,net_roi:2.51,captured_at:new Date(now).toISOString(),budget_editable:1,metrics_scope:'whole_account'};
test('budget progress is recomputed and ROI comparison is strict',()=>{
  const result=evaluateRule(rule,{...target,progress:0},now);
  assert.equal(result.matched,true);assert.equal(result.proposed_action.new_budget,4000);
  assert.equal(evaluateRule(rule,{...target,net_roi:2.5},now).matched,false);
  assert.equal(evaluateRule(rule,{...target,spend:2849.99},now).matched,false);
});
test('missing metrics, expired snapshots, invalid budgets and uneditable plans cannot propose changes',()=>{
  for(const change of[{budget:null},{budget:0},{spend:null},{net_roi:null},{captured_at:new Date(now-300001).toISOString()}])assert.equal(evaluateRule(rule,{...target,...change},now).proposed_action,null);
  assert.equal(evaluateRule({...rule,target_scope:'plan'},{...target,budget_editable:0},now).matched,false);
});

async function fixture(){
  const db=new LocalD1();for(const file of(await readdir(new URL('../migrations/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort())db.raw.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const stamp=new Date().toISOString();
  db.raw.prepare('INSERT INTO browser_accounts(account_id,label,budget,spend,net_roi,progress,captured_at) VALUES(?,?,?,?,?,?,?)').run('account-1','测试账户',3000,2850,2.6,95,stamp);
  db.raw.prepare('INSERT INTO browser_verified_account_metrics(account_id,captured_at) VALUES(?,?)').run('account-1',stamp);
  db.raw.prepare('INSERT INTO browser_rules(id,name,target_scope,target_id,action,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(rule.id,rule.name,rule.target_scope,rule.target_id,rule.action,JSON.stringify(rule.config),stamp,stamp);
  let syncCount=0;
  const api=createLocalApi({db,token:'test-session',allowedOrigins:new Set(['https://xspringsuccess.github.io']),getBrowserState:async()=>'qianchuan_open',syncSnapshot:async()=>{syncCount++;return {accounts:1,plans:0,live_writes:false};}});
  const call=async(path,body)=>api(new Request(`http://127.0.0.1:8798/api/${path}`,{method:body?'POST':'GET',headers:{Origin:'https://xspringsuccess.github.io',Authorization:'Bearer test-session','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));
  return {db,call,count:()=>syncCount};
}
test('preview resyncs, shows exact budget change, deduplicates and never writes to accounts',async()=>{
  const {db,call,count}=await fixture();
  const result=await(await call('previews',{rule_id:'rule'})).json();
  assert.equal(result.live_writes,false);assert.equal(count(),1);
  assert.equal((await(await call('previews',{rule_id:'rule'})).json()).id,result.id);
  const state=await(await call('state')).json();assert.equal(state.previews.length,1);
  assert.equal(state.previews[0].payload.current_budget,3000);assert.equal(state.previews[0].payload.new_budget,4000);assert.equal(state.previews[0].payload.account_id,'account-1');
  assert.equal(db.raw.prepare('SELECT budget FROM browser_accounts').get().budget,3000);
  assert.equal((await call('execute',{id:result.id})).status,404);
  await call('previews/cancel',{id:result.id});assert.equal((await(await call('state')).json()).previews[0].effective_state,'cancelled');
  db.raw.close();
});
test('changed rules, refreshed snapshots and expiration invalidate old previews',async()=>{
  const {db,call}=await fixture();await call('previews',{rule_id:'rule'});
  db.raw.prepare('UPDATE browser_rules SET updated_at=?').run('changed');
  assert.equal((await(await call('state')).json()).previews[0].effective_state,'superseded');
  db.raw.prepare('UPDATE browser_previews SET rule_updated_at=?').run('changed');
  db.raw.prepare('UPDATE browser_accounts SET captured_at=?').run(new Date(Date.now()+1).toISOString());
  assert.equal((await(await call('state')).json()).previews[0].effective_state,'superseded');
  db.raw.prepare('UPDATE browser_previews SET expires_at=?').run('2000-01-01');
  assert.equal((await(await call('state')).json()).previews[0].effective_state,'expired');db.raw.close();
});
test('unmet rules do not produce previews and enabled input cannot activate real execution',async()=>{
  const {db,call}=await fixture();db.raw.exec('UPDATE browser_accounts SET net_roi=2.5');
  assert.equal((await call('previews',{rule_id:'rule'})).status,409);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM browser_previews').get().n,0);
  await call('rules',{...rule,...rule.config,enabled:true});
  assert.equal(db.raw.prepare('SELECT enabled FROM browser_rules').get().enabled,0);db.raw.close();
});
test('login expiration returns an actionable error before attempting sync',async()=>{
  const db=new LocalD1();let called=false;
  const api=createLocalApi({db,token:'test',allowedOrigins:new Set(['https://xspringsuccess.github.io']),getBrowserState:async()=>'login_required',syncSnapshot:async()=>{called=true;}});
  const response=await api(new Request('http://127.0.0.1:8798/api/sync',{method:'POST',headers:{Origin:'https://xspringsuccess.github.io',Authorization:'Bearer test'},body:'{}'}));
  assert.equal(response.status,409);assert.match((await response.json()).error,/重新登录/);assert.equal(called,false);db.raw.close();
});
test('unverified account data blocks new previews and invalidates existing previews',async()=>{
  const {db,call}=await fixture();
  assert.equal((await call('previews',{rule_id:'rule'})).status,200);
  db.raw.exec('DELETE FROM browser_verified_account_metrics');
  const rejected=await call('previews',{rule_id:'rule'});
  assert.equal(rejected.status,409);
  assert.match((await rejected.json()).error,/整账户统计口径待核实/);
  const state=await(await call('state')).json();
  assert.equal(state.accounts[0].metrics_scope,'unverified');
  assert.equal(state.previews[0].effective_state,'scope_unverified');
  db.raw.close();
});
