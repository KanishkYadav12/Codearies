import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';

import { dismissToast, selectToasts } from '../../store/slices/uiSlice';

/**
 * Custom toast notification system (spec explicitly calls out react-hot-toast
 * as the reference feature; frontend constraint #4 forbids using the library
 * itself, so this reimplements the behaviour: a stacked queue, auto-dismiss,
 * hover-to-pause, and an exit animation before the entry actually leaves the
 * DOM).
 *
 * Lives in Redux (`ui.toasts`) rather than local state so any part of the
 * app — RTK Query error handlers included — can push one without prop drilling
 * a `showToast` function through the tree.
 */

const TONE_STYLES = {
  success: 'border-emerald-400/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
  error: 'border-rose-400/40 bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300',
  info: 'border-drop-400/40 bg-drop-50 text-drop-800 dark:bg-drop-500/10 dark:text-drop-300',
  warning: 'border-amber-400/40 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
};

const TONE_ICON = { success: '✓', error: '!', info: 'i', warning: '⚠' };

function ToastItem({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (paused) {
      return undefined;
    }

    const timer = setTimeout(() => setLeaving(true), toast.duration);
    return () => clearTimeout(timer);
  }, [paused, toast.duration]);

  // The exit animation needs to finish before the toast is actually removed
  // from the Redux list, otherwise it just vanishes.
  useEffect(() => {
    if (!leaving) {
      return undefined;
    }
    const timer = setTimeout(() => onDismiss(toast.id), 180);
    return () => clearTimeout(timer);
  }, [leaving, onDismiss, toast.id]);

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={[
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lifted',
        'transition-all duration-200 ease-out',
        TONE_STYLES[toast.tone] || TONE_STYLES.info,
        leaving ? 'translate-x-4 opacity-0' : 'animate-slide-in-right'
      ].join(' ')}
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-current/15 text-xs font-bold">
        {TONE_ICON[toast.tone] || TONE_ICON.info}
      </span>

      <p className="flex-1 text-sm leading-snug">{toast.message}</p>

      <button
        type="button"
        onClick={() => setLeaving(true)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-0.5 text-current/70 hover:text-current"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useSelector(selectToasts);
  const dispatch = useDispatch();

  if (!toasts.length) {
    return null;
  }

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={(id) => dispatch(dismissToast(id))} />
      ))}
    </div>,
    document.body
  );
}

export default ToastContainer;
