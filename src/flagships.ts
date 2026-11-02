import type { Workspace } from './types';
export type FlagshipStatus='Available now'|'In active development'|'Future research';
export const FLAGSHIP_VISION:readonly {id:string;title:string;status:FlagshipStatus;detail:string;workspace:Workspace}[]=[
  {id:'megaworld',title:'Halo Megaworld',status:'In active development',detail:'Atlas and native connected-region builds. Two-way player tunnel traversal remains open; no seamless streaming claim.',workspace:'world'},
  {id:'bsp',title:'Forge & BSP Workshop',status:'Available now',detail:'Four-view native construction, collision and compilation. Custom Edition two-room corridor/ramp gameplay verified; broader geometry tools remain scoped.',workspace:'quickforge'},
  {id:'ai',title:'Multiplayer AI',status:'In active development',detail:'Real host/client actor diagnostics. Shared identities do not establish accepted combat, damage, death or late-join parity.',workspace:'scenario'},
  {id:'survival',title:'Firefight & Zombies',status:'In active development',detail:'Native solo round source with score/restart tests and original carrier recovery. Human combat and automatic zombie release remain acceptance gates.',workspace:'firefight'},
  {id:'conversion',title:'Halo conversion',status:'In active development',detail:'Preserved source, recursive dependencies and native MCC/CE builds. Playable conversion to every runtime is not yet accepted.',workspace:'build'},
  {id:'connected',title:'Live Link & SparkLink',status:'Available now',detail:'Supported MCC game-object edits and private three-process native/BSP collaboration on one computer. Other runtime live writes and cross-computer acceptance remain open.',workspace:'live'},
  {id:'online',title:'Multiplayer Hub',status:'Available now',detail:'Runtime-aware discovery and managed CE hosting/client joining. Engines keep their own protocols; no universal lobby bridge.',workspace:'runtimes'},
  {id:'creator',title:'Campaigns & cinematics',status:'In active development',detail:'Native mission/script source, camera takes and Recording Director. A complete First Contact mission still needs end-to-end gameplay.',workspace:'creator'},
];
export const FLAGSHIP_RESEARCH='Future research: expanded co-op, 128-player acceptance, engine streaming, split-screen and VR.';
