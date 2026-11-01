// Retry transport interruptions with the SAME retained operation ID. Semantic,
// permission, certificate and source-integrity failures require explicit review.
export function studioRetryDelay(error: unknown, attempt: number): number | null {
  if (!Number.isSafeInteger(attempt) || attempt < 0 || attempt >= 6) return null;
  const text = String(error);
  if (
    /certificate|authentication|permission|revoked|conflict|checksum|identity|protocol|source changed/i.test(
      text,
    )
  )
    return null;
  if (
    !/timed? out|connection (?:reset|refused|aborted)|forcibly closed|unreachable|failed to fill whole buffer|peer closed connection without sending TLS close_notify|unexpected end of file|os error (?:10050|10051|10053|10054|10060|10061|10064|10065)\b/i.test(
      text,
    )
  )
    return null;
  return Math.min(8000, 500 * 2 ** attempt);
}
