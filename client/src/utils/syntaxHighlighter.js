/**
 * Minimal syntax highlighter, written from scratch.
 *
 * The spec's UI list mentions prism.js, but the constraints section requires
 * the markdown renderer, form handling, animations and command palette all to
 * be hand-built, and states that all code must be original. Pulling in a
 * highlighter would be the one bought-in piece in an otherwise hand-written
 * rendering stack — and prism's core plus a language pack is ~40kb for what a
 * snippet tool needs from it. So: a small tokeniser.
 *
 * Like the markdown parser, this emits **tokens, not HTML**. `<CodeBlock />`
 * turns them into spans, so highlighted code is subject to React's escaping and
 * carries no injection risk.
 *
 * Scope is honest: this handles comments, strings, numbers, keywords, types,
 * functions and operators. It is not a parser and will not correctly colour
 * every pathological case — but for the snippets people actually save it is
 * accurate, and it degrades to plain text rather than mis-rendering.
 */

/* ------------------------------------------------------------------ */
/* Language definitions                                                */
/* ------------------------------------------------------------------ */

const C_LIKE_KEYWORDS = [
  'return', 'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'switch',
  'case', 'default', 'throw', 'try', 'catch', 'finally', 'new', 'delete',
  'typeof', 'instanceof', 'void', 'in', 'of', 'this', 'super', 'class',
  'extends', 'import', 'export', 'from', 'as', 'async', 'await', 'yield',
  'function', 'const', 'let', 'var', 'static', 'get', 'set'
];

