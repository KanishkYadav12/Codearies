import { Link } from 'react-router-dom';
import { Button } from '../components/common/Button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl">🧭</p>
      <h1 className="text-lg font-semibold text-ink-900 dark:text-white">Page not found</h1>
      <p className="text-sm text-ink-500 dark:text-slate-400">
        That page doesn't exist, or you don't have access to it.
      </p>
      <Link to="/">
        <Button variant="outline">Back to dashboard</Button>
      </Link>
    </div>
  );
}

export default NotFoundPage;
