/** In-flight source transactions. Geometry blocks history until committed;
 * resource bindings settle before Save without blocking Undo or GPU rendering. */
interface Mutation { history: boolean; settled: Promise<Error | undefined>; }
const locks = new Map<string, Map<symbol, Mutation>>();
export function projectMutationPending(id: string) {
  return [...(locks.get(id)?.values() ?? [])].some(mutation => mutation.history);
}
export function beginProjectMutation(id: string, options: { history?: boolean } = {}) {
  const token = Symbol();
  const set = locks.get(id) ?? new Map<symbol, Mutation>();
  let complete!: (failure?: Error) => void;
  const settled = new Promise<Error | undefined>(resolve => { complete = resolve; });
  set.set(token, { history: options.history !== false, settled });
  locks.set(id, set);
  let released = false;
  return (failure?: Error) => {
    if (released) return;
    released = true;
    set.delete(token);
    if (!set.size) locks.delete(id);
    complete(failure);
  };
}
/** Capture after the source operations already in flight at this Save request.
 * New unrelated operations cannot extend the wait or change a queued snapshot.
 * A pending operation can refuse this snapshot if it rejects the requested edit. */
export function afterProjectMutation<T>(id: string, snapshot: () => T, timeoutMs = 15000): Promise<T> {
  const pending = [...(locks.get(id)?.values() ?? [])].map(mutation => mutation.settled);
  if (!pending.length) {
    try { return Promise.resolve(snapshot()); } catch (error) { return Promise.reject(error); }
  }
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      reject(Error('Source changes or default material discovery are still pending. Keep this project open and Save again when they finish.'));
    }, timeoutMs);
    void Promise.all(pending).then(outcomes => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      const failure = outcomes.find(Boolean);
      if (failure) { reject(failure); return; }
      try { resolve(snapshot()); } catch (error) { reject(error); }
    });
  });
}
