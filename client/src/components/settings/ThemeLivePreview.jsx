import { ArrowUpRight, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import Card, { CardHeader, CardBody } from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

export default function ThemeLivePreview() {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Live ERP Preview"
        description="Instant visual check of how your selected colours look on actual ERP components."
      />
      <CardBody className="space-y-6">
        {/* Metric KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-line bg-canvas p-4">
            <span className="text-xs font-medium text-ink-muted">Active Sites</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold text-ink">18</span>
              <span className="inline-flex items-center text-xs font-semibold text-emerald-600">
                <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> +12%
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-4">
            <span className="text-xs font-medium text-ink-muted">Pending Approvals</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold text-ink">5</span>
              <Badge tone="warning">Action Needed</Badge>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-4">
            <span className="text-xs font-medium text-ink-muted">Completed Milestones</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold text-ink">42</span>
              <Badge tone="positive">94% On Time</Badge>
            </div>
          </div>
        </div>

        {/* Buttons & Input Controls Row */}
        <div className="rounded-xl border border-line p-4 space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Buttons & Input Controls
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary Action</Button>
            <Button variant="secondary">Secondary Action</Button>
            <Button variant="ghost">Ghost Link</Button>
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                readOnly
                value="Sample ERP input field..."
                className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Table & Status Badges Row */}
        <div className="rounded-xl border border-line overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-canvas text-xs font-semibold text-ink-muted uppercase">
              <tr>
                <th className="px-4 py-2.5">Project / Task</th>
                <th className="px-4 py-2.5">Contractor</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink">
              <tr className="hover:bg-canvas/50">
                <td className="px-4 py-3 font-medium">Zirakpur Tower A - Flooring</td>
                <td className="px-4 py-3 text-ink-muted">Sandhu Builders</td>
                <td className="px-4 py-3">
                  <Badge tone="positive">
                    <CheckCircle className="h-3 w-3 mr-1 inline" /> On Track
                  </Badge>
                </td>
              </tr>
              <tr className="hover:bg-canvas/50">
                <td className="px-4 py-3 font-medium">Mohali Sector 70 - Structural Steel</td>
                <td className="px-4 py-3 text-ink-muted">Gurmeet Constructions</td>
                <td className="px-4 py-3">
                  <Badge tone="warning">
                    <Clock className="h-3 w-3 mr-1 inline" /> Pending Inspection
                  </Badge>
                </td>
              </tr>
              <tr className="hover:bg-canvas/50">
                <td className="px-4 py-3 font-medium">Patiala Bypass - Concrete Pouring</td>
                <td className="px-4 py-3 text-ink-muted">Khanna & Sons</td>
                <td className="px-4 py-3">
                  <Badge tone="danger">
                    <AlertCircle className="h-3 w-3 mr-1 inline" /> Delayed (Material)
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
