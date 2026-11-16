import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/redact.js';

test('masks credentials while preserving JSON syntax, quoted spaces, and escaped quotes', () => {
  const source = '{"api_key":"hello world", "password":"a\\"b", "model":"small"}';
  const result = analyze(source);
  assert.equal(result.output, '{"api_key":"[SECRET_1]", "password":"[SECRET_2]", "model":"small"}');
  assert.deepEqual(JSON.parse(result.output), { api_key: '[SECRET_1]', password: '[SECRET_2]', model: 'small' });
});

test('gives repeated values stable numbered placeholders', () => {
  assert.equal(analyze('a@demo.example b@demo.example a@demo.example').output, '[EMAIL_1] [EMAIL_2] [EMAIL_1]');
});

test('findings preserve source offsets and can individually be kept', () => {
  const source = 'mail a@demo.example and a@demo.example';
  const initial = analyze(source);
  assert.equal(initial.findings.length, 2);
  const result = analyze(source, { keepIds: [initial.findings[0].id] });
  assert.equal(result.output, 'mail a@demo.example and [EMAIL_1]');
  assert.equal(result.findings[0].applied, false);
  assert.equal(result.findings[1].applied, true);
  for (const item of result.findings) assert.equal(source.slice(item.start, item.end), item.value);
});

test('detects token families and preserves Authorization schemes', () => {
  const token = 'ghp_12345678901234567890';
  const result = analyze(`Authorization: Bearer ${token}\nkey ${token}\nBasic YWxpY2U6cGFzc3dvcmQ=`);
  assert.equal(result.output, 'Authorization: Bearer [SECRET_1]\nkey [SECRET_1]\nBasic [SECRET_2]');
  assert.equal(result.findings.length, 3);
});

test('detects OpenAI, AWS, Slack and JWT credential formats', () => {
  const samples = [
    'sk-proj-abcdefghijklmNOPQRST123456789',
    'AKIA1234567890ABCDEF',
    'xoxb-1234567890-abcdefghijk',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123',
  ];
  for (const value of samples) {
    const result = analyze(`value: ${value}`);
    assert.equal(result.findings.length, 1, value);
    assert.equal(result.findings[0].value, value);
  }
});

test('masks database and HTTP userinfo without discarding hosts', () => {
  const result = analyze('postgres://alice:p%40ss@db.example:5432/app https://bob:secret@host.example/path');
  assert.equal(result.output, 'postgres://[CREDENTIAL_1]@db.example:5432/app https://[CREDENTIAL_2]@host.example/path');
});

test('masks entire multiline private keys as a single finding', () => {
  const source = 'before\n-----BEGIN RSA PRIVATE KEY-----\nabc\nemail@demo.example\n-----END RSA PRIVATE KEY-----\nafter';
  const result = analyze(source);
  assert.equal(result.output, 'before\n[PRIVATE_KEY_1]\nafter');
  assert.equal(result.findings.length, 1);
});

test('masks cookie headers including curl quoted headers', () => {
  assert.equal(analyze("curl -H 'Cookie: session=abc; theme=dark' https://demo.example").output, "curl -H 'Cookie: [COOKIE_1]' https://demo.example");
  assert.equal(analyze('Set-Cookie: session=abc; HttpOnly\nstatus: ok').output, 'Set-Cookie: [COOKIE_1]\nstatus: ok');
});

test('cookie quotes inside a header do not expose the remaining session data', () => {
  const source = 'Cookie: session="abcdef"; securetoken=superprivate';
  assert.equal(analyze(source).output, 'Cookie: [COOKIE_1]');
  assert.equal(analyze(`curl -H '${source}' https://demo.example`).output, "curl -H 'Cookie: [COOKIE_1]' https://demo.example");
  assert.equal(analyze('curl -H "Cookie: session=\\"abcdef\\"; secret=private" https://demo.example').output, 'curl -H "Cookie: [COOKIE_1]" https://demo.example');
});

test('detects cookie and set-cookie values in JSON while preserving valid JSON', () => {
  const source = '{"Cookie":"session=superprivate; theme=dark", "Set-Cookie":"session=\\"abc\\"; HttpOnly"}';
  assert.deepEqual(JSON.parse(analyze(source).output), { Cookie: '[COOKIE_1]', 'Set-Cookie': '[COOKIE_2]' });
});

test('handles curl credential arguments with quotes or equals', () => {
  const source = 'curl --password "a b" --user=alice:pw --password \'c d\'';
  assert.equal(analyze(source).output, 'curl --password "[SECRET_1]" --user=[SECRET_2] --password \'[SECRET_3]\'');
});

test('personal scanning validates IPs and hides only local usernames', () => {
  const source = '/Users/alice/project /home/bob/log C:\\Users\\alice\\log 192.168.1.20 999.168.1.20 version1.2.3.4';
  assert.equal(analyze(source).output, '/Users/[USER_1]/project /home/[USER_2]/log C:\\Users\\[USER_1]\\log [IP_1] 999.168.1.20 version1.2.3.4');
});

test('personal toggle leaves personal data but still removes secrets', () => {
  const source = 'a@demo.example 10.0.0.1 /Users/alice password=abc';
  assert.equal(analyze(source, { includePersonal: false }).output, 'a@demo.example 10.0.0.1 /Users/alice password=[SECRET_1]');
});

