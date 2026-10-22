#!/usr/bin/env python3
"""Сформировать batchUpdate только афиши и выпусков; участники и отметки сохраняются."""
import argparse
import json
from datetime import date
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def serial(value):
    return (date.fromisoformat(value[:10])-date(1899,12,30)).days if value else None

def cell(value):
    if value is None: return {}
    if isinstance(value,(int,float)): return {'userEnteredValue':{'numberValue':value}}
    return {'userEnteredValue':{'stringValue':str(value)}}

def requests_for(catalog,config):
    event_headers=['ID','Название','Категория','Дата','Завершение','Время','Площадка','Адрес','Цена от, ₽','Цена и категория','Описание','Зачем идти','Условия','Теги','Приоритет','Источники JSON','Проверено']
    issue_headers=['ID','Название','Опубликован','Начало периода','Конец периода','ID событий JSON','Word в Telegram']
    events=[[e['id'],e['title'],e['category'],serial(e['date']),serial(e.get('endDate')),e.get('time',''),e['venue'],e.get('address',''),e.get('price'),e.get('priceLabel',''),e['description'],e['why'],e.get('details',''),', '.join(e.get('tags',[])),e.get('priority',5),json.dumps(e['sources'],ensure_ascii=False),serial(e['checkedOn'])] for e in catalog['events']]
    issues=[[str(i['id']),i['title'],serial(i['publishedAt']),serial(i['periodStart']),serial(i['periodEnd']),json.dumps(i['eventIds'],ensure_ascii=False),i.get('documentUrl','')] for i in catalog['issues']]
    event_ids=[e['id'] for e in catalog['events']]
    if len(event_ids)!=len(set(event_ids)): raise ValueError('ID событий должны быть уникальны.')
    if any(key not in event_ids for i in catalog['issues'] for key in i['eventIds']): raise ValueError('В выпуске есть неизвестный ID события.')
    result=[]
    for name,headers,rows in [('events',event_headers,events),('issues',issue_headers,issues)]:
        sid=config['sheets'][name]
        values=[headers,*rows]
        result.append({'updateCells':{'range':{'sheetId':sid,'startRowIndex':0,'endRowIndex':len(values),'startColumnIndex':0,'endColumnIndex':len(headers)},'rows':[{'values':[cell(v) for v in row]} for row in values],'fields':'userEnteredValue'}})
        date_cols=[3,4,16] if name=='events' else [2,3,4]
        for col in date_cols:
            result.append({'repeatCell':{'range':{'sheetId':sid,'startRowIndex':1,'endRowIndex':len(values),'startColumnIndex':col,'endColumnIndex':col+1},'cell':{'userEnteredFormat':{'numberFormat':{'type':'DATE','pattern':'dd.mm.yyyy'}}},'fields':'userEnteredFormat.numberFormat'}})
    result.append({'updateTable':{'table':{'tableId':config['events_table_id'],'range':{'sheetId':config['sheets']['events'],'startRowIndex':0,'endRowIndex':len(events)+1,'startColumnIndex':0,'endColumnIndex':17}},'fields':'range'}})
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalog',type=Path)
    parser.add_argument('--config',type=Path,default=ROOT/'telegram-almanac/web_app.json')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    catalog=json.loads(args.catalog.read_text())
    config=json.loads(args.config.read_text())
    requests=requests_for(catalog,config)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps({'spreadsheet_id':config['spreadsheet_id'],'requests':requests,'include_spreadsheet_in_response':False},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'events':len(catalog['events']),'issues':len(catalog['issues']),'requests':len(requests),'output':str(args.output)},ensure_ascii=False))

if __name__=='__main__': main()
