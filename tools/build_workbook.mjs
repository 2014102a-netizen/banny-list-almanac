import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await fs.readFile(path.join(root, 'public/data/catalog.json'), 'utf8'));
const out = path.join(root, 'tmp');
await fs.mkdir(out, { recursive: true });
const wb = Workbook.create();
const date = value => value ? Date.parse(`${value}T00:00:00Z`) / 86400000 + 25569 : null;
const data = [
  ['События', ['ID', 'Название', 'Категория', 'Дата', 'Завершение', 'Время', 'Площадка', 'Адрес', 'Цена от, ₽', 'Цена и категория', 'Описание', 'Зачем идти', 'Условия', 'Теги', 'Приоритет', 'Источники JSON', 'Проверено'],
    catalog.events.map(e => [e.id,e.title,e.category,date(e.date),date(e.endDate),e.time,e.venue,e.address,e.price,e.priceLabel,e.description,e.why,e.details,e.tags.join(', '),e.priority,JSON.stringify(e.sources),date(e.checkedOn)])],
  ['Выпуски', ['ID', 'Название', 'Опубликован', 'Начало периода', 'Конец периода', 'ID событий JSON', 'Word в Telegram'],
    catalog.issues.map(i=>[i.id,i.title,date(i.publishedAt),date(i.periodStart),date(i.periodEnd),JSON.stringify(i.eventIds),i.documentUrl])],
  ['Участники', ['ID', 'Имя', 'Присоединился'], []],
  ['Отметки', ['ID события', 'ID участника', 'Отметка', 'Обновлено'], []],
];
for (const [name, headers, rows] of data) {
  const sheet = wb.worksheets.add(name);
  const used = sheet.getRangeByIndexes(0,0,rows.length+1,headers.length);
  used.values = [headers, ...rows];
  used.format.font = { name: 'Arial', size: 11, color: '#202124' };
  used.format.verticalAlignment = 'top';
  used.format.wrapText = true;
  used.format.columnWidthPx = 160;
  const header=sheet.getRangeByIndexes(0,0,1,headers.length);
  header.format.fill = '#EEEEEE';
  header.format.font.bold = true;
  header.format.rowHeightPx = 40;
  sheet.showGridLines = true;
  if (rows.length) {
    sheet.freezePanes.freezeRows(1);
    sheet.freezePanes.freezeColumns(name==='События'?2:1);
    sheet.getRangeByIndexes(1,0,rows.length,headers.length).format.rowHeightPx = 96;
  }
  if (name==='События') {
    for(const col of ['D','E','Q']) sheet.getRange(`${col}2:${col}${rows.length+1}`).setNumberFormat('dd.mm.yyyy');
    sheet.getRange(`I2:I${rows.length+1}`).setNumberFormat('#,##0');
    sheet.getRange(`A1:A${rows.length+1}`).format.columnWidthPx=220;
    sheet.getRange(`B1:B${rows.length+1}`).format.columnWidthPx=240;
    for(const col of ['D','E','Q']) sheet.getRange(`${col}1:${col}${rows.length+1}`).format.columnWidthPx=115;
    for(const col of ['H','K','L','M']) sheet.getRange(`${col}1:${col}${rows.length+1}`).format.columnWidthPx=380;
    sheet.getRange(`P1:P${rows.length+1}`).format.columnWidthPx=700;
    sheet.getRange(`C2:C${rows.length+1}`).dataValidation={rule:{type:'list',values:['concert','club','theatre','exhibition']}};
    sheet.getRange(`A2:Q${rows.length+1}`).format.autofitRows();
  }
  if(name==='Выпуски') {
    sheet.getRange('B1:B3').format.columnWidthPx=240;
    sheet.getRange('C2:E3').setNumberFormat('dd.mm.yyyy');
    sheet.getRange('F1:F3').format.columnWidthPx=650;
    sheet.getRange('G1:G3').format.columnWidthPx=450;
    sheet.getRange('A2:G3').format.autofitRows();
  }
  const preview=await wb.render({sheetName:name,range:name==='События'?'A1:G6':name==='Выпуски'?'A1:E3':name==='Участники'?'A1:C4':'A1:D4',scale:1.5,format:'png'});
  await fs.writeFile(path.join(out,`sheet-${name}.png`),new Uint8Array(await preview.arrayBuffer()));
}
wb.recalculate();
console.log((await wb.inspect({kind:'sheet',include:'id,name',maxChars:1500})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',options:{useRegex:true,maxResults:20},maxChars:1000})).ndjson);
await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(out,'almanac-source.xlsx'));
console.log(JSON.stringify({file:path.join(out,'almanac-source.xlsx'),events:catalog.events.length,issues:catalog.issues.length}));
