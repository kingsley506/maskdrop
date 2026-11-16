import { analyze } from './redact.js';
import { samples } from './samples.js';
import { toMarkdown } from './export.js';

const $ = (id) => document.getElementById(id);
const source = $('source');
const terms = $('terms');
const output = $('output');
const MAX_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
let result = { output: '', findings: [] };
let keepIds = new Set();
let debounce;
let toastTimer;

function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200);
}

function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

function jumpTo(finding) {
  source.focus();
  source.setSelectionRange(finding.start, finding.end);
  const precedingLines = source.value.slice(0, finding.start).split('\n').length;
  const lineHeight = parseFloat(getComputedStyle(source).lineHeight);
  source.scrollTop = Math.max(0, (precedingLines - 3) * lineHeight);
}

function renderPreview() {
  // Very large logs stay readable without building hundreds of thousands of DOM nodes.
  if (result.findings.length > 2000) {
    output.textContent = result.output;
    output.classList.remove('empty-output');
    return;
  }
  const nodes = [];
  let cursor = 0;
  for (const finding of result.findings) {
    nodes.push(document.createTextNode(source.value.slice(cursor, finding.start)));
    if (finding.applied) {
      const mark = element('mark', finding.replacement);
      mark.title = `${finding.label} · ${finding.reason}`;
      nodes.push(mark);
    } else {
      nodes.push(document.createTextNode(source.value.slice(finding.start, finding.end)));
    }
    cursor = finding.end;
  }
  nodes.push(document.createTextNode(source.value.slice(cursor)));
  output.replaceChildren(...nodes);
  output.classList.toggle('empty-output', !source.value);
  if (!source.value) output.textContent = 'Your sharing preview will appear here.';
}

function renderFindings() {
  const fragment = document.createDocumentFragment();
  const shown = result.findings.slice(0, 300);
  for (const finding of shown) {
    const row = element('div', undefined, 'finding');
    const personal = ['EMAIL', 'IP', 'USER'].includes(finding.kind);
    row.dataset.category = personal ? 'personal' : 'secret';
    const meta = element('div', undefined, 'finding-meta');
    meta.append(element('span', personal ? '@' : '⌑', 'finding-icon'));
    const text = element('div', undefined, 'finding-text');
    const label = element('div', undefined, 'finding-label');
    label.append(element('span', finding.label), element('code', finding.replacement));
    text.append(label, element('div', finding.reason, 'finding-reason'));
    meta.append(text);
    const actions = element('div', undefined, 'finding-buttons');
    const line = source.value.slice(0, finding.start).split('\n').length;
    const locate = element('button', `L${line}`, 'line-button');
    locate.title = `Find ${finding.label} on line ${line}`;
    locate.setAttribute('aria-label', `Locate ${finding.label} on line ${line}`);
    locate.addEventListener('click', () => jumpTo(finding));
    const toggle = element('button', finding.applied ? 'Masked ✓' : 'Kept ↶', 'mask-button');
    toggle.setAttribute('aria-pressed', String(finding.applied));
    toggle.setAttribute('aria-label', `${finding.applied ? 'Keep' : 'Mask'} ${finding.label} on line ${line}`);
    toggle.addEventListener('click', () => {
      finding.applied ? keepIds.add(finding.id) : keepIds.delete(finding.id);
      update();
      // Retain keyboard position when a review button is replaced.
      const next = [...$('findings').querySelectorAll('.mask-button')][shown.indexOf(finding)];
      next?.focus({ preventScroll: true });
    });
    actions.append(locate, toggle);
    row.append(meta, actions);
    fragment.append(row);
  }
  if (result.findings.length > shown.length) {
    fragment.append(element('p', `Showing the first ${shown.length} of ${result.findings.length} matches. All matches are processed; split the input into smaller snippets to review every match.`, 'no-findings'));
  }
  if (!result.findings.length) {
    fragment.append(element('p', source.value ? 'No matches in the enabled rules. Give your preview a final read.' : 'Add a snippet to see the details that may need a second look.', 'no-findings'));
  }
  $('findings').replaceChildren(fragment);
}

function update() {
  clearTimeout(debounce);
  result = analyze(source.value, {
    includePersonal: $('personal').checked,
    customTerms: terms.value.split('\n').map(t => t.trim()).filter(Boolean),
    keepIds: [...keepIds]
  });
  const applied = result.findings.filter(f => f.applied);
  const kept = result.findings.length - applied.length;
  $('char-count').textContent = `${source.value.length.toLocaleString()} chars`;
  $('findings-count').textContent = result.findings.length;
  $('masked-count').textContent = applied.length;
  $('kept-count').textContent = kept;
  $('unique-count').textContent = new Set(result.findings.map(f => f.value)).size;
  $('output-summary').textContent = source.value ? `${applied.length} masked${kept ? ` · ${kept} kept` : result.findings.length > 2000 ? ' · plain preview for large input' : ' · review before sharing'}` : 'Waiting for your snippet';
  $('preview-badge').textContent = kept ? `${kept} KEPT · REVIEW` : 'REVIEW FIRST';
  $('reset-review').hidden = !kept;
  for (const id of ['copy', 'copy-md', 'download-txt', 'download-md']) $(id).disabled = !source.value;
  renderPreview();
  renderFindings();
}

