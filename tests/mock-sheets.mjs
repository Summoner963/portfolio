// Local stand-in for Google Sheets "Publish to web" CSV export.
// Serves tests/fixtures/sheets/*.csv by gid so worker tests never touch the
// real spreadsheet or need SHEET_ID. Usage: node tests/mock-sheets.mjs [port]
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR  = fileURLToPath(new URL('./fixtures/sheets/', import.meta.url));
const PORT = Number(process.argv[2] || 8899);
// Default GIDs from getSheetGids() / wrangler.toml
const BY_GID = {
  '1132024800': 'blog', '302402061': 'skills', '0': 'projects', '245982630': 'exp',
  '1066410604': 'about', '303688554': 'faq', '1267436347': 'images', '980532084': 'featured',
};

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const name = BY_GID[u.searchParams.get('gid')];
  if (!/\/pub$/.test(u.pathname) || !name) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
  res.end(readFileSync(DIR + name + '.csv'));
}).listen(PORT, '127.0.0.1', () => console.log(`mock sheets on :${PORT}`));
