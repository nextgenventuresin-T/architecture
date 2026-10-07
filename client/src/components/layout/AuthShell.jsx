import { HardHat, ShieldCheck, LayoutGrid } from 'lucide-react';
import Logo from '../ui/Logo';

const CAPABILITIES = [
  { icon: LayoutGrid, text: 'Sites, contractors, materials and finance in one place' },
  { icon: HardHat, text: 'Daily site progress recorded by the people doing the work' },
  { icon: ShieldCheck, text: 'Approvals and spending visible to whoever signs them off' },
];

/**
 * Split-panel chrome shared by every signed-out screen: brand panel on the
 * left, content card on the right. Pages supply only the card contents, so the
 * branding stays identical across login, password help and access messages.
 */
export default function AuthShell({ title, description, children, footer }) {
  return (
    <main className="min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="blueprint-grid relative overflow-hidden bg-brand-800 px-6 py-10 text-white sm:px-10 lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-14">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />

        <div className="relative">
          <Logo size={44} tone="light" withWordmark />
        </div>

        <div className="relative mt-10 hidden max-w-md lg:mt-0 lg:block">
          <h2 className="font-display text-[2rem] font-semibold leading-[1.2]">
            Every site, every cost, on one plan.
          </h2>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-brand-100">
            ABCD India keeps project teams, contractors and the back office working from the
            same set of records.
          </p>

          <ul className="mt-10 space-y-4">
            {CAPABILITIES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-[0.925rem] text-brand-100">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="pt-1.5 leading-snug">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-10 hidden text-sm text-brand-200 lg:block">
          Access is granted by your administrator and matched to your role.
        </p>
      </aside>

      <section className="flex items-center justify-center px-5 py-12 sm:px-8 lg:px-14">
        <div className="w-full max-w-[26rem]">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
            <h1 className="font-display text-[1.6rem] font-semibold leading-tight text-ink">
              {title}
            </h1>
            {description && (
              <p className="mt-2 text-[0.925rem] leading-relaxed text-ink-muted">{description}</p>
            )}
            <div className="mt-7">{children}</div>
          </div>

          {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
