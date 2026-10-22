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
};
export async function request(body) {
  if (!PROJECT.api) throw new ApiError('Отметки пока недоступны. Афиша работает.', 'not_configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(PROJECT.api, body ? {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), signal: controller.signal, redirect: 'follow',
    } : { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('http');
    const data = await response.json();
    if (!data.ok) throw new ApiError(messages[data.error] || 'Сохранить не получилось. Попробуйте ещё раз.', data.error);
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
