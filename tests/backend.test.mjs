import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { filterEvents, selectFeatured } from '../src/lib/events.js';
import { BIRTHDAY } from '../src/config/celebrations.js';

import { setup } from './harness.mjs';
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
test('праздник занимает главный экран до окончания бани; затем возвращается концерт',()=>{
  const concert={id:'rockets-2026-10-25',priority:1};
  const birthday={id:BIRTHDAY.eventId,priority:0};
  const events=[concert,birthday];
  assert.equal(selectFeatured(events,BIRTHDAY,Date.parse('2026-10-23T21:00:00+03:00')),birthday);
  assert.equal(selectFeatured(events,BIRTHDAY,Date.parse('2026-10-24T15:59:59+03:00')),birthday);
  assert.equal(selectFeatured(events,BIRTHDAY,Date.parse('2026-10-24T16:00:00+03:00')),concert);
  assert.equal(selectFeatured([concert],BIRTHDAY,Date.parse(BIRTHDAY.featuredFrom)),concert);
});

const future='2027-03-01';
const proposal=(overrides={})=>({sourceUrl:'https://festival.ru/event?utm_source=tg',title:'Фестиваль друзей',category:'festival',date:future,time:'19:00',venue:'Площадка',why:'Хочу собрать компанию',...overrides});
const enter=(post,name='Андрей')=>post({action:'login',name,password:'test-only-private-password'});
function create(post,session,event=proposal(),requestId=crypto.randomUUID()) {return post({action:'save_event',session,event,requestId});}

