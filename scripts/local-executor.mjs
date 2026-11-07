import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access,mkdir,readFile,readdir,unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename,dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalD1 } from './sqlite.mjs';
import { CdpClient } from './cdp.mjs';
import { createLocalApi } from '../src/local-api.mjs';
import { collectQianchuanSnapshots } from '../src/qianchuan-collector.mjs';
import { evaluateRule } from '../src/rule-engine.mjs';

const VERSION='0.4.0',root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const localDir=resolve(root,'.local');
const browserDataRoot=resolve(process.env.LOCALAPPDATA||localDir,'QianchuanBrowserConsole');
let profileDir;
const pagesOrigin='https://xspringsuccess.github.io',dashboardUrl=`${pagesOrigin}/qianchuan-browser-console/`;
const devOrigin='http://127.0.0.1:8797',port=8798,startUrl=process.env.QIANCHUAN_START_URL||'https://qianchuan.jinritemai.com/';
const token=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function exists(path){try{await access(path,constants.X_OK);return true;}catch{return false;}}
async function findBrowser(){const candidates=[process.env.QIANCHUAN_BROWSER_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',resolve(process.env.LOCALAPPDATA||'','Google/Chrome/Application/chrome.exe'),'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);for(const path of candidates)if(await exists(path))return path;throw new Error('未找到 Chrome 或 Edge，可设置 QIANCHUAN_BROWSER_PATH');}
async function devtoolsPort(){const path=resolve(profileDir,'DevToolsActivePort');for(let attempt=0;attempt<120;attempt++){try{const [value]=String(await readFile(path,'utf8')).split(/\r?\n/);if(/^\d+$/.test(value))return Number(value);}catch{}await sleep(100);}throw new Error('专用浏览器启动超时');}
async function browserState(debugPort){try{const response=await fetch(`http://127.0.0.1:${debugPort}/json/list`),targets=await response.json(),pages=targets.filter(target=>target.type==='page');const page=pages.find(target=>{try{const host=new URL(target.url).hostname;return host==='qianchuan.jinritemai.com'||host.endsWith('.oceanengine.com');}catch{return false;}});if(!page)return pages.some(item=>item.url&&item.url!=='about:blank')?'outside_qianchuan':'browser_open';return /login|passport|sso|登录/i.test(`${page.url} ${page.title||''}`)?'login_required':'qianchuan_open';}catch{return 'browser_closed';}}

