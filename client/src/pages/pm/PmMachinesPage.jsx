import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import ToolUnitsPanel from '../../components/tools/ToolUnitsPanel';
import { toolApi } from '../../api/toolApi';

/**
 * Machines and tools for a Project Manager: request one through procurement (so the existing
 * approval rules apply), see which serials are free or on their projects, update machine health
 * and return machines from their assigned projects.
 */
export default function PmMachinesPage() {
  const [tools, setTools] = useState([]);
  useEffect(() => {
    toolApi.list({ pageSize: 100 }).then((d) => setTools(d.tools ?? [])).catch(() => setTools([]));
  }, []);
  return (
    <>
      <PageHeader
        title="Machines & Tools"
        description="Each physical machine is tracked by its unique serial number. Update health for machines on your projects or request one for a site."
        actions={(
          <Link to="/pm/procurement/new">
            <Button className="gap-2"><Plus className="h-4 w-4" /> Request machine / material</Button>
          </Link>
        )}
      />
      <ToolUnitsPanel tools={tools} mode="pm" />
    </>
  );
}
