import type { CommunityServer } from './runtimeWorkbench';
export type LobbyFilter = 'all' | 'opence' | 'chupathingy' | 'web' | 'unknown';
/** Provider-advertised protocol/platform is not engine/build certification. */
export function matchesLobbyFilter(server: CommunityServer, filter: LobbyFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'opence':
      return server.protocol === 'openCe';
    case 'chupathingy':
      return server.protocol === 'delta';
    case 'web':
      return !!server.platform && /web|browser|wasm/i.test(server.platform);
    case 'unknown':
      return !server.platform || server.protocol === 'unknown';
  }
}
