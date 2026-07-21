import { tagChipStyle, tagChipStyleDark } from '../../utils/format';
import { useSelector } from 'react-redux';
import { selectTheme } from '../../store/slices/uiSlice';

/** Colour-coded tag chip. The colour is derived deterministically from the
 * tag text, so the same tag always renders the same colour across the app
 * without a lookup table to maintain. */
export function TagChip({ tag, onClick, onRemove, className = '' }) {
  const theme = useSelector(selectTheme);
  const style = theme === 'dark' ? tagChipStyleDark(tag) : tagChipStyle(tag);

  const Component = onClick ? 'button' : 'span';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderColor: style.borderColor
      }}
      className={[
        'badge border font-mono text-[11px]',
        onClick ? 'cursor-pointer hover:brightness-110' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      #{tag}
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Remove tag ${tag}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(tag);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onRemove(tag);
            }
          }}
          className="ml-0.5 -mr-0.5 rounded-full px-0.5 hover:bg-black/10 dark:hover:bg-white/10"
        >
          ✕
        </span>
      )}
    </Component>
  );
}

export default TagChip;
