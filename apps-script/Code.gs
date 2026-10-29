/* Банный лист. Привязанный к таблице Apps Script.
 * Пароль задаётся владельцем в свойствах скрипта GROUP_PASSWORD.
 * Код, публичная афиша и репозиторий паролей не содержат.
 */
var TABS = { events: 'События', issues: 'Выпуски', members: 'Участники', votes: 'Отметки', community: 'События участников' };
var SPREADSHEET_ID = '1xL1RFTnlBsERCzR9IXAbMJJsPPGdHEkdmGOYfJ3T474';
var MAX_NAME = 40;
var SESSION_SECONDS = 21600;

function doGet() {
  try { return json_({ ok: true, catalog: catalog_() }); }
  catch (error) { return json_({ ok: false, error: 'read_failed' }); }
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents || '';
    if (raw.length > 12000) return json_({ ok: false, error: 'invalid_request' });
    var req = JSON.parse(raw);
    if (req.action === 'login') return json_(login_(req));
    var memberId = sessionMember_(req.session);
    if (!memberId) return json_({ ok: false, error: 'expired_session' });
    if (req.action === 'private') return json_(privateData_(memberId));
    if (req.action === 'logout') {
      CacheService.getScriptCache().remove('session:' + hash_(req.session));
      return json_({ ok: true });
    }
    if (req.action === 'vote') return json_(vote_(req, memberId));
    if (req.action === 'preview_event') return json_(previewEvent_(req, memberId));
    if (req.action === 'save_event') return json_(saveEvent_(req, memberId));
    if (req.action === 'remove_event') return json_(removeEvent_(req, memberId));
    return json_({ ok: false, error: 'invalid_action' });
  } catch (error) { return json_({ ok: false, error: 'request_failed' }); }
}

