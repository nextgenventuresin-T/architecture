/**
 * ABCD India mark: three stacked slabs read as floor plates in elevation.
 * Rendered as an inline SVG. On a light surface the mark uses the active
 * theme's brand colour (via CSS variables) so it recolours with the theme;
 * on the coloured rail (tone="light") it stays white.
 */
export default function Logo({ size = 40, tone = 'brand', withWordmark = false, className = '' }) {
  const markColor = tone === 'light' ? '#FFFFFF' : 'rgb(var(--brand-600))';
  const accentColor = tone === 'light' ? 'rgba(255,255,255,0.55)' : 'rgb(var(--brand-300))';

  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        role="img"
        aria-label="ABCD India"
      >
        <rect width="40" height="40" rx="11" fill={markColor} opacity={tone === 'light' ? 0.16 : 0.1} />
        <path d="M20 8.5 30.5 15v2.6L20 11.1 9.5 17.6V15L20 8.5Z" fill={markColor} />
        <rect x="12" y="20" width="16" height="3.2" rx="1.2" fill={markColor} />
        <rect x="12" y="26" width="16" height="3.2" rx="1.2" fill={accentColor} />
      </svg>

      {withWordmark && (
        <span className="font-display text-[1.05rem] font-semibold leading-none tracking-tight">
          ABCD <span className="font-normal opacity-70">India</span>
        </span>
      )}
    </span>
  );
}
