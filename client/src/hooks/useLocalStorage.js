import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * `useState` that persists to localStorage.
 *
 * Handles the parts that a naive implementation gets wrong:
 *
 *   - **Availability.** Safari private mode throws on `setItem`, and
 *     localStorage is absent during SSR. Every access is guarded, and the hook
 *     degrades to plain in-memory state rather than crashing the app.
 *   - **Lazy init.** The initial read happens inside the `useState` initialiser,
 *     so it runs once rather than on every render.
 *   - **Cross-tab sync.** A `storage` event fires in *other* tabs when a value
 *     changes. Listening to it keeps two open tabs consistent — which matters
 *     here because the theme and the auth token are both stored this way.
 *   - **Functional updates.** `setValue(prev => ...)` works, like useState.
 */
export function useLocalStorage(key, initialValue) {
  const isAvailable = useRef(null);

  // Probe once. A failed write is the only reliable signal: Safari private mode
  // exposes the API and throws only on use.
  if (isAvailable.current === null) {
    try {
      const probe = '__devdrops_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      isAvailable.current = true;
    } catch (error) {
      isAvailable.current = false;
    }
  }

  const read = useCallback(() => {
    if (!isAvailable.current) {
      return initialValue;
    }

    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initialValue : JSON.parse(raw);
    } catch (error) {
      // Corrupt or hand-edited JSON should not brick the feature.
      return initialValue;
    }
  }, [key, initialValue]);

  const [value, setValue] = useState(read);

  // Keep the latest value in a ref so the functional-update path can read it
  // without making `set` depend on `value` (which would recreate it every
  // render and defeat memoisation in consumers).
  const valueRef = useRef(value);
  valueRef.current = value;

  const set = useCallback(
    (next) => {
      const resolved = typeof next === 'function' ? next(valueRef.current) : next;

      setValue(resolved);

      if (!isAvailable.current) {
        return;
      }

      try {
        if (resolved === undefined || resolved === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        }
      } catch (error) {
        // Quota exceeded, or private mode. The in-memory value still updated,
        // so the UI stays correct for this session.
      }
    },
    [key]
  );

  const remove = useCallback(() => {
    setValue(initialValue);

    if (!isAvailable.current) {
      return;
    }

    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      /* ignore */
    }
  }, [key, initialValue]);

  // Re-read when the key changes (e.g. a per-user storage key after login).
  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current !== key) {
      previousKey.current = key;
      setValue(read());
    }
  }, [key, read]);

  // Cross-tab synchronisation.
  useEffect(() => {
    if (!isAvailable.current) {
      return undefined;
    }

    const handleStorage = (event) => {
      if (event.key !== key) {
        return;
      }

      try {
        setValue(event.newValue === null ? initialValue : JSON.parse(event.newValue));
      } catch (error) {
        setValue(initialValue);
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => window.removeEventListener('storage', handleStorage);
  }, [key, initialValue]);

  return [value, set, remove];
}

export default useLocalStorage;
