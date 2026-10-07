import { useState } from 'react';
import { Check, X, Send, RotateCcw, ShoppingCart, PackagePlus, Ban, ClipboardCheck } from 'lucide-react';
import Button from '../ui/Button';
import PlaceOrderDialog from './PlaceOrderDialog';
import ReceiveDialog from './ReceiveDialog';
import ReceiveMovementDialog from './ReceiveMovementDialog';
import DispatchDialog from './DispatchDialog';
import { procurementApi } from '../../api/procurementApi';
import { toApiError } from '../../api/axiosClient';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../config/roles';
import { STATUS_TRANSITIONS } from '../../utils/procurementOptions';

const ICONS = {
  requested: Send,
  pending_approval: Send,
  approved: Check,
  source_confirmed: Check,
  rejected: X,
  draft: RotateCcw,
  cancelled: Ban,
};

/**
 * One panel of buttons that covers the whole workflow: plain status flips
 * (submit, revert, approve, reject, cancel) plus the two dedicated actions —
 * Place order and Receive material — that carry extra fields a bare status
 * PATCH can't supply. Mirrors procurementService.js's TRANSITIONS exactly so
 * nothing offered here is ever rejected by the API.
 */
export default function StatusActions({ request, movement, onChanged, onError }) {
  const { user } = useAuth();
  const role = user?.role;
  const canManage = [ROLES.ADMIN, ROLES.PROCUREMENT].includes(role);
  const canManageOwnRequest = canManage || role === ROLES.CONTRACTOR;
  const canApprove = role === ROLES.ADMIN;
  const canReceive = [ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE].includes(role);

  const [pendingStatus, setPendingStatus] = useState(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isReceivingMovement, setIsReceivingMovement] = useState(false);
  const [isFulfilling, setIsFulfilling] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isConfirmingSource, setIsConfirmingSource] = useState(false);

  if (!canManageOwnRequest && !canReceive) return null;

  const status = request.status;
  const transitions = STATUS_TRANSITIONS[status] ?? [];
  const isApprovalDecision = status === 'pending_approval';
  const isFlowRequest = request.kind && request.kind !== 'project_site';

  async function applyStatus(nextStatus) {
    setPendingStatus(nextStatus);
    try {
      await procurementApi.updateStatus(request.id, nextStatus);
      onChanged(STATUS_MESSAGE[nextStatus] ?? 'Status updated.');
    } catch (caught) {
      onError(toApiError(caught));
    } finally {
      setPendingStatus(null);
    }
  }

  async function applyFulfil() {
    setIsFulfilling(true);
    try {
      await procurementApi.fulfil(request.id);
      onChanged('Material moved into warehouse stock.');
    } catch (caught) {
      onError(toApiError(caught));
    } finally {
      setIsFulfilling(false);
    }
  }

  async function applyConfirmSource() {
    setIsConfirmingSource(true);
    try {
      await procurementApi.confirmSource(request.id);
      onChanged('Request confirmed — you can now send the material.');
    } catch (caught) {
      onError(toApiError(caught));
    } finally {
      setIsConfirmingSource(false);
    }
  }

  const buttons = [];

  if (canManageOwnRequest) {
    for (const next of transitions) {
      if (isApprovalDecision && !canApprove) continue; // Only Admin can approve/reject.
      buttons.push(
        <Button
          key={next}
          type="button"
          variant={next === 'cancelled' || next === 'rejected' ? 'secondary' : next === 'draft' ? 'secondary' : 'primary'}
          isLoading={pendingStatus === next}
          loadingText="Working…"
          onClick={() => applyStatus(next)}
        >
          <StatusIcon status={next} />
          {STATUS_BUTTON_LABEL[`${status}>${next}`] ?? next}
        </Button>
      );
    }

    if (isApprovalDecision && !canApprove) {
      buttons.push(
        <span key="awaiting" className="text-sm text-ink-subtle">
          Awaiting an admin decision.
        </span>
      );
    }

    if (canManage && status === 'approved' && !isFlowRequest) {
      buttons.push(
        <Button key="place-order" type="button" variant="primary" onClick={() => setIsPlacingOrder(true)}>
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          Place order
        </Button>
      );
    }
  }

  // Instant fulfilment only for receipt-style flows (supplier purchase / central
  // purchase). Two-phase movement kinds use Send Material -> Receive instead.
  const isMovementKind =
    request.kind === 'internal_transfer' ||
    (request.kind === 'contractor_supply' && request.source?.type === 'central_warehouse');
  const isInternalTransfer = request.kind === 'internal_transfer';

  if (canReceive && isFlowRequest && !isMovementKind && status === 'approved' && !request.warehouseTransactionId) {
    buttons.push(
      <Button key="fulfil" type="button" variant="primary" isLoading={isFulfilling} loadingText="Moving…" onClick={applyFulfil}>
        <PackagePlus className="h-4 w-4" aria-hidden="true" />
        Fulfil into warehouse
      </Button>
    );
  }

  // Confirm request: the SOURCE contractor of an approved contractor-to-
  // contractor transfer accepts it. `canConfirmSource` is computed server-side
  // for this exact viewer, so the destination contractor and every other role
  // simply never see it. Confirming moves no stock.
  if (request.canConfirmSource) {
    buttons.push(
      <Button
        key="confirm-source"
        type="button"
        variant="primary"
        isLoading={isConfirmingSource}
        loadingText="Confirming…"
        onClick={applyConfirmSource}
      >
        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
        Confirm request
      </Button>
    );
  }

  if (isInternalTransfer && status === 'source_confirmed' && !request.canDispatch) {
    buttons.push(
      <span key="awaiting-send" className="text-sm text-ink-subtle">
        Confirmed — awaiting the supplying contractor to send the material.
      </span>
    );
  }

  // Send Material. Also server-computed:
  //   internal_transfer  -> source contractor only, and only once confirmed.
  //   central -> contractor -> Admin/Procurement/Warehouse on an approved
  //                            request (unchanged).
  if (request.canDispatch) {
    buttons.push(
      <Button key="dispatch" type="button" variant="primary" onClick={() => setIsDispatching(true)}>
        <Send className="h-4 w-4" aria-hidden="true" />
        Send material
      </Button>
    );
  }

  // Movement receive (Central->Contractor, Contractor->Contractor): the
  // DESTINATION contractor (or Admin/Warehouse) receives the in-transit
  // shipment. Backend enforces destination-only, so this is safe to offer.
  if (movement && movement.status === 'in_transit' && (canReceive || role === ROLES.CONTRACTOR)) {
    buttons.push(
      <Button key="receive-movement" type="button" variant="primary" onClick={() => setIsReceivingMovement(true)}>
        <PackagePlus className="h-4 w-4" aria-hidden="true" />
        Receive material
      </Button>
    );
  }

  // Legacy project/supplier receipt (into material_entries) — not for the
  // two-phase movement kinds, which use the movement receive above.
  if (canReceive && !isMovementKind && ['ordered', 'partially_received'].includes(status)) {
    buttons.push(
      <Button key="receive" type="button" variant="primary" onClick={() => setIsReceiving(true)}>
        <PackagePlus className="h-4 w-4" aria-hidden="true" />
        Receive material
      </Button>
    );
  }

  if (buttons.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">{buttons}</div>

      <PlaceOrderDialog
        request={isPlacingOrder ? request : null}
        onClose={() => setIsPlacingOrder(false)}
        onSaved={(message) => {
          setIsPlacingOrder(false);
          onChanged(message);
        }}
      />

      <ReceiveDialog
        request={isReceiving ? request : null}
        onClose={() => setIsReceiving(false)}
        onSaved={(message) => {
          setIsReceiving(false);
          onChanged(message);
        }}
      />

      <ReceiveMovementDialog
        movement={isReceivingMovement ? movement : null}
        onClose={() => setIsReceivingMovement(false)}
        onReceived={(message) => {
          setIsReceivingMovement(false);
          onChanged(message);
        }}
        onError={onError}
      />

      <DispatchDialog
        request={isDispatching ? request : null}
        onClose={() => setIsDispatching(false)}
        onSaved={(message) => {
          setIsDispatching(false);
          onChanged(message);
        }}
        onError={onError}
      />
    </>
  );
}

function StatusIcon({ status }) {
  const Icon = ICONS[status] ?? Send;
  return <Icon className="h-4 w-4" aria-hidden="true" />;
}

const STATUS_BUTTON_LABEL = {
  'draft>requested': 'Submit request',
  'draft>cancelled': 'Cancel request',
  'requested>pending_approval': 'Submit for approval',
  'requested>draft': 'Revert to draft',
  'requested>cancelled': 'Cancel request',
  'pending_approval>approved': 'Approve',
  'pending_approval>rejected': 'Reject',
  'approved>cancelled': 'Cancel request',
  'source_confirmed>cancelled': 'Cancel request',
  'ordered>cancelled': 'Cancel request',
  'partially_received>cancelled': 'Cancel request',
};

const STATUS_MESSAGE = {
  requested: 'Request submitted.',
  pending_approval: 'Sent for approval.',
  draft: 'Reverted to draft.',
  approved: 'Request approved.',
  source_confirmed: 'Request confirmed by the supplying contractor.',
  rejected: 'Request rejected.',
  cancelled: 'Request cancelled.',
};
