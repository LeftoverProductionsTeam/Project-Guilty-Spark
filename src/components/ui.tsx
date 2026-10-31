import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {createPortal} from 'react-dom';
import { AlertTriangle, Check, ChevronRight, X } from 'lucide-react';
export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: string }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
export function IconButton({
  label,
  title,
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  title?: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? 'active' : ''}`}
      title={title??label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Notice({ children, tone = 'warning' }: { children: ReactNode; tone?: string }) {
  return (
    <div className={`notice ${tone}`}>
      <AlertTriangle size={16} />
      <div>{children}</div>
    </div>
  );
}
export function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="check-row">
      <span className={ok ? 'check-icon good' : 'check-icon pending'}>
        {ok ? <Check size={14} /> : <span />}
      </span>
      <div>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <Pill tone={ok ? 'green' : 'muted'}>{ok ? 'Ready' : 'Required'}</Pill>
    </div>
  );
}
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
export function NumberField({
  value,
  onCommit,
  label,
  min = -1e6,
  max = 1e6,
  step = 'any',
  disabled = false,
}: {
  value: number;
  onCommit: (n: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number | 'any';
  disabled?: boolean;
}) {
  const display = (n: number) => Number(n.toPrecision(7)).toString();
  const [draft, setDraft] = useState(display(value));
  const [error, setError] = useState('');
  const scrub=useRef<{pointer:number;x:number;value:number;next:number;moved:boolean}|null>(null);
  useEffect(() => {scrub.current=null;setDraft(display(value));}, [value]);
  function commit() {
    if (draft === display(value)) {
      setError('');
      return;
    }
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n) || n < min || n > max) {
      setError(`Enter a value from ${min} to ${max}`);
      return;
    }
    setError('');
    if (n !== value) onCommit(n);
  }
  return (
    <div className="number-field">
      <input
        aria-label={label}
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        title="Drag left or right to adjust. Shift: fine adjustment. Click and type an exact value."
        onPointerDown={e=>{
          if(e.button!==0||disabled||e.clientX>e.currentTarget.getBoundingClientRect().right-18)return;
          const parsed=Number(draft);
          scrub.current={pointer:e.pointerId,x:e.clientX,value:Number.isFinite(parsed)?parsed:value,next:value,moved:false};
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e=>{
          const drag=scrub.current;if(!drag||drag.pointer!==e.pointerId)return;
          const delta=e.clientX-drag.x;if(!drag.moved&&Math.abs(delta)<4)return;
          drag.moved=true;e.preventDefault();
          const unit=typeof step==='number'?step:0.1;
          drag.next=Number(Math.min(max,Math.max(min,drag.value+delta*unit*(e.shiftKey ? 0.1 : 1))).toPrecision(12));
          setDraft(display(drag.next));setError('');
        }}
        onPointerUp={e=>{
          const drag=scrub.current;if(!drag||drag.pointer!==e.pointerId)return;
          scrub.current=null;
          if(drag.moved){e.preventDefault();e.stopPropagation();if(drag.next!==value)onCommit(drag.next);}
        }}
        onPointerCancel={()=>{scrub.current=null;setDraft(display(value));}}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            scrub.current=null;
            setDraft(String(value));
            setError('');
          }
        }}
        aria-invalid={!!error}
      />
      {error && <small className="input-error">{error}</small>}
    </div>
  );
}
export function Toast({ message, tone, onClose }: { message: string; tone: string; onClose: () => void }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`toast ${tone}`}>
      <span>{tone === 'error' ? <AlertTriangle size={19} /> : <Check size={19} />}</span>
      <p>{message}</p>
      <button onClick={onClose} aria-label="Dismiss message">
        <X size={17} />
      </button>
    </div>
  );
}
export function Breadcrumb({ section, title }: { section: string; title: string }) {
  return (
    <div className="breadcrumb">
      <span>{section}</span>
      <ChevronRight size={12} />
      <span>{title}</span>
    </div>
  );
}

/**
 * Hover, keyboard focus and touch-accessible help. Escape hides the popup
 * without moving focus; focusing or hovering again reopens it.
 */
export function HelpTip({help}:{help:string}) {
  const id = useId();
  const anchor=useRef<HTMLSpanElement>(null),bubble=useRef<HTMLSpanElement>(null);
  const [position,setPosition]=useState({left:8,top:8});
  const [hovered,setHovered] = useState(false);
  const [focused,setFocused] = useState(false);
  const [dismissed,setDismissed] = useState(false);
  const visible = (hovered || focused) && !dismissed;
  useLayoutEffect(()=>{
    if(!visible)return;
    const place=()=>{if(!anchor.current)return;const rect=anchor.current.getBoundingClientRect(),width=Math.min(320,innerWidth-16),height=bubble.current?.offsetHeight??80;setPosition({left:Math.min(innerWidth-width-8,Math.max(8,rect.left)),top:rect.bottom+height+12>innerHeight?Math.max(8,rect.top-height-6):rect.bottom+6});};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[visible,help]);
  return <span ref={anchor} className={`gs-help-wrapper ${visible ? 'is-visible' : ''}`}
    onMouseEnter={()=>{setHovered(true);setDismissed(false);}}
    onMouseLeave={()=>setHovered(false)}>
    <button type="button" className="gs-helptip" aria-label="Explain this field"
      aria-describedby={visible ? id : undefined}
      onFocus={()=>{setFocused(true);setDismissed(false);}}
      onBlur={()=>{setFocused(false);setDismissed(false);}}
      onClick={()=>setDismissed(false)}
      onKeyDown={event=>{
        if(event.key === 'Escape') {event.preventDefault();event.stopPropagation();setDismissed(true);}
      }}>?</button>
    {createPortal(<span ref={bubble} id={id} role="tooltip" hidden={!visible} aria-hidden={!visible} className="gs-help-bubble gs-help-portal" style={{position:'fixed',left:position.left,top:position.top,zIndex:2147483000,maxWidth:'min(320px, calc(100vw - 16px))'}}>{help}</span>,document.body)}
  </span>;
}
