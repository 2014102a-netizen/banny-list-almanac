import { PROJECT } from '../config/catalog';

export class ApiError extends Error {
  constructor(message, code = 'network') { super(message); this.code = code; }
}
const messages = {
  bad_password: 'Пароль не подошёл. Проверьте его и попробуйте снова.',
  expired_session: 'Войдите ещё раз: время сессии истекло.',
  not_configured: 'Вход временно недоступен. Попробуйте позже.',
  invalid_name: 'Введите имя от 2 до 40 символов.',
  rate_limit: 'Слишком много попыток. Попробуйте через несколько минут.',
  invalid_event: 'Событие уже изменилось. Обновите афишу.',
  invalid_status: 'Выберите одну из трёх отметок.',
  invalid_url: 'Вставьте полную ссылку https:// на общедоступную страницу.',
  required_fields: 'Заполните название и место проведения.',
  invalid_date: 'Проверьте дату: начало сегодня или позже, завершение после начала.',
  invalid_time: 'Укажите время в формате 19:00.',
  invalid_category: 'Выберите категорию события.',
  duplicate_event: 'Это событие уже есть в альманахе.',
  forbidden: 'Изменить событие может его автор после входа.',
  edit_conflict: 'Карточка уже изменилась. Откройте её заново и повторите правку.',
  preview_limit: 'Много ссылок за минуту. Подождите или заполните карточку вручную.',
  submission_limit: 'Сегодня добавлено уже 20 событий. Продолжить можно завтра.',
  community_unavailable: 'Добавление событий временно недоступно. Попробуйте позже.',
};
export async function request(body) {
  if (!PROJECT.api) throw new ApiError('Отметки пока недоступны. Афиша работает.', 'not_configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), body?.action === 'preview_event' ? 45000 : 30000);
  try {
    const response = await fetch(PROJECT.api, body ? {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), signal: controller.signal, redirect: 'follow',
    } : { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('http');
    const data = await response.json();
    if (!data.ok) { const error = new ApiError(messages[data.error] || 'Сохранить не получилось. Попробуйте ещё раз.', data.error); error.eventId = data.eventId; throw error; }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Связь прервалась. Обновите страницу или попробуйте ещё раз.');
  } finally { clearTimeout(timer); }
}
export const sessionStore = {
  get() { try { return JSON.parse(sessionStorage.getItem('almanac-session')); } catch { return null; } },
  set(value) { try { value ? sessionStorage.setItem('almanac-session', JSON.stringify(value)) : sessionStorage.removeItem('almanac-session'); } catch {} },
};