const LANGUAGES = {
  javascript: {
    keywords: C_LIKE_KEYWORDS,
    literals: ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"', "'", '`']
  },
  typescript: {
    keywords: C_LIKE_KEYWORDS.concat([
      'interface', 'type', 'enum', 'implements', 'declare', 'namespace',
      'public', 'private', 'protected', 'readonly', 'abstract', 'satisfies'
    ]),
    literals: ['true', 'false', 'null', 'undefined', 'never', 'unknown', 'any'],
    types: ['string', 'number', 'boolean', 'object', 'symbol', 'bigint', 'void'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"', "'", '`']
  },
  python: {
    keywords: [
      'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break',
      'continue', 'pass', 'import', 'from', 'as', 'try', 'except', 'finally',
      'raise', 'with', 'lambda', 'global', 'nonlocal', 'assert', 'yield',
      'async', 'await', 'del', 'in', 'is', 'not', 'and', 'or'
    ],
    literals: ['True', 'False', 'None', 'self', 'cls'],
    lineComment: '#',
    strings: ['"', "'"]
  },
  bash: {
    keywords: [
      'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case',
      'esac', 'function', 'return', 'export', 'source', 'local', 'until'
    ],
    literals: [],
    builtins: [
      'echo', 'cd', 'ls', 'cat', 'grep', 'sed', 'awk', 'curl', 'wget', 'sudo',
      'apt', 'npm', 'yarn', 'pnpm', 'pip', 'docker', 'git', 'kill', 'chmod',
      'mkdir', 'rm', 'cp', 'mv', 'lsof', 'netstat', 'brew'
    ],
    lineComment: '#',
    strings: ['"', "'"]
  },
  sql: {
    keywords: [
      'select', 'from', 'where', 'insert', 'into', 'values', 'update', 'set',
      'delete', 'create', 'table', 'alter', 'drop', 'index', 'join', 'left',
      'right', 'inner', 'outer', 'on', 'group', 'by', 'order', 'having',
      'limit', 'offset', 'as', 'and', 'or', 'not', 'null', 'distinct', 'union'
    ],
    literals: ['true', 'false', 'null'],
    caseInsensitive: true,
    lineComment: '--',
    blockComment: ['/*', '*/'],
    strings: ["'", '"']
  },
  json: {
    keywords: [],
    literals: ['true', 'false', 'null'],
    strings: ['"']
  },
  css: {
    keywords: ['important', 'media', 'import', 'keyframes', 'supports', 'font-face'],
    literals: [],
    blockComment: ['/*', '*/'],
    strings: ['"', "'"]
  },
  go: {
    keywords: [
      'func', 'package', 'import', 'return', 'if', 'else', 'for', 'range',
      'switch', 'case', 'default', 'break', 'continue', 'go', 'defer', 'chan',
      'select', 'type', 'struct', 'interface', 'map', 'var', 'const'
    ],
    literals: ['true', 'false', 'nil', 'iota'],
    types: ['string', 'int', 'int64', 'float64', 'bool', 'byte', 'rune', 'error'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"', '`']
  },
  rust: {
    keywords: [
      'fn', 'let', 'mut', 'const', 'static', 'if', 'else', 'match', 'loop',
      'while', 'for', 'in', 'break', 'continue', 'return', 'struct', 'enum',
      'impl', 'trait', 'use', 'mod', 'pub', 'crate', 'self', 'where', 'async',
      'await', 'move', 'ref', 'dyn'
    ],
    literals: ['true', 'false', 'None', 'Some', 'Ok', 'Err'],
    types: ['i32', 'i64', 'u32', 'u64', 'f32', 'f64', 'bool', 'char', 'str', 'String', 'Vec'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"']
  },
  java: {
    keywords: [
      'public', 'private', 'protected', 'class', 'interface', 'extends',
      'implements', 'static', 'final', 'void', 'return', 'if', 'else', 'for',
      'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'try',
      'catch', 'finally', 'throw', 'throws', 'import', 'package', 'abstract'
    ],
    literals: ['true', 'false', 'null', 'this', 'super'],
    types: ['int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'String'],
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"', "'"]
  },
  yaml: {
    keywords: [],
    literals: ['true', 'false', 'null', 'yes', 'no'],
    lineComment: '#',
    strings: ['"', "'"]
  },
  nginx: {
    keywords: [
      'server', 'location', 'listen', 'proxy_pass', 'root', 'index',
      'server_name', 'upstream', 'include', 'return', 'rewrite', 'if',
      'proxy_set_header', 'add_header', 'gzip', 'error_page', 'try_files'
    ],
    literals: ['on', 'off'],
    lineComment: '#',
    strings: ['"', "'"]
  },
  dockerfile: {
    keywords: [
      'FROM', 'RUN', 'CMD', 'LABEL', 'EXPOSE', 'ENV', 'ADD', 'COPY',
      'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'HEALTHCHECK', 'AS'
    ],
    literals: [],
    lineComment: '#',
    strings: ['"', "'"]
  }
};

// Aliases so `detectLanguage`'s output and raw fence strings both resolve.
const ALIASES = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', node: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', py3: 'python',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', powershell: 'bash', ps1: 'bash',
  postgres: 'sql', postgresql: 'sql', mysql: 'sql',
  yml: 'yaml',
  golang: 'go',
  rs: 'rust',
  scss: 'css', sass: 'css', less: 'css'
};

export function resolveLanguage(name) {
  if (!name) {
    return null;
  }

  const key = String(name).toLowerCase();
  const resolved = ALIASES[key] || key;

  return LANGUAGES[resolved] ? resolved : null;
}

export function isLanguageSupported(name) {
  return resolveLanguage(name) !== null;
}

/* ------------------------------------------------------------------ */
/* Tokeniser                                                           */
/* ------------------------------------------------------------------ */

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;
const OPERATOR = /[+\-*/%=<>!&|^~?:]/;
const PUNCTUATION = /[{}[\]();,.]/;

/**
 * Turns source into `[{ type, value }]`.
 *
 * A single forward pass with an explicit cursor. Order of checks is what makes
 * it correct: comments and strings are consumed *whole* before anything else
 * gets a chance, so a keyword inside a string is never coloured as a keyword.
 */
export function tokenize(source, languageName) {
  const code = String(source == null ? '' : source);
  const key = resolveLanguage(languageName);

  // Unknown language: one plain token. Better uncoloured than wrongly coloured.
  if (!key) {
    return [{ type: 'plain', value: code }];
  }

  const language = LANGUAGES[key];
  const keywords = new Set(language.keywords || []);
  const literals = new Set(language.literals || []);
  const types = new Set(language.types || []);
  const builtins = new Set(language.builtins || []);
  const stringDelimiters = language.strings || [];

  const tokens = [];
  let buffer = '';
  let index = 0;

  const flush = () => {
    if (buffer) {
      tokens.push({ type: 'plain', value: buffer });
      buffer = '';
    }
  };

  const push = (type, value) => {
    flush();
    tokens.push({ type, value });
  };

  while (index < code.length) {
    const rest = code.slice(index);

    // --- line comment ---
    if (language.lineComment && rest.startsWith(language.lineComment)) {
      const end = code.indexOf('\n', index);
      const stop = end === -1 ? code.length : end;
      push('comment', code.slice(index, stop));
      index = stop;
      continue;
    }

    // --- block comment ---
    if (language.blockComment && rest.startsWith(language.blockComment[0])) {
      const close = code.indexOf(language.blockComment[1], index + 2);
      const stop = close === -1 ? code.length : close + language.blockComment[1].length;
      push('comment', code.slice(index, stop));
      index = stop;
      continue;
    }

    const char = code[index];

    // --- string ---
    if (stringDelimiters.includes(char)) {
      let cursor = index + 1;
      let closed = false;

      while (cursor < code.length) {
        if (code[cursor] === '\\') {
          // Skip the escaped character so \" does not close the string.
          cursor += 2;
          continue;
        }
        if (code[cursor] === char) {
          closed = true;
          cursor += 1;
          break;
        }
        // Only backticks legitimately span lines; an unterminated quote is a
        // typo, and stopping at the newline keeps the rest of the file sane.
        if (code[cursor] === '\n' && char !== '`') {
          break;
        }
        cursor += 1;
      }

      push('string', code.slice(index, closed ? cursor : cursor));
      index = cursor;
      continue;
    }

    // --- number ---
    if (DIGIT.test(char) || (char === '.' && DIGIT.test(code[index + 1] || ''))) {
      let cursor = index;
      while (cursor < code.length && /[0-9a-fA-FxXoObB._]/.test(code[cursor])) {
        cursor += 1;
      }
      push('number', code.slice(index, cursor));
      index = cursor;
      continue;
    }

    // --- identifier / keyword ---
    if (IDENTIFIER_START.test(char)) {
      let cursor = index;
      while (cursor < code.length && IDENTIFIER_PART.test(code[cursor])) {
        cursor += 1;
      }

      const word = code.slice(index, cursor);
      const lookup = language.caseInsensitive ? word.toLowerCase() : word;

      // A `(` immediately after an identifier means it is being called.
      const nextNonSpace = code.slice(cursor).match(/^\s*(.)/);
      const isCall = nextNonSpace && nextNonSpace[1] === '(';

      let type = 'plain';

      if (keywords.has(lookup)) {
        type = 'keyword';
      } else if (literals.has(word) || literals.has(lookup)) {
        type = 'literal';
      } else if (types.has(word)) {
        type = 'type';
      } else if (builtins.has(lookup)) {
        type = 'builtin';
      } else if (isCall) {
        type = 'function';
      } else if (/^[A-Z]/.test(word) && word.length > 1) {
        // Capitalised identifiers are classes/constructors by convention.
        type = 'type';
      }

      if (type === 'plain') {
        buffer += word;
      } else {
        push(type, word);
      }

      index = cursor;
      continue;
    }

    // --- shell variable / flag ---
    if (key === 'bash' && (char === '$' || (char === '-' && /[-\w]/.test(code[index + 1] || '')))) {
      let cursor = index + 1;
      while (cursor < code.length && /[\w{}-]/.test(code[cursor])) {
        cursor += 1;
      }
      push(char === '$' ? 'variable' : 'operator', code.slice(index, cursor));
      index = cursor;
      continue;
    }

    // --- operator / punctuation ---
    if (OPERATOR.test(char)) {
      push('operator', char);
      index += 1;
      continue;
    }

    if (PUNCTUATION.test(char)) {
      push('punctuation', char);
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();

  return tokens;
}

/**
 * Tailwind classes per token type.
 *
 * Both themes are specified: code blocks are the densest colour in the app and
 * a palette tuned only for dark mode becomes unreadable in light mode.
 */
export const TOKEN_CLASSES = {
  plain: 'text-ink-800 dark:text-slate-200',
  comment: 'text-ink-500 dark:text-slate-500 italic',
  string: 'text-emerald-600 dark:text-emerald-300',
  number: 'text-orange-600 dark:text-orange-300',
  keyword: 'text-violet-600 dark:text-violet-300 font-medium',
  literal: 'text-sky-600 dark:text-sky-300',
  type: 'text-amber-600 dark:text-amber-200',
  builtin: 'text-teal-600 dark:text-teal-300',
  function: 'text-blue-600 dark:text-blue-300',
  variable: 'text-rose-600 dark:text-rose-300',
  operator: 'text-pink-600 dark:text-pink-300',
  punctuation: 'text-ink-500 dark:text-slate-400'
};

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGES);
