/** Order invalidations, not cached values. One native read and one trailing read
 * cover a burst; an older reply is never published over a newer request. */
export function createLatestRefresh<Input, Output>(
  read: (input: Input) => Promise<Output>,
  publish: (value: Output) => void,
) {
  type Batch = { promise: Promise<Output>; resolve: (value: Output) => void; reject: (error: unknown) => void };
  let batch: Batch | null = null;
  let generation = 0;
  let latest: Input;
  let disposed = false;

  async function drain(active: Batch) {
    while (!disposed) {
      const revision = generation;
      try {
        const value = await read(latest);
        if (disposed) return;
        if (revision !== generation) continue;
        publish(value);
        if (revision !== generation) continue;
        batch = null;
        active.resolve(value);
        return;
      } catch (error) {
        if (disposed) return;
        if (revision !== generation) continue;
        batch = null;
        active.reject(error);
        return;
      }
    }
  }
  function request(input: Input): Promise<Output> {
    if (disposed) return Promise.reject(Error('Refresh owner closed'));
    latest = input;
    generation++;
    if (batch) return batch.promise;
    let resolve!: Batch['resolve'], reject!: Batch['reject'];
    const promise = new Promise<Output>((ok, failed) => { resolve = ok; reject = failed; });
    batch = { promise, resolve, reject };
    void drain(batch);
    return promise;
  }
  return {
    request,
    // An ordinary save uses its receipt. Only fence a read already in flight.
    invalidateActive(input: Input) { return batch ? request(input) : undefined; },
    dispose() {
      disposed = true;
      const active = batch;
      batch = null;
      active?.reject(Error('Refresh owner closed'));
    },
  };
}
