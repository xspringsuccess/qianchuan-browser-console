import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { collectQianchuanSnapshots } from '../src/qianchuan-collector.mjs';
const [port]=String(await readFile(resolve(process.env.LOCALAPPDATA||'','QianchuanBrowserConsole','chrome-profile','DevToolsActivePort'),'utf8')).split(/\r?\n/);
const snapshots=await collectQianchuanSnapshots(Number(port));
console.log(JSON.stringify({accounts:snapshots.length,plans:snapshots.reduce((sum,item)=>sum+item.plans.length,0),items:snapshots.map(item=>({account:item.account.label,home_spend:item.home_spend,boards:item.boards,plans_with_spend:item.plans.filter(plan=>plan.spend!==null).length,plans_with_net_roi:item.plans.filter(plan=>plan.net_roi!==null).length}))},null,2));
