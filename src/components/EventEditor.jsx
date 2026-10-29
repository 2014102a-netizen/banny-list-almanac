import { useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { CATEGORIES } from '../config/catalog';
import { eventImage } from '../config/media';
import { request } from '../lib/api';
import { dayLabel, moscowToday } from '../lib/events';

const empty = { sourceUrl: '', title: '', date: '', endDate: '', time: '', venue: '', address: '', category: 'other', priceLabel: '', description: '', why: '', details: '', imageUrl: '' };
export function EventCover({ event, className = 'event-cover' }) {
  const [failed, setFailed] = useState('');
  const src = eventImage(event);
  return src && src !== failed ? <img className={className} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(src)} /> : null;
}
export default function EventEditor({ event, revision, session, onSaved, onDuplicate, onExpired }) {
  const [draft, setDraft] = useState(() => event ? { ...empty, ...event, sourceUrl: event.sources[0]?.url || '' } : empty);
  const [step, setStep] = useState(event ? 'edit' : 'link');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [duplicateId, setDuplicateId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  function change(key, value) { setDraft(previous => ({ ...previous, [key]: value })); setConfirmed(false); setError(''); setDuplicateId(''); }
  async function preview(e) {
    e?.preventDefault(); setBusy('preview'); setError('');
    try {
      const data = await request({ action: 'preview_event', session: session.token, url: draft.sourceUrl });
      setDraft(previous => ({ ...previous, ...data.draft })); setStep('edit');
      setNotice(data.manual ? 'Страница отдала мало данных. Заполните карточку и проверьте дату.' : 'Данные со страницы. Проверьте дату, место и цену перед публикацией.');
    } catch (error) {
      if (error.code === 'expired_session') { onExpired(); return; }
      setError(error.message);
      if (error.code !== 'invalid_url') setStep('edit');
    } finally { setBusy(''); }
  }
  async function save(e) {
    e.preventDefault(); setError(''); if (!confirmed) return;
    setBusy('save');
    try {
      const data = await request({ action: 'save_event', session: session.token, requestId: requestId.current, eventId: event?.id, revision, event: draft });
      onSaved(data);
    } catch (error) {
      if (error.code === 'expired_session') { onExpired(); return; }
      setError(error.code === 'network' ? 'Ответ сервера задержался. Повторите публикацию: повторная попытка сохранит одну карточку.' : error.message);
      if (error.eventId) setDuplicateId(error.eventId);
    } finally { setBusy(''); }
  }
  return <div className="event-editor">
    <p className="editor-intro">{event ? 'Исправления появятся у всех участников.' : 'Событие появится сразу. Актуальные предложения учтём в ближайшем четверговом выпуске.'}</p>
    <form onSubmit={step === 'link' ? preview : save}>
      <fieldset disabled={Boolean(busy)}>
        <label className="editor-field">Ссылка на событие<input autoFocus type="url" value={draft.sourceUrl} onChange={e => change('sourceUrl', e.target.value)} placeholder="https://…" required maxLength={2000} /></label>
        {step === 'link' ? <div className="editor-actions"><button className="primary-button" type="submit">{busy ? 'Читаем страницу…' : 'Получить данные'}<ArrowRight size={17} /></button><button className="text-button" type="button" onClick={() => setStep('edit')}>Заполнить вручную</button></div> : <>
          {!event && <button className="text-button read-link" type="button" onClick={preview}>{busy === 'preview' ? 'Читаем страницу…' : 'Обновить данные по ссылке'}<ArrowUpRight size={15} /></button>}
          {notice && <p className="editor-notice" role="status">{notice}</p>}
          <label className="editor-field">Название<input value={draft.title} onChange={e => change('title', e.target.value)} required minLength={3} maxLength={160} /></label>
          <div className="editor-columns"><label className="editor-field">Дата начала<input type="date" value={draft.date} min={moscowToday()} onChange={e => change('date', e.target.value)} required /></label><label className="editor-field">Время<input type="time" value={draft.time} onChange={e => change('time', e.target.value)} /></label></div>
          <div className="editor-columns"><label className="editor-field">Дата завершения <span>Для ночи или нескольких дней</span><input type="date" value={draft.endDate} min={draft.date || moscowToday()} onChange={e => change('endDate', e.target.value)} /></label><label className="editor-field">Категория<select value={draft.category} onChange={e => change('category', e.target.value)}>{CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label></div>
          <label className="editor-field">Место<input value={draft.venue} onChange={e => change('venue', e.target.value)} required maxLength={160} placeholder="Площадка или место встречи" /></label>
          <div className="editor-columns"><label className="editor-field">Адрес<input value={draft.address} onChange={e => change('address', e.target.value)} maxLength={250} /></label><label className="editor-field">Цена<input value={draft.priceLabel} onChange={e => change('priceLabel', e.target.value)} maxLength={100} placeholder="Бесплатно / от 1500 ₽" /></label></div>
          <label className="editor-field">Почему зову<textarea value={draft.why} onChange={e => change('why', e.target.value)} maxLength={400} rows={3} placeholder="Одна фраза для остальных банщиков" /></label>
          <details className="editor-extra"><summary>Описание, условия и изображение</summary><label className="editor-field">Описание<textarea value={draft.description} onChange={e => change('description', e.target.value)} maxLength={1000} rows={4} /></label><label className="editor-field">Условия и регистрация<textarea value={draft.details} onChange={e => change('details', e.target.value)} maxLength={1000} rows={2} /></label><label className="editor-field">Ссылка на изображение<input type="url" value={draft.imageUrl} onChange={e => change('imageUrl', e.target.value)} maxLength={2000} placeholder="https://…" /></label></details>
          <div className="editor-preview"><span className="small-label">Так увидят банщики</span><EventCover event={draft} /><div className="event-card-top"><span className="event-date">{draft.date ? dayLabel(draft.date) : 'Выберите дату'}{draft.time && ` · ${draft.time}`}</span><span className="event-price">{draft.priceLabel || 'Цена уточняется'}</span></div><h3>{draft.title || 'Название события'}</h3><p className="event-venue">{draft.venue || 'Место проведения'}</p><p className="event-description">{draft.why || draft.description || 'Здесь появится ваше приглашение.'}</p></div>
          <label className="editor-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required /><span>Проверил дату и место. Карточка и ссылка будут доступны всем посетителям альманаха.</span></label>
          <div className="editor-actions"><button className="primary-button" type="submit" disabled={!confirmed}>{busy === 'save' ? 'Сохраняем…' : event ? 'Сохранить изменения' : 'Опубликовать событие'}<ArrowRight size={17} /></button></div>
        </>}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      {duplicateId && <button type="button" className="text-button" onClick={() => onDuplicate(duplicateId)}>Открыть существующую карточку <ArrowUpRight size={16} /></button>}
    </form>
  </div>;
}
