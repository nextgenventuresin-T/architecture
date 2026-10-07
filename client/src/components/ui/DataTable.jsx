import Skeleton from './Skeleton';
import EmptyState from './EmptyState';

/**
 * Table for wide screens with a stacked card fallback below `lg`, so a
 * ten-column project list stays readable on a phone.
 *
 * `columns`: { key, header, render(row), align, hideOnCard }
 * `renderCard`: optional custom mobile rendering for a row.
 */
export default function DataTable({
  columns,
  rows = [],
  isLoading,
  skeletonRows = 5,
  empty,
  renderCard,
  getRowKey = (row) => row.id,
  onRowClick,
}) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: skeletonRows }).map((_, index) => (
          <Skeleton key={index} className="h-14" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={empty?.title ?? 'Nothing to show'} description={empty?.description} action={empty?.action} icon={empty?.icon} />;
  }

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-5 py-3 font-medium ${column.align === 'right' ? 'text-right' : ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`transition-colors hover:bg-canvas/60 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((column) => (
                  <td key={column.key} className={`px-5 py-3.5 ${column.align === 'right' ? 'text-right' : ''}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line lg:hidden">
        {rows.map((row) => (
          <li key={getRowKey(row)} className="px-5 py-4">
            {renderCard ? (
              renderCard(row)
            ) : (
              <dl className="space-y-1.5">
                {columns.filter((c) => !c.hideOnCard).map((column) => (
                  <div key={column.key} className="flex items-start justify-between gap-3">
                    <dt className="text-xs text-ink-subtle">{column.header}</dt>
                    <dd className="min-w-0 text-right text-sm text-ink">{column.render(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
