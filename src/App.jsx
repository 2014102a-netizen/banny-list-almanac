import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, Search, X, Users, Check, Share2, MapPin, CalendarDays, LogOut, RotateCw, Leaf, Plus } from 'lucide-react';
import { CATEGORIES, PROJECT, STATUS } from './config/catalog';
import { MEDIA } from './config/media';
import { BIRTHDAY } from './config/celebrations';
import CelebrationFeature from './components/CelebrationFeature';
import EventEditor, { EventCover } from './components/EventEditor';
import { request, sessionStore } from './lib/api';
import { dayLabel, shortDate, isEarly, filterEvents, selectFeatured, isPast, moscowToday } from './lib/events';

function Modal({ children, title, onClose, wide = false }) {
  const ref = useRef(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    const cancel = event => { event.preventDefault(); onClose(); };
    dialog.addEventListener('cancel', cancel);
    return () => { dialog.removeEventListener('cancel', cancel); if (dialog.open) dialog.close(); };
  }, [onClose]);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby={headingId} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="modal-content">
      <div className="modal-top"><span className="small-label">Банный лист</span><button className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={22} /></button></div>
      <h2 id={headingId}>{title}</h2>{children}
    </div>
  </dialog>;
}

function VoteControls({ event, session, votes, busy, onVote, onLogin }) {
  const selected = (votes[event.id] || []).find(v => v.memberId === session?.member?.id)?.status;
  return <div className="vote-controls" aria-label={`Моя отметка: ${event.title}`}>
    {Object.entries(STATUS).map(([id, label]) => <button key={id} className={`vote vote-${id} ${selected === id ? 'selected' : ''}`} aria-pressed={selected === id} disabled={busy} onClick={() => session ? onVote(event.id, selected === id ? 'none' : id) : onLogin()}>
      {selected === id && <Check size={14} aria-hidden="true" />}{label}
    </button>)}
  </div>;
}

function Company({ event, session, votes, members, onLogin }) {
  if (!session) return <button className="company-prompt" onClick={onLogin}><Users size={15} /> Кто собирается</button>;
  const going = (votes[event.id] || []).filter(v => v.status === 'going').map(v => members.find(m => m.id === v.memberId)?.name).filter(Boolean);
  const interested = (votes[event.id] || []).filter(v => v.status === 'interested').length;
  return <span className={`company ${going.length ? 'has-company' : ''}`}><Users size={15} />{going.length ? `Пойдут: ${going.join(', ')}` : 'Пока собираем компанию'}{interested > 0 && ` · Интересно: ${interested}`}</span>;
}

function EventCard({ event, issue, session, votes, members, busy, onVote, onLogin, onOpen }) {
  const exhibit = event.category === 'exhibition';
  return <article className={`event-card category-${event.category}`}>
    <EventCover event={event} /><div className="event-card-top"><span className="event-date">{exhibit ? (event.endDate ? `До ${shortDate(event.endDate)}` : shortDate(event.date)) : shortDate(event.date)}{!exhibit && event.time ? ` · ${event.time}` : ''}</span><span className="event-price">{event.priceLabel}</span></div>
    <button className="event-open" onClick={() => onOpen(event.id)} aria-label={`Подробнее: ${event.title}`}><h3>{event.title}</h3><ArrowUpRight size={21} /></button>
    <p className="event-venue">{event.venue}</p>
    <p className="event-description">{event.why || event.description}</p>
    <div className="event-tags">{event.origin === 'community' && <span className="community-label">От банщиков</span>}{event.tags.slice(0, 2).map(tag => <span key={tag}>{tag}</span>)}{isEarly(event, issue) && <span>Ранний анонс</span>}</div>
    <div className="event-card-bottom"><VoteControls {...{ event, session, votes, onVote, onLogin }} busy={Boolean(busy)} /><Company {...{ event, session, votes, members, onLogin }} /></div>
  </article>;
}

