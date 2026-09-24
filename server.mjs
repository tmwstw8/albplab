import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 4173);

createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') {
      response.writeHead(302, { location: '/albp/index.html', 'cache-control': 'no-store' });
      response.end();
      return;
    }
    const path = resolve(root, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Invalid path');
    const info = await stat(path);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`ALBP Lab: http://127.0.0.1:${port}/albp/index.html`);
  console.log(`Kara 2006: http://127.0.0.1:${port}/kara/index.html`);
  console.log(`Manavizadeh 2015: http://127.0.0.1:${port}/manavizadeh/index.html`);
  console.log(`Zengin crossover SA: http://127.0.0.1:${port}/zengin/index.html`);
});
