import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for(const dir of['src','scripts','tests','public'])for(const file of await readdir(dir))if(/\.(mjs|js)$/.test(file)){const result=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});if(result.status)process.exit(result.status);}
console.log('独立浏览器版本 JavaScript 检查通过');
