import fs from 'node:fs';
const source=new URL('../apps/web/public/shared-language-catalog.json',import.meta.url);
const target=new URL('../apps/web/public/shared-language-snapshot.js',import.meta.url);
const catalog=JSON.parse(fs.readFileSync(source,'utf8'));
fs.writeFileSync(target,'// Generated offline snapshot of shared-language-catalog.json; checked by language tests.\nwindow.BringnessLanguageCatalog='+JSON.stringify(catalog)+';\n');