export default function App() {
  const [params, setParams] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [session, setSession] = useState(sessionStore.get);
  const [members, setMembers] = useState([]);
  const [voteList, setVoteList] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [communityOnly, setCommunityOnly] = useState(false);
  const [past, setPast] = useState(false);
  const [sort, setSort] = useState('date');
  const [editing, setEditing] = useState(null);
  const [addAfterLogin, setAddAfterLogin] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState(false);
  const [mine, setMine] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState('');
  const [source, setSource] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; sessionStore.set(session); }, [session]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t); } }, [toast]);

  const clearSession = useCallback(() => { setSession(null); setMembers([]); setVoteList([]); setSubmissions([]); setSort('date'); setCompany(false); setMine(false); sessionStore.set(null); }, []);
  const hydratePrivate = useCallback(data => { setMembers(data.members || []); setVoteList(data.votes || []); setSubmissions(data.submissions || []); }, []);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (PROJECT.api) {
        const data = await request();
        if (!data.catalog?.issues?.length) throw new Error('empty');
        setCatalog(data.catalog); setSource('live'); setLoadError('');
      }
      if (sessionRef.current && PROJECT.api) {
        try { hydratePrivate(await request({ action: 'private', session: sessionRef.current.token })); }
        catch (error) { if (error.code === 'expired_session') clearSession(); }
      }
    } catch { setSource('snapshot'); }
    finally { setRefreshing(false); }
  }, [hydratePrivate, clearSession]);

  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}data/catalog.json`).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => {
      if (active) { setCatalog(current => current || data); setSource(value => value === 'live' ? value : 'snapshot'); }
    }).catch(() => { if (active) setLoadError('Афиша не загрузилась. Проверьте связь и обновите страницу.'); });
    refresh();
    const visibleRefresh = () => { if (!document.hidden) refresh(); };
    const timer = setInterval(visibleRefresh, 60000);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', visibleRefresh); };
  }, [refresh]);

  const issueId = params.get('issue') || catalog?.currentIssue;
  const issue = catalog?.issues.find(item => item.id === issueId) || catalog?.issues[0];
  const votes = useMemo(() => voteList.reduce((all, v) => { (all[v.eventId] ||= []).push(v); return all; }, {}), [voteList]);
  const today = moscowToday();
  const current = issue?.id === catalog?.currentIssue;
  const filters = { category, query, company, mine, communityOnly, past, sort, current, today, memberId: session?.member?.id };
  const filtered = useMemo(() => catalog && issue ? filterEvents(catalog.events, issue, filters, votes) : [], [catalog, issue, category, query, company, mine, communityOnly, past, sort, current, today, session, votes]);
  const allIssueEvents = useMemo(() => catalog && issue ? catalog.events.filter(e => issue.eventIds.includes(e.id)) : [], [catalog, issue]);
  const featured = selectFeatured(allIssueEvents.filter(e => !isPast(e, today, issue)), BIRTHDAY);
  const birthdayFeatured = featured?.id === BIRTHDAY.eventId;
  const showHero = featured && category === 'all' && !query && !company && !mine && !communityOnly && !past && sort === 'date' && current;
  const editorial = filtered.filter(e => e.origin !== 'community');
  const communityEvents = filtered.filter(e => e.origin === 'community');
  const groups = past || sort === 'interest' ? [{ title: past ? 'Прошедшие события' : 'Интерес группы', note: past ? 'Карточки и отметки сохранены' : 'Сначала «Пойду», затем «Интересно»', events: filtered }] : [
    { title: 'От банщиков', note: 'Планы, которыми поделились участники', events: communityEvents },
    { title: 'На ближайшие две недели', note: 'Концерты, ночи и театр', events: editorial.filter(e => e.category !== 'exhibition' && !isEarly(e, issue) && (!showHero || e.id !== featured.id)) },
    { title: 'Можно зайти днём', note: 'Выставки и инсталляции', events: editorial.filter(e => e.category === 'exhibition') },
    { title: 'Запланировать заранее', note: 'Зарубежные анонсы за пределами двух недель', events: editorial.filter(e => isEarly(e, issue)) },
  ];
  const opened = catalog?.events.find(e => e.id === params.get('event'));
  const closeEvent = useCallback(() => { setRemoveConfirm(false); setParams(previous => { const p = new URLSearchParams(previous); p.delete('event'); return p; }, { replace: true }); }, [setParams]);
  const closeLogin = useCallback(() => { setLoginOpen(false); setLoginPassword(''); setLoginError(''); setAddAfterLogin(false); }, []);
  function openEvent(id) { setRemoveConfirm(false); setParams(previous => { const p = new URLSearchParams(previous); p.set('event', id); p.set('issue', issue.id); return p; }); }
  function changeIssue(id) { setParams({ issue: id }); setCategory('all'); setQuery(''); setCompany(false); setMine(false); setCommunityOnly(false); setPast(false); }
  function openLogin() { setLoginOpen(true); setLoginError(''); }

  const closeEditor = useCallback(() => setEditing(null), []);
  function startAdd() { if (session) setEditing({}); else { setAddAfterLogin(true); openLogin(); } }
  function saved(data) { setCatalog(data.catalog); hydratePrivate(data); setEditing(null); setSource('live'); changeIssue(data.catalog.currentIssue); setParams({ issue: data.catalog.currentIssue, event: data.eventId }); setToast('Событие сохранено и доступно банщикам'); }
  async function removeEvent() {
    setBusy(opened.id);
    try { const own = submissions.find(s => s.eventId === opened.id); const data = await request({ action: 'remove_event', session: session.token, eventId: opened.id, revision: own.revision }); setCatalog(data.catalog); hydratePrivate(data); closeEvent(); setToast('Событие убрано из афиши'); }
    catch (error) { if (error.code === 'expired_session') { clearSession(); closeEvent(); openLogin(); } setToast(error.message); }
    finally { setBusy(null); }
  }

  async function login(e) {
    e.preventDefault(); setLoginBusy(true); setLoginError('');
    try {
      let clientId;
      try { clientId = sessionStorage.getItem('almanac-client'); if (!clientId) { clientId = crypto.randomUUID(); sessionStorage.setItem('almanac-client', clientId); } } catch { clientId = 'browser'; }
      const data = await request({ action: 'login', name: loginName.trim(), password: loginPassword, clientId });
      const next = { token: data.session, member: data.member };
      setSession(next); sessionStore.set(next); hydratePrivate(data); closeLogin(); if (addAfterLogin) { setEditing({}); setAddAfterLogin(false); } setToast(`Вы вошли как ${data.member.name}`);
    } catch (error) { setLoginError(error.message); }
    finally { setLoginBusy(false); }
  }
  async function logout() {
    const token = session?.token; clearSession(); setEditing(null);
    if (token) request({ action: 'logout', session: token }).catch(() => {});
  }
  async function vote(eventId, status) {
    if (busy) return;
    setBusy(eventId);
    try { hydratePrivate(await request({ action: 'vote', session: session.token, eventId, status })); setToast(status === 'none' ? 'Отметка снята' : 'Отметка сохранена'); }
    catch (error) { if (error.code === 'expired_session') { clearSession(); openLogin(); } setToast(error.message); }
    finally { setBusy(null); }
  }
  async function share(event) {
    const url = new URL(window.location.href); url.hash = `/?issue=${encodeURIComponent(issue.id)}&event=${encodeURIComponent(event.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: `${event.title} · Банный лист`, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setToast('Ссылка скопирована'); }
    } catch (error) { if (error.name !== 'AbortError') setToast('Скопируйте ссылку из адресной строки'); }
  }

  const cardProps = { issue, session, votes, members, busy, onVote: vote, onLogin: openLogin, onOpen: openEvent };
  return <>
    <div className="app-shell">
      <header className="site-header"><a className="brand" href="#/" aria-label="Банный лист — текущий альманах"><img src={MEDIA.leaf} width="37" height="37" alt="" /><span>Банный лист<span className="brand-sub">Петербургский альманах</span></span></a>
        <div className="account-actions">{session ? <><button className="profile-button" onClick={() => { setCompany(false); setMine(!mine); }}><span className="avatar">{session.member.name.slice(0, 1)}</span><span>{session.member.name}</span></button><button className="icon-button" aria-label="Выйти" onClick={logout}><LogOut size={18} /></button></> : <button className="login-button" onClick={openLogin}>Войти <ArrowUpRight size={16} /></button>}</div>
      </header>
      <main>
        <div className="issue-line"><span className="small-label">Петербург · {issue ? `Выпуск ${issue.id.padStart(2, '0')}` : 'Альманах'}</span><label className="issue-select"><CalendarDays size={15} /><select aria-label="Выбрать выпуск" value={issue?.id || ''} onChange={e => changeIssue(e.target.value)}>{catalog?.issues.map(item => <option key={item.id} value={item.id}>{item.title}{item.id === catalog.currentIssue ? ' · свежий' : ' · архив'}</option>)}</select></label></div>
        <div className="masthead"><h1>Куда пойдём<span>вместе?</span></h1><div className="masthead-note"><p>Концерты, ночи,<br />современный театр<br />и искусство.</p><span>{issue ? `${dayLabel(issue.periodStart)} — ${dayLabel(issue.periodEnd)}` : 'Афиша на две недели'}</span></div></div>
        {catalog && <div className="community-invite"><p><strong>Есть свой план?</strong> Добавьте событие по ссылке.</p><button className="primary-button" onClick={startAdd} disabled={!catalog.features?.community || source !== 'live'}><Plus size={17} />Добавить событие</button></div>}
        {catalog && source === 'snapshot' && <p className="snapshot-note"><span />Сохранённая афиша от {dayLabel(catalog.checkedOn)}.{PROJECT.api ? ' Обновить данные пока не удалось.' : ''}<button onClick={refresh} disabled={refreshing} aria-label="Обновить афишу"><RotateCw size={14} className={refreshing ? 'spinning' : ''} /></button></p>}
        {loadError && !catalog && <div className="empty-state"><h2>Проверим связь</h2><p>{loadError}</p><button className="primary-button" onClick={() => window.location.reload()}>Обновить</button></div>}
        {!catalog && !loadError && <p className="loading-state" role="status">Собираем афишу…</p>}

        {showHero && (birthdayFeatured ? <CelebrationFeature celebration={BIRTHDAY} onOpen={() => openEvent(featured.id)} /> : <section className="featured" aria-label="Выбор выпуска"><div className="featured-copy"><span className="featured-label">Выбор выпуска / {CATEGORIES.find(c => c.id === featured.category)?.label.toLowerCase()}</span><button className="featured-title" onClick={() => openEvent(featured.id)}><span>{featured.title}</span><ArrowUpRight size={35} /></button><p>{featured.why}</p><div className="featured-meta"><span>{dayLabel(featured.date)} · {featured.time}</span><span>{featured.venue} · {featured.priceLabel}</span></div><button className="featured-link" onClick={() => openEvent(featured.id)}>Посмотреть и выбрать <ArrowRight size={18} /></button></div><div className="featured-poster" aria-hidden="true"><span className="poster-top">{featured.tags[0]}</span><span className="poster-day">{featured.date.slice(8, 10)}</span><span className="poster-month">{new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(new Date(`${featured.date}T12:00:00+03:00`))}</span><Leaf size={68} strokeWidth={1} /><span className="poster-bottom">{featured.category === 'club' ? 'Клубная ночь' : 'Живая сцена'}<br />{featured.venue} / Санкт-Петербург</span></div></section>)}

        {catalog && <>
          <div className="filter-bar"><div className="category-controls" role="group" aria-label="Категории событий">{CATEGORIES.map(c => <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.label}</button>)}</div><label className="search-box"><Search size={18} /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти событие или место" aria-label="Поиск событий" />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={16} /></button>}</label></div>
          <div className="view-controls"><div><button className={communityOnly ? 'active' : ''} aria-pressed={communityOnly} onClick={() => setCommunityOnly(!communityOnly)}>От банщиков</button><button className={company ? 'active' : ''} aria-pressed={company} onClick={() => session ? setCompany(!company) : openLogin()}><Users size={16} />Куда идут наши</button><button className={mine ? 'active' : ''} aria-pressed={mine} onClick={() => session ? setMine(!mine) : openLogin()}>Мои отметки</button>{current && <button className={past ? 'active' : ''} aria-pressed={past} onClick={() => setPast(!past)}>Прошедшие</button>}</div><span>{filtered.length} {filtered.length % 10 === 1 && filtered.length % 100 !== 11 ? 'событие' : [2, 3, 4].includes(filtered.length % 10) && ![12, 13, 14].includes(filtered.length % 100) ? 'события' : 'событий'}</span></div>
          <div className="sort-line"><span>{past ? 'События завершились по московскому времени.' : current ? 'Предложения участников появляются в течение недели.' : 'Состав сохранённого выпуска.'}</span><label>Порядок<select aria-label="Порядок событий" value={sort} onChange={e => { if (e.target.value === 'interest' && !session) { openLogin(); return; } setSort(e.target.value); }}><option value="date">По дате</option><option value="interest">Интерес группы</option></select></label></div>
          {!session && <p className="login-note">Афишу можно переслать друзьям. <button onClick={openLogin}>Войдите</button>, чтобы видеть компанию и сохранять отметки.</p>}
          {groups.map(group => group.events.length > 0 && <section key={group.title} className="events-section"><div className="section-heading"><h2>{group.title}</h2><p>{group.note}</p></div><div className="event-grid">{group.events.map(event => <EventCard key={event.id} event={event} {...cardProps} />)}</div></section>)}
          {!filtered.length && <div className="empty-state"><Leaf size={36} /><h2>{communityOnly ? 'Здесь будут планы банщиков' : past ? 'Прошедшие события появятся здесь' : company ? 'Компания ещё собирается' : mine ? 'Здесь будут ваши события' : 'Пока ничего по этому запросу'}</h2><p>{communityOnly ? 'Добавьте ссылку на событие, которое хотите посетить вместе.' : past ? 'После даты завершения карточки переходят сюда автоматически.' : company ? 'Отметьте «Пойду» у понравившегося события. Оно появится здесь.' : mine ? 'Выберите «Интересно» или «Пойду» в афише.' : 'Попробуйте другое название или посмотрите все категории.'}</p><button className="primary-button" onClick={() => { setCategory('all'); setQuery(''); setMine(false); setCompany(false); setCommunityOnly(false); setPast(false); }}>К полной афише</button></div>}
        </>}
      </main>
      <footer className="site-footer"><img src={MEDIA.leaf} width="27" height="27" alt="" /><div><span>Банный лист · Альманах</span><p>Петербург. Время московское. Новые выпуски по четвергам.</p></div>{issue?.documentUrl && <a href={issue.documentUrl} target="_blank" rel="noreferrer">Word в Telegram <ArrowUpRight size={15} /></a>}</footer>
    </div>
    {toast && <div className="toast" role="status">{toast}</div>}
    {editing && <Modal wide title={editing.event ? 'Изменить событие' : 'Добавить событие'} onClose={closeEditor}><EventEditor {...editing} session={session} onSaved={saved} onDuplicate={id => { setEditing(null); openEvent(id); }} onExpired={() => { setEditing(null); clearSession(); openLogin(); }} /></Modal>}
    {opened && <Modal wide title={opened.title} onClose={closeEvent}>{opened.origin === 'community' && <><p className="community-detail-label">Предложение банщиков{session && (() => { const author = submissions.find(s => s.eventId === opened.id); const name = members.find(m => m.id === author?.memberId)?.name; return name ? ` · Добавил ${name}` : ''; })()}</p><EventCover event={opened} className="detail-photo" /></>}{opened.id === BIRTHDAY.eventId && <img className="detail-photo" src={MEDIA.birthday} width="1280" height="591" alt="Банщики вместе в бане" />}<div className="detail-meta"><span><CalendarDays size={17} />{opened.category === 'exhibition' ? (opened.endDate ? `До ${dayLabel(opened.endDate)}` : dayLabel(opened.date)) : dayLabel(opened.date, { weekday: 'long' })}{opened.time && ` · ${opened.time}`}</span><span><MapPin size={17} />{opened.venue}</span></div><p className="detail-address">{opened.address}</p><p className="detail-description">{opened.description}</p><div className="detail-why"><span className="small-label">Ради чего идти</span><p>{opened.why}</p></div><p className="detail-conditions">{opened.details}</p><div className="detail-sources">{opened.sources.map((source, i) => <a key={source.url} className={i === 0 ? 'primary-button' : 'text-link'} href={source.url} target="_blank" rel="noreferrer">{source.label} <ArrowUpRight size={16} /></a>)}</div><div className="detail-company"><h3>Соберём компанию</h3><VoteControls event={opened} {...{ session, votes }} busy={Boolean(busy)} onVote={vote} onLogin={openLogin} /><Company event={opened} {...{ session, votes, members }} onLogin={openLogin} />{session && <p className="interested-list">Интересуются: {(votes[opened.id] || []).filter(v => v.status === 'interested').map(v => members.find(m => m.id === v.memberId)?.name).filter(Boolean).join(', ') || 'пока без отметок'}</p>}</div><div className="detail-bottom"><span>{opened.origin === 'community' ? 'Дата и условия указаны участником' : `Проверено ${dayLabel(opened.checkedOn)}`}</span><button className="text-button" onClick={() => share(opened)}><Share2 size={16} />Переслать событие</button></div>{session && submissions.some(s => s.eventId === opened.id && s.memberId === session.member.id) && <div className="author-actions">{removeConfirm ? <><p>Убрать событие из афиши?</p><button className="text-button" disabled={Boolean(busy)} onClick={removeEvent}>Да, убрать</button><button className="text-button" disabled={Boolean(busy)} onClick={() => setRemoveConfirm(false)}>Оставить</button></> : <><button className="text-button" onClick={() => { const record = submissions.find(s => s.eventId === opened.id); const event = opened; closeEvent(); setEditing({ event, revision: record.revision }); }}>Изменить своё событие</button><button className="text-button" onClick={() => setRemoveConfirm(true)}>Убрать из афиши</button></>}</div>}</Modal>}
    {loginOpen && <Modal title="Свои собираются здесь" onClose={closeLogin}><p className="login-intro">Выберите имя и введите общий пароль группы. После входа появятся отметки и участники.</p><form onSubmit={login} className="login-form"><label>Ваше имя<input autoFocus name="name" value={loginName} onChange={e => setLoginName(e.target.value)} minLength={2} maxLength={40} required autoComplete="nickname" placeholder="Как вас знают банщики" /></label><label>Пароль группы<input name="password" type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required maxLength={200} autoComplete="current-password" /></label>{loginError && <p className="form-error" role="alert">{loginError}</p>}<button type="submit" className="primary-button" disabled={loginBusy}>{loginBusy ? 'Входим…' : 'Войти и выбрать события'}{!loginBusy && <ArrowRight size={18} />}</button></form><p className="login-footnote">Имя видно участникам после входа. Пароль можно узнать в группе.</p></Modal>}
  </>;
}
