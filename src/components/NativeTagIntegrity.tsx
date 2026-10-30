import type { NativeTagIntegrityReport } from '../nativeTagIntegrity';
import { Notice } from './ui';
export default function NativeTagIntegrity({
  report,
  writerContext,
}: {
  report?: NativeTagIntegrityReport;
  writerContext?: string;
}) {
  if (!report) return null;
  const problems =
    report.invalidFiles +
    report.unverifiedFiles +
    report.pendingFiles +
    (report.semanticUnverifiedFiles ?? 0);
  return (
    <div className="native-tag-integrity" aria-live="polite">
      {problems > 0 ? (
        <Notice>
          <strong>
            {report.invalidFiles
              ? 'Native save failed integrity checks'
              : report.pendingFiles
                ? 'Verifying native save…'
                : 'Native byte integrity is unverified'}
          </strong>
          <p>
            {report.invalidFiles} invalid · {report.pendingFiles} pending ·{' '}
            {report.unverifiedFiles + (report.semanticUnverifiedFiles ?? 0)} unverified. Previous
            source/builds are retained. Re-save in the originating editor or restore a known valid revision.
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
    </div>
  );
}
