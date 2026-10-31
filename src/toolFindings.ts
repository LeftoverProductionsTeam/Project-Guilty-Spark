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
    tool: 'Invader · extracted stock CE source',
    version: '0.55.0.r4134.33518109 / exact reviewed tag hashes',
    status: 'Known extracted-source limitation · explicit recovery available',
    detail:
      'The tested CE extraction yields a Warthog gunner variant with three undefined enum values. The Scorpion headlight and secondary-fire effect also contain out-of-range references rejected by the CE compiler. This does not identify corruption in the playable original cache or certify every extracted tag.',
    action:
      'Select a CE build target, then review Stock CE source recovery. It retains originals and creates a separate copy with seven explicit behaviour changes. Unknown inputs are refused. Compile and test the corrected copy before use.',
  },
  {
    tool: 'Sapien · Halo 1 CE / H1A editing kits',
    version: 'Edition-specific preservation warning; exact offending binary not isolated',
    status: 'Reported detail-object loss/vertical shift · not a confirmed writer defect',
    detail:
      'BSP/environment save workflows can erase or shift painted detail objects. C36 checked a real A30 painted BSP and blocks Spark environment writes that cannot preserve its exact native payload. This does not identify a defective Sapien version or establish a Halo 3/Reach issue.',
    action:
      'Keep pre-save BSP bytes and tool identities. Compare detail counts, integer payload and exact Z data; rounded displayed values are insufficient. Generic external Sapien saves remain outside Spark’s write guard.',
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
