import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { PageLoader } from './components/common/LoadingSpinner';
import { ToastContainer } from './components/common/Toast';

import { useGetMeQuery } from './store/api/apiSlice';
import {
  clearSession,
  dismissExpiryNotice,
  markInitialised,
  selectAuth,
  setUser
} from './store/slices/authSlice';
import { selectTheme } from './store/slices/uiSlice';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import RecallModePage from './pages/RecallModePage';
import DropsExplorerPage from './pages/DropsExplorerPage';
import DropDetailPage from './pages/DropDetailPage';
import MyDropsPage from './pages/MyDropsPage';
import CollectionsPage from './pages/CollectionsPage';
import CollectionDetailPage from './pages/CollectionDetailPage';
import ProfilePage from './pages/ProfilePage';
import SharedCollectionPage from './pages/SharedCollectionPage';
import NotFoundPage from './pages/NotFoundPage';

/**
 * Root component: applies the persisted theme to <html>, resolves the current
 * session on load, and declares the route table.
 *
 * Route table shape mirrors the spec's page list exactly:
 *   /login, /register                      — public, auth pages
 *   /                                       — dashboard (protected)
 *   /recall                                 — recall mode (protected)
 *   /explore                                — public drops feed... but the
 *                                              *authenticated* explorer with
 *                                              filters lives here too, since
 *                                              the spec's "Drops Explorer" is
 *                                              one page, not two
 *   /drops, /drops/:id                      — my drops + detail (protected)
 *   /collections, /collections/:id          — protected
 *   /share/:token                           — public, read-only
 *   /profile                                — protected
 */
export default function App() {
  const dispatch = useDispatch();
  const auth = useSelector(selectAuth);
  const theme = useSelector(selectTheme);

  const { data, isSuccess, isError, isFetching } = useGetMeQuery(undefined, {
    skip: !auth.token
  });

  // No token at all: nothing to resolve, the app is immediately "initialised".
  useEffect(() => {
    if (!auth.token) {
      dispatch(markInitialised());
    }
  }, [auth.token, dispatch]);

  useEffect(() => {
    if (isSuccess && data?.user) {
      dispatch(setUser(data.user));
    }
  }, [isSuccess, data, dispatch]);

  useEffect(() => {
    if (isError) {
      // The stored token is no longer valid — the interceptor in apiSlice
      // already handles the 401 case; this covers genuine failures (e.g. the
      // account was deleted) that were not a 401.
      dispatch(clearSession());
    }
  }, [isError, dispatch]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (auth.expired) {
      const timer = setTimeout(() => dispatch(dismissExpiryNotice()), 8000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [auth.expired, dispatch]);

  if (auth.token && isFetching && !auth.initialised) {
    return <PageLoader />;
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/share/:token" element={<SharedCollectionPage />} />

        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/recall" element={<RecallModePage />} />
          <Route path="/explore" element={<DropsExplorerPage />} />
          <Route path="/drops" element={<MyDropsPage />} />
          <Route path="/drops/:id" element={<DropDetailPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/collections/:id" element={<CollectionDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>

      {/* Rendered outside AppShell too, so toasts on public pages (login,
          register, share) still work. */}
      <ToastContainer />
    </>
  );
}
