import { Link } from 'react-router-dom';
import { KeyRound, UserCog, ArrowLeft } from 'lucide-react';
import AuthShell from '../../components/layout/AuthShell';

/**
 * Accounts in ABCD India are provisioned by an administrator, so password
 * recovery goes through them rather than a self-service email link. The
 * `password_resets` table already exists for when self-service is added.
 */
const ADMIN_CONTACT = 'admin@architecture-erp.local';

const ROUTES_TO_HELP = [
  {
    icon: UserCog,
    title: 'Ask your system administrator',
    body: 'They can set a new password on your account and pass it to you directly.',
  },
  {
    icon: KeyRound,
    title: 'Locked out after failed attempts?',
    body: 'An account unlocks by itself 15 minutes after the fifth failed sign-in. No action needed.',
  },
];

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Getting back into your account"
      description="ABCD India accounts are created and reset by your administrator."
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 rounded font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign in
        </Link>
      }
    >
      <ul className="space-y-4">
        {ROUTES_TO_HELP.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3.5 rounded-xl border border-line p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
            </div>
          </li>
        ))}
      </ul>

      <a
        href={`mailto:${ADMIN_CONTACT}?subject=ABCD%20India%20password%20reset`}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        Email your administrator
      </a>
    </AuthShell>
  );
}
