/**
 * MaskDrop's deterministic, local-only pattern scanner.
 * No network, storage, evaluation, or decoding of the supplied text occurs here.
 * This is a review aid, not a complete secret or personal-data detector.
 */

const DETAILS = {
  SECRET: ['Secret', 'A credential format or a sensitive field name matched.'],
  PRIVATE_KEY: ['Private key', 'A PEM private-key block matched.'],
  CREDENTIAL: ['URL credentials', 'A URL contains a username or password before the host.'],
  COOKIE: ['Cookie', 'A cookie header can contain session credentials.'],
  EMAIL: ['Email address', 'An email-address pattern matched.'],
  IP: ['IP address', 'A valid IPv4 address matched.'],
  USER: ['Local username', 'A username in a local home-directory path matched.'],
  CUSTOM: ['Private term', 'This exact text was added to your private terms.'],
};

const isPlaceholder = value => /^\[[A-Z_]+_\d+\]$/.test(value);
const isSensitiveKey = key => /(?:password|passwd|pwd|secret|apikey|accesskey|accesstoken|authtoken|refreshtoken|privatetoken|token|sessionid)$/.test(key.replace(/[^a-z0-9]/gi, '').toLowerCase());

/**
 * Return a shareable output plus every non-overlapping finding.
 * `keepIds` retains particular occurrences; original values only exist in memory.
 * Offsets refer to JavaScript UTF-16 string positions in the original input.
 */
