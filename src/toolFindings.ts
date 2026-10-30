/** Version-specific observations; unknown writers are not promoted to tool defects. */
export const toolFindings = [
  {
    tool: 'Baboon',
    version: '0.3.2 / reviewed Windows build',
    status: 'Passed scoped test',
    detail:
      'Founder-confirmed MCC H1 pistol handoff and unchanged save preserved the entire file. A genuine bounding-radius edit from 0.1 to 0.5 changed only that exposed field and passed native compilation/readback. Other classes and opaque fields are not certified.',
    action: 'Keep the starting source and review complete saved files.',
  },
  {
    tool: 'Invader',
    version: '0.55.0.r4134.33518109',
    status: 'Binary normalization · exposed fields equivalent',
    detail:
      'A no-op serialization changed 201 binary bytes in the tested native pistol while the same native reader exposed identical fields. A valid-checksum malformed dependency was separately rejected by that parser.',
    action:
      'Separate byte rewrites from actual structure failures. Keep original opaque bytes; parser acceptance does not prove every unexposed field or gameplay behavior.',
  },
  {
    tool: 'Eschaton',
    version: 'Not supplied',
    status: 'Historical user report · unverified cause',
    detail:
      'Halo crashed loading a campaign map after tag imports/scenario additions. A specific defective writer/version has not been independently identified.',
    action:
      'Use compatible native tags, dependency checks and a fresh native rebuild. Preserve the source map and validate the result in Halo.',
  },
  {
    tool: 'Spark',
    version: 'Earlier C37 development attempts',
    status: 'Fixed in current source',
    detail:
      'Native tests found recursive library locking while opening compiled maps and a compiler-containment mismatch for external revisions.',
    action:
      'Current source resolves tags before the import lock and stages accepted source below its validated parent job.',
  },
] as const;
