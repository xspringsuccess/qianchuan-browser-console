import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname,extname,resolve,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../public'),port=8797,types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
createServer(async(req,res)=>{let path=decodeURIComponent(new URL(req.url,`http://127.0.0.1:${port}`).pathname);if(path==='/')path='/index.html';const target=resolve(root,'.'+path);if(!target.startsWith(root+sep)){res.writeHead(404);res.end();return;}try{res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(target));}catch{res.writeHead(404);res.end();}}).listen(port,'127.0.0.1',()=>console.log(`静态看板：http://127.0.0.1:${port}`));
