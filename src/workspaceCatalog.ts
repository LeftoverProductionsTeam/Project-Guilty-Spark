import { ArrowLeftRight, ArrowUpRight, BookOpen, Box, Clapperboard, Compass, FileCode2, Flame, Globe2, GraduationCap, Hammer, Heart, Layers3, LibraryBig, Palette, Server, Settings2, Unplug, Users } from 'lucide-react';
import type { Workspace } from './types';
import { WORKSPACE_TOOLTIPS } from './firstRun';
import { WORKBENCH_GUIDES } from './workbenchGuide';
import type { WorkspaceFinderItem } from './workspaceFinder';

// The original application navigation, shared by the Orb, window switcher and
// Find tools. Aliases select an existing workspace, never a second editor.
export const workspaceCatalog = [
  { id: 'get-started', label: 'Start here', icon: Compass },
  { id: 'features', label: 'Features & workflows', icon: BookOpen },
  { id: 'library', label: 'Map library', icon: LibraryBig },
  { id: 'map-finder', label: 'Community maps', icon: Globe2 },
  { id: 'quickforge', label: 'Level editor', icon: Layers3 },
  { id: 'learning', label: 'Learning center', icon: GraduationCap },
  { id: 'community', label: 'Community Thanks', icon: Heart },
  { id: 'firefight', label: 'Firefight rules', icon: Flame },
  { id: 'world', label: 'World editor', icon: Box },
  { id: 'tags', label: 'Tag editor', icon: FileCode2 },
  { id: 'assets', label: 'Asset workshop', icon: Hammer },
  { id: 'scenario', label: 'AI & scenario', icon: Users },
  { id: 'build', label: 'Build & playtest', icon: ArrowUpRight },
  { id: 'compare', label: 'Compare variants', icon: ArrowLeftRight },
  { id: 'runtimes', label: 'Online', icon: Server },
  { id: 'live', label: 'Live Lab', icon: Unplug },
  { id: 'interface', label: 'Interface Studio', icon: Palette },
  { id: 'creator', label: 'Creator Studio', icon: BookOpen },
  { id: 'machinima', label: 'Machinima', icon: Clapperboard },
  { id: 'preservation', label: 'Preservation record', icon: BookOpen },
  { id: 'settings', label: 'Settings & tools', icon: Settings2 },
] as const;
export const mapWorkspaces:Workspace[]=['world','quickforge','live','tags','assets','scenario','build','firefight','creator','machinima','preservation'];
export const navGroups = [["Level Editor",["quickforge"]],["Tags & Assets",["tags","assets","compare"]],["Gameplay Creator",["machinima","scenario","firefight","creator"]],["Projects & Testing",["library","build","runtimes"]],["Learn & Community",["get-started","features","learning","map-finder","community"]]] as const;
export const canonicalWorkspace = (value:Workspace):Workspace => value==='academy'||value==='how-to'?'learning':value;
export const workspaceLabel = (value:Workspace) => workspaceCatalog.find(item=>item.id===canonicalWorkspace(value))?.label??value;
export const finderItems:readonly WorkspaceFinderItem[]=[...workspaceCatalog.filter(item=>item.id==='quickforge'),...workspaceCatalog.filter(item=>item.id!=='quickforge')].map(({id,label})=>({id,label,help:WORKSPACE_TOOLTIPS[id]??'',keywords:`${WORKBENCH_GUIDES[id].can} ${WORKBENCH_GUIDES[id].cannot} ${WORKBENCH_GUIDES[id].tip} ${id==='quickforge'?'QuickForge geometry brushes tunnels forge':id==='learning'?'how-to how to glossary modding academy tutorials lessons':''}`}));
