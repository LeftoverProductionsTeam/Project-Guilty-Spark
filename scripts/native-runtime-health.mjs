// Classify native engine faults separately from a successful join or zero exit.
// Original parser; no engine code or game content is included.
export function parseRuntimeHealth(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 8 * 1024 * 1024)
    throw Error('Native debug log exceeds bound');
  const lines = text.split(/\r?\n/);
  if (lines.length > 120000 || lines.some((s) => s.length > 16384))
    throw Error('Native debug log line/count exceeds bound');
  const groups = new Map();
  let startupNoiseRecords = 0,
    unclassifiedErrorRecords = 0,
    previous;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}\s+/, '');
    let kind,
      source = null;
    const assertion = line.match(/EXCEPTION assert in .*?[\\/]SOURCE[\\/]([\w\\/ .-]{1,160}),#(\d{1,7}):/i);
    if (assertion) {
      kind = 'nativeAssertion';
      source = assertion[1].replaceAll('\\', '/') + ':' + assertion[2];
    } else if (/\b(?:[a-f\d]{1,8}) is not a tag index: an empty tag is used\b/i.test(line))
      kind = 'invalidTagReference';
    else if (/expected tag group '.{1,4}' but got '.{1,4}'/i.test(line)) kind = 'tagClassMismatch';
    else if (/OUT OF OBJECTS: cannot create /i.test(line)) kind = 'objectCreationFailed';
    else if (/\bcrash: exception [a-f\d]{8}\b/i.test(line)) kind = 'nativeCrash';
    else if (/\b(?:EXCEPTION (?:halt|access violation)|unhandled exception)\b/i.test(line))
      kind = 'nativeException';
    if (kind) {
      const key = kind + ':' + source;
      if (!groups.has(key)) {
        if (groups.size >= 128) throw Error('Too many native fault groups');
        groups.set(key, { kind, source, firstLine: i + 1, loggedRecords: 0, minimumOccurrences: 0 });
      }
      const group = groups.get(key),
        repeats = line.match(/failed (\d{1,10}) times/i);
      group.loggedRecords++;
      group.minimumOccurrences = repeats
        ? Math.max(group.minimumOccurrences, Number(repeats[1]))
        : group.minimumOccurrences + 1;
      previous = group;
    } else {
      const repeated = line.match(/^last line repeated (\d{1,10}) times$/i);
      if (repeated && previous) previous.minimumOccurrences += Number(repeated[1]);
      else previous = null;
      // Known optional intro/video and first-run virtual-file messages stay
      // visible as noise counts. They are not suppressed native tag assertions.
      if (
        /^(?:### ERROR (?:no DirectSound for bink|failed to open bink file '')|Couldn't read map file 'd:\\cachebeta\.map'|(?:file_open\('z:\\(?:lastprof\.txt|last_language\.dat)'\) error 0x00000002)|failed to open 'z:\\lastprof\.txt')$/i.test(
          line,
        )
      )
        startupNoiseRecords++;
      else if (/(?:### ERROR|\b(?:EXCEPTION|fatal error|crash: exception)\b)/i.test(line))
        unclassifiedErrorRecords++;
    }
  }
  const faults = [...groups.values()];
  return {
    checked: true,
    status:
      faults.length || unclassifiedErrorRecords ? 'native-faults-observed' : 'no-classified-native-faults',
    faults,
    startupNoiseRecords,
    unclassifiedErrorRecords,
    contentAcceptance: false,
    boundary:
      'Absence of logged faults does not establish complete gameplay, AI, rendering or audio correctness.',
  };
}
