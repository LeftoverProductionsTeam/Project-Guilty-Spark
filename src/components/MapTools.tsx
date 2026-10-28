import type { Project, Settings } from '../types';
import { useMapState } from '../mapSession';
import BuildTargets from './BuildTargets';
import '../mapTools.css';
export default function MapTools({
  project,
  settings,
  edit,
}: {
  project: Project;
  settings: Settings;
  edit: (p: Project, description: string) => void;
}) {
  const [open, setOpen] = useMapState(project.id, 'tools.open', false);
  const active = project.buildTargets?.find((t) => t.id === project.activeBuildTarget);
  return (
    <details
      className="analysis-card gs-map-tools"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        Map tools &amp; tags · {project.title} · {active?.name ?? 'default tools'}
      </summary>
      <p>
        These profiles belong to this map. Choose its compiler, editing kit, tagset and Invader folder here.
        Other maps retain their own profiles. Extraction, staging and build jobs use separate project folders.
      </p>
      <BuildTargets
        project={project}
        defaults={settings}
        onChange={(p) => edit(p, 'Configure tools and tags for this map')}
      />
      <p className="subtle">
        Tags, selections, searches, viewport position and the last active editor are remembered per map.
        Source edits keep their own undo history; switching tools does not clear them.
      </p>
    </details>
  );
}
