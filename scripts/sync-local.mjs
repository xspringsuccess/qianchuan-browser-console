import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CdpClient } from './cdp.mjs';

const origin='https://xspringsuccess.github.io',profileRoot=resolve(process.env.LOCALAPPDATA||'','QianchuanBrowserConsole','chrome-profile');
const [port]=String(await readFile(resolve(profileRoot,'DevToolsActivePort'),'utf8')).split(/\r?\n/);
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const dashboard=targets.find(target=>target.type==='page'&&new URL(target.url).origin===origin);
if(!dashboard)throw new Error('dashboard page not found');
const client=await new CdpClient(dashboard.webSocketDebuggerUrl).connect();
const token=await client.evaluate(`sessionStorage.getItem('executor_token')`);client.close();
if(!token)throw new Error('executor session not found');
const headers={Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const sync=await fetch('http://127.0.0.1:8798/api/sync',{method:'POST',headers,body:'{}'}),result=await sync.json();
if(!sync.ok)throw new Error(result.error||'sync failed');
const state=await (await fetch('http://127.0.0.1:8798/api/state',{headers})).json();
console.log(JSON.stringify({sync:result,state:{accounts:state.accounts.length,plans:state.plans.length,rules:state.rules.length,evaluations:state.evaluations.length,live_writes:state.live_writes}},null,2));
