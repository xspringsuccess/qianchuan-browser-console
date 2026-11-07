import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CdpClient } from './cdp.mjs';
const [port]=String(await readFile(resolve(process.env.LOCALAPPDATA||'','QianchuanBrowserConsole','chrome-profile','DevToolsActivePort'),'utf8')).split(/\r?\n/);
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=targets.find(target=>target.type==='page'&&new URL(target.url).origin==='https://xspringsuccess.github.io');
if(!page)throw new Error('dashboard page not found');
const client=await new CdpClient(page.webSocketDebuggerUrl).connect(),result=await client.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});client.close();
const output=resolve('.local','dashboard.png');await writeFile(output,Buffer.from(result.data,'base64'));console.log(output);
