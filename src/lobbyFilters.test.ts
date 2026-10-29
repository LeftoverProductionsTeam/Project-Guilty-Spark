import { describe, it, expect } from 'vitest';
import { matchesLobbyFilter } from './lobbyFilters';
import type { CommunityServer } from './runtimeWorkbench';
describe('one lobby list with explicit advertised filters', () => {
  it('keeps unclassified games visible in All without inventing a host engine', () => {
    const server = { protocol: 'openCe', platform: null } as CommunityServer;
    expect(matchesLobbyFilter(server, 'all')).toBe(true);
    expect(matchesLobbyFilter(server, 'opence')).toBe(true);
    expect(matchesLobbyFilter(server, 'unknown')).toBe(true);
    expect(matchesLobbyFilter(server, 'web')).toBe(false);
  });
  it('web and protocol filters are independent advertised facts', () => {
    const server = { protocol: 'delta', platform: 'web_browser' } as CommunityServer;
    expect(matchesLobbyFilter(server, 'web')).toBe(true);
    expect(matchesLobbyFilter(server, 'chupathingy')).toBe(true);
    expect(matchesLobbyFilter(server, 'opence')).toBe(false);
  });
});
