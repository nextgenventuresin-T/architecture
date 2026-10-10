import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Save, Send, X } from 'lucide-react';
import PageHeader from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardBody } from '../../../components/ui/Card';
import { InputField, SelectField, TextAreaField } from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import Alert from '../../../components/ui/Alert';
import Skeleton from '../../../components/ui/Skeleton';
import useAsync from '../../../hooks/useAsync';
import { procurementApi } from '../../../api/procurementApi';
import { projectsApi } from '../../../api/projectsApi';
import { materialsApi } from '../../../api/materialsApi';
import { vendorApi } from '../../../api/vendorApi';
import { tasksApi } from '../../../api/tasksApi';
import { toolApi } from '../../../api/toolApi';
import { toApiError } from '../../../api/axiosClient';
import { formatCurrency } from '../../../utils/format';
import { PRIORITIES, EDITABLE_STATUSES, PROCUREMENT_STATUS_LABELS, PROCUREMENT_KIND_OPTIONS, SOURCE_TYPE_OPTIONS } from '../../../utils/procurementOptions';

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  item_type: 'material',
  tool_id: '',
  tool_procurement_type: 'purchased_owned',
  rental_cost: '',
  usage_charge_rate: '',
  rental_days: '1',
  rental_start_date: '',
  rental_end_date: '',
  procurement_kind: 'project_site',
  source_choice: 'central_warehouse', // contractor-facing: central_warehouse | contractor | supplier
  source_type: 'central_warehouse',
  destination_contractor_id: '',
  source_contractor_id: '',
  project_id: '',
  site_id: '',
  task_id: '',
  subtask_id: '',
  material_id: '',
  vendor_id: '',
  supplier: '',
  supplier_contact: '',
  quantity: '',
  unit: '',
  estimated_rate: '',
  purchase_rate: '',
  total_amount: '',
  purchase_date: '',
  bill_reference: '',
  vehicle_number: '',
  driver_name: '',
  driver_phone: '',
  challan_number: '',
  challan_date: '',
  invoice_number: '',
  invoice_date: '',
  remarks: '',
  required_date: '',
  priority: 'medium',
  reason: '',
  notes: '',
  excess_reason: '',
};

