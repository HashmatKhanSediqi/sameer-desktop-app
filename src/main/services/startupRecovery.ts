/** Only initialization failure enters restricted recovery; window/render failures are not DB recovery. */
export async function initializeOrRecover<T>(initialize: () => Promise<T>, recover: (error: unknown) => Promise<void>): Promise<T | null> {
  try { return await initialize(); }
  catch (error) { await recover(error); return null; }
}
