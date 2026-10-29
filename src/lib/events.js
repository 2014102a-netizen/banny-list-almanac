export function parseDay(value) { return value ? new Date(`${value.slice(0, 10)}T12:00:00+03:00`) : null; }
export function dayLabel(value, options = {}) {
  const date = parseDay(value);
  return date ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', ...options }).format(date) : '';
}
export function shortDate(value) {
  const date = parseDay(value);
  return date ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short' }).format(date).replace('.', '') : '';
}
export function isEarly(event, issue) { return event.date > issue.periodEnd && event.category !== 'exhibition'; }
export function moscowToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key).value).join('-');
}
export function isPast(event, today = moscowToday(), issue) {
  const exhibitionWindow = event.category === 'exhibition' && event.origin !== 'community' && issue?.eventIds?.includes(event.id) ? issue.periodEnd : '';
  return (event.endDate || exhibitionWindow || event.date) < today;
}
export function selectFeatured(events, celebration, now = Date.now()) {
  const special = events.find(event => event.id === celebration?.eventId);
  if (special && now >= Date.parse(celebration.featuredFrom) && now < Date.parse(celebration.featuredUntil)) return special;
  return events.find(event => event.priority === 1) || events.find(event => event.id !== celebration?.eventId) || events[0];
}
export function filterEvents(events, issue, filters, votes = {}) {
  const ids = new Set(issue?.eventIds || []);
  const query = (filters.query || '').trim().toLocaleLowerCase('ru');
  const today = filters.today || moscowToday();
  return events.filter(event => filters.current ? (filters.past ? isPast(event, today, issue) : (ids.has(event.id) || event.origin === 'community') && !isPast(event, today, issue)) : ids.has(event.id))
    .filter(event => !filters.communityOnly || event.origin === 'community')
    .filter(event => !filters.category || filters.category === 'all' || event.category === filters.category)
    .filter(event => !query || [event.title, event.venue, event.description, event.tags?.join(' ')].join(' ').toLocaleLowerCase('ru').includes(query))
    .filter(event => !filters.company || (votes[event.id] || []).some(vote => vote.status === 'going'))
    .filter(event => !filters.mine || (votes[event.id] || []).some(vote => vote.memberId === filters.memberId && vote.status !== 'pass'))
    .sort((a, b) => {
      const count = (event, status) => (votes[event.id] || []).filter(v => v.status === status).length;
      if (filters.sort === 'interest') { const rank = count(b, 'going') - count(a, 'going') || count(b, 'interested') - count(a, 'interested'); if (rank) return rank; }
      return (filters.past ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || (a.time || '').localeCompare(b.time || '');
    });
}