export function analyze(source, { includePersonal = true, customTerms = [], keepIds = [] } = {}) {
  if (typeof source !== 'string') throw new TypeError('The input must be a string.');
  const candidates = [];
  const add = (start, end, kind, priority, reason, quoteReplacement = false) => {
    const value = source.slice(start, end);
    if (!value || isPlaceholder(value)) return;
    candidates.push({ start, end, value, kind, priority, quoteReplacement, reason: reason || DETAILS[kind][1] });
  };
  const scan = (regex, kind, priority, group = 0, reason) => {
    for (const match of source.matchAll(regex)) {
      const value = match[group];
      // A selected capture is always the final content-bearing group in our rules.
      const offset = group ? match[0].lastIndexOf(value) : 0;
      add(match.index + offset, match.index + offset + value.length, kind, priority, reason);
    }
  };

  // Avoid rescanning an entire malformed PEM block for every repeated BEGIN.
  const pemHeaders = /-----BEGIN ((?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY)-----/g;
  for (let header; (header = pemHeaders.exec(source));) {
    const closing = `-----END ${header[1]}-----`;
    const end = source.indexOf(closing, pemHeaders.lastIndex);
    if (end < 0) {
      add(header.index, source.length, 'PRIVATE_KEY', 130, 'A private-key header matched; the incomplete block extends to the end of the input.');
      break;
    }
    add(header.index, end + closing.length, 'PRIVATE_KEY', 130);
    pemHeaders.lastIndex = end + closing.length;
  }
  scan(/\b(?:https?|postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql):\/\/([^\s/@]+(?::[^\s/@]*)?)@/gi, 'CREDENTIAL', 120, 1);
  scan(/\b(?:authorization|proxy-authorization)["']?[ \t]*[:=][ \t]*["']?(?:Bearer|Basic)[ \t]+([^\s"'`,;<>{}\[\]]+)/gi, 'SECRET', 115, 1, 'An Authorization header is followed by a credential.');
  scan(/\bBearer[ \t]+([A-Za-z0-9_~+/.=-]{12,})/g, 'SECRET', 114, 1, 'A bearer-credential pattern matched.');
  scan(/\bBasic[ \t]+([A-Za-z0-9+/]{16,}={0,2})(?![A-Za-z0-9+/=])/g, 'SECRET', 114, 1, 'A basic-authentication credential pattern matched.');
  scan(/\b(?:sk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16})\b/g, 'SECRET', 112);
  scan(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}\b/g, 'SECRET', 112, 0, 'A JSON Web Token pattern matched.');

  // A surrounding curl/JSON quote ends a header; quotes inside a cookie value
  // do not. In direct HTTP headers, the full line is sensitive.
  for (const match of source.matchAll(/\b(?:set-cookie|cookie)(["']?)[ \t]*[:=][ \t]*/gi)) {
    let start = match.index + match[0].length;
    const preceding = source[match.index - 1];
    let delimiter = '';
    if (match[1] || match[0].includes('=')) {
      if (source[start] === '"' || source[start] === "'") delimiter = source[start++];
    } else if (preceding === '"' || preceding === "'") delimiter = preceding;
    let end = start;
    while (end < source.length && !/[\r\n]/.test(source[end])) {
      if (delimiter && source[end] === '\\') { end += 2; continue; }
      if (delimiter && source[end] === delimiter) break;
      end++;
    }
    end = Math.min(end, source.length);
    while (end > start && /\s/.test(source[end - 1])) end--;
    add(start, end, 'COOKIE', 125);
  }

  // Key/value syntax in .env, JSON, YAML and many plain-text logs.
  // Read quoted values explicitly so escaped quotes and spaces remain one value.
  const keys = /(["']?)([A-Za-z_][A-Za-z0-9_.-]{0,100})\1[ \t]*[:=][ \t]*/g;
  let structuredUntil = -1;
  for (const match of source.matchAll(keys)) {
    if (match.index < structuredUntil) continue;
    if (!isSensitiveKey(match[2])) continue;
    let start = match.index + match[0].length;
    let end = start;
    const quote = source[start];
    let quoteReplacement = false;
    if (source.startsWith('${', start) || source.startsWith('{{', start)) {
      // Environment/template references contain no resolved credential.
      continue;
    } else if ((quote === '{' || quote === '[') && !/^\[[A-Z_]+_\d+\]/.test(source.slice(start))) {
      // A JSON-sensitive field can itself contain an object or array. Cover the
      // whole value and substitute a JSON string, never just its opening bracket.
      const stack = [];
      let inString = false;
      for (; end < source.length; end++) {
        const character = source[end];
        if (inString) {
          if (character === '\\') end++;
          else if (character === '"') inString = false;
        } else if (character === '"') inString = true;
        else if (character === '{' || character === '[') stack.push(character);
        else if (character === '}' || character === ']') {
          const expected = character === '}' ? '{' : '[';
          if (stack[stack.length - 1] !== expected) break;
          stack.pop();
          if (!stack.length) { end++; break; }
        }
      }
      end = Math.min(end, source.length);
      structuredUntil = end;
      quoteReplacement = true;
    } else if (quote === '"' || quote === "'") {
      start++;
      end = start;
      while (end < source.length && source[end] !== '\n' && source[end] !== '\r') {
        if (source[end] === '\\') { end += 2; continue; }
        if (quote === "'" && source[end] === "'" && source[end + 1] === "'") { end += 2; continue; }
        if (source[end] === quote) break;
        end++;
      }
      end = Math.min(end, source.length);
    } else {
      const lineStart = source.lastIndexOf('\n', match.index - 1) + 1;
      const prefix = source.slice(lineStart, match.index).trim();
      if (prefix === '' || prefix === 'export') {
        // .env/YAML unquoted values may contain spaces. Stop before a comment,
        // another log field, or a structural delimiter, keeping that syntax.
        while (end < source.length && !/[\r\n]/.test(source[end])) end++;
        const raw = source.slice(start, end);
        const nextField = raw.search(/[ \t]+(?:#|[A-Za-z_][A-Za-z0-9_.-]{0,100}[ \t]*[:=])/);
        if (nextField >= 0) end = start + nextField;
        while (end > start && /[ \t]/.test(source[end - 1])) end--;
      } else {
        while (end < source.length && !/[\s,;}<>"']/.test(source[end])) end++;
      }
    }
    const value = source.slice(start, end);
    if (/^(?:null|undefined|true|false|\$\{[^}]*\}|\{\{.*\}\})$/i.test(value)) continue;
    if (match[1] === '"' && match[0].includes(':') && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) quoteReplacement = true;
    // Keep an existing placeholder, including one surrounded by common quotes.
    // An entire sensitive field outranks a token/URL contained within its value.
    add(start, end, 'SECRET', 124, 'The value belongs to a password, token, or secret-like field.', quoteReplacement);
  }

  // curl --password (and --user) accepts a single shell argument; never run it.
  for (const match of source.matchAll(/(?:^|\s)--(?:password|user)(?:[ \t]+|=)(?:"((?:\\.|[^"\r\n])*)"|'([^'\r\n]*)'|([^\s"']+))/g)) {
    const value = match[1] ?? match[2] ?? match[3];
    const offset = match[0].lastIndexOf(value);
    add(match.index + offset, match.index + offset + value.length, 'SECRET', 113, 'A curl credential argument matched.');
  }

  if (includePersonal) {
    // An email-like suffix inside URL userinfo is not a separate contact address.
    // Ignore personal heuristics that intersect a known credential container.
    const credentialRanges = candidates.map(({ start, end }) => ({ start, end })).sort((a, b) => a.start - b.start);
    const mergedRanges = [];
    for (const range of credentialRanges) {
      const previous = mergedRanges[mergedRanges.length - 1];
      if (previous && range.start < previous.end) previous.end = Math.max(previous.end, range.end);
      else mergedRanges.push({ ...range });
    }
    const overlapsCredential = (start, end) => {
      let low = 0;
      let high = mergedRanges.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (mergedRanges[middle].start < end) low = middle + 1;
        else high = middle;
      }
      return low > 0 && mergedRanges[low - 1].end > start;
    };
    const personalScan = (regex, kind, priority, group = 0) => {
      for (const match of source.matchAll(regex)) {
        const value = match[group];
        const start = match.index + (group ? match[0].lastIndexOf(value) : 0);
        if (!overlapsCredential(start, start + value.length)) add(start, start + value.length, kind, priority);
      }
    };
    personalScan(/\b[A-Z0-9._%+-]{1,64}@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.){1,10}[A-Z]{2,63}\b/gi, 'EMAIL', 20);
    for (const match of source.matchAll(/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g)) {
      if (match[0].split('.').every(part => Number(part) <= 255) && !overlapsCredential(match.index, match.index + match[0].length)) add(match.index, match.index + match[0].length, 'IP', 10);
    }
    personalScan(/\/(?:Users|home)\/([^/\\\s"'<>:]+)/g, 'USER', 25, 1);
    personalScan(/\b[A-Za-z]:\\Users\\([^\\/\s"'<>:]+)/gi, 'USER', 25, 1);
  }

  for (const term of new Set(customTerms)) {
    if (typeof term !== 'string' || !term.length) continue;
    let from = 0;
    while (from < source.length) {
      const at = source.indexOf(term, from);
      if (at < 0) break;
      // Custom terms must never narrow an already-detected credential span.
      add(at, at + term.length, 'CUSTOM', 105);
      from = at + term.length;
    }
  }

  // Cover the union of intersecting detections. Simply rejecting a lower-
  // priority overlap could reveal part of a broader password or private term.
  // Keep the strongest label while hiding every detected character in the group.
  candidates.sort((a, b) => a.start - b.start || b.end - a.end || b.priority - a.priority);
  const accepted = [];
  for (const candidate of candidates) {
    const previous = accepted[accepted.length - 1];
    if (previous && candidate.start < previous.end) {
      const start = previous.start;
      const end = Math.max(previous.end, candidate.end);
      if (candidate.priority > previous.priority) Object.assign(previous, candidate);
      previous.start = start;
      previous.end = end;
      previous.value = source.slice(start, end);
    } else {
      accepted.push({ ...candidate });
    }
  }

  const kept = new Set(keepIds);
  const replacements = new Map();
  const counters = new Map();
  let cursor = 0;
  const pieces = [];
  const findings = accepted.map(candidate => {
    const { start, end, value, kind, reason } = candidate;
    const key = `${kind}\0${value}`;
    if (!replacements.has(key)) {
      const number = (counters.get(kind) || 0) + 1;
      counters.set(kind, number);
      replacements.set(key, `[${kind}_${number}]`);
    }
    const token = replacements.get(key);
    const replacement = candidate.quoteReplacement ? JSON.stringify(token) : token;
    const id = `${kind}:${start}:${end}`;
    const applied = !kept.has(id);
    pieces.push(source.slice(cursor, start), applied ? replacement : value);
    cursor = end;
    return { id, start, end, value, kind, label: DETAILS[kind][0], reason, replacement, applied };
  });
  pieces.push(source.slice(cursor));
  return { output: pieces.join(''), findings };
}
