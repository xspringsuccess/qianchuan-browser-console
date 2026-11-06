import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access,mkdir,readFile,readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename,dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalD1 } from './sqlite.mjs';
import { createLocalApi } from '../src/local-api.mjs';

const VERSION='0.2.0',root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const localDir=resolve(root,'.local'),profileDir=resolve(localDir,'browser-profile');
const pagesOrigin='https://xspringsuccess.github.io',dashboardUrl=`${pagesOrigin}/qianchuan-browser-console/`;
const devOrigin='http://127.0.0.1:8797',port=8798,startUrl=process.env.QIANCHUAN_START_URL||'https://qianchuan.jinritemai.com/';
const token=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function exists(path){try{await access(path,constants.X_OK);return true;}catch{return false;}}
async function findBrowser(){const candidates=[process.env.QIANCHUAN_BROWSER_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',resolve(process.env.LOCALAPPDATA||'','Google/Chrome/Application/chrome.exe'),'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);for(const path of candidates)if(await exists(path))return path;throw new Error('未找到 Chrome 或 Edge，可设置 QIANCHUAN_BROWSER_PATH');}
async function devtoolsPort(){const path=resolve(profileDir,'DevToolsActivePort');for(let attempt=0;attempt<120;attempt++){try{const [value]=String(await readFile(path,'utf8')).split(/\r?\n/);if(/^\d+$/.test(value))return Number(value);}catch{}await sleep(100);}throw new Error('专用浏览器启动超时');}
async function browserState(debugPort){try{const response=await fetch(`http://127.0.0.1:${debugPort}/json/list`),targets=await response.json(),pages=targets.filter(target=>target.type==='page');const page=pages.find(target=>{try{const host=new URL(target.url).hostname;return host==='qianchuan.jinritemai.com'||host.endsWith('.oceanengine.com');}catch{return false;}});if(!page)return pages.some(item=>item.url&&item.url!=='about:blank')?'outside_qianchuan':'browser_open';return /login|passport|sso|登录/i.test(`${page.url} ${page.title||''}`)?'login_required':'qianchuan_open';}catch{return 'browser_closed';}}

await mkdir(localDir,{recursive:true});const db=new LocalD1(resolve(localDir,'browser.sqlite'));for(const file of(await readdir(resolve(root,'migrations'))).filter(name=>name.endsWith('.sql')).sort())db.raw.exec(await readFile(resolve(root,'migrations',file),'utf8'));
const executable=await findBrowser(),browserName=basename(executable).toLowerCase().includes('edge')?'Microsoft Edge':'Google Chrome';
const child=spawn(executable,[`--user-data-dir=${profileDir}`,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--new-window',`${dashboardUrl}#token=${token}`,startUrl],{stdio:'ignore'});
let debugPort;try{debugPort=await devtoolsPort();}catch(error){child.kill();throw error;}
const api=createLocalApi({db,token,allowedOrigins:new Set([pagesOrigin,devOrigin,'http://localhost:8797']),getBrowserState:()=>browserState(debugPort)});
const server=createServer(async(req,res)=>{try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);res.end();return;}chunks.push(chunk);}const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers:req.headers,body:['GET','HEAD','OPTIONS'].includes(req.method)?undefined:Buffer.concat(chunks)});const response=await api(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":"本机执行器异常"}');}});
server.listen(port,'127.0.0.1',()=>{console.log(`千川网页执行器 ${VERSION} 已启动`);console.log(`浏览器：${browserName}`);console.log('看板只连接本机 127.0.0.1，关闭专用浏览器窗口即可停止。');});
let stopping=false;const stop=()=>{if(stopping)return;stopping=true;server.close();child.kill();};process.on('SIGINT',()=>{stop();process.exit(0);});process.on('SIGTERM',()=>{stop();process.exit(0);});child.on('exit',()=>{stop();process.exit(0);});
