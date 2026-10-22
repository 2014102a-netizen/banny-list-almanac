#!/usr/bin/env python3
"""Подготовить статическую папку docs/ для GitHub Pages после npm run build."""
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'dist'
target=ROOT/'docs'
if not (source/'index.html').is_file():
    raise SystemExit('Сначала выполните npm run build.')
if target.exists():
    shutil.rmtree(target)
shutil.copytree(source,target)
(target/'.nojekyll').touch()
print('Статическая папка docs/ подготовлена.')
