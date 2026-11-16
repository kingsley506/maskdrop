import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildStandalone } from '../scripts/build-standalone.js';

const hash = text => createHash('sha256').update(text).digest('base64');

test('standalone release is deterministic, complete and limited by exact CSP hashes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maskdrop-build-test-'));
  try {
    const output = join(directory, 'maskdrop.html');
    const metadata = await buildStandalone(output);
    const html = await readFile(output, 'utf8');
    assert.equal(metadata.bytes, Buffer.byteLength(html));
    await buildStandalone(join(directory, 'again.html'));
    assert.equal(html, await readFile(join(directory, 'again.html'), 'utf8'));

    const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
    const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
    assert.ok(script, 'the application script is inlined');
    assert.ok(style, 'the stylesheet is inlined');
    assert.doesNotMatch(script, /^\s*(?:import|export)\s/m);
    assert.match(script, /function analyze\(/);
    assert.match(script, /function toMarkdown\(/);
    assert.match(script, /const samples =/);
    assert.match(script, /setSource\(samples\.incident/);
    assert.doesNotMatch(html, /<script[^>]+\bsrc=|<link[^>]+rel="stylesheet"/);
    assert.doesNotMatch(html, /(?:src|href)="\.\/public\//);
    assert.equal((html.match(/data:image\/svg\+xml,/g) || []).length, 2);

    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
    assert.ok(csp);
    assert.ok(csp.includes(`script-src 'sha256-${hash(script)}'`));
    assert.ok(csp.includes(`style-src 'sha256-${hash(style)}'`));
    for (const directive of ["default-src 'none'", 'img-src data:', "connect-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(directive), directive);
    assert.doesNotMatch(csp, /unsafe-inline|'self'|https?:/);

    const original = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const ids = [...original.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    for (const id of ids) assert.ok(html.includes(`id="${id}"`), `DOM target ${id} is retained`);
    const modulePath = join(directory, 'app.mjs');
    await writeFile(modulePath, script);
    const syntax = spawnSync(process.execPath, ['--check', modulePath], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