await mkdir(localDir,{recursive:true});await mkdir(browserDataRoot,{recursive:true});const db=new LocalD1(resolve(localDir,'browser.sqlite'));for(const file of(await readdir(resolve(root,'migrations'))).filter(name=>name.endsWith('.sql')).sort())db.raw.exec(await readFile(resolve(root,'migrations',file),'utf8'));
const executable=await findBrowser(),browserName=basename(executable).toLowerCase().includes('edge')?'Microsoft Edge':'Google Chrome';
profileDir=resolve(browserDataRoot,browserName==='Microsoft Edge'?'edge-profile':'chrome-profile');
try{await unlink(resolve(profileDir,'DevToolsActivePort'));}catch(error){if(error.code!=='ENOENT')throw error;}
let stopping=false,misses=0,browserExited=false;
const child=spawn(executable,[`--user-data-dir=${profileDir}`,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--disable-gpu','--no-first-run','--no-default-browser-check','--new-window',`${dashboardUrl}#token=${token}`,startUrl],{stdio:'inherit'});
child.on('exit',(code,signal)=>{browserExited=true;if(!stopping)console.error(`${browserName} 启动失败或已退出：code=${code} signal=${signal||'none'}`);});
let debugPort;try{debugPort=await devtoolsPort();}catch(error){child.kill();throw error;}
async function syncSnapshot(){
  const snapshots=await collectQianchuanSnapshots(debugPort),rules=db.raw.prepare('SELECT * FROM browser_rules').all(),now=new Date().toISOString();
  db.raw.exec('BEGIN');
  try{
    for(const snapshot of snapshots){const account=snapshot.account;db.raw.prepare('INSERT INTO browser_accounts(account_id,label,budget,spend,net_roi,progress,delivery_status,captured_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET label=excluded.label,budget=excluded.budget,spend=excluded.spend,net_roi=excluded.net_roi,progress=excluded.progress,delivery_status=excluded.delivery_status,captured_at=excluded.captured_at').run(account.account_id,account.label,account.budget,account.spend,account.net_roi,account.progress,account.delivery_status,account.captured_at);db.raw.prepare('DELETE FROM browser_plans WHERE account_id=?').run(account.account_id);for(const plan of snapshot.plans)db.raw.prepare('INSERT INTO browser_plans(plan_id,account_id,name,budget,spend,net_roi,progress,status,budget_editable,status_editable,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(plan.plan_id,plan.account_id,plan.name,plan.budget,plan.spend,plan.net_roi,plan.progress,plan.status,plan.budget_editable,plan.status_editable,plan.captured_at);}
    for(const rule of rules){const target=rule.target_scope==='account'?snapshots.map(item=>item.account).find(item=>item.account_id===rule.target_id):snapshots.flatMap(item=>item.plans).find(item=>item.plan_id===rule.target_id),evaluation=evaluateRule(rule,target);db.raw.prepare('INSERT INTO browser_rule_evaluations(id,rule_id,target_scope,target_id,matched,reason,proposed_action,created_at) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),rule.id,rule.target_scope,rule.target_id,evaluation.matched?1:0,evaluation.reason,evaluation.proposed_action?JSON.stringify(evaluation.proposed_action):null,now);}
    db.raw.prepare('DELETE FROM browser_rule_evaluations WHERE id NOT IN (SELECT id FROM browser_rule_evaluations ORDER BY created_at DESC LIMIT 200)').run();db.raw.exec('COMMIT');
  }catch(error){db.raw.exec('ROLLBACK');throw error;}
  return {accounts:snapshots.length,plans:snapshots.reduce((sum,item)=>sum+item.plans.length,0),captured_at:now,live_writes:false};
}
const api=createLocalApi({db,token,allowedOrigins:new Set([pagesOrigin,devOrigin,'http://localhost:8797']),getBrowserState:()=>browserState(debugPort),syncSnapshot});
const server=createServer(async(req,res)=>{try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);res.end();return;}chunks.push(chunk);}const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers:req.headers,body:['GET','HEAD','OPTIONS'].includes(req.method)?undefined:Buffer.concat(chunks)});const response=await api(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){console.error('本机接口异常：',error);res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":"本机执行器异常"}');}});
server.listen(port,'127.0.0.1',()=>{console.log(`千川网页执行器 ${VERSION} 已启动`);console.log(`浏览器：${browserName}`);console.log('看板只连接本机 127.0.0.1，关闭专用浏览器窗口即可停止。');});
const stop=async({closeBrowser=true}={})=>{if(stopping)return;stopping=true;clearInterval(browserWatch);await new Promise(resolve=>server.close(resolve));if(closeBrowser&&child.exitCode===null){try{const version=await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json(),client=await new CdpClient(version.webSocketDebuggerUrl).connect();await client.send('Browser.close');client.close();await sleep(1000);}catch(error){console.error('浏览器优雅关闭失败：',error.message);child.kill();}}};
const browserWatch=setInterval(async()=>{try{const response=await fetch(`http://127.0.0.1:${debugPort}/json/version`);if(!response.ok)throw new Error(`HTTP ${response.status}`);misses=0;}catch(error){misses+=1;console.error(`浏览器连接检查失败 ${misses}/5：${error.message}`);if(misses>=5){console.error('专用浏览器无法保持运行，请保留此窗口并截图最后几行。');await stop({closeBrowser:false});process.exit(browserExited?2:3);}}},3000);
browserWatch.unref();
process.on('SIGINT',async()=>{await stop();process.exit(0);});process.on('SIGTERM',async()=>{await stop();process.exit(0);});
