import { useEffect, useState } from 'react';
import { APP_COMMIT, APP_VERSION } from '../version';

/**
 * Polls /version.json (emitted on every build) and offers a refresh when a newer release has
 * been deployed, so customers never keep running a stale cached bundle.
 */
export default function UpdateBanner() {
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (!stop && j && (j.version !== APP_VERSION || (j.commit && j.commit !== APP_COMMIT))) {
          setNext(String(j.version));
        }
      } catch { /* offline: try again later */ }
    };
    const id = window.setInterval(check, 5 * 60 * 1000);
    const onFocus = () => { void check(); };
    window.addEventListener('focus', onFocus);
    void check();
    return () => { stop = true; window.clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, []);

  if (!next) return null;
  return (
    <div className="nx-update-banner" role="status">
      <span>Nuvis Flipex v{next} is available.</span>
      <button type="button" onClick={() => window.location.reload()}>Refresh to update</button>
      <button type="button" className="nx-update-dismiss" aria-label="Dismiss" onClick={() => setNext(null)}>×</button>
    </div>
  );
}
