import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceActivity } from './WorkspaceActivity';
import { EditorAudioScope } from './EditorAudio';

/** Park the editor without losing document/UI state. Only its expensive Canvas
 * subtree may be retired by the bounded warm-view policy. Closing the document
 * still performs ordinary disposal of the complete editor. */
export default function RetainedLevelView({id,active,graphicsResident=true,children}:{id:string;active:boolean;graphicsResident?:boolean;children:ReactNode}) {
  const slot = useRef<HTMLDivElement>(null);
  const [host] = useState(() => document.createElement('div'));
  const [parking] = useState(() => document.createDocumentFragment());
  const resident=active||graphicsResident;
  const activity = useMemo(() => ({active,graphicsResident:resident,scope:`level:${id}`}),[id,active,resident]);
  useLayoutEffect(() => {
    host.className = 'gs-retained-level-content';
    host.dataset.levelProject = id;
    host.dataset.levelActivity = active ? 'active' : 'paused';
    host.dataset.levelGraphics = resident ? 'resident' : 'released';
    host.inert = !active;
    (active && slot.current ? slot.current : parking).appendChild(host);
    return () => { parking.appendChild(host); };
  },[id,active,resident,host,parking]);
  return <div ref={slot} className="gs-retained-level-slot" hidden={!active} data-level-project={id} data-level-active={active}>
    {createPortal(<WorkspaceActivity.Provider value={activity}><EditorAudioScope active={active}>{children}</EditorAudioScope></WorkspaceActivity.Provider>,host)}
  </div>;
}
