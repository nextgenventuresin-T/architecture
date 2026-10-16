import { formatCurrency } from '../../utils/format';

/**
 * Item cost and transport shown as separate lines under a bucket. The bucket's
 * own Actual already INCLUDES the transport (counted once); these rows only split it.
 */
export const TRANSPORT_LABELS = {
  materials: ['Material cost', 'Material transport'],
  tools: ['Machine cost', 'Machine transport'],
  labour: ['Labour wages', 'Labour transport'],
};

/** <tr> rows for a table: `columns` = total number of columns in the table. */
export default function CostSplitRows({ bucket, util, columns, cellClass = 'px-3 py-1.5' }) {
  const c = util?.[bucket];
  const labels = TRANSPORT_LABELS[bucket];
  if (!c || !labels || !(Number(c.transport) > 0)) return null;
  const transport = Number(c.transport || 0);
  const itemCost = Number(c.actual || 0) - transport;
  const rest = Math.max(0, columns - 3);
  return (
    <>
      {[[labels[0], itemCost], [labels[1], transport]].map(([label, value]) => (
        <tr key={label} className="bg-canvas/30 text-[11px] text-ink-muted">
          <td className={`${cellClass} pl-9`}>↳ {label}</td>
          <td className={`${cellClass} text-right text-ink-subtle`}>—</td>
          <td className={`${cellClass} text-right tabular-nums`}>{formatCurrency(value)}</td>
          {rest > 0 && <td className={cellClass} colSpan={rest} />}
        </tr>
      ))}
    </>
  );
}

/** One-line split for cards and summary cells: "₹1,000 material + ₹1,000 transport". */
export function CostSplitLine({ bucket, util, total, transport, className = 'block text-[10px] font-normal text-ink-subtle' }) {
  const t = transport ?? Number(util?.[bucket]?.transport || 0);
  const all = total ?? Number(util?.[bucket]?.actual || 0);
  if (!(t > 0)) return null;
  const word = bucket === 'tools' ? 'machine' : bucket === 'labour' ? 'wages' : 'material';
  return <span className={className}>{formatCurrency(all - t)} {word} + {formatCurrency(t)} transport</span>;
}
