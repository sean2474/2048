import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MatchRecordSchema, type MatchRecord } from "schema/results";
export type MatchWriter = (record: MatchRecord) => Promise<void>;

// Persist before sending to Supabase. Failed jobs survive restarts and RPC retries
// are safe because the database accepts each match UUID only once.
export class ResultStore {
  private inFlight = new Map<string, Promise<void>>();
  private pendingRanked = new Map<string, Array<string | null>>();
  private pendingAccounts = new Map<string, Array<string | null>>();
  private unpersisted = new Map<string, MatchRecord>();
  private timer?: ReturnType<typeof setInterval>;
  private retryJob?: Promise<void>;
  constructor(private directory: string, private writeRemote: MatchWriter, private report: (message: string) => void = console.error) {}
  async start(interval = 30_000) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    // Load every pending account before accepting matches, even while retries are offline.
    for (const file of await readdir(this.directory)) {
      if (file.endsWith(".json")) this.trackRanked(await this.readRecord(file));
    }
    void this.retryPending();
    this.timer = setInterval(() => { void this.retryPending(); }, interval);
    this.timer.unref();
  }
  async save(record: MatchRecord) {
    MatchRecordSchema.parse(record);
    this.trackRanked(record);
    this.unpersisted.set(record.id, record);
    await this.deliver(record, true);
  }
  hasPendingRanked(userId: string) {
    return [...this.pendingRanked.values()].some(accounts => accounts.includes(userId));
  }
  hasPendingAccount(userId: string) {
    return [...this.pendingAccounts.values()].some(accounts => accounts.includes(userId));
  }
  private trackRanked(record: MatchRecord) {
    this.pendingAccounts.set(record.id, record.participants.map(p => p.userId));
    if (record.mode === "ranked") this.pendingRanked.set(record.id, record.participants.map(p => p.userId));
  }
  private async readRecord(file: string) {
    const record = MatchRecordSchema.parse(JSON.parse(await readFile(join(this.directory, file), "utf8")));
    if (`${record.id}.json` !== file) throw new Error("Invalid outbox filename");
    return record;
  }
  private deliver(record: MatchRecord, persist = false): Promise<void> {
    const existing = this.inFlight.get(record.id);
    if (existing) return existing;
    const job = (async () => {
      if (persist) {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const destination = join(this.directory, `${record.id}.json`);
        const temporary = `${destination}.tmp`;
        await writeFile(temporary, JSON.stringify(record), { mode: 0o600, flush: true });
        await rename(temporary, destination);
        this.unpersisted.delete(record.id);
      }
      await this.writeRemote(record);
      await unlink(join(this.directory, `${record.id}.json`));
      this.pendingRanked.delete(record.id);
      this.pendingAccounts.delete(record.id);
    })();
    this.inFlight.set(record.id, job);
    void job.finally(() => this.inFlight.delete(record.id)).catch(() => {});
    return job;
  }
  retryPending(): Promise<void> {
    if (this.retryJob) return this.retryJob;
    this.retryJob = this.drain().finally(() => { this.retryJob = undefined; });
    return this.retryJob;
  }
  private async drain() {
    // Disk failures leave no JSON file to discover, so retain these jobs until persisted.
    for (const record of this.unpersisted.values()) {
      try { await this.deliver(record, true); }
      catch { this.report(`Match result still pending: ${record.id}.json`); }
    }
    try {
      for (const file of await readdir(this.directory)) {
        if (!file.endsWith(".json")) continue;
        try {
          const record = await this.readRecord(file);
          await this.deliver(record);
        } catch {
          this.report(`Match result still pending: ${file}`);
        }
      }
    } catch { this.report("Cannot read the match result outbox"); }
  }
  async close() {
    clearInterval(this.timer);
    await this.retryJob;
    await Promise.allSettled([...this.inFlight.values()]);
  }
}
