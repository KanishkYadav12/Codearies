import { createSlice } from '@reduxjs/toolkit';

import { REMEMBER_STORAGE_KEY, TOKEN_STORAGE_KEY } from '../../constants';

/**
 * Authentication state.
 *
 * RTK Query owns *server* data; this slice owns the *session* — the token, the
 * current user, and whether the session ended because it expired (which the
 * login page uses to explain why the user is suddenly back there).
 *
 * "Remember me" decides where the token lives:
 *   - checked   localStorage, so the session survives closing the browser
 *   - unchecked sessionStorage, so it dies with the tab
 *
 * Persisting in the reducer rather than in a middleware keeps the write next to
 * the state change that caused it, so the two can never drift apart.
 */

function readToken() {
  try {
    // localStorage first: an explicit "remember me" outlives a tab session.
    const persisted = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (persisted) {
      return JSON.parse(persisted);
    }

    const session = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    return session ? JSON.parse(session) : null;
  } catch (error) {
    return null;
  }
}

function readRemember() {
  try {
    const raw = window.localStorage.getItem(REMEMBER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : false;
  } catch (error) {
    return false;
  }
}

function persistToken(token, remember) {
  try {
    // Always clear both stores first, so switching the remember-me choice never
    // leaves a stale copy behind in the other one.
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);

    if (!token) {
      window.localStorage.removeItem(REMEMBER_STORAGE_KEY);
      return;
    }

    const store = remember ? window.localStorage : window.sessionStorage;
    store.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
    window.localStorage.setItem(REMEMBER_STORAGE_KEY, JSON.stringify(Boolean(remember)));
  } catch (error) {
    // Private mode: the session stays valid in memory for this tab.
  }
}

const initialState = {
  token: readToken(),
  user: null,
  remember: readRemember(),
  // True only when a token was rejected mid-session, so the login page can say
  // "your session expired" instead of silently appearing.
  expired: false,
  // Until `getMe` resolves we do not know whether the stored token is valid;
  // the router waits on this to avoid flashing the login page on reload.
  initialised: false
};

const authSlice = createSlice({
  name: 'auth',
  initialState,

  reducers: {
    setSession: {
      reducer(state, action) {
        const { user, token, remember } = action.payload;

        state.user = user;
        state.token = token;
        state.remember = remember;
        state.expired = false;
        state.initialised = true;

        persistToken(token, remember);
      },
      prepare(user, token, remember = false) {
        return { payload: { user, token, remember } };
      }
    },

    /** Refreshes the user after `getMe` or a preferences update. */
    setUser(state, action) {
      state.user = action.payload;
      state.initialised = true;
    },

    clearSession(state) {
      state.user = null;
      state.token = null;
      state.initialised = true;

      persistToken(null, false);
    },

    sessionExpired(state) {
      state.expired = true;
    },

    /** Called once the initial `getMe` settles, successfully or not. */
    markInitialised(state) {
      state.initialised = true;
    },

    dismissExpiryNotice(state) {
      state.expired = false;
    }
  }
});

export const {
  setSession,
  setUser,
  clearSession,
  sessionExpired,
  markInitialised,
  dismissExpiryNotice
} = authSlice.actions;

export const selectAuth = (state) => state.auth;
export const selectCurrentUser = (state) => state.auth.user;
export const selectToken = (state) => state.auth.token;
export const selectIsAuthenticated = (state) => Boolean(state.auth.token);
export const selectAuthInitialised = (state) => state.auth.initialised;
export const selectPreferences = (state) =>
  state.auth.user?.preferences || { theme: 'dark', defaultVisibility: 'private', recallInterval: 24 };

export default authSlice.reducer;
