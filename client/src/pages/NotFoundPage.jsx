import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">This page does not exist</h1>
        <p className="mt-2 text-ink-muted">
          The link may be out of date, or the module has not been built yet.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
