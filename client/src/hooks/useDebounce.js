import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delay` milliseconds.
 *
 * Used by the search box: without it every keystroke is a request, and the
 * responses race — a slow reply for "doc" can land after the reply for "docker"
 * and repaint the list with stale results.
 */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    // A zero delay would still defer by a tick; skip the timer entirely so
    // `delay={0}` behaves as "no debouncing".
    if (delay <= 0) {
      setDebounced(value);
      return undefined;
    }

    const timer = setTimeout(() => setDebounced(value), delay);

    // Clearing on every change is what actually produces the debounce: a new
    // keystroke cancels the pending update before it fires.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Debounces a *callback* rather than a value.
 *
 * For handlers that should not fire on every event — autosave, resize. The
 * returned function is stable, and the latest callback is always the one
 * invoked, so it never closes over stale props.
 */
export function useDebouncedCallback(callback, delay = 300) {
  const callbackRef = useRef(callback);
  const timerRef = useRef(null);

  callbackRef.current = callback;

  const debounced = useCallback(
    (...args) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // A pending timer must not fire after unmount — it would call setState on a
  // dead component, or worse, act on a page the user has left.
  useEffect(() => cancel, [cancel]);

  return [debounced, cancel];
}

export default useDebounce;
