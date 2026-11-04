import { describe, expect, it, vi } from 'vitest';
vi.mock('./mapSession', () => ({ writeMapSession: vi.fn() }));
import { writeMapSession } from './mapSession';
import { SPARK_FEATURES } from './featureCatalog';
import { featureWorkflowTarget, openFeatureWorkflow } from './featureWorkflow';
import type { Project } from './types';
import { readFileSync, readdirSync } from 'node:fs';

describe('guided demo entrypoints', () => {
  it('opens source geometry and object demos on the same map without inserting or replacing content', () => {
    vi.mocked(writeMapSession).mockClear();
    const project = {
      id: 'user-map',
      quickForge: { name: 'User rooms', geometry: [{ id: 'authored' }] },
    } as unknown as Project;
    const before = JSON.stringify(project),
      navigate = vi.fn();
    openFeatureWorkflow(
      SPARK_FEATURES.find((f) => f.id === 'bsp-workshop')!,
      project,
      navigate,
    );
    expect(navigate).toHaveBeenLastCalledWith('quickforge');
    expect(writeMapSession).toHaveBeenCalledWith('user-map', 'forge.bspWorkshop', true);
    openFeatureWorkflow(
      SPARK_FEATURES.find((f) => f.id === 'native-door-logic')!,
      project,
      navigate,
    );
    expect(writeMapSession).toHaveBeenCalledWith('user-map', 'forge.bspWorkshop', false);
    expect(JSON.stringify(project)).toBe(before);
  });
  it('routes users to create/open source instead of trying brush operations on a compiled map', () => {
    vi.mocked(writeMapSession).mockClear();
    const feature = SPARK_FEATURES.find((f) => f.id === 'bsp-workshop')!,
      navigate = vi.fn();
    for (const project of [null, { id: 'compiled', source: { sha256: 'a'.repeat(64) } } as Project]) {
      expect(featureWorkflowTarget(feature, project)).toBe('library');
      openFeatureWorkflow(feature, project, navigate);
    }
    expect(writeMapSession).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(2);
  });
  it('gives each catalog capability actionable steps and a stable route without promoting gameplay evidence', () => {
    expect(new Set(SPARK_FEATURES.map((f) => f.id)).size).toBe(SPARK_FEATURES.length);
    for (const feature of SPARK_FEATURES) {
      expect(feature.title.trim()).not.toBe('');
      expect(feature.steps.length, feature.id).toBeGreaterThanOrEqual(3);
      expect(
        feature.steps.every((step) => step.trim().length > 15),
        feature.id,
      ).toBe(true);
      expect(featureWorkflowTarget(feature, null)).not.toBeUndefined();
    }
    expect(SPARK_FEATURES.find((f) => f.id === 'native-door-logic')?.limit).toContain('H1A Standalone');
    expect(SPARK_FEATURES.find((f) => f.id === 'megaworld-atlas')?.limit).toContain('research');
  });
  it('keeps every current native demo/harness mapped to a user workflow or an explicit diagnostic/research boundary', () => {
    const coverage = JSON.parse(
      readFileSync(new URL('../docs/fixtures/demo-workflow-coverage.json', import.meta.url), 'utf8'),
    );
    const actual = [
      ...readdirSync(new URL('../crates/spark-core/examples/', import.meta.url))
        .filter((name) => /^qa_.*\.rs$/.test(name))
        .map((name) => `crates/spark-core/examples/${name}`),
      ...readdirSync(new URL('../scripts/', import.meta.url))
        .filter(
          (name) =>
            name.endsWith('.mjs') &&
            ((name.startsWith('test-') && (name.includes('-native') || name.startsWith('test-native-'))) ||
              name === 'recover-zombie-carriers-native.mjs'),
        )
        .map((name) => `scripts/${name}`),
    ].sort();
    expect(coverage.artifacts.map((record: any) => record.artifact).sort()).toEqual(actual);
    for (const record of coverage.artifacts) {
      expect(
        SPARK_FEATURES.some((f) => f.id === record.featureId),
        record.artifact,
      ).toBe(true);
      expect(['workflow', 'diagnostic', 'research']).toContain(record.kind);
      expect(record.scope.length).toBeGreaterThan(20);
    }
  });
});
