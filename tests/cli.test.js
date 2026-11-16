import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, link, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../bin/maskdrop.js', import.meta.url));
function run(args = [], input = '') {
  return spawnSync(process.execPath, [cliPath, ...args], { input, encoding: 'utf8', maxBuffer: 3 * 1024 * 1024 });
}
async function withTemp(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'maskdrop-test-'));
  try { await fn(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('CLI redacts stdin and writes only the transformed text to stdout', () => {
  const result = run([], 'Owner: alice@example.com\r\nStatus: 500');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Owner: \[EMAIL_1\]\r\nStatus: 500$/);
  assert.equal(result.stderr, '');
});

test('CLI preserves plain text, Unicode, CRLF and BOM with no extra newline', () => {
  const input = '\ufeffEverything fine — 你好\r\n42';
  const result = run([], input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, input);
});

test('CLI supports repeated literal custom terms and secrets-only', () => {
  const result = run(['--secrets-only', '--term', 'Acme Corp', '--term', '客户甲'], 'Acme Corp contacts 客户甲 at alice@example.com');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Acme Corp|客户甲/);
  assert.match(result.stdout, /alice@example\.com/);
});

test('CLI report contains only counts and detector kinds', () => {
  const result = run(['--report'], 'alice@example.com and alice@example.com');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stderr);
  assert.equal(report.redacted, 2);
  assert.equal(Object.values(report.byKind).reduce((a, b) => a + b, 0), 2);
  assert.doesNotMatch(result.stderr, /alice|example/);
});

test('CLI refuses oversized and invalid UTF-8 input', () => {
  assert.equal(run([], 'x'.repeat(1024 * 1024 + 1)).status, 1);
  const invalid = spawnSync(process.execPath, [cliPath], { input: Buffer.from([0xc3, 0x28]), encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /UTF-8/);
  assert.equal(invalid.stdout, '');
});

test('CLI rejects unknown options and missing values', () => {
  for (const args of [['--bad'], ['--file'], ['--term'], ['--out', '--report'], ['--file', 'a', '--file', 'b']]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
  }
});

test('CLI exposes help and version', () => {
  assert.match(run(['--help']).stdout, /--secrets-only/);
  assert.equal(run(['--version']).stdout, '0.1.0\n');
});

test('CLI writes a new output file without overwriting an existing file', async () => withTemp(async directory => {
  const source = join(directory, 'input.txt');
  const output = join(directory, 'output.txt');
  await writeFile(source, 'alice@example.com');
  let result = run(['--file', source, '--out', output]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(await readFile(output, 'utf8'), '[EMAIL_1]');
  if (process.platform !== 'win32') assert.equal((await stat(output)).mode & 0o777, 0o600);
  await writeFile(output, 'keep me');
  result = run(['--file', source, '--out', output]);
  assert.equal(result.status, 1);
  assert.equal(await readFile(output, 'utf8'), 'keep me');
  result = run(['--file', source, '--out', output, '--force']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(output, 'utf8'), '[EMAIL_1]');
}));

test('CLI refuses to overwrite its input even with --force or a hard link', async () => withTemp(async directory => {
  const source = join(directory, 'input.txt');
  const alias = join(directory, 'alias.txt');
  await writeFile(source, 'alice@example.com');
  await link(source, alias);
  for (const output of [source, alias]) {
    const result = run(['--file', source, '--out', output, '--force']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /different files/);
  }
  assert.equal(await readFile(source, 'utf8'), 'alice@example.com');
}));
