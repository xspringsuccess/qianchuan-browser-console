import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CdpClient } from './cdp.mjs';

const profileRoot=resolve(process.env.LOCALAPPDATA||'','QianchuanBrowserConsole','chrome-profile');
const [port]=String(await readFile(resolve(profileRoot,'DevToolsActivePort'),'utf8')).split(/\r?\n/);
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const pages=targets.filter(target=>target.type==='page'&&new URL(target.url).hostname==='qianchuan.jinritemai.com');
const output=[];
for(const page of pages){
  const client=await new CdpClient(page.webSocketDebuggerUrl).connect();
  const point=await client.evaluate(`(()=>{const node=[...document.querySelectorAll('button,a,[role=button],[role=link]')].find(item=>(item.innerText||item.textContent||'').trim()==='查看计划详情');if(!node)return null;const rect=node.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`);
  let clicked=false;
  if(point){await client.send('Page.bringToFront');await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});clicked=true;}
  if(clicked)await new Promise(done=>setTimeout(done,4000));
  const structure=await client.evaluate(`(()=>{
    const text=selector=>[...document.querySelectorAll(selector)].map(node=>(node.innerText||node.textContent||'').trim()).filter(Boolean);
    const unique=values=>[...new Set(values)].filter(value=>value.length<=80).slice(0,300);
    const resources=performance.getEntriesByType('resource').map(entry=>{try{const url=new URL(entry.name);return url.origin+url.pathname;}catch{return ''}}).filter(path=>/api|report|data|ad|campaign|project|budget|account|plan/i.test(path));
    return {path:location.pathname,title:document.title,headings:unique(text('h1,h2,h3,[role=heading]')),buttons:unique(text('button,[role=button]')),tabs:unique(text('[role=tab]')),tableHeaders:unique(text('th,[role=columnheader]')),resources:unique(resources)};
  })()`);
  client.close();
  output.push({pageId:page.id.slice(0,8),clicked,...structure});
}
console.log(JSON.stringify({pageCount:output.length,pages:output},null,2));
