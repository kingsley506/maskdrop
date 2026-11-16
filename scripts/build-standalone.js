#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');
const defaultOutput = resolve(root, 'dist/maskdrop.html');
const moduleFiles = ['src/redact.js', 'src/export.js', 'src/samples.js', 'src/app.js'];
const allowedImports = new Set([
  "import { analyze } from './redact.js';",
  "import { samples } from './samples.js';",
  "import { toMarkdown } from './export.js';",
]);

function inlineModule(source, file) {
  const withoutImports = source.replace(/^import[^\r\n]*;\s*$/gm, line => {
    if (!allowedImports.has(line.trim())) throw new Error(`Unsupported import in ${file}. Review the standalone build.`);
    return '';
  });
  const flattened = withoutImports.replace(/^export (?=(?:function|const)\b)/gm, '');
  if (/^\s*(?:import|export)\s/m.test(flattened)) throw new Error(`Unsupported module syntax in ${file}.`);
  // HTML parses raw script text even inside JS strings or comments.
  return flattened.replace(/<\/script/gi, '<\\/script');
}

const hash = content => createHash('sha256').update(content, 'utf8').digest('base64');

/** Build from only reviewed project assets; no network requests or dependencies. */
export async function buildStandalone(outputPath = defaultOutput) {
  const [index, css, icon, ...modules] = await Promise.all([
    readFile(resolve(root, 'index.html'), 'utf8'),
    readFile(resolve(root, 'styles.css'), 'utf8'),
    readFile(resolve(root, 'public/icon.svg'), 'utf8'),
    ...moduleFiles.map(file => readFile(resolve(root, file), 'utf8')),
  ]);
  const script = `\n${modules.map((source, i) => inlineModule(source, moduleFiles[i])).join('\n\n')}\n`;
  const style = `\n${css.replace(/<\/style/gi, '<\\/style')}\n`;
  const csp = `default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'sha256-${hash(style)}'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const iconUri = `data:image/svg+xml,${encodeURIComponent(icon)}`;

  if (!index.includes('<link rel="stylesheet" href="./styles.css">')
    || !index.includes('<script type="module" src="./src/app.js"></script>')) {
    throw new Error('The app entry points changed. Review the standalone build.');
  }
  const html = index
    .replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, () => `<meta http-equiv="Content-Security-Policy" content="${csp}">`)
    .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${style}</style>`)
    .replace('<script type="module" src="./src/app.js"></script>', () => `<script type="module">${script}</script>`)
    .replaceAll('./public/icon.svg', iconUri)
    .replace('class="brand" href="./"', 'class="brand" href="#source"');
  const destination = resolve(outputPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, html, 'utf8');
  return { path: destination, bytes: Buffer.byteLength(html), scriptHash: hash(script), styleHash: hash(style) };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  if (process.argv.length > 3) {
    console.error('Usage: node scripts/build-standalone.js [output.html]');
    process.exitCode = 1;
  } else {
    buildStandalone(process.argv[2]).then(({ path, bytes }) => {
      console.log(`Built ${path} (${bytes} bytes). Open this file directly in a browser.`);
    }).catch(error => {
      console.error(`MaskDrop build: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