test('custom private terms are literal, Unicode-aware, case-sensitive and non-overlapping', () => {
  const source = '项目计划 [acme.*] ACME acme a@demo.example';
  const result = analyze(source, { customTerms: ['项目计划', '[acme.*]', 'ACME', 'a@demo.example', ''] });
  assert.equal(result.output, '[CUSTOM_1] [CUSTOM_2] [CUSTOM_3] acme [CUSTOM_4]');
  assert.ok(result.findings.every(item => item.kind === 'CUSTOM'));
});

test('does not mask common unrelated field names, nulls, empty values, or existing placeholders', () => {
  const source = 'model=small max_tokens=100 token_count=40 monkey=banana password="" token=null api_key=[SECRET_1] password=${MY_PASSWORD}';
  assert.equal(analyze(source).output, source);
});

test('resolves nested email/secret overlaps to one finding', () => {
  assert.equal(analyze('password=alice@demo.example').output, 'password=[SECRET_1]');
  assert.equal(analyze('password=alice@demo.example').findings.length, 1);
});

test('custom terms cannot reveal part of a larger detected secret', () => {
  assert.equal(analyze('password=alice@demo.example', { customTerms: ['alice'] }).output, 'password=[SECRET_1]');
});

test('token and URL rules cannot expose surrounding fragments of a sensitive field', () => {
  const source = 'password="prefix ghp_12345678901234567890 suffix"\npassword="prefix postgres://alice:pw@host.example suffix"';
  const result = analyze(source);
  assert.equal(result.output, 'password="[SECRET_1]"\npassword="[SECRET_2]"');
  assert.equal(result.findings.length, 2);
});

test('crossing custom and credential matches hide the union, never just the overlap', () => {
  const source = 'team alice@demo.example private';
  const result = analyze(source, { customTerms: ['team alice', 'example private'] });
  assert.equal(result.output, '[CUSTOM_1]');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].value, source);
});

test('a second pass does not corrupt existing redaction placeholders', () => {
  const source = 'Authorization: Bearer abc\npassword=secret\nCookie: session=abc\npostgres://alice:pw@host.example\n/Users/alice/a\na@demo.example';
  const first = analyze(source).output;
  assert.equal(analyze(first).output, first);
});

test('does not confuse ordinary basic-auth prose with a credential', () => {
  assert.equal(analyze('Basic authentication is useful. Bearer token documentation.').output, 'Basic authentication is useful. Bearer token documentation.');
});

test('blank and benign text have no findings; HTML input remains inert text', () => {
  for (const source of ['', 'Hello, world.', '<script>alert(1)</script>']) {
    assert.deepEqual(analyze(source), { output: source, findings: [] });
  }
  assert.throws(() => analyze(null), TypeError);
});

test('large logs retain all repeated findings without overlapping ranges', () => {
  const source = 'request a@demo.example status=200\n'.repeat(5000);
  const result = analyze(source);
  assert.equal(result.findings.length, 5000);
  assert.equal(result.output.match(/\[EMAIL_1\]/g).length, 5000);
  for (let index = 1; index < result.findings.length; index++) assert.ok(result.findings[index].start >= result.findings[index - 1].end);
});

test('long unstructured strings and repeated incomplete PEM headers terminate', { timeout: 2000 }, () => {
  const source = 'a'.repeat(300_000) + '\n' + '-----BEGIN PRIVATE KEY-----\n'.repeat(3000);
  assert.equal(analyze(source).output, 'a'.repeat(300_000) + '\n[PRIVATE_KEY_1]');
});

test('unquoted .env and YAML values can contain spaces without losing comments', () => {
  const source = 'PASSWORD=correct horse battery staple # local only\n  password: another pass phrase\nexport API_KEY=private key value\npassword=abc status=ok';
  assert.equal(analyze(source).output, 'PASSWORD=[SECRET_1] # local only\n  password: [SECRET_2]\nexport API_KEY=[SECRET_3]\npassword=[SECRET_4] status=ok');
});

test('sensitive JSON array and object values become complete valid JSON placeholders', () => {
  const source = '{"token":["abc","def"],"password":{"value":"abcdef","nested":{"token":"inside"}},"ok":true}';
  const result = analyze(source);
  assert.deepEqual(JSON.parse(result.output), { token: '[SECRET_1]', password: '[SECRET_2]', ok: true });
  assert.equal(result.findings.length, 2);
});

test('unquoted .env secrets retain commas and semicolons inside the hidden value', () => {
  const source = 'PASSWORD=hello,world;secret\nexport API_KEY=a,b;c\nNEXT=ok';
  assert.equal(analyze(source).output, 'PASSWORD=[SECRET_1]\nexport API_KEY=[SECRET_2]\nNEXT=ok');
});

test('numeric JSON secrets use quoted placeholders but numeric .env values remain unquoted', () => {
  assert.deepEqual(JSON.parse(analyze('{"password":12345,"token":-12.5e2}').output), { password: '[SECRET_1]', token: '[SECRET_2]' });
  assert.equal(analyze('PASSWORD=12345').output, 'PASSWORD=[SECRET_1]');
});

test('YAML doubled single-quotes and unresolved templates do not reveal value fragments', () => {
  assert.equal(analyze("password: 'don''t reveal me'").output, "password: '[SECRET_1]'");
  assert.equal(analyze('PASSWORD={{MY_PASSWORD}}').output, 'PASSWORD={{MY_PASSWORD}}');
});
