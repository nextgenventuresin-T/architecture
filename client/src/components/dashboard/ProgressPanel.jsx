import { Card, CardHeader, CardBody } from '../ui/Card';
import ProgressBar from '../ui/ProgressBar';
import Skeleton from '../ui/Skeleton';

/** Ranked progress across every live site, highest first. */
export default function ProgressPanel({ projects = [], isLoading }) {
  const ranked = [...projects].sort((a, b) => b.progress - a.progress);

  return (
    <Card>
      <CardHeader title="Progress by project" description="Across all active sites" />
      <CardBody className="space-y-4">
        {isLoading
          ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-9" />)
          : ranked.map((project) => (
              <div key={project.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-ink">{project.name}</span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-ink-muted">
                    {project.progress}%
                  </span>
                </div>
                <ProgressBar value={project.progress} status={project.status} />
              </div>
            ))}
      </CardBody>
    </Card>
  );
}
