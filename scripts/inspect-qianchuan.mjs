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
  const structure=await client.evaluate(`(()=>{
    const text=selector=>[...document.querySelectorAll(selector)].map(node=>(node.innerText||node.textContent||'').trim()).filter(Boolean);
    const unique=values=>[...new Set(values)].filter(value=>value.length<=80).slice(0,300);
    const resources=performance.getEntriesByType('resource').map(entry=>{try{const url=new URL(entry.name);return url.origin+url.pathname;}catch{return ''}}).filter(path=>/api|report|data|ad|campaign|project|budget|account|plan/i.test(path));
    const planDetail=[...document.querySelectorAll('button,a,[role=button],[role=link]')].filter(node=>(node.innerText||node.textContent||'').trim()==='查看计划详情').map(node=>{const rect=node.getBoundingClientRect(),top=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return {tag:node.tagName,role:node.getAttribute('role'),href:node.getAttribute('href'),disabled:Boolean(node.disabled),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},pointerEvents:getComputedStyle(node).pointerEvents,topText:(top?.innerText||top?.textContent||'').trim().slice(0,80),className:String(node.className||'').slice(0,200)}});
    return {title:document.title,readyState:document.readyState,headings:unique(text('h1,h2,h3,[role=heading]')),buttons:unique(text('button,[role=button]')),links:unique(text('a,[role=link]')),tabs:unique(text('[role=tab]')),planDetail,resources:unique(resources)};
  })()`);
  client.close();
  output.push({pageId:page.id.slice(0,8),...structure});
}
console.log(JSON.stringify({pageCount:output.length,pages:output},null,2));
