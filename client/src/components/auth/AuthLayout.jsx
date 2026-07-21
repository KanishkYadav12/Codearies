/** Shared shell for the login/register/share pages — no sidebar, just a centred card. */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-ink-950">
      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-drop-500 font-mono text-lg font-bold text-white shadow-glow">
            D
          </span>
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500 dark:text-slate-400">{subtitle}</p>}
        </div>

        <div className="surface p-6">{children}</div>

        {footer && <p className="mt-6 text-center text-sm text-ink-500 dark:text-slate-500">{footer}</p>}
      </div>
    </div>
  );
}

export default AuthLayout;
