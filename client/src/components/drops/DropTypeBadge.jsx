import { DROP_TYPE_META } from '../../constants';

const COLOR_CLASSES = {
  code: 'border-violet-400/30 bg-violet-500/10 text-violet-600 dark:text-violet-300',
  command: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  link: 'border-sky-400/30 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  note: 'border-amber-400/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'
};

/** Small badge identifying a drop's type — code / command / link / note. */
export function DropTypeBadge({ type, showLabel = true, className = '' }) {
  const meta = DROP_TYPE_META[type] || DROP_TYPE_META.note;

  return (
    <span className={`badge font-mono ${COLOR_CLASSES[type] || COLOR_CLASSES.note} ${className}`}>
      <span aria-hidden="true">{meta.icon}</span>
      {showLabel && <span className="font-sans">{meta.label}</span>}
    </span>
  );
}

export default DropTypeBadge;
