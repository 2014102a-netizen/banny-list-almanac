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
export function selectFeatured(events, celebration, now = Date.now()) {
  const special = events.find(event => event.id === celebration?.eventId);
  if (special && now >= Date.parse(celebration.featuredFrom) && now < Date.parse(celebration.featuredUntil)) return special;
  return events.find(event => event.priority === 1) || events.find(event => event.id !== celebration?.eventId) || events[0];
}
export function filterEvents(events, issue, filters, votes = {}) {
  const ids = new Set(issue?.eventIds || []);
  const query = (filters.query || '').trim().toLocaleLowerCase('ru');
  return events.filter(event => ids.has(event.id))
    .filter(event => filters.category === 'all' || event.category === filters.category)
    .filter(event => !query || [event.title, event.venue, event.description, event.tags?.join(' ')].join(' ').toLocaleLowerCase('ru').includes(query))
    .filter(event => !filters.company || (votes[event.id] || []).some(vote => vote.status === 'going'))
    .filter(event => !filters.mine || (votes[event.id] || []).some(vote => vote.memberId === filters.memberId && vote.status !== 'pass'))
    .sort((a, b) => Number(isEarly(a, issue)) - Number(isEarly(b, issue)) || (a.category === 'exhibition') - (b.category === 'exhibition') || a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}