function clearSelection() {
  document.querySelectorAll('[data-sample]').forEach(button => button.setAttribute('aria-pressed', 'false'));
}

function inputChanged() {
  if (encoder.encode(source.value).byteLength > MAX_BYTES) {
    // Keep the previous accepted text rather than silently truncating a snippet.
    source.value = source.dataset.accepted || '';
    notify('This snippet is over 1 MiB. Try a smaller excerpt.');
    return;
  }
  source.dataset.accepted = source.value;
  keepIds.clear();
  clearSelection();
  $('source-meta').textContent = 'ONLY IN THIS TAB';
  clearTimeout(debounce);
  debounce = setTimeout(update, 120);
}

function setSource(text, meta) {
  source.value = text;
  source.dataset.accepted = text;
  $('source-meta').textContent = meta;
  keepIds.clear();
  update();
}

source.addEventListener('input', inputChanged);
terms.addEventListener('input', () => {
  keepIds.clear();
  clearTimeout(debounce);
  debounce = setTimeout(update, 120);
});
$('personal').addEventListener('change', () => { keepIds.clear(); update(); });
$('reset-review').addEventListener('click', () => { keepIds.clear(); update(); });

document.querySelectorAll('[data-sample]').forEach(button => {
  button.addEventListener('click', () => {
    clearSelection();
    button.setAttribute('aria-pressed', 'true');
    setSource(samples[button.dataset.sample], 'DEMO · FAKE DATA');
    notify('Fictitious demo loaded. Replaces the current input.');
  });
});

$('clear').addEventListener('click', () => {
  clearSelection();
  terms.value = '';
  setSource('', 'ONLY IN THIS TAB');
  source.focus();
  notify('Workspace cleared. Previously copied or downloaded text stays where you saved it.');
});

async function readFile(file) {
  if (!file) return;
  if (file.size > MAX_BYTES) return notify('File is over 1 MiB. Open a smaller text excerpt.');
  try {
    const bytes = await file.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('binary');
    clearSelection();
    setSource(text, 'LOCAL FILE · NOT UPLOADED');
    notify('Local file opened in this tab.');
  } catch {
    notify('Could not read this as UTF-8 text. Try a .txt, .log, or config file.');
  }
}
$('open-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', async event => {
  await readFile(event.target.files[0]);
  event.target.value = '';
});
for (const type of ['dragenter', 'dragover']) $('drop-zone').addEventListener(type, event => {
  event.preventDefault();
  $('drop-zone').classList.add('dragover');
});
$('drop-zone').addEventListener('dragleave', event => {
  if (!$('drop-zone').contains(event.relatedTarget)) $('drop-zone').classList.remove('dragover');
});
$('drop-zone').addEventListener('drop', event => {
  event.preventDefault();
  $('drop-zone').classList.remove('dragover');
  if (event.dataTransfer.files.length > 1) return notify('Open one text file at a time.');
  if (event.dataTransfer.files.length) readFile(event.dataTransfer.files[0]);
  else {
    const text = event.dataTransfer.getData('text/plain');
    if (encoder.encode(text).byteLength > MAX_BYTES) return notify('Snippet is over 1 MiB. Try a smaller excerpt.');
    clearSelection();
    setSource(text, 'ONLY IN THIS TAB');
  }
});

async function copy(asMarkdown) {
  update();
  try {
    await navigator.clipboard.writeText(asMarkdown ? toMarkdown(result.output) : result.output);
    const kept = result.findings.filter(f => !f.applied).length;
    notify(`Copied ${asMarkdown ? 'Markdown' : 'text'}${kept ? `, including ${kept} item${kept > 1 ? 's' : ''} you kept` : '. Review before sharing'}.`);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(output);
    selection.removeAllRanges();
    selection.addRange(range);
    notify('Clipboard unavailable. Preview selected; press Ctrl/Cmd+C to copy text.');
  }
}
$('copy').addEventListener('click', () => copy(false));
$('copy-md').addEventListener('click', () => copy(true));

function download(asMarkdown) {
  update();
  const content = asMarkdown ? toMarkdown(result.output) : result.output;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `maskdrop-shared.${asMarkdown ? 'md' : 'txt'}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Downloaded the sharing preview. Review before sending.');
}
$('download-txt').addEventListener('click', () => download(false));
$('download-md').addEventListener('click', () => download(true));

setSource(samples.incident, 'DEMO · FAKE DATA');
