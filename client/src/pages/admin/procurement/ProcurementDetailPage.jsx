import { useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { Pencil, RefreshCw } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import Tabs from '../../../components/ui/Tabs';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import Badge from '../../../components/ui/Badge';
import OverviewTab from '../../../components/procurement/OverviewTab';
import PurchaseOrderTab from '../../../components/procurement/PurchaseOrderTab';
import ReceivingTab from '../../../components/procurement/ReceivingTab';
import TimelineTab from '../../../components/procurement/TimelineTab';
import StatusActions from '../../../components/procurement/StatusActions';
import PlaceOrderDialog from '../../../components/procurement/PlaceOrderDialog';
import ReceiveDialog from '../../../components/procurement/ReceiveDialog';
import useAsync from '../../../hooks/useAsync';
import useAuth from '../../../hooks/useAuth';
import { procurementApi } from '../../../api/procurementApi';
import { ROLES } from '../../../config/roles';
import { PROCUREMENT_STATUS_LABELS, PROCUREMENT_STATUS_TONE, EDITABLE_STATUSES } from '../../../utils/procurementOptions';
import { formatCurrency, formatNumber } from '../../../utils/format';

export default function ProcurementDetailPage({ basePath = '/admin/procurement' }) {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [flash, setFlash] = useState(location.state?.flash ?? null);
  const [actionError, setActionError] = useState(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);

  const { data: detail, isLoading, error, reload } = useAsync(() => procurementApi.detail(id), [id]);

  const canManage = [ROLES.ADMIN, ROLES.PROCUREMENT].includes(user?.role);
  const canReceive = [ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE].includes(user?.role);

  if (error) {
    return (
      <>
        <PageHeader
          title="Procurement request"
          breadcrumbs={[
            { label: 'Dashboard', to: basePath.startsWith('/admin') ? '/admin' : '/contractor' },
            { label: 'Procurement', to: basePath },
            { label: 'Not found' },
          ]}
          showBack
        />
        <Alert tone="error" title="Could not load this request">{error.message}</Alert>
        <Link to={basePath} className="mt-4 inline-block">
          <Button variant="secondary">Back to procurement</Button>
        </Link>
      </>
    );
  }

  if (isLoading || !detail) {
    return (
      <>
        <PageHeader
          title="Loading request…"
          breadcrumbs={[
            { label: 'Dashboard', to: basePath.startsWith('/admin') ? '/admin' : '/contractor' },
            { label: 'Procurement', to: basePath },
          ]}
          showBack
        />
        <div className="space-y-4">
          <Skeleton className="h-11" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  const { request, receipts, movement } = detail;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'po', label: 'Purchase order' },
    { id: 'receiving', label: 'Receiving', count: receipts.length },
    { id: 'timeline', label: 'Timeline' },
  ];

  const panels = {
    overview: <OverviewTab request={request} movement={movement} />,
    po: (
      <PurchaseOrderTab request={request} canManage={canManage} onPlaceOrder={() => setIsPlacingOrder(true)} />
    ),
    receiving: (
      <ReceivingTab request={request} receipts={receipts} canReceive={canReceive} onReceive={() => setIsReceiving(true)} />
    ),
    timeline: <TimelineTab request={request} receipts={receipts} />,
  };

  return (
    <>
      <PageHeader
        title={request.requestNumber}
        description={`${request.material.name} · ${formatNumber(request.quantity)} ${request.unit} · ${formatCurrency(request.estimatedTotal)}`}
        breadcrumbs={[
          { label: 'Dashboard', to: basePath.startsWith('/admin') ? '/admin' : '/contractor' },
          { label: 'Procurement', to: basePath },
          { label: request.requestNumber },
        ]}
        showBack
        actions={
          <>
            <Badge tone={PROCUREMENT_STATUS_TONE[request.status] ?? 'neutral'}>
              {PROCUREMENT_STATUS_LABELS[request.status] ?? request.status}
            </Badge>
            <Button variant="secondary" onClick={reload} aria-label="Refresh request">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            {EDITABLE_STATUSES.includes(request.status) && (
              <Link to={`${basePath}/${id}/edit`}>
                <Button>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit request
                </Button>
              </Link>
            )}
          </>
        }
      />

      {flash && <Alert tone="success" className="mb-4">{flash}</Alert>}
      {actionError && <Alert tone="error" title="Could not complete that" className="mb-4">{actionError.message}</Alert>}

      <div className="mb-6">
        <StatusActions
          request={request}
          movement={movement}
          onChanged={(message) => {
            setFlash(message);
            setActionError(null);
            reload();
          }}
          onError={setActionError}
        />
      </div>

      <Tabs
        tabs={tabs}
        active={activeTab}
        onChange={(tab) => {
          setActiveTab(tab);
          setFlash(null);
          setActionError(null);
        }}
        className="mb-6"
      />

      <div role="tabpanel">{panels[activeTab]}</div>

      <PlaceOrderDialog
        request={isPlacingOrder ? request : null}
        onClose={() => setIsPlacingOrder(false)}
        onSaved={(message) => {
          setIsPlacingOrder(false);
          setFlash(message);
          reload();
        }}
      />

      <ReceiveDialog
        request={isReceiving ? request : null}
        onClose={() => setIsReceiving(false)}
        onSaved={(message) => {
          setIsReceiving(false);
          setFlash(message);
          reload();
        }}
      />
    </>
  );
}
