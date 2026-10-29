#!/usr/bin/env python3
"""Выбрать предложения участников для номера из публичного каталога API."""
import argparse
import json
import urllib.request
from datetime import date, timedelta
from pathlib import Path

def candidates(catalog, start, end):
    return sorted((e for e in catalog['events'] if e.get('origin')=='community' and (e.get('endDate') or e['date'])>=start and e['date']<=end),key=lambda e:(e['date'],e.get('time','')))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start',default=date.today().isoformat())
    parser.add_argument('--end')
    parser.add_argument('--catalog',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    end=args.end or (date.fromisoformat(args.start)+timedelta(days=14)).isoformat()
    if args.catalog:
        catalog=json.loads(args.catalog.read_text())
    else:
        config=json.loads((Path(__file__).resolve().parents[2]/'telegram-almanac/web_app.json').read_text())
        with urllib.request.urlopen(config['api_url'],timeout=45) as response:
            result=json.load(response)
        if not result.get('ok'):raise RuntimeError('Публичный API вернул ошибку')
        catalog=result['catalog']
    selected=candidates(catalog,args.start,end)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps({'periodStart':args.start,'periodEnd':end,'events':selected},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'count':len(selected),'output':str(args.output)},ensure_ascii=False))

if __name__=='__main__':main()
