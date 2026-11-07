import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CdpClient } from './cdp.mjs';

const pathHint=process.argv[2]||'/overall-prom';
const profileRoot=resolve(process.env.LOCALAPPDATA||'','QianchuanBrowserConsole','chrome-profile');
const [port]=String(await readFile(resolve(profileRoot,'DevToolsActivePort'),'utf8')).split(/\r?\n/);
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page=targets.find(target=>target.type==='page'&&new URL(target.url).hostname==='qianchuan.jinritemai.com'&&new URL(target.url).pathname.includes(pathHint));
if(!page)throw new Error('target page not found');
const client=await new CdpClient(page.webSocketDebuggerUrl).connect();
const result=await client.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
client.close();
const output=resolve('.local','qianchuan-page.png');
await writeFile(output,Buffer.from(result.data,'base64'));
console.log(output);
