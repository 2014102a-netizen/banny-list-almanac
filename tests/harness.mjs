import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const code=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
export function setup() {
  const tables={
    'События':[['id'],['concert-2026-10-25','Концерт','concert','2026-10-25','','19:00','Клуб','Адрес',1000,'от 1000','Описание','Причина','Условия','Рок',1,'[]','2026-10-23']],
    'Выпуски':[['id'],['2','Выпуск 2','2026-10-23','2026-10-23','2026-11-06','["concert-2026-10-25"]','https://example.org']],
    'События участников':[['id','title','category','date','endDate','time','venue','address','price','priceLabel','description','why','details','tags','priority','sources','checkedOn','imageUrl','memberId','createdAt','updatedAt','state','requestId','revision']],
    'Участники':[['id','name','joined']], 'Отметки':[['event','member','status','updated']],
  };
  const cache=new Map();
  const props=new Map([['GROUP_PASSWORD','test-only-private-password']]);
  const context=vm.createContext({
    Date,JSON,Number,String,Boolean,Error,Math,
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>tables[name]?({
      getDataRange:()=>({getValues:()=>tables[name].map(r=>[...r])}),
      appendRow:r=>tables[name].push(r.map(v=>typeof v==='string'&&/^'[=+\-@]/.test(v)?v.slice(1):v)),deleteRow:r=>tables[name].splice(r-1,1),
      getRange:(row,col)=>({setValues:values=>values.forEach((r,i)=>r.forEach((v,j)=>{tables[name][row-1+i][col-1+j]=typeof v==='string'&&/^'[=+\-@]/.test(v)?v.slice(1):v;}))}),
    }):null}),flush:()=>{}},
    CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key)||null})},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()],formatDate:(value,tz,pattern)=>pattern==='HH:mm'?new Date(value.getTime()+10800000).toISOString().slice(11,16):new Date(value.getTime()+10800000).toISOString().slice(0,10)},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
  });
  vm.runInContext(code,context);
  const post=value=>context.doPost({postData:{contents:JSON.stringify(value)}});
  return {context,post,tables,props,cache};
}
