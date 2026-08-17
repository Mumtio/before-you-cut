/**
 * Free hosting puts an idle backend to sleep, and the next request pays for it
 * with a cold start of the better part of a minute. Someone looking at this for
 * the first time reads that as broken and leaves.
 *
 * A scheduled ping from CI keeps it awake between visits (see
 * `.github/workflows/keep-awake.yml`); this is the second layer — while anyone
 * has the page open, their own browser keeps the API warm, so the try-on they
 * are about to run does not land on a sleeping service.
 */
const EVERY_MS = 10 * 60 * 1000;

export function keepAwake() {
  const ping = () => {
    // Nothing waits on this and a failure means nothing — it is a doorbell.
    void fetch('/api/health', { cache: 'no-store' }).catch(() => undefined);
  };

  ping();
  const timer = setInterval(ping, EVERY_MS);

  // A backgrounded tab has its timers throttled, so the interval alone is not
  // enough — catch up the moment someone comes back to the page.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ping();
  });

  return () => clearInterval(timer);
}
