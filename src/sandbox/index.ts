// MV3 sandboxed page (manifest "sandbox.pages"): opaque origin, no chrome.* APIs,
// no access to K-Flow's storage. The dashboard runs script "dry runs" here
// against a detached document built from the HTML the user provides.
import { runScriptPayload } from '../automation/script/host';

window.addEventListener('message', async (e: MessageEvent) => {
  const d = e.data;
  if (!d || d.channel !== 'kf-sandbox' || typeof d.id !== 'string') return;
  let result: any;
  try {
    const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${String(d.html || '')}</body></html>`, 'text/html');
    result = await runScriptPayload(d.payload, doc);
    result.html = doc.body.innerHTML.slice(0, 4000);
  } catch (err: any) {
    result = { ok: false, error: { message: err?.message || String(err) }, logs: [], vars: {}, durationMs: 0, steps: 0 };
  }
  (e.source as Window | null)?.postMessage({ channel: 'kf-sandbox-result', id: d.id, result }, e.origin === 'null' ? '*' : e.origin);
});
