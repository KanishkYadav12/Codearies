import { useState } from 'react';

import { tokenize, resolveLanguage, TOKEN_CLASSES } from '../../utils/syntaxHighlighter';

/**
 * Renders a fenced code block with hand-written syntax highlighting and a
 * copy button. Tokens (not HTML) come out of `tokenize`, so this maps them to
 * `<span>` elements — React escapes every token's text, so there is no
 * injection surface even for adversarial snippet content.
 */
export function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);
  const resolved = resolveLanguage(language);
  const tokens = tokenize(code, language);
  const lineCount = (code.match(/\n/g) || []).length + 1;

  const handleCopy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        // Clipboard permission denied — the code is still visible and
        // selectable, so this fails silently rather than surfacing a toast for
        // something this low-stakes.
      });
  };

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border border-ink-700 bg-ink-950">
      <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/60 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500">
          {language || 'text'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-ink-800 hover:text-slate-200"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <pre className="min-w-full px-4 py-3 font-mono text-[13px] leading-relaxed">
          <code>
            {lineCount > 1 ? (
              <LineNumberedTokens tokens={tokens} resolved={resolved} />
            ) : (
              <TokenSpans tokens={tokens} />
            )}
          </code>
        </pre>
      </div>
    </div>
  );
}

function TokenSpans({ tokens }) {
  return tokens.map((token, index) => (
    // Tokens are positional and never reordered, so index is a stable key here.
    // eslint-disable-next-line react/no-array-index-key
    <span key={index} className={TOKEN_CLASSES[token.type] || TOKEN_CLASSES.plain}>
      {token.value}
    </span>
  ));
}

/** Splits the token stream back into lines so each can carry a gutter number. */
function LineNumberedTokens({ tokens }) {
  const lines = [[]];

  tokens.forEach((token) => {
    const parts = token.value.split('\n');

    parts.forEach((part, index) => {
      if (index > 0) {
        lines.push([]);
      }
      if (part) {
        lines[lines.length - 1].push({ type: token.type, value: part });
      }
    });
  });

  return (
    <table className="border-collapse">
      <tbody>
        {lines.map((lineTokens, lineIndex) => (
          // eslint-disable-next-line react/no-array-index-key
          <tr key={lineIndex}>
            <td className="select-none pr-4 text-right align-top text-slate-600" aria-hidden="true">
              {lineIndex + 1}
            </td>
            <td className="whitespace-pre align-top">
              <TokenSpans tokens={lineTokens} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default CodeBlock;
