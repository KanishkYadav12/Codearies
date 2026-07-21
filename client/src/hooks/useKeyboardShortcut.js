import { useEffect, useRef } from 'react';

/**
 * Global keyboard shortcuts.
 *
 * The app is meant to be driven from the keyboard — Ctrl+K opens the palette,
 * Ctrl+N creates a drop, and recall mode runs on Space / R / N. That only works
 * if shortcuts are disciplined about two things:
 *
 *   1. **Never hijack typing.** A shortcut must not fire while the user is in an
 *      input, textarea or contenteditable. The one exception is Escape, which
 *      should always be able to close things, and explicit modifier combos like
 *      Ctrl+K, which are unambiguous.
 *   2. **Cross-platform modifiers.** `Cmd` on macOS and `Ctrl` elsewhere are the
 *      same intent. `mod` expresses that so callers do not branch on platform.
 *
 * Bindings are parsed from strings: 'mod+k', 'shift+?', 'space', 'escape'.
 */

/** True when the event originated from somewhere the user is typing. */
export function isTypingTarget(target) {
  if (!target) {
    return false;
  }

  const tag = target.tagName;

  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }

  return Boolean(target.isContentEditable);
}

/** Normalises `event.key` into the vocabulary used in binding strings. */
function normalizeKey(key) {
  if (key === ' ' || key === 'Spacebar') {
    return 'space';
  }

  const lowered = String(key).toLowerCase();

  const aliases = {
    esc: 'escape',
    del: 'delete',
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
    return: 'enter'
  };

  return aliases[lowered] || lowered;
}

function parseBinding(binding) {
  const parts = String(binding)
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  const spec = { mod: false, ctrl: false, meta: false, shift: false, alt: false, key: null };

  parts.forEach((part) => {
    if (part === 'mod' || part === 'cmdorctrl') {
      spec.mod = true;
    } else if (part === 'ctrl' || part === 'control') {
      spec.ctrl = true;
    } else if (part === 'cmd' || part === 'meta') {
      spec.meta = true;
    } else if (part === 'shift') {
      spec.shift = true;
    } else if (part === 'alt' || part === 'option') {
      spec.alt = true;
    } else {
      spec.key = normalizeKey(part);
    }
  });

  return spec;
}

function matches(event, spec) {
  if (normalizeKey(event.key) !== spec.key) {
    return false;
  }

  // `mod` accepts either Cmd or Ctrl, so one binding covers both platforms.
  if (spec.mod) {
    if (!(event.metaKey || event.ctrlKey)) {
      return false;
    }
  } else {
    if (spec.ctrl !== event.ctrlKey) {
      return false;
    }
    if (spec.meta !== event.metaKey) {
      return false;
    }
  }

  if (spec.shift !== event.shiftKey) {
    return false;
  }
  if (spec.alt !== event.altKey) {
    return false;
  }

  return true;
}

/**
 * Binds one shortcut.
 *
 * @param {string} binding    e.g. 'mod+k', 'space', 'escape'
 * @param {Function} handler  receives the KeyboardEvent
 * @param {object} options
 * @param {boolean} options.enabled       default true
 * @param {boolean} options.allowInInputs fire even while typing (default false)
 * @param {boolean} options.preventDefault default true
 */
export function useKeyboardShortcut(binding, handler, options = {}) {
  const {
    enabled = true,
    allowInInputs = false,
    preventDefault = true
  } = options;

  // Ref so a handler recreated every render does not re-bind the listener.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || !binding) {
      return undefined;
    }

    const spec = parseBinding(binding);

    const onKeyDown = (event) => {
      if (!matches(event, spec)) {
        return;
      }

      // Escape and explicit modifier combos are always safe; bare-letter
      // shortcuts must not steal keystrokes from a form field.
      const isSafeWhileTyping = spec.key === 'escape' || spec.mod || spec.ctrl || spec.meta;

      if (!allowInInputs && !isSafeWhileTyping && isTypingTarget(event.target)) {
        return;
      }

      if (preventDefault) {
        event.preventDefault();
      }

      handlerRef.current(event);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [binding, enabled, allowInInputs, preventDefault]);
}

/**
 * Binds several shortcuts with one listener.
 *
 * `{ 'mod+k': open, escape: close }`. Preferred when a component owns a group of
 * keys — one listener instead of N.
 */
export function useKeyboardShortcuts(bindings, options = {}) {
  const { enabled = true, allowInInputs = false, preventDefault = true } = options;

  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  // Only the *set of keys* should re-bind the listener, not the handler
  // identities — which change on every render.
  const signature = Object.keys(bindings || {}).sort().join('|');

  useEffect(() => {
    if (!enabled || !signature) {
      return undefined;
    }

    const specs = Object.keys(bindingsRef.current).map((key) => ({
      spec: parseBinding(key),
      key
    }));

    const onKeyDown = (event) => {
      for (let i = 0; i < specs.length; i += 1) {
        const { spec, key } = specs[i];

        if (!matches(event, spec)) {
          continue;
        }

        const isSafeWhileTyping = spec.key === 'escape' || spec.mod || spec.ctrl || spec.meta;

        if (!allowInInputs && !isSafeWhileTyping && isTypingTarget(event.target)) {
          return;
        }

        const handler = bindingsRef.current[key];

        if (typeof handler === 'function') {
          if (preventDefault) {
            event.preventDefault();
          }
          handler(event);
        }

        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [signature, enabled, allowInInputs, preventDefault]);
}

/** True on macOS — lets the UI print ⌘K instead of Ctrl+K. */
export function isMac() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');
}

/** Renders a binding for display: 'mod+k' -> '⌘K' or 'Ctrl+K'. */
export function formatBinding(binding) {
  const spec = parseBinding(binding);
  const mac = isMac();
  const parts = [];

  if (spec.mod) parts.push(mac ? '⌘' : 'Ctrl');
  if (spec.ctrl && !spec.mod) parts.push('Ctrl');
  if (spec.meta && !spec.mod) parts.push(mac ? '⌘' : 'Win');
  if (spec.alt) parts.push(mac ? '⌥' : 'Alt');
  if (spec.shift) parts.push(mac ? '⇧' : 'Shift');

  if (spec.key) {
    const labels = {
      space: 'Space',
      escape: 'Esc',
      enter: '↵',
      up: '↑',
      down: '↓',
      left: '←',
      right: '→'
    };

    parts.push(labels[spec.key] || spec.key.toUpperCase());
  }

  return mac ? parts.join('') : parts.join('+');
}

export default useKeyboardShortcut;
