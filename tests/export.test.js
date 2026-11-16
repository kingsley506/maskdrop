import test from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown } from '../src/export.js';

test('Markdown preserves snippet text, including fences inside it', () => {
  const input = 'log\n```\n# injected heading\n````\n';
  const output = toMarkdown(input);
  assert.ok(output.startsWith('## Shared snippet\n\n`````text\n'));
  assert.ok(output.includes(`${input}\x60\x60\x60\x60\x60\n`));
});

test('Markdown handles a sub-MiB snippet with hundreds of thousands of backtick runs', () => {
  const input = '`x'.repeat(400000);
  const output = toMarkdown(input);
  assert.ok(output.includes(input));
  assert.ok(output.startsWith('## Shared snippet\n\n```text\n'));
});
