import type { NativeSaveEvidence, NativeTagIntegrityReport } from '../nativeTagIntegrity';
import { Notice } from './ui';
export default function NativeTagIntegrity({
  report,
  writerContext,
  evidence,
}: {
  report?: NativeTagIntegrityReport;
  writerContext?: string;
  evidence?: NativeSaveEvidence;
}) {
  if (!report) return null;
  const problems =
    report.invalidFiles +
    report.unverifiedFiles +
    report.pendingFiles +
    (report.semanticUnverifiedFiles ?? 0);
  const parserPending = (report.nativeParserCheckedFiles ?? 0) < report.checkedFiles + report.unverifiedFiles;
  return (
    <div className="native-tag-integrity" aria-live="polite">
      {problems > 0 || parserPending ? (
        <Notice>
          <strong>
            {report.invalidFiles
              ? 'Native save failed integrity checks'
              : report.pendingFiles
                ? 'Verifying native save…'
                : parserPending || report.semanticUnverifiedFiles
                  ? 'Native structure needs verification'
                  : 'Native byte integrity is unverified'}
          </strong>
          <p>
            {report.invalidFiles} invalid · {report.pendingFiles} pending ·{' '}
            {report.unverifiedFiles + (report.semanticUnverifiedFiles ?? 0)} unverified. Previous
            source/builds are retained. Re-save in the originating editor or restore a known valid revision.{' '}
            Keeping or compiling edits waits for native structure checks to finish.
          </p>
          {writerContext && <p>{writerContext}</p>}
          <ul>
            {report.findings.slice(0, 8).map((f, index) => (
              <li key={`${f.path}:${f.state}:${index}`}>
                <code>{f.path}</code> · {f.detail}
              </li>
            ))}
          </ul>
          {report.listTruncated && (
            <p>Showing a bounded finding list; all invalid-file counts remain included.</p>
          )}
        </Notice>
      ) : (
        report.checkedFiles > 0 && (
          <p className="subtle">
            {report.checkedFiles} saved native files pass header/class/CRC checks.{' '}
            {report.nativeParserCheckedFiles
              ? `${report.nativeParserCheckedFiles} pass the configured native parser; ${report.equivalentFieldFiles ?? 0} have equivalent exposed fields and ${report.changedFieldFiles ?? 0} have field changes. Opaque data and gameplay still need review.`
              : 'Valid bytes do not establish valid game structures or dependencies; native parser/compiler checks are still required.'}
          </p>
        )
      )}
      {!!evidence?.files.length && (
        <details>
          <summary>Save evidence · revision {evidence.revision} · writer unknown</summary>
          <p className="subtle">{evidence.explanation}</p>
          {evidence.associations.map((tool, index) => (
            <p key={index}>
              <strong>Associated: {tool.tool}</strong> · {tool.version}
              {tool.processId ? ` · last launched PID ${tool.processId}` : ''}
              <br />
              {tool.basis}
              <br />
              <code>{tool.executable}</code>
              <br />
              <code>{tool.executableSha256}</code>
            </p>
          ))}
          <p className="subtle">
            Observed {new Date(evidence.observedAt).toLocaleString()}. File checks and failures are listed
            above.
          </p>
          {evidence.files.slice(0, 8).map((file) => (
            <p key={file.path}>
              <code>{file.path}</code> · {file.kind} · {file.bytes ?? 'unknown'} bytes
              <br />
              Modified:{' '}
              {file.modifiedUnixMs == null
                ? 'unknown / removed'
                : new Date(file.modifiedUnixMs).toLocaleString()}
              <br />
              Before: <code>{file.previousSha256 ?? 'absent'}</code>
              <br />
              Observed: <code>{file.observedSha256 ?? 'absent'}</code>
            </p>
          ))}
          {(evidence.listTruncated || evidence.files.length > 8) && (
            <p>Showing the first 8 file identities; change counts include all files.</p>
          )}
        </details>
      )}
    </div>
  );
}