function sheet_(name) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sheet) throw new Error('missing_sheet');
  return sheet;
}
function rows_(name) {
  var values = sheet_(name).getDataRange().getValues();
  return values.slice(1).filter(function(row) { return String(row[0]).trim() !== ''; });
}
function date_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Europe/Moscow', 'yyyy-MM-dd');
  return String(value || '').slice(0,10);
}
function parse_(value, fallback) {
  try { return JSON.parse(value); } catch (error) { return fallback; }
}
function eventFromRow_(r) {
    return { id:String(r[0]), title:String(r[1]), category:String(r[2]), date:date_(r[3]), endDate:date_(r[4]), time:String(r[5]||''),
      venue:String(r[6]), address:String(r[7]||''), price:r[8] === '' ? null : Number(r[8]), priceLabel:String(r[9]||''),
      description:String(r[10]||''), why:String(r[11]||''), details:String(r[12]||''), tags:String(r[13]||'').split(',').map(function(x){return x.trim();}).filter(Boolean),
      priority:Number(r[14])||5, sources:parse_(r[15],[]), checkedOn:date_(r[16]) };
}
function communityRows_() {
  var sheet=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TABS.community);
  return sheet?sheet.getDataRange().getValues().slice(1).filter(function(r){return r[0];}):[];
}
function catalog_() {
  var events = rows_(TABS.events).map(eventFromRow_);
  communityRows_().filter(function(r){return r[21]==='published';}).forEach(function(r){
    var event=eventFromRow_(r); event.origin='community'; event.imageUrl=String(r[17]||'');
    event.createdAt=String(r[19]||''); event.updatedAt=String(r[20]||'');
    // A community ID keeps its votes when it is included in a weekly issue.
    events=events.filter(function(e){return e.id!==event.id;}); events.push(event);
  });
  var issues=rows_(TABS.issues).map(function(r) {
    return { id:String(r[0]),title:String(r[1]),publishedAt:date_(r[2]),periodStart:date_(r[3]),periodEnd:date_(r[4]),eventIds:parse_(r[5],[]),documentUrl:String(r[6]||'') };
  }).sort(function(a,b){return b.publishedAt.localeCompare(a.publishedAt)||Number(b.id)-Number(a.id);});
  return { version:2, features:{community:!!SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TABS.community)}, events:events, issues:issues, currentIssue:issues.length?issues[0].id:'', checkedOn:issues.length?issues[0].publishedAt:'' };
}
function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function safeEqual_(a,b) {
  var difference=a.length^b.length;
  for(var i=0;i<a.length;i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i%b.length);
  return difference===0;
}
function login_(req) {
  var password=PropertiesService.getScriptProperties().getProperty('GROUP_PASSWORD');
  if(!password) return {ok:false,error:'not_configured'};
  var name=String(req.name||'').trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>MAX_NAME||/^[=+\-@]/.test(name)) return {ok:false,error:'invalid_name'};
  var cache=CacheService.getScriptCache();
  var fingerprint=hash_(String(req.clientId||'anonymous').slice(0,100));
  var failed=Number(cache.get('fail:'+fingerprint)||0);
  if(failed>=8) return {ok:false,error:'rate_limit'};
  if(!safeEqual_(hash_(String(req.password||'')),hash_(password))) {
    cache.put('fail:'+fingerprint,String(failed+1),600);
    return {ok:false,error:'bad_password'};
  }
  cache.remove('fail:'+fingerprint);
  var lock=LockService.getScriptLock(); lock.waitLock(10000);
  var member;
  try {
    var existing=rows_(TABS.members).find(function(r){return String(r[1]).toLocaleLowerCase()===name.toLocaleLowerCase();});
    member=existing?{id:String(existing[0]),name:String(existing[1])}:{id:Utilities.getUuid(),name:name};
    if(!existing) sheet_(TABS.members).appendRow([member.id,member.name,new Date()]);
    SpreadsheetApp.flush();
  } finally {lock.releaseLock();}
  var session=Utilities.getUuid()+Utilities.getUuid();
  cache.put('session:'+hash_(session),member.id,SESSION_SECONDS);
  var snapshot=privateData_(member.id);
  return {ok:true,session:session,member:member,members:snapshot.members,votes:snapshot.votes,submissions:snapshot.submissions};
}
function sessionMember_(session) {
  if(typeof session!=='string'||session.length>100||session.length<32) return null;
  return CacheService.getScriptCache().get('session:'+hash_(session));
}
function privateData_(memberId) {
  var members=rows_(TABS.members).map(function(r){return {id:String(r[0]),name:String(r[1])};});
  var member=members.find(function(item){return item.id===memberId;});
  if(!member) return {ok:false,error:'expired_session'};
  var votes=rows_(TABS.votes).map(function(r){return {eventId:String(r[0]),memberId:String(r[1]),status:String(r[2]),updatedAt:r[3] instanceof Date?r[3].toISOString():String(r[3])};});
  var submissions=communityRows_().filter(function(r){return r[21]==='published';}).map(function(r){return {eventId:String(r[0]),memberId:String(r[18]),revision:String(r[23]||'')};});
  return {ok:true,member:member,members:members,votes:votes,submissions:submissions};
}
function vote_(req,memberId) {
  if(['interested','going','pass','none'].indexOf(req.status)<0) return {ok:false,error:'invalid_status'};
  if(!catalog_().events.some(function(e){return e.id===req.eventId;})) return {ok:false,error:'invalid_event'};
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var sheet=sheet_(TABS.votes), values=sheet.getDataRange().getValues(), row=-1;
    for(var i=1;i<values.length;i++) if(String(values[i][0])===req.eventId&&String(values[i][1])===memberId){row=i+1;break;}
    if(req.status==='none') {if(row>0) sheet.deleteRow(row);}
    else if(row>0) sheet.getRange(row,1,1,4).setValues([[req.eventId,memberId,req.status,new Date()]]);
    else sheet.appendRow([req.eventId,memberId,req.status,new Date()]);
    SpreadsheetApp.flush();
  } finally {lock.releaseLock();}
  return privateData_(memberId);
}
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

/* События участников. A:Q повторяют публичную схему афиши.
 * R imageUrl, S memberId, T createdAt, U updatedAt, V state,
 * W requestId, X revision. S/W/X выдаются только в закрытых методах.
 */
