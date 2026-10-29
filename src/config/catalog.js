export const PROJECT = {
  name: 'Банный лист',
  title: 'Альманах',
  city: 'Петербург',
  telegram: 'https://t.me/c/1178604122/88757',
  api: (window.ALMANAC_API || '').trim(),
};
export const CATEGORIES = [
  { id: 'all', label: 'Всё' },
  { id: 'concert', label: 'Концерты' },
  { id: 'club', label: 'Ночи' },
  { id: 'theatre', label: 'Театр' },
  { id: 'exhibition', label: 'Выставки' },
  { id: 'meeting', label: 'Встречи' },
  { id: 'festival', label: 'Фестивали' },
  { id: 'other', label: 'Другое' },
];
export const STATUS = { interested: 'Интересно', going: 'Пойду', pass: 'Пропускаю' };
