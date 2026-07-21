import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut';

/**
 * Accessible modal dialog, built from scratch.
 *
 * Three things a modal must get right, all handled here:
 *   - **Escape closes it** (spec: `Esc` closes modals globally).
 *   - **Focus is trapped** inside the dialog while open, and returned to
 *     whatever triggered it on close — without this, Tab silently moves focus
 *     into content hidden behind the overlay.
 *   - **Background scroll is locked**, so scrolling the page behind a modal on
 *     mobile does not fight the modal's own content.
 *
 * Rendered through a portal so its stacking context is never fought by a
 * parent's `overflow: hidden` or `z-index`.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocusRef
}) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  useKeyboardShortcut('escape', () => onClose(), { enabled: open, allowInInputs: true });

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    previouslyFocused.current = document.activeElement;

    const target = initialFocusRef?.current || dialogRef.current;
    // Deferred a tick so the element exists and any enter animation has
    // started before focus jumps, avoiding a visible layout jump.
    const timer = setTimeout(() => target?.focus(), 10);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      if (previouslyFocused.current && typeof previouslyFocused.current.focus === 'function') {
        previouslyFocused.current.focus();
      }
    };
  }, [open, initialFocusRef]);

  const handleTabTrap = (event) => {
    if (event.key !== 'Tab' || !dialogRef.current) {
      return;
    }

    const focusable = dialogRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-ink-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={handleTabTrap}
        className={[
          'relative z-10 w-full',
          sizes[size] || sizes.md,
          'max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl',
          'border border-slate-200 bg-white dark:border-ink-700 dark:bg-ink-900',
          'shadow-lifted animate-slide-up sm:animate-scale-in'
        ].join(' ')}
      >
        {(title || description) && (
          <div className="border-b border-slate-100 px-5 py-4 dark:border-ink-700">
            {title && (
              <h2 id={titleId} className="text-base font-semibold text-ink-900 dark:text-white">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="mt-1 text-sm text-ink-500 dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
        )}

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-ink-700">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
