#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, sep, extname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootPath = await realpath(root);
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('MaskDrop: PORT must be an integer between 1 and 65535.');
  process.exit(1);
}
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function permitted(path) {
  return ['/index.html', '/styles.css', '/app.js', '/site.webmanifest'].includes(path)
    || /^\/src\/[a-zA-Z0-9_/-]+\.js$/.test(path)
    || /^\/public\/[a-zA-Z0-9_/-]+\.(?:svg|png|ico|webp|woff2)$/.test(path);
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end('Method not allowed');
  }
  let path;
  try {
    path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400);
    return response.end('Bad request');
  }
  if (path === '/') path = '/index.html';
  if (!permitted(path)) {
    response.writeHead(404);
    return response.end('Not found');
  }
  try {
    const file = await realpath(resolve(root, `.${path}`));
    if (!file.startsWith(`${rootPath}${sep}`)) throw new Error('Outside static root');
    if (!permitted(`/${relative(rootPath, file).split(sep).join('/')}`)) throw new Error('Not a public asset');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Content-Length': data.length });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? 'MaskDrop: port is in use. Set PORT to a free port.'
    : 'MaskDrop: the local server could not start.');
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`MaskDrop → http://localhost:${port}`));
