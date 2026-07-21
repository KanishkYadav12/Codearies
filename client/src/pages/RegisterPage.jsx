import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import { AuthLayout } from '../components/auth/AuthLayout';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { PasswordStrengthMeter } from '../components/auth/PasswordStrengthMeter';
import { useForm } from '../hooks/useForm';
import { useRegisterMutation } from '../store/api/apiSlice';
import { selectIsAuthenticated, setSession } from '../store/slices/authSlice';
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
  validateUsername
} from '../utils/validators';

export function RegisterPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [register] = useRegisterMutation();

  const form = useForm(
    { username: '', email: '', password: '', confirmPassword: '' },
    {
      username: validateUsername,
      email: validateEmail,
      password: validatePassword,
      confirmPassword: validateConfirmPassword
    },
    (values) =>
      register({ username: values.username, email: values.email, password: values.password })
        .unwrap()
        .then(({ user, token }) => {
          dispatch(setSession(user, token, true));
          navigate('/', { replace: true });
        })
  );

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start capturing knowledge drops today"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-drop-600 hover:underline dark:text-drop-400">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={form.handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Username"
          autoComplete="username"
          placeholder="ada_lovelace"
          required
          {...form.field('username')}
        />

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          {...form.field('email')}
        />

        <div>
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            required
            {...form.field('password')}
          />
          <PasswordStrengthMeter password={form.values.password} />
        </div>

        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
          {...form.field('confirmPassword')}
        />

        {form.submitError && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {form.submitError}
          </p>
        )}

        <Button type="submit" fullWidth loading={form.submitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

export default RegisterPage;
