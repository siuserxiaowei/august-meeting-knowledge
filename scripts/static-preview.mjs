import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 4321);
const root = path.resolve('dist');
const base = `/${(process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '');
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2']
]);

async function existingFile(relativePath) {
  const safePath = path.resolve(root, relativePath.replace(/^\/+/, ''));
  if (safePath !== root && !safePath.startsWith(`${root}${path.sep}`)) return undefined;

  try {
    const details = await stat(safePath);
    if (details.isDirectory()) return path.join(safePath, 'index.html');
    return safePath;
  } catch {
    return undefined;
  }
}

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || '/', `http://${host}`).pathname);
  const insideBase = !base || pathname === base || pathname.startsWith(`${base}/`);
  const relativePath = insideBase ? pathname.slice(base.length) || '/' : '__outside_base__';
  const filePath = await existingFile(relativePath);
  const selectedPath = filePath || path.join(root, '404.html');

  try {
    const body = await readFile(selectedPath);
    response.statusCode = filePath ? 200 : 404;
    response.setHeader('Content-Type', mimeTypes.get(path.extname(selectedPath)) || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.statusCode = 500;
    response.end('Preview server could not read the build output.');
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Static preview: http://${host}:${port}${base || '/'}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
