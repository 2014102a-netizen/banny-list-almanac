/* Банный лист. Привязанный к таблице Apps Script.
 * Пароль задаётся владельцем в свойствах скрипта GROUP_PASSWORD.
 * Код, публичная афиша и репозиторий паролей не содержат.
 */
var TABS = { events: 'События', issues: 'Выпуски', members: 'Участники', votes: 'Отметки' };
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
function catalog_() {
  var events = rows_(TABS.events).map(function(r) {
    return { id:String(r[0]), title:String(r[1]), category:String(r[2]), date:date_(r[3]), endDate:date_(r[4]), time:String(r[5]||''),
      venue:String(r[6]), address:String(r[7]||''), price:r[8] === '' ? null : Number(r[8]), priceLabel:String(r[9]||''),
      description:String(r[10]||''), why:String(r[11]||''), details:String(r[12]||''), tags:String(r[13]||'').split(',').map(function(x){return x.trim();}).filter(Boolean),
      priority:Number(r[14])||5, sources:parse_(r[15],[]), checkedOn:date_(r[16]) };
  });
  var issues=rows_(TABS.issues).map(function(r) {
    return { id:String(r[0]),title:String(r[1]),publishedAt:date_(r[2]),periodStart:date_(r[3]),periodEnd:date_(r[4]),eventIds:parse_(r[5],[]),documentUrl:String(r[6]||'') };
  }).sort(function(a,b){return b.publishedAt.localeCompare(a.publishedAt)||Number(b.id)-Number(a.id);});
  return { version:1, events:events, issues:issues, currentIssue:issues.length?issues[0].id:'', checkedOn:issues.length?issues[0].publishedAt:'' };
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
  return {ok:true,session:session,member:member,members:snapshot.members,votes:snapshot.votes};
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
  return {ok:true,member:member,members:members,votes:votes};
}
function vote_(req,memberId) {
  if(['interested','going','pass','none'].indexOf(req.status)<0) return {ok:false,error:'invalid_status'};
  if(!rows_(TABS.events).some(function(r){return String(r[0])===req.eventId;})) return {ok:false,error:'invalid_event'};
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
