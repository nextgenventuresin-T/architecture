import { MapPin, Package, TrendingDown } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import ProgressBar from '../ui/ProgressBar';
import EmptyState from '../ui/EmptyState';
import InfoList from '../projects/InfoList';
import { formatCurrency, formatNumber, formatDate } from '../../utils/format';
import {
  MATERIAL_STATUS_LABELS,
  MATERIAL_STATUS_TONE,
  STOCK_STATUS_LABELS,
  STOCK_STATUS_TONE,
} from '../../utils/materialOptions';

/**
 * Stock position and where it sits. The gauge compares current stock against
 * the reorder point, so a full bar means comfortably above minimum rather than
 * a percentage of some capacity the system does not model.
 */
export default function StockOverviewTab({ material, locations }) {
  const { stats } = material;

  // Show stock relative to twice the reorder point, so "at minimum" reads as
  // the halfway mark and the bar stays meaningful once stock climbs.
  const gaugeMax = material.minStock > 0 ? material.minStock * 2 : Math.max(material.currentStock, 1);
  const gaugePct = Math.min(100, Math.round((material.currentStock / gaugeMax) * 100));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Material details" description={`${material.category} · measured in ${material.unit}`} />
        <CardBody>
          <InfoList
            columns={2}
            items={[
              { label: 'Material code', value: material.code },
              { label: 'Category', value: material.category },
              { label: 'Unit', value: material.unit },
              {
                label: 'Minimum stock level',
                value: `${formatNumber(material.minStock)} ${material.unit}`,
              },
              { label: 'Supplier', value: material.supplier || '—' },
              { label: 'Purchase rate', value: material.purchaseRate ? formatCurrency(material.purchaseRate) : '—' },
              {
                label: 'Last received',
                value: stats.lastReceived ? formatDate(stats.lastReceived) : 'Never',
              },
              {
                label: 'Status',
                value: (
                  <Badge tone={MATERIAL_STATUS_TONE[material.status] ?? 'neutral'}>
                    {MATERIAL_STATUS_LABELS[material.status] ?? material.status}
                  </Badge>
                ),
              },
            ]}
          />

          {material.notes && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-1.5 text-xs uppercase tracking-wide text-ink-subtle">Notes</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{material.notes}</p>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Stock overview" />
          <CardBody className="space-y-5">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums text-ink">
                  {formatNumber(material.currentStock)}
                </span>
                <span className="text-sm text-ink-subtle">{material.unit}</span>
              </div>
              <ProgressBar value={gaugePct} status={material.stockStatus === 'healthy' ? 'on-track' : 'delayed'} />
              <div className="mt-2 flex items-center justify-between">
                <Badge tone={STOCK_STATUS_TONE[material.stockStatus] ?? 'neutral'}>
                  {STOCK_STATUS_LABELS[material.stockStatus] ?? material.stockStatus}
                </Badge>
                <span className="text-xs text-ink-subtle">
                  min {formatNumber(material.minStock)} {material.unit}
                </span>
              </div>
            </div>

            {material.stockStatus !== 'healthy' && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5">
                <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <p className="text-sm text-ink-muted">
                  {material.stockStatus === 'out'
                    ? 'Nothing left in stock. Raise a material request or record a delivery.'
                    : `At or below the reorder point of ${formatNumber(material.minStock)} ${material.unit}.`}
                </p>
              </div>
            )}

            <InfoList
              items={[
                { label: 'Total received', value: `${formatNumber(stats.receivedQty)} ${material.unit}` },
                { label: 'Total used', value: `${formatNumber(stats.usedQty)} ${material.unit}` },
                { label: 'Stock value', value: formatCurrency(stats.stockValue) },
                { label: 'Deliveries', value: stats.entryCount },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <Card className="lg:col-span-3">
        <CardHeader
          title="Stock by project and site"
          description="Where this material currently sits, derived from its deliveries."
        />
        {locations.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Not stocked anywhere yet"
            description="Add a stock entry to record this material against a project or site."
          />
        ) : (
          <ul className="divide-y divide-line">
            {locations.map((loc) => (
              <li
                key={`${loc.project_id}-${loc.site_id ?? 'store'}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">{loc.site_name || `${loc.project_name} — project store`}</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    {loc.project_code} · {loc.project_name} · {loc.entry_count} deliver
                    {Number(loc.entry_count) === 1 ? 'y' : 'ies'}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-ink-subtle">
                    received {formatNumber(loc.received_qty)} · used {formatNumber(loc.used_qty)}
                  </span>
                  <span className="whitespace-nowrap font-medium tabular-nums text-ink">
                    {formatNumber(loc.current_stock)} {material.unit}
                  </span>
                  <Badge tone={Number(loc.current_stock) > 0 ? 'positive' : 'danger'}>
                    {Number(loc.current_stock) > 0 ? 'In stock' : 'Empty'}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
