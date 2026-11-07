import type {KeyboardEvent as ReactKeyboardEvent} from 'react';

const controls = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]';
const typing = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
const search = new WeakMap<HTMLElement,{value:string;at:number}>();
const regionFocus = new WeakMap<HTMLElement,HTMLElement>();

function visible(element:HTMLElement) {
  return !element.closest('[hidden],[inert],[aria-hidden="true"]') && element.getClientRects().length > 0;
}
export function hasKeyboardDialog() {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"]')].some(visible);
}

/** Standard composite navigation, after each editor's own handler has first refusal.
 * Text fields, native selects, camera keys and authoring shortcuts retain ownership. */
export function navigateComposite(event:ReactKeyboardEvent<HTMLElement>) {
  if(event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || !(event.target instanceof Element) || event.target.closest(typing))return;
  const target=event.target;
  const tablist=target.closest<HTMLElement>('[role="tablist"]');
  const menu=target.closest<HTMLElement>('[role="menu"],#gs-workspace-navigation');
  const group=tablist??menu;
  if(!group)return;
  const items=[...group.querySelectorAll<HTMLElement>(tablist?'[role="tab"]':menu?.id==='gs-workspace-navigation'?'button:not(:disabled),a[href]':'button:not(:disabled),a[href],[role^="menuitem"]')]
    .filter(item=>visible(item)&&!item.matches(':disabled,[aria-disabled="true"]')&&(!tablist||item.closest('[role="tablist"]')===tablist));
  if(!items.length)return;
  const at=items.indexOf(document.activeElement as HTMLElement);
  const vertical=!tablist||tablist.getAttribute('aria-orientation')==='vertical';
  let next=-1;
  if(event.key==='Home')next=0;
  else if(event.key==='End')next=items.length-1;
  else if(event.key===(vertical?'ArrowDown':'ArrowRight'))next=(at+1)%items.length;
  else if(event.key===(vertical?'ArrowUp':'ArrowLeft'))next=at<0?items.length-1:(at-1+items.length)%items.length;
  else if(!tablist && event.key.length===1 && /\S/.test(event.key)) {
    const now=performance.now(),previous=search.get(group);
    let value=previous&&now-previous.at<800?previous.value+event.key:event.key;
    // Repeated initials cycle matching entries, like a desktop menu.
    if([...value.toLocaleLowerCase()].every(letter=>letter===value[0].toLocaleLowerCase()))value=event.key;
    const find=(prefix:string)=>{for(let offset=1;offset<=items.length;offset++){
      const index=(at+offset+items.length)%items.length;
      if((items[index].getAttribute('aria-label')??items[index].textContent??'').trim().toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()))return index;
    }return -1;};
    next=find(value);
    if(next<0){value=event.key;next=find(value);}
    search.set(group,{value,at:now});
  }
  if(next<0)return;
  event.preventDefault();event.stopPropagation();items[next].focus();
  if(tablist)items[next].click();
}

/** F6 moves within this native window only. A paused/hidden editor is never focused. */
export function cycleWorkArea(backwards=false) {
  const regions=[...document.querySelectorAll<HTMLElement>('#gs-window-header,#gs-workspace-navigation,main.main-content,.gs-workspace-panel,.runtime-dock')].filter(visible);
  if(!regions.length)return;
  const focused=document.activeElement as HTMLElement;
  // Drawers are portals inside main; prefer the most specific containing region.
  let at=-1;
  for(let i=0;i<regions.length;i++)if(regions[i].contains(focused)&&(at<0||regions[at].contains(regions[i])))at=i;
  if(at>=0)regionFocus.set(regions[at],focused);
  const next=regions[at<0?(backwards?regions.length-1:0):(at+(backwards?-1:1)+regions.length)%regions.length];
  const remembered=regionFocus.get(next);
  const destination=remembered?.isConnected&&visible(remembered)?remembered:[...next.querySelectorAll<HTMLElement>(controls)].find(element=>visible(element)&&element.tabIndex>=0);
  if(destination)destination.focus();
  else {next.tabIndex=-1;next.focus();}
}
