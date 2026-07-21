'use strict';

/**
 * Auto-categorisation and keyword extraction.
 *
 * Two jobs:
 *   1. Infer a drop's `type` from its content, using the rules in the spec.
 *   2. Extract up to five useful tags, so capturing a snippet stays a one-field
 *      action and the drop is still findable later.
 *
 * Everything here is deterministic and dependency-free — no NLP library, no
 * model call. That keeps drop creation fast and the behaviour explainable.
 */

const { normalizeTags, LIMITS } = require('../utils/validators');

/* ------------------------------------------------------------------ */
/* Type detection                                                      */
/* ------------------------------------------------------------------ */

// A fenced block, or a bare declaration keyword on a word boundary. The \b
// guards matter: without them "constant" and "classic" would read as code.
const CODE_FENCE = /```/;
const CODE_KEYWORD = /\b(?:function|class|const|let|var)\b/;

// Shell prompt at the start of any line, or a well-known package manager.
const COMMAND_PROMPT = /^\s*[$>]\s+\S/m;
const COMMAND_KEYWORD = /\b(?:sudo|apt|apt-get|npm|yarn|pnpm|pip|pip3|brew|docker|git)\b/;

const URL_PATTERN = /https?:\/\/\S+/;

/**
 * Classifies content into code | command | link | note.
 *
 * Evaluated in the order the spec lays out, so the rules stay auditable against
 * the requirement. A fenced block wins over everything: if a user wrapped it in
 * backticks they have already told us it is code.
 */
function detectType(content) {
  const text = typeof content === 'string' ? content : '';

  if (!text.trim()) {
    return 'note';
  }

  if (CODE_FENCE.test(text) || CODE_KEYWORD.test(text)) {
    return 'code';
  }

  if (COMMAND_PROMPT.test(text) || COMMAND_KEYWORD.test(text)) {
    return 'command';
  }

  if (URL_PATTERN.test(text)) {
    return 'link';
  }

  return 'note';
}

/* ------------------------------------------------------------------ */
/* Language detection                                                  */
/* ------------------------------------------------------------------ */

// Canonical names, keyed by the aliases users actually type after ``` .
const LANGUAGE_ALIASES = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
  py: 'python',
  python: 'python',
  rb: 'ruby',
  ruby: 'ruby',
  go: 'go',
  golang: 'go',
  rs: 'rust',
  rust: 'rust',
  java: 'java',
  kt: 'kotlin',
  kotlin: 'kotlin',
  swift: 'swift',
  php: 'php',
  cs: 'csharp',
  csharp: 'csharp',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  shell: 'bash',
  ps1: 'powershell',
  powershell: 'powershell',
  sql: 'sql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  markdown: 'markdown',
  dockerfile: 'dockerfile',
  graphql: 'graphql'
};

