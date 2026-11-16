#!/usr/bin/env node
import { readFile, open, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyze } from '../src/redact.js';

const LIMIT = 1024 * 1024;
const VERSION = '0.1.0';
const HELP = `MaskDrop ${VERSION} — Review what leaves your clipboard.

Usage: node bin/maskdrop.js [options] < input.log > share.txt

  --file <path>       Read a UTF-8 file instead of stdin
  --out <path>        Write to a new file instead of stdout
  --force             Allow replacing an existing output file
  --secrets-only      Keep emails, IP addresses, and home paths
  --term <text>       Mask an exact private term (repeatable)
  --report            Print redaction counts to stderr, never original values
  --help              Show this help
  --version           Print the version

Maximum input: 1 MiB. Review the output: detection is heuristic and incomplete.
`;

function parse(args) {
  const options = { customTerms: [], includePersonal: true };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--secrets-only') options.includePersonal = false;
    else if (arg === '--report') options.report = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--file' || arg === '--out' || arg === '--term') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      if (arg === '--term') options.customTerms.push(value);
      else {
        const key = arg.slice(2);
        if (options[key]) throw new Error(`${arg} can only be supplied once.`);
        options[key] = value;
      }
    } else throw new Error('Unknown option. Use --help for usage.');
  }
  return options;
}

async function readInput(file) {
  if (file) {
    const metadata = await stat(file);
    if (!metadata.isFile()) throw new Error('Input must be a regular file.');
    if (metadata.size > LIMIT) throw new Error('Input exceeds the 1 MiB limit.');
    const buffer = await readFile(file);
    if (buffer.length > LIMIT) throw new Error('Input exceeds the 1 MiB limit.');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  }
  if (process.stdin.isTTY) throw new Error('Pipe text into stdin or use --file <path>.');
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > LIMIT) throw new Error('Input exceeds the 1 MiB limit.');
    chunks.push(chunk);
  }
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
}

async function assertDifferentFiles(input, output) {
  if (!input || !output) return;
  if (resolve(input) === resolve(output)) throw new Error('Input and output must be different files.');
  const [source, destination] = await Promise.all([
    stat(input), stat(output).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error)),
  ]);
  if (destination && source.dev === destination.dev && source.ino === destination.ino) {
    throw new Error('Input and output must be different files, including links.');
  }
  const [sourcePath, destinationPath] = await Promise.all([
    realpath(input), realpath(output).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error)),
  ]);
  if (sourcePath === destinationPath) throw new Error('Input and output must be different files.');
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) return process.stdout.write(HELP);
  if (options.version) return process.stdout.write(`${VERSION}\n`);
  await assertDifferentFiles(options.file, options.out);
  const source = await readInput(options.file);
  const { output, findings } = analyze(source, options);
  if (options.out) {
    const handle = await open(options.out, options.force ? 'w' : 'wx', 0o600);
    try { await handle.writeFile(output, 'utf8'); } finally { await handle.close(); }
  } else process.stdout.write(output);
  if (options.report) {
    const applied = findings.filter(finding => finding.applied);
    const byKind = {};
    for (const finding of applied) byKind[finding.kind] = (byKind[finding.kind] || 0) + 1;
    process.stderr.write(`${JSON.stringify({ redacted: applied.length, byKind })}\n`);
  }
}

main().catch(error => {
  // Input contents and secret values are never included in error reports.
  const message = error.code === 'EEXIST'
    ? 'Output already exists. Choose a new path or pass --force.'
    : error.code === 'ENOENT'
      ? 'A file or parent directory does not exist.'
      : error.code === 'EACCES' || error.code === 'EPERM'
        ? 'Permission denied while accessing a file.'
        : error instanceof TypeError
          ? 'Input must contain valid UTF-8 text.'
          : error.message;
  process.stderr.write(`MaskDrop: ${message}\n`);
  process.exitCode = 1;
});
