// Minimal chrome.* stub for unit tests (storage.local/session + runtime id).
// Must be installed before any module that captures `chrome` at import time.
const area = () => {
  const data: Record<string, any> = {};
  return {
    data,
    get: (k: any, cb: (r: any) => void) => { const keys = typeof k === 'string' ? [k] : Array.isArray(k) ? k : Object.keys(data); cb(Object.fromEntries(keys.map((x) => [x, data[x]]))); },
    set: (o: Record<string, any>, cb?: () => void) => { Object.assign(data, o); cb?.(); },
    remove: (k: string | string[], cb?: () => void) => { for (const x of [k].flat()) delete data[x]; cb?.(); },
  };
};
(globalThis as any).chrome = {
  runtime: { id: 'kf-test', getURL: (p: string) => 'chrome-extension://kf-test/' + p.replace(/^\//, '') },
  storage: { local: area(), session: area(), onChanged: { addListener() {}, removeListener() {} } },
};
