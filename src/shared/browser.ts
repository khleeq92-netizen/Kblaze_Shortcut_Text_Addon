// Thin cross-browser wrapper. Chrome exposes `chrome.*`; Firefox/Safari expose
// `browser.*` (promise based) and also alias `chrome`. All code goes through `api`.
declare const browser: typeof chrome | undefined;
export const api: typeof chrome =
  (typeof browser !== 'undefined' && (browser as any)?.runtime ? (browser as any) : (globalThis as any).chrome) as typeof chrome;

export const isExtensionContext = () => !!api?.runtime?.id;

export function sendMessage<T = any>(msg: any): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      api.runtime.sendMessage(msg, (res: T) => {
        const err = api.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(res);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => api.storage.local.get(key, (r) => resolve(r?.[key] as T | undefined)));
}
export function storageSet(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => api.storage.local.set({ [key]: value }, () => resolve()));
}
