import { Link, useParams, useLocation } from 'react-router-dom';
import { Pencil, Warehouse } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import Badge from '../../../components/ui/Badge';
import InfoList from '../../../components/projects/InfoList';
import useAsync from '../../../hooks/useAsync';
import { materialsApi } from '../../../api/materialsApi';
import { MATERIAL_STATUS_LABELS, MATERIAL_STATUS_TONE } from '../../../utils/materialOptions';

/**
 * Material MASTER detail. Identity and reference only — no stock quantities,
 * no "add stock", no stock entries. Actual stock lives in Warehouse
 * (warehouse_stock), the single source of truth.
 */
export default function MaterialDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const flash = location.state?.flash ?? null;

  const { data: detail, isLoading, error } = useAsync(() => materialsApi.detail(id), [id]);

  if (error) {
    return (
      <>
        <PageHeader
          title="Material"
          breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Materials', to: '/admin/materials' }, { label: 'Not found' }]}
          showBack
        />
        <Alert tone="error" title="Could not load this material">{error.message}</Alert>
        <Link to="/admin/materials" className="mt-4 inline-block">
          <Button variant="secondary">Back to materials</Button>
        </Link>
      </>
    );
  }

  if (isLoading || !detail) {
    return (
      <>
        <PageHeader
          title="Loading material…"
          breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Materials', to: '/admin/materials' }]}
          showBack
        />
        <div className="space-y-4"><Skeleton className="h-11" /><Skeleton className="h-64" /></div>
      </>
    );
  }

  const { material, requests = [] } = detail;

  return (
    <>
      <PageHeader
        title={material.name}
        description={`${material.code} · ${material.category}`}
        breadcrumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Materials', to: '/admin/materials' }, { label: material.name }]}
        showBack
        actions={
          <>
            <Badge tone={MATERIAL_STATUS_TONE[material.status] ?? 'neutral'}>
              {MATERIAL_STATUS_LABELS[material.status] ?? material.status}
            </Badge>
            <Link to={`/admin/materials/${id}/edit`}>
              <Button>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit material
              </Button>
            </Link>
          </>
        }
      />

      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}

      <Alert tone="info" className="mb-6">
        <span className="inline-flex items-center gap-1.5">
          <Warehouse className="h-4 w-4" aria-hidden="true" />
          Stock quantities for this material are shown in <Link to="/admin/warehouse" className="font-medium underline">Warehouse</Link>, the single source of truth.
        </span>
      </Alert>

      <Card>
        <CardHeader title="Material master" description="Identity used to select this material across the ERP." />
        <CardBody>
          <InfoList
            columns={2}
            items={[
              { label: 'Name', value: material.name },
              { label: 'Code', value: material.code || '—' },
              { label: 'Category', value: material.category },
              { label: 'Unit', value: material.unit },
              { label: 'Status', value: MATERIAL_STATUS_LABELS[material.status] ?? material.status },
              ...(material.notes ? [{ label: 'Notes', value: material.notes }] : []),
            ]}
          />
        </CardBody>
      </Card>

      {requests.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Used in procurement" description="Recent procurement requests referencing this material (reference only)." />
          <CardBody>
            <ul className="divide-y divide-line">
              {requests.slice(0, 10).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <Link to={`/admin/procurement/${r.id}`} className="text-brand-700 hover:underline">{r.requestNumber || r.request_number || `Request #${r.id}`}</Link>
                  <span className="text-ink-subtle">{r.status}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
