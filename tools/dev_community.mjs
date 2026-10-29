/* Isolated local fixture for UI verification. All data stays in memory. */
import http from 'node:http';
import fs from 'node:fs';
import { setup } from '../tests/harness.mjs';
const { context, post, tables } = setup();
const catalog = JSON.parse(fs.readFileSync(new URL('../public/data/catalog.json',import.meta.url),'utf8'));
tables['События'] = [['id'], ...catalog.events.map(e=>[e.id,e.title,e.category,e.date,e.endDate,e.time,e.venue,e.address,e.price??'',e.priceLabel,e.description,e.why,e.details,e.tags.join(', '),e.priority,JSON.stringify(e.sources),e.checkedOn])];
tables['Выпуски'] = [['id'],...catalog.issues.map(i=>[i.id,i.title,i.publishedAt,i.periodStart,i.periodEnd,JSON.stringify(i.eventIds),i.documentUrl])];
context.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getAllHeaders:()=>({'Content-Type':'text/html'}),getContentText:()=>'<title>Встреча банщиков</title><script type="application/ld+json">'+JSON.stringify({'@type':'Event',name:'Встреча банщиков',startDate:'2026-11-05T19:00:00+03:00',location:{name:'Тестовое пространство'},description:'Локальный пример для проверки формы',offers:{price:0,priceCurrency:'RUB'}})+'</script>'})};
http.createServer((req,res)=>{
  if(req.url!=='/api'){res.writeHead(404);res.end();return;}
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:4173');
  res.setHeader('Content-Type','application/json');
  let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
    try{res.end(JSON.stringify(req.method==='POST'?post(JSON.parse(raw)):context.doGet()));}catch{res.writeHead(500);res.end('{}');}
  });
}).listen(4174,'127.0.0.1',()=>console.log('Isolated almanac fixture on http://127.0.0.1:4174/api'));
