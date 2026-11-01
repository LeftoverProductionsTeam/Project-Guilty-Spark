import { lazy, Suspense } from 'react';
import { BookOpen, GraduationCap, Search } from 'lucide-react';
import type { MapInspection, Project, Settings, Workspace } from '../types';
import type { LearningSection } from '../workflowHistory';
import HowTo from './HowTo';
import '../learningCenter.css';

const Academy = lazy(() => import('./Academy'));
const sections: { id: LearningSection; label: string; icon: typeof BookOpen }[] = [
  { id: 'guides', label: 'Guides', icon: BookOpen },
  { id: 'glossary', label: 'Glossary', icon: Search },
  { id: 'academy', label: 'Academy', icon: GraduationCap },
];

export default function LearningCenter({ project, inspection, settings, section, onSection, navigate }: {
  project: Project | null;
  inspection: MapInspection | null;
  settings: Partial<Settings>;
  section: LearningSection;
  onSection: (section: LearningSection) => void;
  navigate: (workspace: Workspace) => void;
}) {
  return <div className="analysis-page learning-center">
    <header className="learning-heading">
      <h1><GraduationCap size={20} /> Learning center</h1>
      <span>Find a task, learn a term or follow a lesson.</span>
      <button onClick={() => navigate('features')}>All features &amp; workflows</button>
    </header>
    <div className="learning-navigation">
      <div role="tablist" aria-label="Learning sections">
        {sections.map(({ id, label, icon: Icon }, index) => <button key={id} role="tab"
          id={`learning-${id}-tab`} aria-controls="learning-content" aria-selected={section === id}
          tabIndex={section === id ? 0 : -1} onClick={() => onSection(id)} onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % sections.length
              : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : -1;
            if (next < 0) return;
            event.preventDefault(); onSection(sections[next].id);
            document.getElementById(`learning-${sections[next].id}-tab`)?.focus();
          }}><Icon size={14} />{label}</button>)}
      </div>
      <small className="learning-map-context">{project ? `Using ${project.title}` : 'Open a map for project-aware lesson checks'}</small>
    </div>
    <section role="tabpanel" id="learning-content" aria-labelledby={`learning-${section}-tab`}>
      {section === 'academy' ? <Suspense fallback={<p role="status">Loading lessons…</p>}>
        <Academy embedded project={project} inspection={inspection} settings={settings} navigate={navigate} />
      </Suspense> : <HowTo section={section} navigate={navigate} />}
    </section>
  </div>;
}
