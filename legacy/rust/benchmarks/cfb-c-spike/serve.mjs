import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
const fixtures = new URL('../../crates/hwp-core/tests/fixtures/', import.meta.url);
const names = readdirSync(fixtures).filter(name => name.endsWith('.hwp'));
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let body;
  let type = 'application/octet-stream';
  if (path === '/') {
    body = readFileSync(new URL('./browser.html', import.meta.url));
    type = 'text/html; charset=utf-8';
  } else if (path === '/probe.wasm') {
    body = readFileSync(new URL('./probe.wasm', import.meta.url));
    type = 'application/wasm';
  } else if (path === '/fixtures') {
    body = JSON.stringify(names);
    type = 'application/json';
  } else if (path.startsWith('/fixture/') && names.includes(path.slice(9))) {
    body = readFileSync(new URL(path.slice(9), fixtures));
  } else { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': type });
  res.end(body);
}).listen(11309, '127.0.0.1', () => console.log('http://127.0.0.1:11309'));
