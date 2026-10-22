import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { filterEvents } from '../src/lib/events.js';

const code=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
function setup() {
  const tables={
    'События':[['id'],['concert-2026-10-25','Концерт','concert','2026-10-25','','19:00','Клуб','Адрес',1000,'от 1000','Описание','Причина','Условия','Рок',1,'[]','2026-10-23']],
    'Выпуски':[['id'],['2','Выпуск 2','2026-10-23','2026-10-23','2026-11-06','["concert-2026-10-25"]','https://example.org']],
    'Участники':[['id','name','joined']], 'Отметки':[['event','member','status','updated']],
  };
  const cache=new Map();
  const props=new Map([['GROUP_PASSWORD','test-only-private-password']]);
  const context=vm.createContext({
    Date,JSON,Number,String,Boolean,Error,Math,
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>({
      getDataRange:()=>({getValues:()=>tables[name].map(r=>[...r])}),
      appendRow:r=>tables[name].push(r),deleteRow:r=>tables[name].splice(r-1,1),
      getRange:(row,col)=>({setValues:values=>values.forEach((r,i)=>r.forEach((v,j)=>{tables[name][row-1+i][col-1+j]=v;}))}),
    })}),flush:()=>{}},
    CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key)||null})},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()],formatDate:value=>value.toISOString().slice(0,10)},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
  });
  vm.runInContext(code,context);
  const post=value=>context.doPost({postData:{contents:JSON.stringify(value)}});
  return {context,post,tables,props,cache};
}
test('публичная афиша скрывает участников и отметки',()=>{
  const {context,tables}=setup(); tables['Участники'].push(['secret-id','Андрей','2026-10-23']);
  tables['Отметки'].push(['concert-2026-10-25','secret-id','going','2026-10-23']);
  const result=context.doGet(); assert.equal(result.ok,true); assert.equal(result.catalog.events.length,1);
  assert.equal(JSON.stringify(result).includes('secret-id'),false); assert.equal(JSON.stringify(result).includes('Андрей'),false);
});
test('неверный пароль и отсутствующая сессия запрещают запись',()=>{
  const {post,tables}=setup(); assert.equal(post({action:'login',name:'Андрей',password:'wrong'}).error,'bad_password');
  assert.equal(post({action:'vote',eventId:'concert-2026-10-25',status:'going',session:'invalid'}).error,'expired_session');
  assert.equal(tables['Участники'].length,1); assert.equal(tables['Отметки'].length,1);
});
test('отметка меняется в одной строке, сохраняет привязку и снимается',()=>{
  const {post,tables}=setup();
  const login=post({action:'login',name:'Андрей',password:'test-only-private-password'}); assert.equal(login.ok,true);
  const vote=status=>post({action:'vote',session:login.session,eventId:'concert-2026-10-25',status});
  assert.equal(vote('interested').votes[0].status,'interested');
  assert.equal(vote('going').votes[0].status,'going'); assert.equal(tables['Отметки'].length,2);
  tables['Выпуски'].push(['3','Следующий','2026-10-29','2026-10-29','2026-11-12','["concert-2026-10-25"]','']);
  assert.equal(post({action:'private',session:login.session}).votes[0].memberId,login.member.id);
  assert.equal(vote('none').votes.length,0);
});
test('имя повторно использует участника; чужой memberId из запроса игнорируется',()=>{
  const {post,tables}=setup();
  const first=post({action:'login',name:'Андрей',password:'test-only-private-password'});
  const again=post({action:'login',name:'андрей',password:'test-only-private-password'});
  assert.equal(first.member.id,again.member.id); assert.equal(tables['Участники'].length,2);
  const result=post({action:'vote',session:first.session,eventId:'concert-2026-10-25',memberId:'another',status:'going'});
  assert.equal(result.votes[0].memberId,first.member.id);
});
test('неизвестное событие, статус и имя-формула отклоняются',()=>{
  const {post}=setup(); assert.equal(post({action:'login',name:'=IMPORTXML()',password:'test-only-private-password'}).error,'invalid_name');
  const {session}=post({action:'login',name:'Андрей',password:'test-only-private-password'});
  assert.equal(post({action:'vote',session,eventId:'missing',status:'going'}).error,'invalid_event');
  assert.equal(post({action:'vote',session,eventId:'concert-2026-10-25',status:'garbage'}).error,'invalid_status');
});
test('выход отзывает сессию; пароль требуется при первом запуске',()=>{
  const {post,props}=setup(); const {session}=post({action:'login',name:'Андрей',password:'test-only-private-password'});
  post({action:'logout',session}); assert.equal(post({action:'private',session}).error,'expired_session');
  props.clear(); assert.equal(post({action:'login',name:'Андрей',password:'anything'}).error,'not_configured');
});
test('архив и фильтр компании используют ID событий и действительные отметки',()=>{
  const events=[{id:'a',category:'concert',date:'2026-10-25',time:'19:00',title:'Rockets',venue:'BASE'},{id:'b',category:'theatre',date:'2026-11-04',time:'20:00',title:'Спектакль',venue:'Узел'},{id:'c',category:'concert',date:'2026-12-06',time:'20:00',title:'Turner',venue:'Jagger'}];
  const issue={eventIds:['a','c'],periodEnd:'2026-11-06'};
  assert.deepEqual(filterEvents(events,issue,{category:'all'}).map(e=>e.id),['a','c']);
  assert.deepEqual(filterEvents(events,issue,{category:'all',company:true},{a:[{status:'going',memberId:'m'}]}).map(e=>e.id),['a']);
  assert.deepEqual(filterEvents(events,issue,{category:'all',query:'BASE'}).map(e=>e.id),['a']);
});
