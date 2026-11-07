import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CdpClient } from './cdp.mjs';

const profileRoot=resolve(process.env.LOCALAPPDATA||'','QianchuanBrowserConsole','chrome-profile');
const [port]=String(await readFile(resolve(profileRoot,'DevToolsActivePort'),'utf8')).split(/\r?\n/);
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page=targets.find(target=>target.type==='page'&&new URL(target.url).hostname==='qianchuan.jinritemai.com'&&new URL(target.url).pathname==='/overall-prom');
if(!page)throw new Error('plan page not found');
const client=await new CdpClient(page.webSocketDebuggerUrl).connect();
const requests=[];
client.on('Network.requestWillBeSent',event=>{try{const url=new URL(event.request.url);if(url.hostname!=='qianchuan.jinritemai.com'||!url.pathname.startsWith('/ad/api/'))return;let bodyKeys=[];if(event.request.postData){try{const body=JSON.parse(event.request.postData);bodyKeys=Object.keys(body);}catch{bodyKeys=['non-json'];}}requests.push({method:event.request.method,path:url.pathname,queryKeys:[...url.searchParams.keys()].sort(),bodyKeys:bodyKeys.sort()});}catch{}});
await client.send('Network.enable');
await client.send('Page.reload',{ignoreCache:false});
await new Promise(done=>setTimeout(done,8000));
client.close();
const unique=[];const seen=new Set();for(const request of requests){const key=JSON.stringify(request);if(!seen.has(key)){seen.add(key);unique.push(request);}}
console.log(JSON.stringify({requestCount:requests.length,requests:unique},null,2));
