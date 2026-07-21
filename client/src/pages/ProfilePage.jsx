import { useDispatch, useSelector } from 'react-redux';

import { useGetStatsQuery, useUpdatePreferencesMutation } from '../store/api/apiSlice';
import { selectCurrentUser } from '../store/slices/authSlice';
import { pushToast, setTheme } from '../store/slices/uiSlice';

import { Card } from '../components/common/Card';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { StatCard } from '../components/dashboard/StatCard';
import { StatCardSkeleton } from '../components/common/Skeleton';
import { initials, dateTime } from '../utils/format';
import { previewSchedule } from '../utils/fibonacci';
import { TOKEN_STORAGE_KEY } from '../constants';

const RECALL_INTERVALS = [12, 24, 36, 48, 72, 168];

function readStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export function ProfilePage() {
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);
  const { data: stats, isLoading } = useGetStatsQuery();
  const [updatePreferences] = useUpdatePreferencesMutation();

  const handlePreferenceChange = (changes) => {
    updatePreferences(changes)
      .unwrap()
      .then(() => {
        if (changes.theme) {
          dispatch(setTheme(changes.theme));
        }
        dispatch(pushToast('Preferences saved', 'success'));
      })
      .catch(() => dispatch(pushToast('Could not save preferences', 'error')));
  };

  const handleExport = () => {
    const token = readStoredToken();

    fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include'
    })
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `devdrops-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        dispatch(pushToast('Export downloaded', 'success'));
      })
      .catch(() => dispatch(pushToast('Export failed', 'error')));
  };

  if (!user) {
    return null;
  }

  const schedule = previewSchedule(6, user.preferences.recallInterval);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-drop-500/15 text-lg font-semibold text-drop-600 dark:text-drop-400">
          {initials(user.username)}
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">{user.username}</h1>
          <p className="text-sm text-ink-500 dark:text-slate-400">{user.email}</p>
        </div>
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-500 dark:text-slate-500">Last login</dt>
            <dd className="mt-0.5 font-medium text-ink-800 dark:text-slate-200">
              {user.lastLogin ? dateTime(user.lastLogin) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500 dark:text-slate-500">Last login IP</dt>
            <dd className="mt-0.5 font-mono text-xs text-ink-800 dark:text-slate-200">{user.lastLoginIP || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500 dark:text-slate-500">Member since</dt>
            <dd className="mt-0.5 font-medium text-ink-800 dark:text-slate-200">{dateTime(user.createdAt)}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Total drops" value={stats?.totalDrops || 0} icon="▤" />
            <StatCard label="Collections" value={stats?.totalCollections || 0} icon="▢" />
            <StatCard label="Mastered" value={stats?.masteredDrops || 0} icon="✓" tone="success" />
            <StatCard label="Streak" value={stats?.currentStreak || 0} icon="🔥" tone="brand" />
          </>
        )}
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-ink-900 dark:text-white">Preferences</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-800 dark:text-slate-200">Theme</p>
              <p className="text-xs text-ink-500 dark:text-slate-500">Applies across all your sessions</p>
            </div>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-ink-800">
              {['light', 'dark'].map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => handlePreferenceChange({ theme })}
                  aria-pressed={user.preferences.theme === theme}
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    user.preferences.theme === theme
                      ? 'bg-white text-drop-600 shadow-sm dark:bg-ink-700 dark:text-drop-400'
                      : 'text-ink-500 dark:text-slate-400'
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink-800 dark:text-slate-200">Default visibility</p>
              <p className="text-xs text-ink-500 dark:text-slate-500">Applied to new drops unless overridden</p>
            </div>
            <Select
              value={user.preferences.defaultVisibility}
              onChange={(event) => handlePreferenceChange({ defaultVisibility: event.target.value })}
              options={[
                { value: 'private', label: 'Private' },
                { value: 'public', label: 'Public' }
              ]}
              containerClassName="w-32"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink-800 dark:text-slate-200">Recall cadence</p>
              <p className="text-xs text-ink-500 dark:text-slate-500">Scales every interval in the schedule</p>
            </div>
            <Select
              value={String(user.preferences.recallInterval)}
              onChange={(event) => handlePreferenceChange({ recallInterval: Number(event.target.value) })}
              options={RECALL_INTERVALS.map((hours) => ({
                value: String(hours),
                label: hours < 24 ? `${hours}h base` : `${hours / 24}d base`
              }))}
              containerClassName="w-32"
            />
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-ink-700">
          <p className="mb-2 text-xs text-ink-500 dark:text-slate-500">Your review ladder</p>
          <div className="flex flex-wrap gap-1.5">
            {schedule.map((step) => (
              <span
                key={step.step}
                className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-ink-600 dark:bg-ink-800 dark:text-slate-400"
              >
                {step.label}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Export your data</h2>
            <p className="text-xs text-ink-500 dark:text-slate-500">
              Download every drop, collection and recall event as JSON.
            </p>
          </div>
          <Button variant="outline" onClick={handleExport}>
            Export JSON
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default ProfilePage;
