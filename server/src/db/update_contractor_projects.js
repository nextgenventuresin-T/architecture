const fs = require('fs');
let content = fs.readFileSync('client/src/pages/contractor/ContractorProjectsPage.jsx', 'utf8');

// Add Users import
if (!content.includes('Users,')) {
  content = content.replace('Eye,', 'Eye,\n  Users,');
}

// Add state for initialModalTab
if (!content.includes('initialModalTab')) {
  content = content.replace(
    'const [viewingTaskId, setViewingTaskId] = useState(null);',
    "const [viewingTaskId, setViewingTaskId] = useState(null);\n  const [initialModalTab, setInitialModalTab] = useState('overview');"
  );
}

// Add Assign Workers button before Log Work
const oldBtn = `<button
                                      type="button"
                                      onClick={() => setViewingTaskId(task.id)}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-canvas transition-colors shadow-xs"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      View Scope
                                    </button>`;

const newBtns = `<button
                                      type="button"
                                      onClick={() => {
                                        setViewingTaskId(task.id);
                                        setInitialModalTab('overview');
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-canvas transition-colors shadow-xs"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      View Scope
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setViewingTaskId(task.id);
                                        setInitialModalTab('labour');
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100 transition-colors shadow-xs"
                                    >
                                      <Users className="h-3.5 w-3.5 text-brand-600" />
                                      Assign Workers
                                    </button>`;

content = content.replace(oldBtn.replace(/\r?\n/g, '\r\n'), newBtns.replace(/\r?\n/g, '\r\n'));
if (!content.includes('Assign Workers')) {
  content = content.replace(oldBtn.replace(/\r?\n/g, '\n'), newBtns.replace(/\r?\n/g, '\n'));
}

// Pass initialTab to TaskDetailModal
content = content.replace(
  '<TaskDetailModal taskId={viewingTaskId} onClose={() => setViewingTaskId(null)} />',
  "<TaskDetailModal taskId={viewingTaskId} initialTab={initialModalTab} onClose={() => { setViewingTaskId(null); setInitialModalTab('overview'); }} />"
);

fs.writeFileSync('client/src/pages/contractor/ContractorProjectsPage.jsx', content, 'utf8');
console.log('ContractorProjectsPage.jsx updated cleanly');
