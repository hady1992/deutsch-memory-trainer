import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'public');
const mime = {'.html':'text/html; charset=utf-8','.webp':'image/webp','.png':'image/png','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server = http.createServer(async (req, res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(target);
    res.writeHead(200, {'Content-Type':mime[extname(target)] || 'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':extname(target)==='.html'?'no-cache':'public, max-age=86400'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end('Not found');
  }
});
server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('DrukArt landing is running'));
