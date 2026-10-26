const fs = require('node:fs');
const ExcelJS = require('exceljs');
const parse = p => Object.fromEntries(fs.readFileSync(p, 'utf8').trim().split('\n').slice(1).map(x=>{const [name,total]=x.split(','); return [name,Number(total)]}));
(async()=>{
  const before=parse('before.csv'), after=parse('after.csv');
  const rows=Object.entries(before).map(([name,previous])=>({name,previous,current:after[name]??0,change:(after[name]??0)-previous}));
  const dropped=rows.filter(r=>r.change<0);
  const book=new ExcelJS.Workbook();
  const sheet=book.addWorksheet('Customer spending');
  sheet.columns=[{header:'Customer',key:'name',width:20},{header:'Before',key:'previous',width:15},{header:'After',key:'current',width:15},{header:'Change',key:'change',width:15}];
  sheet.addRows(rows); sheet.getRow(1).font={bold:true};
  const summary=book.addWorksheet('Customers spending less'); summary.columns=sheet.columns; summary.addRows(dropped); summary.getRow(1).font={bold:true};
  await book.xlsx.writeFile('sales-report.xlsx');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240"><rect width="800" height="240" fill="#101722"/><text x="30" y="35" fill="white" font-size="24">Customers with declining spend (synthetic data)</text>'+dropped.map((r,i)=>`<text x="30" y="${85+i*70}" fill="white" font-size="20">${r.name}</text><rect x="140" y="${62+i*70}" width="${-r.change/10}" height="30" fill="#ff5363"/><text x="${155-r.change/10}" y="${85+i*70}" fill="white" font-size="20">${r.change}</text>`).join('')+'</svg>';
  fs.writeFileSync('spending-drop.svg',svg);
  const result={runtime:process.version,platform:process.platform,customersCompared:rows.length,dropped,artifacts:['sales-report.xlsx','spending-drop.svg']};
  fs.writeFileSync('result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
})();
