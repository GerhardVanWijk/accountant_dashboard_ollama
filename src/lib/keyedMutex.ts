/**
 * A per-key async mutex — TEST-DOUBLE-ONLY. Production concurrency safety
 * comes from real Postgres row locking (`SELECT ... FOR UPDATE` inside the
 * atomic RPCs, e.g. `settle_payroll_net_pay` / `settle_lease_period_payment`,
 * migrations 0096/0097) — a single-process JS mutex proves nothing about a
 * real multi-connection database. This exists so a Fake executor's test
 * double can faithfully SIMULATE that same "second caller for the same row
 * waits for the first to fully finish" serialisation, so a genuine
 * `Promise.all([...])` concurrency test (two "concurrent" settlement
 * attempts against the SAME target) exercises the identical observable
 * contract the RPC provides, instead of racing freely the way a naive
 * check-then-write Fake would (see FakePayrollSettlementExecutor /
 * FakeLeasePeriodSettlementExecutor for why this matters: without it, two
 * concurrent settlement attempts against the same outstanding balance could
 * both read the SAME "amount already settled" figure before either writes,
 * exactly reproducing the double-tab over-settlement bug this hardening
 * pass closes).
 */
export class KeyedMutex {
  private readonly queue = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prior = this.queue.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queue.set(key, prior.then(() => next));
    await prior;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