/** Serves both /procurement/new and /procurement/:id/edit — same fields, same rules. */
export default function ProcurementFormPage({ mode = 'create', basePath = '/admin/procurement' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === 'edit';
  // Contractors and Project Managers raise REQUESTS (project -> site -> task -> source). They are not
  // dispatching anything, so this form never asks them for vehicle / driver / transport details.
  const isContractor = basePath.startsWith('/contractor') || basePath.startsWith('/pm');
  const workspaceRoot = basePath.startsWith('/admin') ? '/admin' : basePath.startsWith('/pm') ? '/pm' : '/contractor';
  const [billFile, setBillFile] = useState(null);

  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [savingAction, setSavingAction] = useState(null); // 'draft' | 'submit' | 'save' | null
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [plannedMaterials, setPlannedMaterials] = useState([]);
  const [plannedTools, setPlannedTools] = useState([]);
  const [loadingPlannedMaterials, setLoadingPlannedMaterials] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [tools, setTools] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [vendors, setVendors] = useState([]);

  const { data: existing, isLoading: loadingRequest, error: loadError } = useAsync(
    () => (isEdit ? procurementApi.detail(id) : Promise.resolve(null)),
    [isEdit, id]
  );

  useEffect(() => {
    if (basePath.startsWith('/pm')) {
      procurementApi.lookups().then((data) => setProjects(data.projects ?? [])).catch(() => setProjects([]));
    } else {
      projectsApi.list({ pageSize: 50 }).then((data) => setProjects(data.projects ?? [])).catch(() => setProjects([]));
    }
    materialsApi.list({ pageSize: 50 }).then((data) => setMaterials(data.materials ?? [])).catch(() => setMaterials([]));
    toolApi.list({ pageSize: 100 }).then((data) => setTools(data.tools ?? [])).catch(() => setTools([]));
    procurementApi.lookups().then((data) => setContractors(data.contractors ?? [])).catch(() => setContractors([]));
    vendorApi.list().then((data) => setVendors(data.vendors ?? [])).catch(() => setVendors([]));
  }, []);

  useEffect(() => {
    if (!values.project_id) {
      setSites([]);
      setTasks([]);
      return;
    }
    let active = true;
    projectsApi
      .detail(values.project_id)
      .then((data) => active && setSites(data.sites ?? []))
      .catch(() => active && setSites([]));

    tasksApi
      .list({ projectId: values.project_id, siteId: values.site_id || undefined })
      .then((data) => active && setTasks(data ?? []))
      .catch(() => active && setTasks([]));

    return () => {
      active = false;
    };
  }, [values.project_id, values.site_id]);

  useEffect(() => {
    if (!values.task_id) {
      setPlannedMaterials([]);
      return;
    }
    let active = true;
    setLoadingPlannedMaterials(true);
    tasksApi
      .getPlannedMaterials(values.task_id, values.subtask_id || 'direct')
      .then((data) => active && setPlannedMaterials(data ?? []))
      .catch(() => active && setPlannedMaterials([]))
      .finally(() => {
        if (active) setLoadingPlannedMaterials(false);
      });
    return () => {
      active = false;
    };
  }, [values.task_id, values.subtask_id]);

  // Machines Admin planned for the selected task - the only ones a contractor / PM may request.
  useEffect(() => {
    if (!values.task_id) {
      setPlannedTools([]);
      return;
    }
    let active = true;
    tasksApi
      .getPlannedTools(values.task_id, values.subtask_id || 'direct')
      .then((data) => active && setPlannedTools(data ?? []))
      .catch(() => active && setPlannedTools([]));
    return () => {
      active = false;
    };
  }, [values.task_id, values.subtask_id]);

  useEffect(() => {
    if (!existing?.request) return;
    const r = existing.request;
    setValues({
      item_type: r.itemType ?? (r.tool ? 'tool' : 'material'),
      tool_id: r.tool?.id ? String(r.tool.id) : (r.tool_id ? String(r.tool_id) : ''),
      tool_procurement_type: r.toolProcurementType || 'purchased_owned',
      rental_cost: r.rentalCost != null ? String(r.rentalCost) : '',
      usage_charge_rate: r.usageChargeRate != null ? String(r.usageChargeRate) : '',
      rental_days: r.rentalDays != null ? String(r.rentalDays) : '1',
      rental_start_date: r.rentalStartDate ? String(r.rentalStartDate).slice(0, 10) : '',
      rental_end_date: r.rentalEndDate ? String(r.rentalEndDate).slice(0, 10) : '',
      procurement_kind: r.kind ?? 'project_site',
      source_type: r.sourceType ?? 'central_warehouse',
      destination_contractor_id: r.destination?.contractorId ? String(r.destination.contractorId) : '',
      source_contractor_id: r.source?.contractorId ? String(r.source.contractorId) : '',
      project_id: r.project ? String(r.project.id) : '',
      site_id: r.site ? String(r.site.id) : '',
      task_id: r.task?.id ? String(r.task.id) : (r.task_id ? String(r.task_id) : ''),
      subtask_id: r.subtask?.id ? String(r.subtask.id) : '',
      material_id: r.material?.id ? String(r.material.id) : '',
      vendor_id: r.vendorId ? String(r.vendorId) : '',
      supplier: r.supplier ?? '',
      supplier_contact: r.supplierContact ?? '',
      quantity: String(r.quantity ?? ''),
      unit: r.unit ?? '',
      estimated_rate: String(r.estimatedRate ?? 0),
      purchase_rate: r.purchaseRate != null ? String(r.purchaseRate) : '',
      total_amount: r.totalAmount != null ? String(r.totalAmount) : '',
      purchase_date: r.purchaseDate ? String(r.purchaseDate).slice(0, 10) : '',
      bill_reference: r.billReference ?? '',
      vehicle_number: r.vehicleNumber ?? '',
      driver_name: r.driverName ?? '',
      driver_phone: r.driverPhone ?? '',
      challan_number: r.challanNumber ?? '',
      challan_date: r.challanDate ? String(r.challanDate).slice(0, 10) : '',
      invoice_number: r.invoiceNumber ?? '',
      invoice_date: r.invoiceDate ? String(r.invoiceDate).slice(0, 10) : '',
      remarks: r.remarks ?? '',
      required_date: r.requiredDate ? String(r.requiredDate).slice(0, 10) : '',
      priority: r.priority ?? 'medium',
      reason: r.reason ?? '',
      notes: r.notes ?? '',
      excess_reason: r.excessReason || r.excess_reason || '',
    });
  }, [existing]);

  const setTool = (event) => {
    const { value } = event.target;
    const foundTool = tools.find((t) => String(t.id) === value);
    const plan = plannedTools.find((t) => String(t.toolId) === value);
    setValues((current) => {
      let pType = foundTool?.ownershipType === 'rented' ? 'rented' : (foundTool?.ownershipType === 'to_be_purchased' ? 'to_be_purchased' : 'purchased_owned');
      const chargeRate = foundTool?.defaultChargeRate ? String(foundTool.defaultChargeRate) : '';
      let rentRate = foundTool?.rentalRate ? String(foundTool.rentalRate) : '';
      if (plan) {
        // Prefill from the estimate planned on the task; Admin can still change it.
        const isPurchase = String(plan.rentalType || '').toLowerCase() === 'purchase';
        if (isPurchase) {
          return {
            ...current,
            tool_id: value,
            tool_procurement_type: 'to_be_purchased',
            purchase_rate: String(plan.plannedRate),
            estimated_rate: String(plan.plannedRate),
            total_amount: String(plan.plannedRate),
            unit: 'unit',
            quantity: '1',
          };
        }
        pType = 'rented';
        rentRate = String(plan.plannedRate);
        current = { ...current, rental_days: String(plan.plannedDays || current.rental_days || 1) };
      }
      const qty = parseFloat(current.quantity) || 1;
      let total = '';
      if (pType === 'rented' && rentRate) {
        total = String(Number((parseFloat(rentRate) * qty * (parseFloat(current.rental_days) || 1)).toFixed(2)));
      } else if (pType === 'purchased_owned' && chargeRate) {
        total = String(Number((parseFloat(chargeRate) * qty).toFixed(2)));
      }
      return {
        ...current,
        tool_id: value,
        tool_procurement_type: pType,
        usage_charge_rate: chargeRate,
        rental_cost: rentRate,
        purchase_rate: pType === 'rented' ? rentRate : (pType === 'purchased_owned' ? chargeRate : current.purchase_rate),
        total_amount: total,
        unit: 'unit',
        quantity: current.quantity || '1',
      };
    });
    setFieldErrors((current) => ({ ...current, tool_id: undefined }));
  };

  const set = (key) => (event) => {
    const { value } = event.target;
    setValues((current) => {
      const next = {
        ...current,
        [key]: value,
        ...(key === 'project_id' ? { site_id: '', task_id: '', subtask_id: '', material_id: '' } : null),
        ...(key === 'site_id' ? { task_id: '', subtask_id: '', material_id: '' } : null),
        ...(key === 'task_id' ? { subtask_id: '', material_id: '', ...(isContractor ? { tool_id: '' } : null) } : null),
        ...(key === 'subtask_id' ? { material_id: '', ...(isContractor ? { tool_id: '' } : null) } : null),
      };

      // Auto-calculate tool and rental costs
      if (next.item_type === 'tool') {
        const qty = parseFloat(next.quantity) || 1;
        if (next.tool_procurement_type === 'rented') {
          const rentRate = parseFloat(next.rental_cost || next.purchase_rate || 0);
          const rDays = parseFloat(next.rental_days || 1);
          if (rentRate > 0) {
            next.total_amount = String(Number((rentRate * rDays * qty).toFixed(2)));
          }
        } else if (next.tool_procurement_type === 'purchased_owned') {
          const cRate = parseFloat(next.usage_charge_rate || 0);
          next.total_amount = cRate > 0 ? String(Number((cRate * qty).toFixed(2))) : '0';
          next.purchase_rate = '0';
        } else if (next.tool_procurement_type === 'to_be_purchased') {
          const pRate = parseFloat(next.purchase_rate || next.estimated_rate || 0);
          if (pRate > 0) {
            next.total_amount = String(Number((pRate * qty).toFixed(2)));
          }
        }
        return next;
      }

      // Auto-calculate total cost when quantity or unit cost changes for material
      if (key === 'quantity' || key === 'purchase_rate' || key === 'estimated_rate') {
        const qty = parseFloat(key === 'quantity' ? value : next.quantity);
        const pRate = parseFloat(key === 'purchase_rate' ? value : next.purchase_rate);
        const eRate = parseFloat(key === 'estimated_rate' ? value : next.estimated_rate);

        // Keep unit cost fields in sync if one is filled and other is empty
        if (key === 'purchase_rate' && value && (!next.estimated_rate || next.estimated_rate === '0')) {
          next.estimated_rate = value;
        } else if (key === 'estimated_rate' && value && !next.purchase_rate) {
          next.purchase_rate = value;
        }

        const effectiveRate = !isNaN(pRate) && pRate >= 0 ? pRate : (!isNaN(eRate) && eRate >= 0 ? eRate : null);

        if (!isNaN(qty) && qty > 0 && effectiveRate !== null) {
          next.total_amount = String(Number((qty * effectiveRate).toFixed(2)));
        } else if (key === 'quantity' && (!value || qty <= 0)) {
          if (!next.purchase_rate && !next.estimated_rate) {
            next.total_amount = '';
          }
        }
      }

      return next;
    });
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  };

  const setVendor = (event) => {
    const { value } = event.target;
    const selected = vendors.find((v) => String(v.id) === value);
    setValues((current) => ({
      ...current,
      vendor_id: value,
      supplier: selected ? selected.name : current.supplier,
      supplier_contact: selected ? (selected.phone || selected.contactPerson || '') : current.supplier_contact,
    }));
    setFieldErrors((current) => ({ ...current, vendor_id: undefined }));
  };

  /** Selecting a material prefills unit and non-zero unit cost from default_rate */
  const setMaterial = (event) => {
    const { value } = event.target;
    const pm = plannedMaterials.find((m) => String(m.materialId) === value);
    const material = materials.find((m) => String(m.id) === value);
    const rateToUse = pm?.costPerUnit
      ? String(pm.costPerUnit)
      : (material?.defaultRate && Number(material.defaultRate) > 0
          ? String(material.defaultRate)
          : (material?.default_rate && Number(material.default_rate) > 0
              ? String(material.default_rate)
              : (material?.purchaseRate && Number(material.purchaseRate) > 0 ? String(material.purchaseRate) : '')));
    setValues((current) => {
      const nextRate = rateToUse || '';
      const qty = parseFloat(current.quantity);
      const effectiveRate = parseFloat(nextRate);
      const nextTotal = (!isNaN(qty) && qty > 0 && !isNaN(effectiveRate) && effectiveRate > 0)
        ? String(Number((qty * effectiveRate).toFixed(2)))
        : '';

      return {
        ...current,
        material_id: value,
        unit: pm?.unit || material?.unit || current.unit || '',
        estimated_rate: nextRate,
        purchase_rate: nextRate,
        total_amount: nextTotal,
      };
    });
    setFieldErrors((current) => ({ ...current, material_id: undefined }));
  };

  const currentPlannedMaterial = plannedMaterials.find(
    (pm) => String(pm.materialId) === String(values.material_id)
  );
  const plannedQty = currentPlannedMaterial ? currentPlannedMaterial.revisedPlannedQuantity : 0;
  const alreadyProcured = currentPlannedMaterial ? currentPlannedMaterial.alreadyProcured : 0;
  const remainingPlanned = currentPlannedMaterial ? currentPlannedMaterial.remainingPlannedQuantity : 0;
  const requestedQty = Number(values.quantity || 0);
  const remainingAfter = currentPlannedMaterial ? Number((remainingPlanned - requestedQty).toFixed(2)) : 0;
  const isToolItem = values.item_type === 'tool';
  const currentPlannedTool = plannedTools.find((t) => String(t.toolId) === String(values.tool_id));
  const selectedTaskSubtasks = tasks.find((t) => String(t.id) === String(values.task_id))?.subtasks ?? [];
  const isToolExcess = isContractor && isToolItem && Boolean(currentPlannedTool) && requestedQty > currentPlannedTool.remainingQuantity;
  const isExcess = isToolItem
    ? isToolExcess
    : values.task_id
    ? currentPlannedMaterial
      ? requestedQty > remainingPlanned
      : requestedQty > 0
    : false;
  const selectedTool = tools.find((t) => String(t.id) === String(values.tool_id));
  const excessQty = isToolItem
    ? (isToolExcess ? requestedQty : 0)
    : isExcess
    ? currentPlannedMaterial
      ? Number((requestedQty - remainingPlanned).toFixed(2))
      : requestedQty
    : 0;

  const materialOptions = values.task_id && plannedMaterials.length > 0
    ? [
        ...plannedMaterials.map((m) => ({
          value: String(m.materialId),
          label: `⭐ [Planned] ${m.materialName} — Remaining: ${m.remainingPlannedQuantity} ${m.unit} (of ${m.revisedPlannedQuantity})`,
        })),
        ...materials
          .filter((m) => !plannedMaterials.some((pm) => Number(pm.materialId) === Number(m.id)))
          .map((m) => ({
            value: String(m.id),
            label: `${m.name} (${m.category}) — [Unplanned - requires reason & Admin approval]`,
          })),
      ]
    : materials.map((m) => ({ value: String(m.id), label: `${m.name} (${m.category})` }));

  function validate() {
    const errors = {};
    if (isContractor) {
      // Contractor form: Project -> Site -> Task -> Source only.
      if (!values.project_id) errors.project_id = 'Select a project.';
      if (!values.task_id) errors.task_id = 'Select a task for task-wise procurement.';
      if (values.source_choice === 'contractor' && !values.source_contractor_id) errors.source_contractor_id = 'Select the contractor to request from.';
      if (values.source_choice === 'supplier' && !values.supplier.trim()) errors.supplier = 'Enter the supplier name.';
      if (values.item_type === 'tool') {
        if (!values.tool_id) errors.tool_id = 'Select a tool or machinery.';
      } else {
        if (!values.material_id) errors.material_id = 'Select a material.';
      }
      if (!values.quantity || Number(values.quantity) <= 0) errors.quantity = 'Enter a quantity greater than zero.';
      if (values.item_type === 'tool' && Number(values.quantity) !== 1) {
        errors.quantity = 'Each physical machine has its own serial number - request one machine at a time (quantity 1).';
      }
      if (isExcess && !values.excess_reason?.trim()) {
        errors.excess_reason = isToolItem
          ? 'All planned machines of this type are already requested for this task - give a reason for the extra one.'
          : 'Reason for excess procurement is mandatory when requested quantity exceeds the Admin-planned baseline.';
      }
      return errors;
    }
    const kind = values.procurement_kind;
    if (kind === 'central_purchase' && !values.vehicle_number?.trim()) {
      errors.vehicle_number = 'Vehicle number is mandatory for Central Warehouse purchase.';
    }
    if (kind === 'project_site') {
      if (!values.project_id) errors.project_id = 'Select a project.';
      if (values.item_type !== 'tool' && isExcess && !values.excess_reason?.trim()) {
        errors.excess_reason = 'Reason for excess procurement is mandatory when requested quantity exceeds the Admin-planned baseline.';
      }
    }
    if (kind === 'contractor_supply' && !values.destination_contractor_id) errors.destination_contractor_id = 'Select the receiving contractor.';
    if (kind === 'internal_transfer') {
      if (!values.source_contractor_id) errors.source_contractor_id = 'Select the source contractor.';
      if (!values.destination_contractor_id) errors.destination_contractor_id = 'Select the destination contractor.';
      if (values.source_contractor_id && values.source_contractor_id === values.destination_contractor_id) {
        errors.destination_contractor_id = 'Choose a different contractor to transfer to.';
      }
    }
    if (values.item_type === 'tool') {
      if (!values.tool_id) errors.tool_id = 'Select a tool or machinery.';
    } else {
      if (!values.material_id) errors.material_id = 'Select a material.';
    }
    if (!values.quantity || Number(values.quantity) <= 0) errors.quantity = 'Enter a quantity greater than zero.';
    if (values.estimated_rate !== '' && Number(values.estimated_rate) < 0) {
      errors.estimated_rate = 'Rate cannot be negative.';
    }
    return errors;
  }

  function buildPayload() {
    // Contractor form maps a single "Source" choice onto the backend kinds.
    // A contractor is always the DESTINATION and is tied to their project/site.
    const isTool = values.item_type === 'tool';
    if (isContractor) {
      const common = {
        item_type: isTool ? 'tool' : 'material',
        material_id: !isTool && values.material_id ? Number(values.material_id) : null,
        tool_id: isTool && values.tool_id ? Number(values.tool_id) : null,
        quantity: Number(values.quantity),
        unit: values.unit.trim() || (isTool ? 'unit' : undefined),
        project_id: Number(values.project_id),
        site_id: values.site_id ? Number(values.site_id) : null,
        task_id: values.task_id ? Number(values.task_id) : null,
        subtask_id: values.task_id && values.subtask_id ? Number(values.subtask_id) : null,
        excess_reason: values.excess_reason ? values.excess_reason.trim() : null,
        required_date: values.required_date || null,
        priority: values.priority,
        reason: values.reason.trim() || null,
        notes: values.notes.trim() || null,
        estimated_rate: values.purchase_rate ? Number(values.purchase_rate) : (values.estimated_rate ? Number(values.estimated_rate) : 0),
        purchase_rate: values.purchase_rate ? Number(values.purchase_rate) : (values.estimated_rate ? Number(values.estimated_rate) : null),
        total_amount: values.total_amount ? Number(values.total_amount) : null,
        tool_procurement_type: isTool ? values.tool_procurement_type : null,
        rental_cost: isTool && values.rental_cost ? Number(values.rental_cost) : null,
        usage_charge_rate: isTool && values.usage_charge_rate ? Number(values.usage_charge_rate) : null,
        rental_days: isTool && values.rental_days ? Number(values.rental_days) : null,
        rental_start_date: isTool && values.rental_start_date ? values.rental_start_date : null,
        rental_end_date: isTool && values.rental_end_date ? values.rental_end_date : null,
      };
      if (values.source_choice === 'central_warehouse') {
        return {
          ...common,
          procurement_kind: 'contractor_supply',
          source_type: 'central_warehouse',
          remarks: values.remarks ? values.remarks.trim() : null,
        };
      }
      if (values.source_choice === 'contractor') {
        return { ...common, procurement_kind: 'internal_transfer', source_contractor_id: Number(values.source_contractor_id) };
      }
      // Outside supplier — external purchase with bill + financials.
      return {
        ...common,
        procurement_kind: 'contractor_supply',
        source_type: 'supplier',
        vendor_id: values.vendor_id ? Number(values.vendor_id) : null,
        supplier: values.supplier.trim() || null,
        supplier_contact: values.supplier_contact.trim() || null,
        purchase_date: values.purchase_date || null,
        bill_reference: values.bill_reference.trim() || null,
        challan_number: values.challan_number ? values.challan_number.trim() : null,
        challan_date: values.challan_date || null,
        invoice_number: values.invoice_number ? values.invoice_number.trim() : null,
        invoice_date: values.invoice_date || null,
        remarks: values.remarks ? values.remarks.trim() : null,
      };
    }
    const kind = values.procurement_kind;
    const base = {
      procurement_kind: kind,
      item_type: isTool ? 'tool' : 'material',
      material_id: !isTool && values.material_id ? Number(values.material_id) : null,
      tool_id: isTool && values.tool_id ? Number(values.tool_id) : null,
      task_id: values.task_id ? Number(values.task_id) : null,
      subtask_id: values.task_id && values.subtask_id ? Number(values.subtask_id) : null,
      excess_reason: values.excess_reason ? values.excess_reason.trim() : null,
      vendor_id: values.vendor_id ? Number(values.vendor_id) : null,
      supplier: values.supplier.trim() || null,
      supplier_contact: values.supplier_contact.trim() || null,
      quantity: Number(values.quantity),
      unit: values.unit.trim() || (isTool ? 'unit' : undefined),
      estimated_rate: values.purchase_rate ? Number(values.purchase_rate) : (values.estimated_rate ? Number(values.estimated_rate) : 0),
      required_date: values.required_date || null,
      priority: values.priority,
      reason: values.reason.trim() || null,
      notes: values.notes.trim() || null,
      tool_procurement_type: isTool ? values.tool_procurement_type : null,
      rental_cost: isTool && values.rental_cost ? Number(values.rental_cost) : null,
      usage_charge_rate: isTool && values.usage_charge_rate ? Number(values.usage_charge_rate) : null,
      rental_days: isTool && values.rental_days ? Number(values.rental_days) : null,
      rental_start_date: isTool && values.rental_start_date ? values.rental_start_date : null,
      rental_end_date: isTool && values.rental_end_date ? values.rental_end_date : null,
      // External purchase / bill details (ignored server-side for internal moves).
      purchase_rate: values.purchase_rate ? Number(values.purchase_rate) : null,
      total_amount: values.total_amount ? Number(values.total_amount) : (values.purchase_rate && values.quantity ? Number((Number(values.quantity) * Number(values.purchase_rate)).toFixed(2)) : null),
      purchase_date: values.purchase_date || null,
      bill_reference: values.bill_reference.trim() || null,
      vehicle_number: values.vehicle_number ? values.vehicle_number.trim() : null,
      driver_name: values.driver_name ? values.driver_name.trim() : null,
      driver_phone: values.driver_phone ? values.driver_phone.trim() : null,
      challan_number: values.challan_number ? values.challan_number.trim() : null,
      challan_date: values.challan_date || null,
      invoice_number: values.invoice_number ? values.invoice_number.trim() : null,
      invoice_date: values.invoice_date || null,
      remarks: values.remarks ? values.remarks.trim() : null,
    };
    if (kind === 'project_site') {
      return { ...base, project_id: Number(values.project_id), site_id: values.site_id ? Number(values.site_id) : null };
    }
    if (kind === 'central_purchase') {
      return { ...base, source_type: 'supplier' };
    }
    if (kind === 'contractor_supply') {
      return {
        ...base,
        source_type: values.source_type,
        destination_contractor_id: Number(values.destination_contractor_id),
        site_id: values.site_id ? Number(values.site_id) : null,
        project_id: values.project_id ? Number(values.project_id) : null,
      };
    }
    // internal_transfer
    return {
      ...base,
      source_contractor_id: Number(values.source_contractor_id),
      destination_contractor_id: Number(values.destination_contractor_id),
    };
  }

  /**
   * `action` is 'draft' or 'submit' on create (decides the starting status),
   * and 'save' on edit (fields only — status changes happen from the detail
   * page's status actions, since a status flip needs its own confirmation).
   */
  async function handleSubmit(action) {
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setSavingAction(action);
    setFormError(null);

    try {
      let saved;
      if (isEdit) {
        saved = await procurementApi.update(id, buildPayload());
        if (action === 'submit' && saved.status === 'draft') {
          saved = await procurementApi.updateStatus(id, 'requested');
        }
      } else {
        saved = await procurementApi.create({ ...buildPayload(), status: action === 'submit' ? 'requested' : 'draft' });
      }
      // If a real bill/invoice file was chosen (outside/central purchases),
      // attach it to the freshly-saved request.
      if (billFile && saved?.id) {
        try { await procurementApi.uploadBill(saved.id, billFile); } catch { /* surfaced on detail */ }
      }
      navigate(`${basePath}/${saved.id}`, {
        replace: true,
        state: {
          flash: isEdit
            ? 'Procurement request updated.'
            : action === 'submit'
              ? 'Procurement request submitted.'
              : 'Procurement request saved as draft.',
        },
      });
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.details) setFieldErrors(apiError.details);
      setFormError(apiError);
      setSavingAction(null);
    }
  }

  const isLoading = isEdit && loadingRequest;
  const cancelTo = isEdit ? `${basePath}/${id}` : basePath;
  const currentStatus = existing?.request?.status;
  const isLocked = isEdit && currentStatus && !EDITABLE_STATUSES.includes(currentStatus);

  if (loadError) {
    return (
      <>
        <PageHeader
          title="Edit procurement request"
          breadcrumbs={[
            { label: 'Dashboard', to: workspaceRoot },
            { label: 'Procurement', to: basePath },
            { label: 'Edit' },
          ]}
          showBack
        />
        <Alert tone="error" title="Could not load this request">{loadError.message}</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit procurement request' : 'Add procurement request'}
        description={
          isEdit
            ? 'Update this request\u2019s details before it moves past Requested.'
            : 'Raise a new material purchase request against a project.'
        }
        breadcrumbs={[
          { label: 'Dashboard', to: workspaceRoot },
          { label: 'Procurement', to: basePath },
          ...(isEdit
            ? [{ label: existing?.request?.requestNumber ?? 'Request', to: `${basePath}/${id}` }]
            : []),
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        showBack
      />

      {formError && <Alert tone="error" title="Could not save" className="mb-4">{formError.message}</Alert>}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-40" />
        </div>
      ) : isLocked ? (
        <Alert tone="info" title="This request can no longer be edited">
          A request that is {PROCUREMENT_STATUS_LABELS[currentStatus]?.toLowerCase() ?? currentStatus} is past the
          point where its details can change. Use the status actions on the request instead.
        </Alert>
      ) : (
        <form onSubmit={(event) => event.preventDefault()} noValidate className="space-y-6">
          {isContractor && (
            <Card>
              <CardHeader title="Material request" description="Choose the project, site and where the material should come from." />
              <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <SelectField
                  label="Project"
                  required
                  value={values.project_id}
                  onChange={set('project_id')}
                  error={fieldErrors.project_id}
                  placeholder="Select a project"
                  options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
                />
                <SelectField
                  label="Site"
                  value={values.site_id}
                  onChange={set('site_id')}
                  error={fieldErrors.site_id}
                  placeholder={!values.project_id ? 'Select a project first' : 'Select a site'}
                  options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
                  disabled={!values.project_id}
                />
                <SelectField
                  label="Task (Task-wise procurement)"
                  required
                  value={values.task_id}
                  onChange={set('task_id')}
                  error={fieldErrors.task_id}
                  placeholder={!values.project_id ? 'Select a project first' : tasks.length === 0 ? 'No tasks created' : 'Select a task'}
                  options={tasks.map((t) => ({ value: String(t.id), label: `${t.name} (${t.status})` }))}
                  disabled={!values.project_id}
                  className="sm:col-span-2"
                />
                {selectedTaskSubtasks.length > 0 && (
                  <SelectField
                    label="Subtask"
                    value={values.subtask_id}
                    onChange={set('subtask_id')}
                    error={fieldErrors.subtask_id}
                    placeholder="Main task (not a specific subtask)"
                    hint="Pick the subtask this item is for - it is checked against that subtask's own plan and budget."
                    options={selectedTaskSubtasks.map((st) => ({ value: String(st.id), label: `${st.name} (${st.progress}% · ${st.status})` }))}
                    className="sm:col-span-2"
                  />
                )}
                <SelectField
                  label="Source"
                  required
                  value={values.source_choice}
                  onChange={set('source_choice')}
                  error={fieldErrors.source_choice}
                  className="sm:col-span-2"
                  hint="Select where the material will be sourced from. Company Central Warehouse is the main company warehouse managed by Admin."
                  options={[
                    { value: 'central_warehouse', label: 'Company Central Warehouse' },
                    { value: 'contractor', label: 'Another Contractor' },
                    { value: 'supplier', label: 'Outside Supplier' },
                  ]}
                />
                <p className="-mt-2 text-xs text-ink-subtle sm:col-span-2">
                  {values.source_choice === 'central_warehouse' && 'Main company warehouse managed by Admin.'}
                  {values.source_choice === 'contractor' && 'Material from another contractor linked with the company.'}
                  {values.source_choice === 'supplier' && 'Material purchased/sourced from an external supplier.'}
                </p>
                {values.source_choice === 'contractor' && (
                  <SelectField
                    label="Request from contractor"
                    required
                    value={values.source_contractor_id}
                    onChange={set('source_contractor_id')}
                    error={fieldErrors.source_contractor_id}
                    placeholder="Select a contractor"
                    className="sm:col-span-2"
                    options={contractors.map((c) => ({ value: String(c.id), label: c.name }))}
                  />
                )}
                <div className="sm:col-span-2 rounded-xl border border-line bg-canvas p-3">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-2">Item Category to Procure</span>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-ink">
                      <input
                        type="radio"
                        name="contractor_item_type"
                        value="material"
                        checked={values.item_type !== 'tool'}
                        onChange={() => setValues((c) => ({ ...c, item_type: 'material' }))}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      Raw Material
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-ink">
                      <input
                        type="radio"
                        name="contractor_item_type"
                        value="tool"
                        checked={values.item_type === 'tool'}
                        onChange={() => setValues((c) => ({ ...c, item_type: 'tool', unit: 'unit', quantity: c.quantity || '1' }))}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      🛠️ Tool / Machinery / Equipment
                    </label>
                  </div>
                </div>

                {values.item_type === 'tool' ? (
                  <div className="sm:col-span-2 space-y-3">
                    <SelectField
                      label="Tool / Machinery (planned for this task)"
                      required
                      value={values.tool_id}
                      onChange={(e) => {
                        setValues((c) => ({ ...c, tool_id: e.target.value, unit: 'unit', quantity: '1' }));
                        setFieldErrors((c) => ({ ...c, tool_id: undefined }));
                      }}
                      error={fieldErrors.tool_id}
                      disabled={!values.task_id}
                      placeholder={
                        !values.task_id
                          ? 'Select a task first'
                          : plannedTools.length === 0
                            ? 'No machines planned for this task'
                            : 'Select a planned machine'
                      }
                      options={plannedTools
                        .filter((t) => t.toolId)
                        .map((t) => ({
                          value: String(t.toolId),
                          label: `${t.toolName} — planned ${t.plannedQuantity}${t.plannedDays ? ` for ${t.plannedDays} day(s)` : ''}, ${t.remainingQuantity} still to request`,
                        }))}
                    />
                    {values.task_id && plannedTools.length === 0 && (
                      <p className="text-xs text-amber-700">
                        Admin has not planned any machine or tool for this task. Ask Admin to add it to the task budget first.
                      </p>
                    )}
                    {currentPlannedTool && (
                      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                        <div className="rounded-lg border border-line bg-canvas p-2">
                          <p className="text-[11px] text-ink-muted">Planned</p>
                          <p className="text-sm font-bold text-ink">{currentPlannedTool.plannedQuantity}</p>
                        </div>
                        <div className="rounded-lg border border-line bg-canvas p-2">
                          <p className="text-[11px] text-ink-muted">Planned days</p>
                          <p className="text-sm font-bold text-ink">{currentPlannedTool.plannedDays || '—'}</p>
                        </div>
                        <div className="rounded-lg border border-line bg-canvas p-2">
                          <p className="text-[11px] text-ink-muted">Est. rate</p>
                          <p className="text-sm font-bold text-ink">{formatCurrency(currentPlannedTool.plannedRate)}</p>
                        </div>
                        <div className="rounded-lg border border-line bg-canvas p-2">
                          <p className="text-[11px] text-ink-muted">Estimated cost</p>
                          <p className="text-sm font-bold text-brand-700">{formatCurrency(currentPlannedTool.plannedTotal)}</p>
                        </div>
                        <div className="rounded-lg border border-line bg-canvas p-2">
                          <p className="text-[11px] text-ink-muted">Already requested</p>
                          <p className="text-sm font-bold text-ink">{currentPlannedTool.alreadyRequested}</p>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-ink-subtle">Admin decides whether the machine is allocated from company stock, purchased or rented.</p>
                  </div>
                ) : (
                  <SelectField
                    label="Material"
                    required
                    value={values.material_id}
                    onChange={setMaterial}
                    error={fieldErrors.material_id}
                    placeholder="Select a material"
                    options={materialOptions}
                    className="sm:col-span-2"
                  />
                )}
                {values.source_choice === 'supplier' && (
                  <>
                    <InputField label="Supplier / source name" required value={values.supplier} onChange={set('supplier')} error={fieldErrors.supplier} placeholder="ACME Traders" />
                    <InputField label="Supplier contact" value={values.supplier_contact} onChange={set('supplier_contact')} error={fieldErrors.supplier_contact} placeholder="Phone / email" />
                  </>
                )}
              </CardBody>
            </Card>
          )}

          {!isContractor && (
          <Card>
            <CardHeader title="Procurement type" description="Where the material comes from and where it goes." />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <SelectField
                label="Type"
                value={values.procurement_kind}
                onChange={set('procurement_kind')}
                options={PROCUREMENT_KIND_OPTIONS}
                error={fieldErrors.procurement_kind}
                className="sm:col-span-2"
                disabled={isEdit}
              />

              {values.procurement_kind === 'project_site' && (
                <>
                  <SelectField
                    label="Project"
                    required
                    value={values.project_id}
                    onChange={set('project_id')}
                    error={fieldErrors.project_id}
                    placeholder="Select a project"
                    options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
                  />
                  <SelectField
                    label="Site (optional)"
                    value={values.site_id}
                    onChange={set('site_id')}
                    error={fieldErrors.site_id}
                    placeholder={!values.project_id ? 'Select a project first' : 'Project store (no specific site)'}
                    options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
                    disabled={!values.project_id}
                  />
                  <SelectField
                    label="Task (Task-wise planning)"
                    value={values.task_id}
                    onChange={set('task_id')}
                    error={fieldErrors.task_id}
                    placeholder={!values.project_id ? 'Select a project first' : tasks.length === 0 ? 'No tasks created' : 'Select a task (optional for admin)'}
                    options={tasks.map((t) => ({ value: String(t.id), label: `${t.name} (${t.status})` }))}
                    disabled={!values.project_id}
                    className="sm:col-span-2"
                  />
                  {selectedTaskSubtasks.length > 0 && (
                    <SelectField
                      label="Subtask"
                      value={values.subtask_id}
                      onChange={set('subtask_id')}
                      error={fieldErrors.subtask_id}
                      placeholder="Main task (not a specific subtask)"
                      hint="Pick the subtask this item is for - it is checked against that subtask's own plan and budget."
                      options={selectedTaskSubtasks.map((st) => ({ value: String(st.id), label: `${st.name} (${st.progress}% · ${st.status})` }))}
                      className="sm:col-span-2"
                    />
                  )}
                </>
              )}

              {values.procurement_kind === 'central_purchase' && (
                <div className="sm:col-span-2 rounded-lg bg-canvas px-4 py-3 text-sm text-ink-muted">
                  Destination: <span className="font-medium text-ink">Central Company Warehouse</span>. Source: outside supplier (enter the bill details below).
                </div>
              )}

              {values.procurement_kind === 'contractor_supply' && (
                <>
                  <SelectField
                    label="Receiving contractor"
                    required
                    value={values.destination_contractor_id}
                    onChange={set('destination_contractor_id')}
                    error={fieldErrors.destination_contractor_id}
                    placeholder="Select a contractor"
                    options={contractors.map((c) => ({ value: String(c.id), label: c.name }))}
                  />
                  <SelectField
                    label="Source"
                    value={values.source_type}
                    onChange={set('source_type')}
                    error={fieldErrors.source_type}
                    options={SOURCE_TYPE_OPTIONS.filter((o) => ['supplier', 'central_warehouse'].includes(o.value))}
                  />
                </>
              )}

              {values.procurement_kind === 'internal_transfer' && (
                <>
                  <SelectField
                    label="From contractor"
                    required
                    value={values.source_contractor_id}
                    onChange={set('source_contractor_id')}
                    error={fieldErrors.source_contractor_id}
                    placeholder="Select the source"
                    options={contractors.map((c) => ({ value: String(c.id), label: c.name }))}
                  />
                  <SelectField
                    label="To contractor"
                    required
                    value={values.destination_contractor_id}
                    onChange={set('destination_contractor_id')}
                    error={fieldErrors.destination_contractor_id}
                    placeholder="Select the destination"
                    options={contractors.map((c) => ({ value: String(c.id), label: c.name }))}
                  />
                </>
              )}

              <div className="sm:col-span-2 rounded-xl border border-line bg-canvas p-3">
                <span className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-2">Item Category to Procure</span>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-ink">
                    <input
                      type="radio"
                      name="admin_item_type"
                      value="material"
                      checked={values.item_type !== 'tool'}
                      onChange={() => setValues((c) => ({ ...c, item_type: 'material' }))}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    Raw Material
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-ink">
                    <input
                      type="radio"
                      name="admin_item_type"
                      value="tool"
                      checked={values.item_type === 'tool'}
                      onChange={() => setValues((c) => ({ ...c, item_type: 'tool', unit: 'unit', quantity: c.quantity || '1' }))}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    🛠️ Tool / Machinery / Equipment
                  </label>
                </div>
              </div>

              {values.item_type === 'tool' ? (
                <div className="sm:col-span-2 space-y-4">
                  <SelectField
                    label="Tool / Machinery"
                    required
                    value={values.tool_id}
                    onChange={setTool}
                    error={fieldErrors.tool_id}
                    placeholder="Select tool / machine"
                    options={tools.map((t) => {
                      const plan = plannedTools.find((p) => Number(p.toolId) === Number(t.id));
                      return { value: String(t.id), label: `${plan ? '⭐ [Planned] ' : ''}${t.name} (${t.type || 'Tool'}) - ${t.availableQuantity ?? 0} serial(s) available` };
                    })}
                  />

                  {values.task_id && (currentPlannedTool ? (
                    <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 text-xs text-ink">
                      <span className="font-bold uppercase tracking-wider text-brand-900">Task plan estimate</span>
                      <p className="mt-1">
                        {currentPlannedTool.plannedQuantity} × {currentPlannedTool.toolName} · {currentPlannedTool.rentalType || 'Rent'}
                        {String(currentPlannedTool.rentalType).toLowerCase() === 'purchase'
                          ? ` · ${formatCurrency(currentPlannedTool.plannedRate)} each`
                          : ` · ${formatCurrency(currentPlannedTool.plannedRate)}/day × ${currentPlannedTool.plannedDays} day(s)`}
                        {' = '}<strong>{formatCurrency(currentPlannedTool.plannedTotal)}</strong>
                        {' · '}already requested {currentPlannedTool.alreadyRequested}
                      </p>
                    </div>
                  ) : values.tool_id ? (
                    <p className="text-xs text-amber-700">This machine is not in the selected task&rsquo;s plan.</p>
                  ) : null)}

                  {selectedTool && (
                    <div className="rounded-xl border border-line bg-canvas p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink">Fleet Availability Status</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full ${Number(selectedTool.availableQuantity ?? 1) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {Number(selectedTool.availableQuantity ?? 1) > 0
                            ? `✓ ${selectedTool.availableQuantity ?? 1} of ${selectedTool.totalQuantity ?? 1} Available`
                            : '⚠️ 0 Available (Currently Allocated)'}
                        </span>
                      </div>
                      {Number(selectedTool.availableQuantity ?? 1) === 0 && selectedTool.currentHolders?.length > 0 && (
                        <div className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                          <strong>Currently in use by:</strong>{' '}
                          {selectedTool.currentHolders.map(h => `${h.contractorName || 'Contractor'} at ${h.projectName || 'Project'} (${h.siteName || 'Site'}) [${h.quantity} units]`).join(', ')}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-xl border border-line bg-white p-3 space-y-3">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                      Machine / Tool Procurement Mode
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className={`flex flex-col p-2.5 rounded-lg border cursor-pointer text-xs transition-colors ${values.tool_procurement_type === 'purchased_owned' ? 'border-brand-500 bg-brand-50/50' : 'border-line hover:bg-canvas'}`}>
                        <div className="flex items-center gap-2 font-semibold text-ink">
                          <input
                            type="radio"
                            name="admin_tool_mode"
                            value="purchased_owned"
                            checked={values.tool_procurement_type === 'purchased_owned'}
                            onChange={() => setValues(c => ({
                              ...c,
                              tool_procurement_type: 'purchased_owned',
                              purchase_rate: '0',
                              total_amount: c.usage_charge_rate ? String(Number((parseFloat(c.usage_charge_rate) * (parseFloat(c.quantity) || 1)).toFixed(2))) : '0',
                            }))}
                            className="text-brand-600 focus:ring-brand-500"
                          />
                          🏢 Purchased / Owned
                        </div>
                        <p className="mt-1 text-[11px] text-ink-muted">Company already owns this machine. No purchase cost.</p>
                      </label>

                      <label className={`flex flex-col p-2.5 rounded-lg border cursor-pointer text-xs transition-colors ${values.tool_procurement_type === 'to_be_purchased' ? 'border-brand-500 bg-brand-50/50' : 'border-line hover:bg-canvas'}`}>
                        <div className="flex items-center gap-2 font-semibold text-ink">
                          <input
                            type="radio"
                            name="admin_tool_mode"
                            value="to_be_purchased"
                            checked={values.tool_procurement_type === 'to_be_purchased'}
                            onChange={() => setValues(c => ({
                              ...c,
                              tool_procurement_type: 'to_be_purchased',
                              total_amount: c.purchase_rate ? String(Number((parseFloat(c.purchase_rate) * (parseFloat(c.quantity) || 1)).toFixed(2))) : '',
                            }))}
                            className="text-brand-600 focus:ring-brand-500"
                          />
                          🛒 To Be Purchased
                        </div>
                        <p className="mt-1 text-[11px] text-ink-muted">Purchase requirement for new machine. Not rental.</p>
                      </label>

                      <label className={`flex flex-col p-2.5 rounded-lg border cursor-pointer text-xs transition-colors ${values.tool_procurement_type === 'rented' ? 'border-brand-500 bg-brand-50/50' : 'border-line hover:bg-canvas'}`}>
                        <div className="flex items-center gap-2 font-semibold text-ink">
                          <input
                            type="radio"
                            name="admin_tool_mode"
                            value="rented"
                            checked={values.tool_procurement_type === 'rented'}
                            onChange={() => setValues(c => ({
                              ...c,
                              tool_procurement_type: 'rented',
                              total_amount: c.rental_cost ? String(Number((parseFloat(c.rental_cost) * (parseFloat(c.rental_days) || 1) * (parseFloat(c.quantity) || 1)).toFixed(2))) : '',
                            }))}
                            className="text-brand-600 focus:ring-brand-500"
                          />
                          ⏱️ Rented
                        </div>
                        <p className="mt-1 text-[11px] text-ink-muted">Actual rental cost. Flows into Task & Project finance.</p>
                      </label>
                    </div>

                    {values.tool_procurement_type === 'purchased_owned' && (
                      <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-line">
                        <InputField
                          label="Approved Usage / Charge Rate (₹, optional)"
                          type="number"
                          value={values.usage_charge_rate}
                          onChange={(e) => {
                            const val = e.target.value;
                            setValues(c => ({
                              ...c,
                              usage_charge_rate: val,
                              total_amount: val ? String(Number((parseFloat(val) * (parseFloat(c.quantity) || 1)).toFixed(2))) : '0',
                            }));
                          }}
                          placeholder="0.00"
                          description="Admin approved rate to charge project for company machine usage."
                        />
                        <div className="flex items-center text-xs text-ink-muted pt-5">
                          Zero capital purchase cost will be charged for company-owned fleet.
                        </div>
                      </div>
                    )}

                    {values.tool_procurement_type === 'rented' && (
                      <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-line">
                        <InputField
                          label="Rental Rate / Day (₹)"
                          type="number"
                          required
                          value={values.rental_cost}
                          onChange={(e) => {
                            const val = e.target.value;
                            setValues(c => ({
                              ...c,
                              rental_cost: val,
                              purchase_rate: val,
                              total_amount: val ? String(Number((parseFloat(val) * (parseFloat(c.rental_days) || 1) * (parseFloat(c.quantity) || 1)).toFixed(2))) : '',
                            }));
                          }}
                          placeholder="e.g. 2000"
                        />
                        <InputField
                          label="Rental Period (Days)"
                          type="number"
                          required
                          value={values.rental_days}
                          onChange={(e) => {
                            const val = e.target.value;
                            setValues(c => ({
                              ...c,
                              rental_days: val,
                              total_amount: c.rental_cost ? String(Number((parseFloat(c.rental_cost) * (parseFloat(val) || 1) * (parseFloat(c.quantity) || 1)).toFixed(2))) : '',
                            }));
                          }}
                          placeholder="e.g. 5"
                        />
                        <InputField
                          label="Rental Start Date"
                          type="date"
                          value={values.rental_start_date}
                          onChange={set('rental_start_date')}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <SelectField
                  label="Material"
                  required
                  value={values.material_id}
                  onChange={setMaterial}
                  error={fieldErrors.material_id}
                  placeholder="Select a material"
                  options={materialOptions}
                  className="sm:col-span-2"
                />
              )}

              {['central_purchase', 'contractor_supply'].includes(values.procurement_kind) && (values.source_type === 'supplier' || values.procurement_kind === 'central_purchase') && (
                <>
                  <SelectField
                    label="Select Vendor (from Vendor Master)"
                    value={values.vendor_id}
                    onChange={setVendor}
                    placeholder="-- Choose from Vendor Master (or enter manual supplier) --"
                    options={vendors.map((v) => ({
                      value: String(v.id),
                      label: `${v.name} ${v.phone ? `(${v.phone})` : ''}`,
                    }))}
                    className="sm:col-span-2"
                  />
                  <InputField label="Supplier / Vendor name" value={values.supplier} onChange={set('supplier')} error={fieldErrors.supplier} placeholder="ACME Cement Co" />
                  <InputField label="Contact / details" value={values.supplier_contact} onChange={set('supplier_contact')} error={fieldErrors.supplier_contact} placeholder="Phone / email" />
                </>
              )}

              {values.procurement_kind === 'internal_transfer' && (
                <InputField label="Reason" value={values.reason} onChange={set('reason')} error={fieldErrors.reason} placeholder="Site B shortage" className="sm:col-span-2" />
              )}
            </CardBody>
          </Card>
          )}

          {((!isContractor && ['central_purchase', 'contractor_supply', 'project_site'].includes(values.procurement_kind) && (values.source_type === 'supplier' || values.procurement_kind === 'central_purchase' || values.procurement_kind === 'project_site')) || (isContractor && values.source_choice === 'supplier')) && (
            <Card>
              <CardHeader
                title={values.procurement_kind === 'central_purchase' || values.source_choice === 'central_warehouse' ? "🚚 Central Warehouse Transport, Vehicle & Delivery Details" : "Vendor, Billing & Transport Details"}
                description={values.procurement_kind === 'central_purchase' || values.source_choice === 'central_warehouse' ? "Vehicle number, transporter, driver details, and delivery challan for goods movement." : "Challan, vehicle, driver details and invoice files."}
              />
              <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {(!isContractor || values.source_choice === 'supplier') && (
                  <>
                    <SelectField
                      label="Vendor (Vendor Master)"
                      value={values.vendor_id}
                      onChange={setVendor}
                      placeholder="-- Choose from Vendor Master --"
                      options={vendors.map((v) => ({
                        value: String(v.id),
                        label: `${v.name} ${v.phone ? `(${v.phone})` : ''}`,
                      }))}
                      className="sm:col-span-2"
                    />
                    <InputField
                      label="Cost per unit"
                      type="number"
                      min="0"
                      step="0.01"
                      value={values.purchase_rate}
                      onChange={set('purchase_rate')}
                      error={fieldErrors.purchase_rate}
                      hint="Vendor cost per unit."
                      placeholder="0.00"
                    />
                    <InputField
                      label="Total cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={values.total_amount}
                      onChange={set('total_amount')}
                      error={fieldErrors.total_amount}
                      hint={
                        values.quantity && (values.purchase_rate || values.estimated_rate)
                          ? `Auto-calculated: ${values.quantity} ${values.unit || 'units'} × ₹${values.purchase_rate || values.estimated_rate} = ₹${values.total_amount || '0'}`
                          : 'Calculated automatically: Quantity × Cost per unit.'
                      }
                      placeholder="0.00"
                    />
                    <InputField label="Purchase date" type="date" value={values.purchase_date} onChange={set('purchase_date')} error={fieldErrors.purchase_date} />
                    <InputField label="Bill / PO reference" value={values.bill_reference} onChange={set('bill_reference')} error={fieldErrors.bill_reference} placeholder="Bill / PO number" />
                  </>
                )}

                {/* Transportation / Logistics - Admin only: a contractor/PM requesting is not dispatching. */}
                {!isContractor && (() => {
                  const isCentral = isContractor
                    ? values.source_choice === 'central_warehouse'
                    : values.procurement_kind === 'central_purchase' || values.source_type === 'central_warehouse';
                  return (
                    <>
                      <div className="sm:col-span-2 border-t border-line/60 pt-3">
                        <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <span>🚛</span> Vehicle & Transport Logistics {isCentral && <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Vehicle Number Mandatory for Central Warehouse</span>}
                        </h4>
                      </div>
                      <InputField
                        label="Vehicle Number"
                        required={isCentral}
                        value={values.vehicle_number}
                        onChange={set('vehicle_number')}
                        error={fieldErrors.vehicle_number}
                        placeholder="e.g. MH-12-AB-1234 / PB-10-AB-1234"
                        description={isCentral ? "Registration number of the delivery truck/vehicle (Mandatory for Central Warehouse)" : "Registration number of the delivery truck/vehicle"}
                      />
                    </>
                  );
                })()}
                {!isContractor && (
                  <>
                    <InputField
                      label="Transporter / Logistics Partner"
                      value={values.remarks}
                      onChange={set('remarks')}
                      placeholder="e.g. VRL Logistics / Delhivery / Private Transporter"
                      description="Name of transport agency or fleet"
                    />
                    <InputField label="Driver Name" value={values.driver_name} onChange={set('driver_name')} placeholder="Driver full name" />
                    <InputField label="Driver Phone" value={values.driver_phone} onChange={set('driver_phone')} placeholder="Driver contact number" />
                  </>
                )}
                <InputField label="Delivery Challan No" value={values.challan_number} onChange={set('challan_number')} placeholder="Challan / DC Ref" />
                <InputField label="Challan Date" type="date" value={values.challan_date} onChange={set('challan_date')} />
                <InputField label="Invoice / E-way Bill No" value={values.invoice_number} onChange={set('invoice_number')} placeholder="GST Tax Invoice / E-way Bill No" />
                <InputField label="Invoice Date" type="date" value={values.invoice_date} onChange={set('invoice_date')} />

                {(!isContractor || values.source_choice === 'supplier') && (
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-ink">Bill / invoice file (JPG, PNG or PDF)</label>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                      onChange={(e) => setBillFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-canvas file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-surface"
                    />
                    {billFile && <p className="mt-1 text-xs text-ink-subtle">Selected: {billFile.name}</p>}
                    <p className="mt-1 text-xs text-ink-subtle">The actual bill is uploaded when you save; Admin and Finance can open it from the request.</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Quantity and cost" description="How much is needed and the expected cost." />
            <CardBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {values.task_id && !isToolItem && (
                <div className="sm:col-span-2 rounded-xl border border-brand-200 bg-brand-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-900">
                      Task Material Planning Baseline
                    </span>
                    {currentPlannedMaterial ? (
                      <span className="text-xs text-brand-700 font-medium">
                        Planned Unit Cost: ₹{currentPlannedMaterial.costPerUnit} / {currentPlannedMaterial.unit}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700 font-semibold bg-amber-100 px-2 py-0.5 rounded">
                        Unplanned Material
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-center">
                    <div className="rounded-lg bg-white p-2.5 border border-line">
                      <p className="text-[11px] text-ink-muted">Planned Qty</p>
                      <p className="text-base font-bold text-ink">
                        {plannedQty} <span className="text-xs font-normal text-ink-muted">{values.unit || currentPlannedMaterial?.unit || ''}</span>
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-line">
                      <p className="text-[11px] text-ink-muted">Already Procured</p>
                      <p className="text-base font-bold text-ink">
                        {alreadyProcured} <span className="text-xs font-normal text-ink-muted">{values.unit || currentPlannedMaterial?.unit || ''}</span>
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-line">
                      <p className="text-[11px] text-ink-muted">Remaining Planned</p>
                      <p className="text-base font-bold text-emerald-700">
                        {remainingPlanned} <span className="text-xs font-normal text-ink-muted">{values.unit || currentPlannedMaterial?.unit || ''}</span>
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-line">
                      <p className="text-[11px] text-ink-muted">This Request</p>
                      <p className="text-base font-bold text-brand-700">
                        {requestedQty} <span className="text-xs font-normal text-ink-muted">{values.unit || currentPlannedMaterial?.unit || ''}</span>
                      </p>
                    </div>
                    <div className={`rounded-lg bg-white p-2.5 border ${remainingAfter < 0 ? 'border-danger/40 bg-red-50/50' : 'border-line'}`}>
                      <p className="text-[11px] text-ink-muted">Remaining After</p>
                      <p className={`text-base font-bold ${remainingAfter < 0 ? 'text-danger' : 'text-ink'}`}>
                        {remainingAfter < 0 ? `Deficit: ${Math.abs(remainingAfter)}` : remainingAfter} <span className="text-xs font-normal text-ink-muted">{values.unit || currentPlannedMaterial?.unit || ''}</span>
                      </p>
                    </div>
                  </div>

                  {isExcess && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                      <div className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold text-sm">⚠️</span>
                        <div>
                          <p className="text-xs font-semibold text-amber-900">
                            Requested quantity exceeds the Admin-planned quantity by {excessQty} {values.unit || currentPlannedMaterial?.unit || 'units'}.
                          </p>
                          <p className="text-[11px] text-amber-700 mt-0.5">
                            This excess procurement requires Admin approval and justification before proceeding.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <InputField
                label={`Quantity${values.unit ? ` (${values.unit})` : ''}`}
                required
                type="number"
                min="0"
                step="0.01"
                value={values.quantity}
                onChange={set('quantity')}
                error={fieldErrors.quantity}
                placeholder="500"
              />
              <InputField
                label="Unit"
                value={values.unit}
                onChange={set('unit')}
                error={fieldErrors.unit}
                placeholder="bags"
                hint="Prefilled from the material; change if this order differs."
              />
              {!(isContractor && isToolItem) && !(((!isContractor && ['central_purchase', 'contractor_supply', 'project_site'].includes(values.procurement_kind) && (values.source_type === 'supplier' || values.procurement_kind === 'central_purchase' || values.procurement_kind === 'project_site')) || (isContractor && values.source_choice === 'supplier'))) && (
                <InputField
                  label="Cost per unit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.estimated_rate}
                  onChange={set('estimated_rate')}
                  error={fieldErrors.estimated_rate}
                  placeholder="0.00"
                />
              )}
              <SelectField
                label="Priority"
                value={values.priority}
                onChange={set('priority')}
                options={PRIORITIES}
                error={fieldErrors.priority}
              />
              <InputField
                label="Required by"
                type="date"
                value={values.required_date}
                onChange={set('required_date')}
                error={fieldErrors.required_date}
              />
              {isExcess && (
                <TextAreaField
                  label={isToolItem ? 'Reason for an extra machine' : 'Reason for Excess Procurement'}
                  required
                  value={values.excess_reason}
                  onChange={set('excess_reason')}
                  error={fieldErrors.excess_reason}
                  rows={3}
                  className="sm:col-span-2"
                  placeholder="State clearly why excess quantity is required (e.g. site design change, unexpected foundation reinforcement, etc.). Mandatory for Admin approval."
                />
              )}
              <TextAreaField
                label="Notes"
                value={values.notes}
                onChange={set('notes')}
                rows={3}
                className="sm:col-span-2"
                placeholder="Specification, brand preference, delivery instructions…"
              />
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            {isEdit ? (
              <>
                <Button
                  type="button"
                  size="lg"
                  isLoading={savingAction === 'save'}
                  loadingText="Saving…"
                  onClick={() => handleSubmit('save')}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save changes
                </Button>
                {currentStatus === 'draft' && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    isLoading={savingAction === 'submit'}
                    loadingText="Submitting…"
                    onClick={() => handleSubmit('submit')}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Save and submit request
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  isLoading={savingAction === 'draft'}
                  loadingText="Saving…"
                  onClick={() => handleSubmit('draft')}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save draft
                </Button>
                <Button
                  type="button"
                  size="lg"
                  isLoading={savingAction === 'submit'}
                  loadingText="Submitting…"
                  onClick={() => handleSubmit('submit')}
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Submit request
                </Button>
              </>
            )}
            <Link to={cancelTo}>
              <Button type="button" variant="secondary" size="lg">
                <X className="h-4 w-4" aria-hidden="true" />
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      )}
    </>
  );
}
