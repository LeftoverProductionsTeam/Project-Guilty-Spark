import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceActivity } from './WorkspaceActivity';
import { EditorAudioScope } from './EditorAudio';

/** Parking a stable portal host preserves the React tree, WebGL context and
 * decoded resources. Inactive maps leave the visible DOM and stop their clock;
 * closing the document still performs ordinary resource disposal. */
export default function RetainedLevelView({id,active,children}:{id:string;active:boolean;children:ReactNode}) {
  const slot = useRef<HTMLDivElement>(null);
  const [host] = useState(() => document.createElement('div'));
  const [parking] = useState(() => document.createDocumentFragment());
  const activity = useMemo(() => ({active,scope:`level:${id}`}),[id,active]);
  useLayoutEffect(() => {
    host.className = 'gs-retained-level-content';
    host.dataset.levelProject = id;
    host.dataset.levelActivity = active ? 'active' : 'paused';
    host.inert = !active;
    (active && slot.current ? slot.current : parking).appendChild(host);
    return () => { parking.appendChild(host); };
  },[id,active,host,parking]);
  return <div ref={slot} className="gs-retained-level-slot" hidden={!active} data-level-project={id} data-level-active={active}>
    {createPortal(<WorkspaceActivity.Provider value={activity}><EditorAudioScope active={active}>{children}</EditorAudioScope></WorkspaceActivity.Provider>,host)}
  </div>;
}
