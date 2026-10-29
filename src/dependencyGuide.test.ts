import { describe, expect, it } from 'vitest';
import { dependencyContextMatches, mergeDependencyChoice } from './dependencyGuide';
import type { EngineBuildTarget, OpenProject, Project } from './types';

function project(): Project {
  const target: EngineBuildTarget = {
    id: 'profile',
    name: 'MCC map',
    runtimeId: 'mccSteam',
    builder: 'h1a-tool',
    hekDirectory: 'H:/old-kit',
    hekFlavor: 'h1aEk',
    tagsDirectory: 'H:/old-tags',
    invaderDirectory: 'H:/Invader',
    ceCompatibleTagset: false,
    openSauce: false,
  };
  return {
    schemaVersion: 1,
    id: 'map',
    title: 'Map',
    createdAt: '',
    modifiedAt: '',
    source: {
      originalPath: 'original.map',
      preservedPath: 'preserved.map',
      sha256: 'source-hash',
      cacheVersion: 13,
      engine: 'MCC',
      scenarioPath: 'levels/test',
      resourceDirectory: 'H:/old',
      resourceSha256: { paks: 'old' },
    },
    provenance: {
      creator: '',
      community: '',
      releaseYear: null,
      description: '',
      sourceUrl: '',
      permissions: '',
    },
    scene: [],
    assets: [],
    tagEdits: [],
    history: [],
    builds: [],
    buildTargets: [target],
    activeBuildTarget: 'profile',
  };
}
function opened(p: Project): OpenProject {
  return { project: p, inspection: null };
}
describe('dependency picker integration', () => {
  it('retains authored edits while merging only the chosen per-map tool path', () => {
    const before = project(),
      current = structuredClone(before),
      native = structuredClone(before);
    current.title = 'Unsaved title';
    current.tagEdits.push({ tagId: 42, fieldKey: 'speed', value: 2 });
    current.scene.push({
      id: 'new',
      name: 'Unsaved object',
      kind: 'scenery',
      tagId: 1,
      position: [1, 2, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
      sourceOffset: null,
      rotationOffset: null,
      assetId: null,
    });
    current.buildTargets![0].name = 'Unsaved profile name';
    native.buildTargets![0].tagsDirectory = 'H:/chosen-tags';
    native.buildTargets![0].invaderDirectory = 'H:/stale-other-tool';
    const merged = mergeDependencyChoice(current, before, opened(native), 'tags.choose');
    expect(merged.project.scene).toBe(current.scene);
    expect(merged.project.tagEdits).toBe(current.tagEdits);
    expect(merged.project.title).toBe(current.title);
    expect(merged.project.buildTargets![0].name).toBe('Unsaved profile name');
    expect(merged.project.buildTargets![0].tagsDirectory).toBe('H:/chosen-tags');
    expect(merged.project.buildTargets![0].invaderDirectory).toBe(current.buildTargets![0].invaderDirectory);
    expect(merged.inspection).toBeNull();
  });
  it('updates source resource pins without accepting another source or stale authored resource selection', () => {
    const before = project(),
      current = structuredClone(before),
      native = structuredClone(before);
    native.source!.resourceDirectory = 'H:/exact-paks';
    native.source!.resourceSha256 = { paks: 'fresh' };
    const merged = mergeDependencyChoice(current, before, opened(native), 'resources.choose');
    expect(merged.project.source!.resourceDirectory).toBe('H:/exact-paks');
    expect(merged.project.source!.preservedPath).toBe(current.source!.preservedPath);
    current.source!.resourceDirectory = 'H:/concurrent';
    expect(() => mergeDependencyChoice(current, before, opened(native), 'resources.choose')).toThrow(
      'retained',
    );
    current.source!.sha256 = 'other-source';
    expect(() => mergeDependencyChoice(current, before, opened(native), 'resources.choose')).toThrow(
      'map/source changed',
    );
  });
  it('rejects a conflicting active target/path and stale reports after map/runtime switches', () => {
    const before = project(),
      current = structuredClone(before),
      native = structuredClone(before);
    current.buildTargets![0].tagsDirectory = 'H:/new-authored-choice';
    expect(() => mergeDependencyChoice(current, before, opened(native), 'tags.choose')).toThrow('retained');
    current.activeBuildTarget = 'another';
    expect(() => mergeDependencyChoice(current, before, opened(native), 'tags.choose')).toThrow(
      'active map tool profile',
    );
    const report = { runtimeId: 'mccSteam' as const, projectId: 'map' };
    expect(dependencyContextMatches(report, 'mccSteam', before)).toBe(true);
    expect(dependencyContextMatches(report, 'openCe', before)).toBe(false);
    expect(dependencyContextMatches(report, 'mccSteam', { ...before, id: 'another' })).toBe(false);
  });
});
