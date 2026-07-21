import { parseInline, parseMarkdown } from '../../utils/markdownParser';
import { CodeBlock } from './CodeBlock';

/**
 * Renders the AST from `parseMarkdown` as React elements.
 *
 * This is the half of the custom markdown implementation that makes it safe:
 * every text node passes through JSX as a plain string, so React escapes it.
 * There is no `dangerouslySetInnerHTML` anywhere in this file — the parser
 * emits structure, this renders structure, and user content is never treated
 * as markup.
 */
export function Markdown({ content, className = '' }) {
  const blocks = parseMarkdown(content);

  if (!blocks.length) {
    return null;
  }

  return (
    <div className={`prose-drop ${className}`}>
      {blocks.map((block, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Block key={index} node={block} />
      ))}
    </div>
  );
}

function Block({ node }) {
  switch (node.type) {
    case 'heading': {
      const Tag = `h${Math.min(node.level, 4)}`;
      return (
        <Tag>
          <Inline nodes={node.children} />
        </Tag>
      );
    }

    case 'paragraph':
      return (
        <p>
          <Inline nodes={node.children} />
        </p>
      );

    case 'codeBlock':
      return <CodeBlock code={node.value} language={node.language} />;

    case 'blockquote':
      return (
        <blockquote>
          {node.children.map((child, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Block key={index} node={child} />
          ))}
        </blockquote>
      );

    case 'list': {
      const ListTag = node.ordered ? 'ol' : 'ul';
      return (
        <ListTag start={node.ordered ? node.start : undefined}>
          {node.children.map((item, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={index}>
              <Inline nodes={item.children} />
            </li>
          ))}
        </ListTag>
      );
    }

    case 'rule':
      return <hr />;

    default:
      return null;
  }
}

function Inline({ nodes }) {
  return nodes.map((node, index) => {
    // eslint-disable-next-line react/no-array-index-key
    const key = index;

    switch (node.type) {
      case 'text':
        return node.value.split('\n').reduce((acc, line, lineIndex) => {
          if (lineIndex > 0) {
            acc.push(<br key={`${key}-br-${lineIndex}`} />);
          }
          acc.push(line);
          return acc;
        }, []);

      case 'bold':
        return (
          <strong key={key}>
            <Inline nodes={node.children} />
          </strong>
        );

      case 'italic':
        return (
          <em key={key}>
            <Inline nodes={node.children} />
          </em>
        );

      case 'strike':
        return (
          <del key={key}>
            <Inline nodes={node.children} />
          </del>
        );

      case 'code':
        return <code key={key}>{node.value}</code>;

      case 'link':
        return (
          <a key={key} href={node.href} title={node.title} target="_blank" rel="noreferrer noopener">
            <Inline nodes={node.children} />
          </a>
        );

      default:
        return null;
    }
  });
}

export default Markdown;
