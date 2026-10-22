#!/usr/bin/env python3
"""Первоначальная афиша из двух проверенных Word-выпусков."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = Path(__file__).resolve().parents[1]
CURRENT = ROOT / 'telegram-almanac/issues/2026-10-23-expanded.json'
OLD = ROOT / 'tmp/almanac-2026-10-22/events.json'

INFO = {
    'rockets': ['concert', '2026-10-25', '', '19:00', 'BASE', 'Кондратьевский проспект, 44', 3700, ['Франция', 'Спейс-рок'], 1],
    'megi': ['concert', '2026-10-30', '', '20:00', 'Космонавт', 'Бронницкая улица, 24', 2500, ['Грузинская сцена', 'Вокал'], 4],
    'sadist': ['concert', '2026-11-28', '', '', 'Factory 3', 'Кожевенная линия, 40Д', 3300, ['Италия', 'Дэт-метал'], 3],
    'turner': ['concert', '2026-12-06', '', '20:00', 'Jagger', 'Площадь Конституции, 2', 2500, ['Зарубежный артист', 'Рок'], 3],
    'k30': ['club', '2026-10-30', '', '23:00', 'К-30', 'Красного Текстильщика, 10–12АШ', 1600, ['Рейв', 'Сценография'], 1],
    'darkwave': ['club', '2026-10-31', '', '19:00–03:00', 'Брусницын холл', 'Кожевенная линия, 30', 1700, ['Darkwave', 'Witch house'], 1],
    'dnb': ['club', '2026-10-31', '', '22:00', 'A2', 'Проспект Медиков, 3', 2400, ['Drum & bass', 'Два танцпола'], 4],
    'katapulta': ['theatre', '2026-10-24', '', '20:00', 'Невидимый театр', 'Исткабель, Кожевенная линия, 34', 1700, ['Независимый театр'], 2],
    'radio': ['theatre', '2026-10-25', '', '19:00', 'Узел / АТС', 'Некрасова, 3–5, 3-й этаж; отдельный вход из переулка у граффити Цоя', 1400, ['Премьера', 'Живая музыка'], 1],
    'zveri': ['theatre', '2026-10-27', '', '20:00', 'Узел / АТС', 'Некрасова, 3–5, 3-й этаж; отдельный вход из переулка у граффити Цоя', 1600, ['Музыкальный ритуал', 'Видео'], 2],
    'branco': ['theatre', '2026-11-04', '', '20:00', 'Узел / АТС', 'Некрасова, 3–5, 3-й этаж; отдельный вход из переулка у граффити Цоя', 2000, ['Фантасмагория', 'Участие зрителей'], 2],
    'text': ['exhibition', '2026-10-23', '2027-01-10', 'По экскурсионным сеансам', 'Стрит-арт хранение', 'Севкабель Порт, НИИ, Кожевенная линия, 40', None, ['Новая выставка', 'Стрит-арт'], 1],
    'body': ['exhibition', '2026-08-15', '2026-12-22', 'Вт–пт 12–22 · сб–вс 11–22', 'Исткабель', 'Корпус 3, 4-й этаж', 800, ['Инсталляции', 'Хоррор'], 3],
    'august': ['exhibition', '2026-08-11', '', 'Вт–вс 12–20', 'Галерея Джессика', 'Брусницын, Морской фасад, 1-й этаж, Кожевенная линия, 30', 350, ['Графика', 'Видео'], 3],
}
TITLES = {'rockets':'Rockets', 'megi':'Меги Гогитидзе', 'sadist':'Sadist', 'turner':'Joe Lynn Turner', 'k30':'Два королевства', 'darkwave':'DARK WAVE', 'dnb':'Затмение', 'katapulta':'Катапульта', 'radio':'Радио «Манхэттен»', 'zveri':'Время зверей', 'branco':'Гипнотеатр Бранко Душича', 'text':'Текстоцентричность', 'body':'В.Н.Е / Body Horror', 'august':'Август / Маша Ша'}

def current_event(item):
    key = item['id']
    category, date, end, time, venue, address, price, tags, priority = INFO[key]
    return dict(id=f'{key}-{date}', title=TITLES[key], category=category, date=date, endDate=end, time=time,
                venue=venue, address=address, price=price, priceLabel=('По сеансам' if price is None else f'от {price:,} ₽'.replace(',', ' ')),
                description=item['body'], why=item['why'], details=item['cost']+' '+item['meta'],
                sources=[{'label':label,'url':url} for label,url in item['sources']], tags=tags, priority=priority, checkedOn='2026-10-23')

def main():
    source = json.loads(CURRENT.read_text())
    events = [current_event(e) for e in source['events']]
    zveri = next(e for e in events if e['id'].startswith('zveri-'))
    second = {**zveri, 'id':'zveri-2026-10-28', 'date':'2026-10-28', 'price':None, 'priceLabel':'Уточнить цену'}
    second['details'] = 'Категорию и цену на 28 октября уточнить у продавца. 20:00; 60 минут; 16+.'
    zveri['details'] = 'От 1 600 ₽ на Яндекс Афише для 27 октября. 20:00; 60 минут; 16+.'
    events.append(second)
    current_ids = [e['id'] for e in events]
    previous_ids = []
    if OLD.exists():
        old = json.loads(OLD.read_text())
        for e in old['events']:
            date = f"2026-{e['date'][3:5]}-{e['date'][:2]}"
            stable = f"{e['id']}-{date}"
            previous_ids.append(stable)
            if stable in {x['id'] for x in events}:
                continue
            category = 'club' if e['id'] in ['delina','samain'] else 'concert'
            events.append(dict(id=stable,title=e['name'],category=category,date=date,endDate='',time=e['time'],venue=e['venue'],address=e['meta'],price=None,priceLabel=e['price'],description=e['body'],why=e['why'],details=e['cost'],tags=['Архив'],priority=5,checkedOn='2026-10-22',sources=[{'label':label,'url':url} for label,url in e['sources']]))
    catalog = dict(version=1, checkedOn='2026-10-23', currentIssue='2', events=events, issues=[
        dict(id='2',title='23 октября — 6 ноября',publishedAt='2026-10-23',periodStart='2026-10-23',periodEnd='2026-11-06',eventIds=current_ids,documentUrl='https://t.me/c/1178604122/88757/88762'),
        dict(id='1',title='22 октября — 5 ноября',publishedAt='2026-10-22',periodStart='2026-10-22',periodEnd='2026-11-05',eventIds=previous_ids,documentUrl='https://t.me/c/1178604122/88757/88760')
    ])
    target=APP/'public/data/catalog.json'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'events':len(events),'current':len(current_ids),'issues':len(catalog['issues'])}))

if __name__=='__main__': main()