test('событие появляется между выпусками; повтор запроса возвращает одну карточку; личные поля закрыты',()=>{
  const {post,context,tables}=setup(),login=enter(post);
  const requestId=crypto.randomUUID(),event=proposal(),first=create(post,login.session,event,requestId);
  assert.equal(first.ok,true); assert.match(first.eventId,/^community-/);
  assert.equal(first.submissions[0].memberId,login.member.id);
  assert.equal(create(post,login.session,event,requestId).eventId,first.eventId);
  assert.equal(tables['События участников'].length,2);
  const publicData=context.doGet(); const json=JSON.stringify(publicData);
  assert.equal(publicData.catalog.events.find(e=>e.id===first.eventId).origin,'community');
  assert.equal(json.includes(login.member.id),false);assert.equal(json.includes(requestId),false);assert.equal(json.includes('revision'),false);
  assert.equal(publicData.catalog.events.find(e=>e.id===first.eventId).sources[0].url,'https://festival.ru/event');
});
test('общие голоса сохраняются при включении предложения в новый выпуск',()=>{
  const {post,tables}=setup(),login=enter(post),saved=create(post,login.session);
  assert.equal(post({action:'vote',session:login.session,eventId:saved.eventId,status:'going'}).votes[0].eventId,saved.eventId);
  tables['Выпуски'].push(['3','Новый','2027-02-25','2027-02-25','2027-03-11',JSON.stringify([saved.eventId]),'']);
  assert.equal(post({action:'private',session:login.session}).votes[0].status,'going');
});
test('правки принадлежат автору; устаревшая версия отклоняется; снятие сохраняет историю',()=>{
  const {post,context,tables}=setup(),owner=enter(post),other=enter(post,'Олег'),saved=create(post,owner.session);
  const revision=saved.submissions[0].revision;
  assert.equal(post({action:'save_event',session:other.session,eventId:saved.eventId,revision,event:proposal()}).error,'forbidden');
  const edited=post({action:'save_event',session:owner.session,eventId:saved.eventId,revision,event:proposal({title:'Новое название'})});
  assert.equal(edited.ok,true);
  assert.equal(post({action:'save_event',session:owner.session,eventId:saved.eventId,revision,event:proposal()}).error,'edit_conflict');
  assert.equal(post({action:'remove_event',session:other.session,eventId:saved.eventId,revision:edited.submissions[0].revision}).error,'forbidden');
  const removal={action:'remove_event',session:owner.session,eventId:saved.eventId,revision:edited.submissions[0].revision};
  assert.equal(post(removal).ok,true);assert.equal(post(removal).ok,true);
  assert.equal(context.doGet().catalog.events.some(e=>e.id===saved.eventId),false);
  assert.equal(tables['События участников'][1][21],'withdrawn');
});
test('повторы ссылки и даты объединяются, новые даты допускаются; формулы записываются текстом',()=>{
  const {post}=setup(),login=enter(post),saved=create(post,login.session);
  const duplicate=create(post,login.session,proposal({sourceUrl:'https://www.festival.ru/event/?utm_campaign=group'}));
  assert.equal(duplicate.error,'duplicate_event'); assert.equal(duplicate.eventId,saved.eventId);
  const different=create(post,login.session,proposal({date:'2027-03-02',title:'=IMPORTXML(1)',why:'+формула'}));
  assert.equal(different.ok,true); assert.equal(different.catalog.events.find(e=>e.id===different.eventId).title,'=IMPORTXML(1)');
});
test('ссылка, дата и поля проверяются сервером; действия требуют сессии',()=>{
  const {post}=setup(),{session}=enter(post);
  for(const sourceUrl of ['javascript:alert(1)','http://festival.ru','https://127.0.0.1/x','https://localhost/x','https://metadata.google.internal/x','https://user:pass@festival.ru/x']) assert.equal(create(post,session,proposal({sourceUrl})).error,'invalid_url');
  for(const date of ['2026-02-31','2020-01-01','2027-13-01']) assert.equal(create(post,session,proposal({date})).error,'invalid_date');
  assert.equal(create(post,session,proposal({endDate:'2027-02-28'})).error,'invalid_date');
  assert.equal(create(post,session,proposal({title:''})).error,'required_fields');
  assert.equal(create(post,'expired-session').error,'expired_session');
});
test('парсер использует единственный Event, переводит время в Москву и оставляет неизвестное пустым',()=>{
  const {context}=setup();
  const html='<meta content="Открытая встреча &amp; музыка" property="og:title"><meta property="og:image" content="/cover.jpg"><script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'Event',name:'Встреча',startDate:'2027-03-01T17:00:00Z',location:{name:'Порт',address:{streetAddress:'Линия 1'}},offers:{price:0,priceCurrency:'RUB'}})+'</script>';
  const event=context.metadata_(html,'https://festival.ru/event');
  assert.equal(event.title,'Встреча');assert.equal(event.date,'2027-03-01');assert.equal(event.time,'20:00');assert.equal(event.imageUrl,'https://festival.ru/cover.jpg');assert.equal(event.priceLabel,'Бесплатно');
  const unknown=context.metadata_('<title>Афиша</title>','https://festival.ru/');assert.equal(unknown.date,undefined);assert.equal(unknown.imageUrl,'');
});
test('приватный предпросмотр переживает закрытый сайт; редирект на служебный адрес отклоняется',()=>{
  const {context,post}=setup(),{session}=enter(post);
  context.UrlFetchApp={fetch:()=>({getResponseCode:()=>302,getAllHeaders:()=>({Location:'https://127.0.0.1/token'})})};
  const result=post({action:'preview_event',session,url:'https://festival.ru/private'});
  assert.equal(result.ok,true);assert.equal(result.manual,true);assert.equal(result.draft.sourceUrl,'https://festival.ru/private');
  assert.equal(post({action:'preview_event',url:'https://festival.ru'}).error,'expired_session');
});
test('живая лента включает будущие предложения; даты уводят в архив, состав выпуска сохраняется',()=>{
  const {context,post}=setup(),{session}=enter(post),saved=create(post,session);
  const catalog=context.doGet().catalog,issue=catalog.issues[0];
  const filters={category:'all',current:true,today:'2027-02-28'};
  assert.deepEqual(filterEvents(catalog.events,issue,filters).map(e=>e.id),[saved.eventId]);
  assert.equal(filterEvents(catalog.events,issue,{...filters,today:'2027-03-02'}).length,0);
  assert.equal(filterEvents(catalog.events,issue,{...filters,today:'2027-03-02',past:true,communityOnly:true}).length,1);
  assert.deepEqual(filterEvents(catalog.events,issue,{category:'all'}).map(e=>e.id),['concert-2026-10-25']);
  const overnight={id:'night',origin:'community',category:'club',date:'2027-03-01',endDate:'2027-03-02'};
  assert.equal(filterEvents([overnight],issue,{...filters,today:'2027-03-02'}).length,1);
});
test('интерес группы учитывает Пойду, затем Интересно; Пропускаю не снижает рейтинг',()=>{
  const events=['a','b','c'].map(id=>({id,origin:'community',date:future,category:'meeting'})),issue={eventIds:[],periodEnd:future};
  const votes={a:[{status:'interested'},{status:'interested'}],b:[{status:'going'},{status:'pass'}],c:[{status:'interested'}]};
  assert.deepEqual(filterEvents(events,issue,{current:true,today:future,sort:'interest'},votes).map(e=>e.id),['b','a','c']);
});
