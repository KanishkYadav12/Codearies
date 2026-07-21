/**
 * Client-side auto-categorisation preview.
 *
 * The server is authoritative — it re-derives type, language and tags on every
 * create and update. This mirror exists so the create form can show the user
 * what *will* be detected as they type, live, with no request in flight.
 *
 * Kept intentionally in step with server/src/services/tagService.js. If the
 * rules diverge the preview simply becomes optimistic; nothing breaks, because
 * the response replaces the guess.
 */

const CODE_FENCE = /```/;
const CODE_KEYWORD = /\b(?:function|class|const|let|var)\b/;

const COMMAND_PROMPT = /^\s*[$>]\s+\S/m;
const COMMAND_KEYWORD = /\b(?:sudo|apt|apt-get|npm|yarn|pnpm|pip|pip3|brew|docker|git)\b/;

const URL_PATTERN = /https?:\/\/\S+/;

export const DROP_TYPES = ['code', 'command', 'link', 'note'];

/** Mirrors the server's rules, in the same order. */
export function detectType(content) {
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

const LANGUAGE_ALIASES = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  javascript: 'javascript',
  ts: 'typescript', tsx: 'typescript', typescript: 'typescript',
  py: 'python', python: 'python',
  rb: 'ruby', ruby: 'ruby',
  go: 'go', golang: 'go',
  rs: 'rust', rust: 'rust',
  java: 'java', kt: 'kotlin', kotlin: 'kotlin', swift: 'swift', php: 'php',
  cs: 'csharp', csharp: 'csharp', c: 'c', cpp: 'cpp', 'c++': 'cpp',
  sh: 'bash', bash: 'bash', zsh: 'bash', shell: 'bash',
  ps1: 'powershell', powershell: 'powershell',
  sql: 'sql', html: 'html', css: 'css', scss: 'scss',
  json: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml',
  md: 'markdown', markdown: 'markdown',
  dockerfile: 'dockerfile', nginx: 'nginx', graphql: 'graphql'
};

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
  { language: 'css', pattern: /[.#]?[\w-]+\s*\{[^}]*:[^}]*\}/ }
];

export function detectLanguage(content) {
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

const STOPWORDS = new Set(
  ('a an the and or but if then else for while do this that these those with without ' +
    'from into onto out about above below over under again further once here there when ' +
    'where why how all any both each few more most other some such only own same than too ' +
    'very can will just should now you your yours i me my we our us they them he she it its ' +
    'is are was were be been being have has had having does did doing not no nor so use used ' +
    'using get gets got make makes made new old set sets run runs need needs want wants ' +
    'to of in on at by as up down off out per via etc eg ie').split(' ')
);

const TECH_TERMS = new Set([
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
]);

export const MAX_TAGS = 5;

/** Normalises, de-duplicates and caps a tag list. Mirrors the server. */
export function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set();
  const output = [];

  tags.forEach((tag) => {
    if (typeof tag !== 'string') {
      return;
    }

    const cleaned = tag
      .trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/[^a-z0-9+#._-]/g, '')
      .slice(0, 24);

    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      output.push(cleaned);
    }
  });

  return output.slice(0, MAX_TAGS);
}

/** Ranked keyword extraction, mirroring the server's priority order. */
export function extractTags(content, options = {}) {
  const text = typeof content === 'string' ? content : '';
  const title = typeof options.title === 'string' ? options.title : '';

  if (!text.trim() && !title.trim()) {
    return [];
  }

  const combined = `${title}\n${text}`;
  const candidates = [];

  // 1. explicit hashtags
  (combined.match(/(?:^|\s)#([a-z0-9][a-z0-9+._-]{1,23})/gi) || []).forEach((match) => {
    candidates.push(match.trim().slice(1).toLowerCase());
  });

  const type = options.type || detectType(text);
  const language = options.language || (type === 'code' ? detectLanguage(text) : null);

  // 2. detected language
  if (language) {
    candidates.push(language);
  }

  // Strip fenced blocks and URLs before word analysis so their noise never
  // becomes a tag.
  const clean = combined
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');

  const words = (clean.toLowerCase().match(/[a-z][a-z0-9+#._-]{1,23}/g) || []).filter(
    (word) => word.length > 2 && !STOPWORDS.has(word)
  );

  // 3. known technology terms, in order of first appearance
  const techSeen = new Set();
  words.forEach((word) => {
    if (TECH_TERMS.has(word) && !techSeen.has(word)) {
      techSeen.add(word);
      candidates.push(word);
    }
  });

  // 4. the link's domain
  if (type === 'link') {
    const match = text.match(/https?:\/\/([^/\s:]+)/);
    if (match) {
      const parts = match[1].toLowerCase().replace(/^www\./, '').split('.');
      candidates.push(parts.length >= 2 ? parts[parts.length - 2] : parts[0]);
    }
  }

  // 5. frequency fallback
  const counts = new Map();
  words.forEach((word) => {
    if (!TECH_TERMS.has(word)) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  });

  Array.from(counts.entries())
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : b[0].length - a[0].length))
    .slice(0, MAX_TAGS)
    .forEach(([word]) => candidates.push(word));

  // 6. the type itself, last — it only fills a slot nothing better wanted
  candidates.push(type);

  return normalizeTags(candidates);
}

/** One-shot preview for the create form. */
export function previewCategorization(fields) {
  const content = fields.content || '';
  const type = fields.type || detectType(content);
  const language = fields.language || (type === 'code' ? detectLanguage(content) : null);

  const tags =
    Array.isArray(fields.tags) && fields.tags.length
      ? normalizeTags(fields.tags)
      : extractTags(content, { title: fields.title, type, language });

  return { type, language, tags };
}
