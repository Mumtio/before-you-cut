/**
 * The API allows roughly 5 requests a second and 250 per 300 seconds, so every
 * call goes through one queue that respects both. Failures back off rather than
 * hammering — a burst of retries is the fastest way to get rate limited harder.
 */
export class Limiter {
  constructor({ perSecond = 4, perWindow = 240, windowMs = 300_000 } = {}) {
    this.perSecond = perSecond;
    this.perWindow = perWindow;
    this.windowMs = windowMs;
    this.recent = [];
    this.queue = [];
    this.running = false;
  }

  #prune(now) {
    while (this.recent.length && now - this.recent[0] > this.windowMs) this.recent.shift();
  }

  /** Milliseconds to wait before another request may go out. */
  #waitFor(now) {
    this.#prune(now);
    const lastSecond = this.recent.filter((t) => now - t < 1000).length;
    if (lastSecond >= this.perSecond) {
      const oldest = this.recent.find((t) => now - t < 1000);
      return 1000 - (now - oldest) + 5;
    }
    if (this.recent.length >= this.perWindow) {
      return this.windowMs - (now - this.recent[0]) + 5;
    }
    return 0;
  }

  schedule(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.#drain();
    });
  }

  async #drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const wait = this.#waitFor(Date.now());
      if (wait > 0) {
        await sleep(wait);
        continue;
      }
      const job = this.queue.shift();
      this.recent.push(Date.now());
      try {
        job.resolve(await job.fn());
      } catch (err) {
        job.reject(err);
      }
    }
    this.running = false;
  }

  stats() {
    this.#prune(Date.now());
    return { inWindow: this.recent.length, queued: this.queue.length, perWindow: this.perWindow };
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retry on transport errors and 429/5xx, with growing gaps. */
export async function withRetry(fn, { attempts = 4, base = 900 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!err.retryable || i === attempts - 1) throw err;
      await sleep(base * 2 ** i);
    }
  }
  throw lastErr;
}
