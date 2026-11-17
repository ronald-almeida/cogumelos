import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import checkout from '../api/checkout.js';
import paymentStatus from '../api/payment-status.js';
const root = path.resolve(import.meta.dirname, '../public');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/checkout')return await checkout(req,res);
    if(url.pathname==='/api/payment-status')return await paymentStatus(req,res);
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    let name=decodeURIComponent(url.pathname);
    if(name==='/')name='/index.html';
    if(!path.extname(name))name+='.html';
    const file=path.resolve(root,`.${name}`);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Página não encontrada.');}
});
server.listen(3000,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:3000'));