var EVENT_CATEGORIES=['concert','club','theatre','exhibition','meeting','festival','other'];
function today_(){return Utilities.formatDate(new Date(),'Europe/Moscow','yyyy-MM-dd');}
function text_(value,max){return String(value||'').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function sheetText_(value){return typeof value==='string'&&/^[=+\-@]/.test(value)?"'"+value:value;}
function validDay_(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
function publicUrl_(value){
  var url=String(value||'').trim();
  if(url.length>2000||/[\s\\\u0000-\u001f]/.test(url)) return '';
  var match=/^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^#]*)?(?:#.*)?$/i.exec(url);
  if(!match) return '';
  var host=match[1].toLowerCase();
  if(!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(host)||/\.\./.test(host)||/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)) return '';
  return 'https://'+host+(match[2]||'/');
}
function canonicalUrl_(value){
  var url=publicUrl_(value); if(!url)return '';
  var parts=url.split('?'), path=parts[0].replace(/^https:\/\/www\./,'https://').replace(/\/$/,'');
  var query=(parts.slice(1).join('?')||'').split('&').filter(function(part){return part&&!/^(utm_[^=]*|clckid|fbclid|gclid|yclid|ysclid|_openstat)=/i.test(part);}).sort().join('&');
  return path+(query?'?'+query:'');
}
function duplicateEvent_(event,exceptId){
  var key=canonicalUrl_(event.sources[0].url);
  return catalog_().events.find(function(e){return e.id!==exceptId&&e.date===event.date&&(e.sources||[]).some(function(s){return canonicalUrl_(s.url)===key;});});
}
function eventInput_(req){
  var input=req.event||{}, url=publicUrl_(input.sourceUrl), date=String(input.date||''), end=String(input.endDate||''), time=String(input.time||'');
  var title=text_(input.title,160), venue=text_(input.venue,160);
  if(!url)return {error:'invalid_url'};
  if(title.length<3||!venue)return {error:'required_fields'};
  if(!validDay_(date)||date<today_()||Number(date.slice(0,4))>Number(today_().slice(0,4))+2||end&&(!validDay_(end)||end<date))return {error:'invalid_date'};
  if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return {error:'invalid_time'};
  if(EVENT_CATEGORIES.indexOf(input.category)<0)return {error:'invalid_category'};
  return {event:{title:title,category:input.category,date:date,endDate:end,time:time,venue:venue,address:text_(input.address,250),price:null,
    priceLabel:text_(input.priceLabel,100)||'Цена уточняется',description:text_(input.description,1000),why:text_(input.why,400),details:text_(input.details,1000),
    tags:[],priority:5,sources:[{label:'Страница события',url:canonicalUrl_(url)}],checkedOn:'',imageUrl:publicUrl_(input.imageUrl)}};
}
function communityReply_(memberId,extra){
  var result=privateData_(memberId); result.catalog=catalog_();
  Object.keys(extra||{}).forEach(function(k){result[k]=extra[k];}); return result;
}
function saveEvent_(req,memberId){
  if(!SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TABS.community))return {ok:false,error:'community_unavailable'};
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    var rows=communityRows_(), id=String(req.eventId||''), existing=rows.find(function(r){return String(r[0])===id;});
    var requestId=String(req.requestId||'');
    if(!id&&!/^[a-zA-Z0-9-]{16,100}$/.test(requestId))return {ok:false,error:'invalid_request'};
    // Repeating a request after a lost response returns the same event.
    var previous=!id&&rows.find(function(r){return r[18]===memberId&&r[22]===requestId;});
    if(previous)return communityReply_(memberId,{eventId:String(previous[0])});
    if(id&&(!existing||existing[18]!==memberId||existing[21]!=='published'))return {ok:false,error:'forbidden'};
    if(existing&&String(req.revision||'')!==String(existing[23]))return {ok:false,error:'edit_conflict'};
    var parsed=eventInput_(req);if(parsed.error)return {ok:false,error:parsed.error};
    var event=parsed.event, duplicate=duplicateEvent_(event,id);
    if(duplicate)return {ok:false,error:'duplicate_event',eventId:duplicate.id};
    var now=new Date().toISOString();
    if(!existing&&rows.filter(function(r){return r[18]===memberId&&String(r[19]).slice(0,10)===now.slice(0,10);}).length>=20)return {ok:false,error:'submission_limit'};
    id=id||'community-'+Utilities.getUuid();
    var values=[id,event.title,event.category,event.date,event.endDate,event.time,event.venue,event.address,'',event.priceLabel,event.description,event.why,event.details,'',5,JSON.stringify(event.sources),'',event.imageUrl,memberId,existing?existing[19]:now,now,'published',existing?existing[22]:requestId,Utilities.getUuid()].map(sheetText_);
    var sheet=sheet_(TABS.community);
    if(existing){var all=sheet.getDataRange().getValues();var row=all.findIndex(function(r){return String(r[0])===id;})+1;sheet.getRange(row,1,1,24).setValues([values]);}
    else sheet.appendRow(values);
    SpreadsheetApp.flush();
    return communityReply_(memberId,{eventId:id});
  }finally{lock.releaseLock();}
}
function removeEvent_(req,memberId){
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    var sheet=sheet_(TABS.community), rows=sheet.getDataRange().getValues(), index=rows.findIndex(function(r,i){return i>0&&String(r[0])===req.eventId;});
    if(index<1||rows[index][18]!==memberId)return {ok:false,error:'forbidden'};
    if(rows[index][21]==='withdrawn')return communityReply_(memberId);
    if(String(req.revision||'')!==String(rows[index][23]))return {ok:false,error:'edit_conflict'};
    sheet.getRange(index+1,21,1,4).setValues([[new Date().toISOString(),'withdrawn',rows[index][22],Utilities.getUuid()]]);
    SpreadsheetApp.flush();return communityReply_(memberId);
  }finally{lock.releaseLock();}
}
function previewEvent_(req,memberId){
  var url=publicUrl_(req.url);if(!url)return {ok:false,error:'invalid_url'};
  var cache=CacheService.getScriptCache(), key='preview-rate:'+memberId, count=Number(cache.get(key)||0);
  if(count>=10)return {ok:false,error:'preview_limit'};
  cache.put(key,String(count+1),60);
  var cached=cache.get('preview:'+hash_(canonicalUrl_(url)));if(cached)return parse_(cached,{ok:true,draft:{sourceUrl:url},manual:true});
  var result={ok:true,draft:{sourceUrl:canonicalUrl_(url)},manual:true};
  try{
    var html=fetchPage_(url);var extracted=metadata_(html.text,html.url);
    Object.keys(extracted).forEach(function(k){if(extracted[k])result.draft[k]=extracted[k];});
    result.manual=!result.draft.title;
  }catch(error){result.manual=true;}
  cache.put('preview:'+hash_(canonicalUrl_(url)),JSON.stringify(result),1800);return result;
}
function fetchPage_(url){
  for(var i=0;i<4;i++){
    url=publicUrl_(url);if(!url)throw new Error('invalid_url');
    var response=UrlFetchApp.fetch(url,{followRedirects:false,muteHttpExceptions:true,validateHttpsCertificates:true,headers:{Accept:'text/html,application/xhtml+xml'}});
    var status=response.getResponseCode(), headers=response.getAllHeaders();
    if(status>=300&&status<400){url=absoluteUrl_(headers.Location||headers.location||'',url);continue;}
    var type=String(headers['Content-Type']||headers['content-type']||'');
    if(status!==200||type&&!/text\/html|application\/xhtml\+xml/i.test(type)||Number(headers['Content-Length']||headers['content-length']||0)>1000000)throw new Error('unavailable');
    return {url:url,text:response.getContentText().slice(0,400000)};
  }throw new Error('redirect_limit');
}
function absoluteUrl_(value,base){
  value=String(value||'').trim();if(!value)return '';if(/^https:\/\//i.test(value))return publicUrl_(value);
  if(/^\/\//.test(value))return publicUrl_('https:'+value);
  if(/^[a-z][a-z0-9+.-]*:/i.test(value))return '';
  var origin=/^https:\/\/[^/]+/.exec(base)[0];
  return publicUrl_(value.charAt(0)==='/'?origin+value:base.split('?')[0].replace(/[^/]*$/,'')+value);
}
function entities_(value){
  return String(value||'').replace(/&#(x[0-9a-f]+|\d+);?/gi,function(_,n){var c=n.charAt(0).toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=1114111?String.fromCodePoint(c):'';})
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/gi,function(_,k){return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[k.toLowerCase()];});
}
function attributes_(tag){
  var attrs={}, pattern=/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g, match;
  while((match=pattern.exec(tag)))attrs[match[1].toLowerCase()]=entities_(match[2]!==undefined?match[2]:match[3]!==undefined?match[3]:match[4]);
  return attrs;
}
function metadata_(html,url){
  var meta={}, tags=html.match(/<meta\b[^>]*>/gi)||[];
  tags.forEach(function(tag){var attrs=attributes_(tag),key=(attrs.property||attrs.name||'').toLowerCase();if(key&&!meta[key])meta[key]=attrs.content||'';});
  var title=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html), events=[];
  function visit(value,depth){
    if(!value||typeof value!=='object'||depth>6)return;
    if(Array.isArray(value)){value.forEach(function(v){visit(v,depth+1);});return;}
    var types=Array.isArray(value['@type'])?value['@type']:[value['@type']];
    if(types.some(function(t){return /(^|\/)\w*Event$/.test(String(t||''));}))events.push(value);
    if(value['@graph'])visit(value['@graph'],depth+1);
    if(value.itemListElement)visit(value.itemListElement,depth+1);
    if(value.item)visit(value.item,depth+1);
  }
  (html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi)||[]).forEach(function(script){
    var open=/<script\b[^>]*>/i.exec(script)[0];if(/application\/ld\+json/i.test(attributes_(open).type||''))try{visit(JSON.parse(script.slice(open.length).replace(/<\/script>$/i,'')),0);}catch(error){}
  });
  var event=events.length===1?events[0]:{}, location=typeof event.location==='object'&&!Array.isArray(event.location)?event.location:{}, address=location.address||{};
  var image=event.image;if(Array.isArray(image))image=image[0];if(image&&typeof image==='object')image=image.url||image.contentUrl;
  var draft={title:text_(entities_(event.name||meta['og:title']||meta['twitter:title']||title&&title[1]),160),description:text_(entities_(event.description||meta['og:description']||meta.description),1000),
    imageUrl:absoluteUrl_(image||meta['og:image']||meta['twitter:image']||'',url),venue:text_(location.name||typeof event.location==='string'&&event.location,160),
    address:text_(typeof address==='string'?address:[address.streetAddress,address.addressLocality].filter(Boolean).join(', '),250)};
  ['startDate','endDate'].forEach(function(key){
    var value=String(event[key]||''),day=value.slice(0,10), isStart=key==='startDate';if(!validDay_(day))return;
    if(/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)&&!isNaN(Date.parse(value))){var parsed=new Date(value);day=Utilities.formatDate(parsed,'Europe/Moscow','yyyy-MM-dd');if(isStart)draft.time=Utilities.formatDate(parsed,'Europe/Moscow','HH:mm');}
    else if(isStart&&/T\d{2}:\d{2}/.test(value))draft.time=value.slice(11,16);
    draft[isStart?'date':'endDate']=day;
  });
  var offers=Array.isArray(event.offers)?event.offers[0]:event.offers;
  if(offers&&offers.price!==undefined&&String(offers.price)!=='')draft.priceLabel=Number(offers.price)===0?'Бесплатно':text_(offers.price+' '+(offers.priceCurrency||''),100);
  return draft;
}
// Owner-only check from the editor. No password, members or votes are logged.
function checkCommunitySetup(){
  var catalog=catalog_();
  var preview=previewEvent_({url:'https://alfabank.sale/alfafuture/fest/spb/'},'owner-setup-check');
  console.log(JSON.stringify({events:catalog.events.length,features:catalog.features,previewTitle:preview.draft&&preview.draft.title||'',manual:preview.manual}));
}
