type Job = () => Promise<void>;

/**
 * Minimal in-process FIFO job queue (concurrency 1). Good enough for the MVP's
 * single-process worker; no Redis/BullMQ. Jobs are not durable across restarts,
 * but unfinished requests are re-enqueued on startup (see `requeueUnfinished`).
 */
export class JobQueue {
  private queue: Job[] = [];
  private running = false;

  enqueue(job: Job): void {
    this.queue.push(job);
    void this.drain();
  }

  get length(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      try {
        await job();
      } catch (err) {
        console.error("Job failed:", err);
      }
    }
    this.running = false;
  }
}

export const analysisQueue = new JobQueue();
