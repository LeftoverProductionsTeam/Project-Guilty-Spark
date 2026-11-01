import type { PendingStudioEdit } from './studioClient';
import type { QuickForgeDocument } from './forge';
import { portableForge } from './forgeSession';
import { sameJson } from './semanticJson';
/** Joining updates the acknowledged baseline, not the user's unresolved local
 * recipe. A draft explicitly set aside on the shared version stays parked. */
export function studioJoinDraft(
  sessionId: string,
  shared: QuickForgeDocument,
  local: QuickForgeDocument,
  pending: PendingStudioEdit | null,
) {
  const sameSession = pending?.sessionId === sessionId;
  return {
    document: sameSession ? local : shared,
    parked:
      !!pending &&
      (!sameSession ||
        (sameJson(portableForge(local), portableForge(shared)) &&
          !sameJson(portableForge(local), portableForge(pending.document)))),
  };
}
/** An uncertain acknowledgment must be resolved with its original operation,
 * baseline and bytes before a newer local draft becomes another transaction. */
export function retainedStudioProposal(
  sessionId: string,
  revision: number,
  document: QuickForgeDocument,
  pending: PendingStudioEdit | null,
  newId: () => string,
): PendingStudioEdit {
  if (pending) {
    if (pending.sessionId !== sessionId)
      throw Error(
        'The retained edit belongs to another session. Export or review it before sharing new edits.',
      );
    return pending;
  }
  return { sessionId, operationId: newId(), revision, document };
}
