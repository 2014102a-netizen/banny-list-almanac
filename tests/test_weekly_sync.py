import importlib.util
import json
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'tools'/f'{name}.py')
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
sync=module('sync_sheet');community=module('community_candidates')
class WeeklyCommunity(unittest.TestCase):
    def setUp(self):
        self.catalog=json.loads((ROOT/'public/data/catalog.json').read_text())
        self.proposal={**self.catalog['events'][0],'id':'community-fixture','origin':'community','category':'meeting','date':'2026-11-05','endDate':'','checkedOn':''}
        self.catalog['events'].append(self.proposal)
        self.catalog['issues'][0]['eventIds'].append(self.proposal['id'])
    def test_weekly_write_preserves_community_tab_and_id(self):
        config={'sheets':{'events':1,'issues':2,'members':3,'votes':4,'community':5},'events_table_id':'known-table'}
        requests=sync.requests_for(self.catalog,config)
        event_write=next(r['updateCells'] for r in requests if r.get('updateCells',{}).get('range',{}).get('sheetId')==1)
        self.assertEqual(len(event_write['rows']),len(self.catalog['events']))
        self.assertNotIn('community-fixture',json.dumps(event_write))
        issue_write=next(r['updateCells'] for r in requests if r.get('updateCells',{}).get('range',{}).get('sheetId')==2)
        self.assertIn('community-fixture',json.dumps(issue_write))
        self.assertTrue(all(r.get('updateCells',{}).get('range',{}).get('sheetId') not in [3,4,5] for r in requests))
    def test_dates_select_ongoing_and_future_proposals(self):
        self.assertEqual(len(community.candidates(self.catalog,'2026-11-05','2026-11-19')),1)
        self.assertEqual(community.candidates(self.catalog,'2026-11-06','2026-11-20'),[])
        self.proposal['endDate']='2026-11-07'
        self.assertEqual(len(community.candidates(self.catalog,'2026-11-06','2026-11-20')),1)
        self.assertEqual(community.candidates(self.catalog,'2026-10-20','2026-11-04'),[])
if __name__=='__main__':unittest.main()
