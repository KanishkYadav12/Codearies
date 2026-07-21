import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

import { selectAuthInitialised, selectIsAuthenticated } from '../../store/slices/authSlice';
import { PageLoader } from '../common/LoadingSpinner';

/**
 * Gate for authenticated routes.
 *
 * Waits on `auth.initialised` before deciding anything: on a hard refresh the
 * token exists in storage but `getMe` has not resolved yet, and redirecting to
 * /login during that window would bounce an already-logged-in user.
 */
export function ProtectedRoute({ children }) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const initialised = useSelector(selectAuthInitialised);
  const location = useLocation();

  if (!initialised) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;