// Fallback signatures, tried only when no fence language was supplied.
const LANGUAGE_SIGNATURES = [
  { language: 'python', pattern: /\b(?:def\s+\w+\s*\(|import\s+\w+|print\()/ },
  { language: 'javascript', pattern: /\b(?:const|let|=>|require\(|console\.log)\b/ },
  { language: 'typescript', pattern: /\b(?:interface\s+\w+|type\s+\w+\s*=|:\s*string\b)/ },
  { language: 'sql', pattern: /\b(?:select\s+.+\s+from|insert\s+into|create\s+table)\b/i },
  { language: 'go', pattern: /\b(?:func\s+\w+\(|package\s+main)\b/ },
  { language: 'rust', pattern: /\b(?:fn\s+\w+\(|let\s+mut)\b/ },
  { language: 'java', pattern: /\b(?:public\s+class|System\.out\.println)\b/ },
  { language: 'bash', pattern: /^\s*[$>]\s+\S|#!\/bin\/(?:ba)?sh/m },
  { language: 'html', pattern: /<\/?[a-z][\w-]*>/i },
  { language: 'css', pattern: /[.#]?[\w-]+\s*\{[^}]*:[^}]*}/ }
];

/**
 * Best-effort language for a code drop. Prefers the explicit fence info string
 * (```python) and falls back to signature matching. Returns null when unsure —
 * a wrong badge is worse than no badge.
 */
function detectLanguage(content) {
  const text = typeof content === 'string' ? content : '';

  const fence = text.match(/```([a-z0-9+#.-]+)/i);
  if (fence) {
    const alias = fence[1].toLowerCase();
    if (LANGUAGE_ALIASES[alias]) {
      return LANGUAGE_ALIASES[alias];
    }
  }

  for (let i = 0; i < LANGUAGE_SIGNATURES.length; i += 1) {
    if (LANGUAGE_SIGNATURES[i].pattern.test(text)) {
      return LANGUAGE_SIGNATURES[i].language;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Tag extraction                                                      */
/* ------------------------------------------------------------------ */

// Words that carry no retrieval value. Kept deliberately small — over-filtering
// throws away domain terms.
const STOPWORDS = new Set(
  ('a an the and or but if then else for while do this that these those with without ' +
    'from into onto out about above below over under again further once here there when ' +
    'where why how all any both each few more most other some such only own same than too ' +
    'very can will just should now you your yours i me my we our us they them he she it its ' +
    'is are was were be been being have has had having does did doing not no nor so use used ' +
    'using get gets got make makes made new old set sets run runs need needs want wants ' +
    'to of in on at by as up down off out per via etc eg ie').split(' ')
);

// Technology vocabulary. A match here is worth more than raw word frequency,
// because "kubernetes" is a far better tag than whatever word appears most.
const TECH_TERMS = [
  'javascript', 'typescript', 'python', 'java', 'kotlin', 'swift', 'ruby', 'rust', 'golang',
  'php', 'scala', 'elixir', 'haskell', 'perl', 'lua', 'dart',
  'react', 'redux', 'vue', 'angular', 'svelte', 'nextjs', 'remix', 'vite', 'webpack', 'babel',
  'node', 'nodejs', 'express', 'fastify', 'nestjs', 'django', 'flask', 'fastapi', 'rails',
  'spring', 'laravel', 'graphql', 'rest', 'grpc', 'websocket', 'trpc',
  'mongodb', 'mongo', 'postgres', 'postgresql', 'mysql', 'sqlite', 'redis', 'elasticsearch',
  'cassandra', 'dynamodb', 'firebase', 'supabase', 'prisma', 'mongoose', 'sequelize',
  'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'nginx', 'apache', 'aws', 'gcp',
  'azure', 'vercel', 'netlify', 'render', 'railway', 'heroku', 'cloudflare', 'lambda',
  'git', 'github', 'gitlab', 'bitbucket', 'ci', 'cd', 'jenkins', 'actions',
  'linux', 'ubuntu', 'debian', 'macos', 'windows', 'wsl', 'bash', 'zsh', 'powershell', 'vim',
  'npm', 'yarn', 'pnpm', 'pip', 'cargo', 'maven', 'gradle', 'brew',
  'jwt', 'oauth', 'auth', 'authentication', 'authorization', 'security', 'cors', 'csrf',
  'xss', 'encryption', 'hashing', 'bcrypt', 'ssl', 'tls',
  'testing', 'jest', 'vitest', 'mocha', 'cypress', 'playwright', 'pytest', 'selenium',
  'algorithm', 'recursion', 'async', 'promise', 'closure', 'regex', 'performance', 'caching',
  'debugging', 'deployment', 'migration', 'refactoring', 'api', 'cli', 'sdk', 'orm',
  'html', 'css', 'tailwind', 'sass', 'scss', 'bootstrap', 'animation', 'accessibility',
  'json', 'yaml', 'xml', 'csv', 'markdown', 'sql', 'nosql'
];

const TECH_TERM_SET = new Set(TECH_TERMS);

/** Pulls explicit `#hashtags` — an intentional tag always outranks a guess. */
function extractHashtags(text) {
  const matches = text.match(/(?:^|\s)#([a-z0-9][a-z0-9+._-]{1,23})/gi) || [];

  return matches.map(function (match) {
    return match.trim().slice(1).toLowerCase();
  });
}

/** Strips fenced blocks and URLs so their noise never becomes a tag. */
function stripNoise(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
}

/** Hostname of the first URL, minus `www.` — a good tag for link drops. */
function extractDomain(text) {
  const match = text.match(/https?:\/\/([^/\s:]+)/);
  if (!match) {
    return null;
  }

  const host = match[1].toLowerCase().replace(/^www\./, '');
  // Keep the registrable-ish part: "docs.mongodb.com" -> "mongodb".
  const parts = host.split('.');

  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }

  return host;
}

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9+#._-]{1,23}/g) || []).filter(function (word) {
    return word.length > 2 && !STOPWORDS.has(word);
  });
}

/**
 * Ranked keyword extraction.
 *
 * Priority, highest first:
 *   1. explicit hashtags     - the user said so
 *   2. the drop's type       - always a useful facet
 *   3. detected language     - for code drops
 *   4. known technology terms present in the text
 *   5. the link's domain     - for link drops
 *   6. most frequent remaining words
 *
 * Capped at five (schema limit) and normalised through the shared tag rules.
 */
function extractTags(content, options) {
  const settings = options || {};
  const text = typeof content === 'string' ? content : '';
  const title = typeof settings.title === 'string' ? settings.title : '';

  if (!text.trim() && !title.trim()) {
    return [];
  }

  const candidates = [];
  const push = function (tag) {
    if (tag) {
      candidates.push(String(tag).toLowerCase());
    }
  };

  const combined = title + '\n' + text;

  extractHashtags(combined).forEach(push);

  const type = settings.type || detectType(text);
  const language = settings.language || (type === 'code' ? detectLanguage(text) : null);

  if (language) {
    push(language);
  }

  const clean = stripNoise(combined);
  const words = tokenize(clean);

  // Technology terms, in order of first appearance so the primary subject leads.
  const techSeen = new Set();
  words.forEach(function (word) {
    if (TECH_TERM_SET.has(word) && !techSeen.has(word)) {
      techSeen.add(word);
      push(word);
    }
  });

  if (type === 'link') {
    push(extractDomain(text));
  }

  // Frequency fallback, so a drop about a niche topic still gets something.
  const counts = new Map();
  words.forEach(function (word) {
    if (!TECH_TERM_SET.has(word)) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  });

  Array.from(counts.entries())
    .sort(function (a, b) {
      // Frequency first; ties broken by length, favouring the more specific word.
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return b[0].length - a[0].length;
    })
    .slice(0, LIMITS.DROP_TAGS_MAX)
    .forEach(function (entry) {
      push(entry[0]);
    });

  // The type tag goes last so it only fills a slot nothing better wanted.
  push(type);

  return normalizeTags(candidates);
}

/**
 * One-shot enrichment used by the create/update paths.
 *
 * User-supplied values always win: auto-detection fills gaps, it never
 * overrides an explicit choice.
 */
function enrich(fields) {
  const content = fields.content || '';
  const type = fields.type || detectType(content);

  const language =
    fields.language !== undefined && fields.language !== null && fields.language !== ''
      ? fields.language
      : type === 'code'
        ? detectLanguage(content)
        : null;

  const tags =
    Array.isArray(fields.tags) && fields.tags.length
      ? normalizeTags(fields.tags)
      : extractTags(content, { title: fields.title, type: type, language: language });

  return {
    type: type,
    language: language,
    tags: tags,
    autoDetected: {
      type: !fields.type,
      language: !fields.language && Boolean(language),
      tags: !(Array.isArray(fields.tags) && fields.tags.length)
    }
  };
}

module.exports = {
  detectType: detectType,
  detectLanguage: detectLanguage,
  extractTags: extractTags,
  enrich: enrich,
  TECH_TERMS: TECH_TERMS,
  STOPWORDS: STOPWORDS
};
