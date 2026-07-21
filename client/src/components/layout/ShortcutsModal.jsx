import { useDispatch, useSelector } from 'react-redux';

import { Modal } from '../common/Modal';
import { selectShortcutsOpen, setShortcutsOpen } from '../../store/slices/uiSlice';
import { SHORTCUTS } from '../../constants';
import { formatBinding } from '../../hooks/useKeyboardShortcut';

/** `?` opens this from anywhere in the app — the full keyboard reference. */
export function ShortcutsModal() {
  const open = useSelector(selectShortcutsOpen);
  const dispatch = useDispatch();

  const global = SHORTCUTS.filter((s) => s.scope === 'global');
  const recall = SHORTCUTS.filter((s) => s.scope === 'recall');

  return (
    <Modal
      open={open}
      onClose={() => dispatch(setShortcutsOpen(false))}
      title="Keyboard shortcuts"
      size="sm"
    >
      <div className="space-y-5">
        <ShortcutGroup title="Everywhere" items={global} />
        <ShortcutGroup title="Recall mode" items={recall} />
      </div>
    </Modal>
  );
}

function ShortcutGroup({ title, items }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-500">
        {title}
      </h3>
      <dl className="space-y-1.5">
        {items.map((item) => (
          <div key={`${item.scope}-${item.label}`} className="flex items-center justify-between">
            <dt className="text-sm text-ink-700 dark:text-slate-300">{item.label}</dt>
            <dd>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-ink-600 dark:border-ink-600 dark:bg-ink-800 dark:text-slate-300">
                {formatBinding(item.binding)}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default ShortcutsModal;
