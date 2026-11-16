import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
}

function get(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('local static server isolates web assets and sends restrictive headers', { timeout: 10000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'maskdrop-server-test-'));
  let child;
  try {
    for (const name of ['scripts', 'src', 'public', '.git']) await mkdir(join(directory, name));
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    await writeFile(join(directory, 'index.html'), '<!doctype html><title>Fixture</title>');
    await writeFile(join(directory, 'src', 'app.js'), 'export const fixture = true;');
    await writeFile(join(directory, '.env'), 'DO_NOT_SERVE=fixture-secret');
    await writeFile(join(directory, '.git', 'config'), 'private-git-config');
    await copyFile(fileURLToPath(new URL('../scripts/serve.js', import.meta.url)), join(directory, 'scripts', 'serve.js'));
    if (process.platform !== 'win32') {
      await symlink(join(directory, '.env'), join(directory, 'src', 'leak.js'));
      await symlink(join(directory, '..'), join(directory, 'public', 'outside'));
    }
    const port = await freePort();
    child = spawn(process.execPath, [join(directory, 'scripts', 'serve.js')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(([code]) => { throw new Error(`Fixture server exited with ${code}`); }),
    ]);

    await t.test('serves index and JavaScript with correct MIME and no-store', async () => {
      const index = await get(port, '/');
      assert.equal(index.status, 200);
      assert.match(index.headers['content-type'], /^text\/html/);
      assert.equal(index.body, '<!doctype html><title>Fixture</title>');
      assert.equal(index.headers['cache-control'], 'no-store');
      const script = await get(port, '/src/app.js?cache-test=1');
      assert.equal(script.status, 200);
      assert.match(script.headers['content-type'], /^text\/javascript/);
      assert.equal(script.headers['x-content-type-options'], 'nosniff');
    });

    await t.test('CSP forbids connections, inline scripts, embeds and forms', async () => {
      const { headers } = await get(port, '/');
      const csp = headers['content-security-policy'];
      for (const directive of ["script-src 'self'", "style-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"]) assert.ok(csp.includes(directive), directive);
      assert.ok(!csp.includes('unsafe-inline'));
      assert.equal(headers['referrer-policy'], 'no-referrer');
    });

    await t.test('does not serve configuration, git files or traversal targets', async () => {
      for (const path of ['/package.json', '/.env', '/.git/config', '/scripts/serve.js', '/src/../../.env', '/src/..%2f..%2f.env', '/src/%2e%2e/%2e%2e/.git/config']) {
        const response = await get(port, path);
        assert.equal(response.status, 404, path);
        assert.equal(response.body, 'Not found', path);
      }
    });

    await t.test('blocks symlinks into private files and outside the root', async () => {
      if (process.platform === 'win32') return;
      assert.equal((await get(port, '/src/leak.js')).status, 404);
      assert.equal((await get(port, '/public/outside/unrelated.svg')).status, 404);
    });

    await t.test('rejects POST and provides body-free HEAD responses', async () => {
      const post = await get(port, '/', 'POST');
      assert.equal(post.status, 405);
      assert.equal(post.headers.allow, 'GET, HEAD');
      const head = await get(port, '/src/app.js', 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.body, '');
      assert.ok(Number(head.headers['content-length']) > 0);
    });
  } finally {
    if (child && child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
