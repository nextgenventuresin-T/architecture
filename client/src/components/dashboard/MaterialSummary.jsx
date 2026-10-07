import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import Badge from '../ui/Badge';
import Skeleton from '../ui/Skeleton';
import { formatNumber } from '../../utils/format';

/**
 * Stock overview only. Full material management arrives with its own interface;
 * this answers one question — is anything about to run out?
 */
export default function MaterialSummary({ materials = [], isLoading }) {
  const lowStock = materials.filter((m) => m.inStock < m.reorderLevel).length;

  return (
    <Card>
      <CardHeader
        title="Material stock"
        description={lowStock > 0 ? `${lowStock} items below reorder level` : 'All items above reorder level'}
        action={
          <Link
            to="/admin/materials"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
          >
            View all
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />
      <CardBody className="space-y-3.5">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10" />)
          : materials.map((material) => {
              const isLow = material.inStock < material.reorderLevel;
              // Track is scaled against twice the reorder level, so the halfway
              // point on the bar is always the reorder threshold.
              const fill = Math.min(100, (material.inStock / (material.reorderLevel * 2)) * 100);

              return (
                <div key={material.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-ink">{material.name}</span>
                    <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                      {formatNumber(material.inStock)} {material.unit}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-100">
                      <div
                        className={`h-full rounded-full ${isLow ? 'bg-amber-500' : 'bg-brand-500'}`}
                        style={{ width: `${fill}%` }}
                      />
                    </div>
                    {isLow && <Badge tone="warning">Low</Badge>}
                  </div>
                </div>
              );
            })}
      </CardBody>
    </Card>
  );
}
