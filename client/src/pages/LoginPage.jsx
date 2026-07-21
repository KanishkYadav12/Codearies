import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import { AuthLayout } from '../components/auth/AuthLayout';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Checkbox } from '../components/common/Checkbox';
import { useForm } from '../hooks/useForm';
import { useLoginMutation } from '../store/api/apiSlice';
import { selectIsAuthenticated, setSession } from '../store/slices/authSlice';
import { validateEmail } from '../utils/validators';

export function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [login] = useLoginMutation();

  const form = useForm(
    { email: '', password: '', rememberMe: true },
    { email: validateEmail, password: (value) => (value ? null : 'Password is required') },
    (values) =>
      login({ email: values.email, password: values.password })
        .unwrap()
        .then(({ user, token }) => {
          dispatch(setSession(user, token, values.rememberMe));
          navigate(location.state?.from?.pathname || '/', { replace: true });
        })
  );

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to keep your streak alive"
      footer={
        <>
          New to DevDrops?{' '}
          <Link to="/register" className="font-medium text-drop-600 hover:underline dark:text-drop-400">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={form.handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          {...form.field('email')}
        />

        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          {...form.field('password')}
        />

        <Checkbox
          label="Remember me"
          checked={form.values.rememberMe}
          onChange={(event) => form.handleChange('rememberMe', event.target.checked)}
        />

        {form.submitError && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {form.submitError}
          </p>
        )}

        <Button type="submit" fullWidth loading={form.submitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-ink-500 dark:bg-ink-800 dark:text-slate-500">
        Demo: demo@devdrops.dev / demo1234
      </p>
    </AuthLayout>
  );
}

export default LoginPage;
