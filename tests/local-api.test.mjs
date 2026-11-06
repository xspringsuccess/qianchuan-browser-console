import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LocalD1 } from '../scripts/sqlite.mjs';
import { createLocalApi } from '../src/local-api.mjs';
async function setup(){const db=new LocalD1();db.raw.exec(await readFile(new URL('../migrations/0001_local.sql',import.meta.url),'utf8'));return createLocalApi({db,token:'secret',allowedOrigins:new Set(['https://xspringsuccess.github.io']),getBrowserState:async()=>'qianchuan_open'});}
const request=(path,{method='GET',token='secret',origin='https://xspringsuccess.github.io',body}={})=>new Request(`http://127.0.0.1:8798${path}`,{method,headers:{Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
test('rejects untrusted origins and invalid sessions',async()=>{const api=await setup();assert.equal((await api(request('/api/state',{origin:'https://evil.example'}))).status,403);assert.equal((await api(request('/api/state',{token:'wrong'}))).status,401);});
test('returns only local read-only state',async()=>{const api=await setup(),response=await api(request('/api/state')),data=await response.json();assert.equal(response.status,200);assert.equal(data.browser_state,'qianchuan_open');assert.equal(data.live_writes,false);assert.equal(data.storage,'local_sqlite');assert.doesNotMatch(JSON.stringify(data),/secret/);});
test('stores disabled rule locally without enabling writes',async()=>{const api=await setup(),response=await api(request('/api/rules',{method:'POST',body:{name:'测试规则',target_scope:'account',target_id:'123456',action:'increase_budget',progress:95,roi:2.5,increment:1000,cooldown_minutes:5,enabled:false}})),result=await response.json();assert.equal(result.ok,true);assert.equal(result.live_writes,false);const state=await(await api(request('/api/state'))).json();assert.equal(state.rules.length,1);assert.equal(state.rules[0].enabled,0);});
