import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CdpClient } from './cdp.mjs';

const profileRoot=resolve(process.env.LOCALAPPDATA||'','QianchuanBrowserConsole','chrome-profile');
const [port]=String(await readFile(resolve(profileRoot,'DevToolsActivePort'),'utf8')).split(/\r?\n/);
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page=targets.find(target=>target.type==='page'&&new URL(target.url).hostname==='qianchuan.jinritemai.com'&&new URL(target.url).pathname==='/overall-prom');
if(!page)throw new Error('plan page not found');
const client=await new CdpClient(page.webSocketDebuggerUrl).connect();
await client.evaluate(`(()=>{window.scrollTo(0,document.body.scrollHeight);return true})()`);
await new Promise(done=>setTimeout(done,1500));
const result=await client.evaluate(`(()=>{
  const clean=value=>(value||'').replace(/\s+/g,' ').trim();
  const unique=values=>[...new Set(values.map(clean).filter(Boolean))];
  const rows=[...document.querySelectorAll('tbody tr,[role=row]')].filter(row=>row.querySelector('td,[role=gridcell]'));
  const actionLabels=unique(rows.flatMap(row=>[...row.querySelectorAll('button,[role=button],a')].map(node=>node.innerText||node.textContent||''))).filter(value=>value.length<=40);
  return {
    headers:unique([...document.querySelectorAll('th,[role=columnheader]')].map(node=>node.innerText||node.textContent||'')),
    rowCount:rows.length,
    cellCounts:rows.slice(0,10).map(row=>row.querySelectorAll('td,[role=gridcell]').length),
    actionLabels,
    scrollHeight:document.documentElement.scrollHeight,
    viewportHeight:innerHeight
  };
})()`);
client.close();
console.log(JSON.stringify(result,null,2));
