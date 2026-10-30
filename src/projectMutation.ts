/** Short local geometry transactions finish before history can advance. */
const locks = new Map<string, Set<symbol>>();
export function projectMutationPending(id: string) {
  return !!locks.get(id)?.size;
}
export function beginProjectMutation(id: string) {
  const token = Symbol();
  const set = locks.get(id) ?? new Set<symbol>();
  set.add(token);
  locks.set(id, set);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    set.delete(token);
    if (!set.size) locks.delete(id);
  };
}
