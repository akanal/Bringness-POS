(() => {
 // Quote every cell and prevent spreadsheet applications from interpreting
 // ingredient or location names as formulas. UTF-8 BOM supports Excel umlauts.
 function cell(value) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
 }
 function serialize(rows) {
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
 }
 function download(rows, filename) {
  const url = URL.createObjectURL(new Blob([serialize(rows)], {type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
 }
 globalThis.BringnessCsv = {serialize, download};
})();
