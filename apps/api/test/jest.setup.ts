// Safety net for a bullmq/ioredis teardown race: when a real Redis IS reachable
// (a dev running the e2e/infra stack), bullmq's lazyConnect connection can emit
// an 'error' during app.close() ('Connection is closed'). With no listener Node
// escalates it to ERR_UNHANDLED_ERROR and kills the jest worker, failing whatever
// unrelated suites shared it. The API test contract is Redis-free (mongodb-memory
// -server + QueuesService stubs) — a stray connection-close must never crash the
// runner. Swallow only that specific teardown noise; re-throw anything else.
function isRedisTeardownNoise(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  // Narrow: ONLY the bullmq connection-close race, not ECONNREFUSED — a real
  // refused-connection bug in a suite must still surface.
  return /Connection is closed|Connection is closing/.test(message);
}

process.on('unhandledRejection', (reason) => {
  if (!isRedisTeardownNoise(reason)) throw reason;
});

process.on('uncaughtException', (err) => {
  if (!isRedisTeardownNoise(err)) throw err;
});
