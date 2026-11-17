// Google Sheets integration.
//  1. Public / "anyone with the link" sheets: read through the CSV export URL (no sign-in).
//  2. Private sheets: Google OAuth (chrome.identity.launchWebAuthFlow, scope
//     spreadsheets) + Sheets API v4 values.get / values.append (write reports).
import type { DataSourceAdapter, ImportedSheet } from './sources';
import { parseDelimited } from './sources';

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export function parseSheetUrl(input: string): { id: string; gid?: string } | null {
  const s = input.trim();
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/.exec(s);
  const id = m ? m[1] : /^[a-zA-Z0-9-_]{25,}$/.test(s) ? s : null;
  if (!id) return null;
  const gid = /[#&?]gid=(\d+)/.exec(s)?.[1];
  return { id, gid };
}

export function csvExportUrl(id: string, gid?: string) {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv${gid ? `&gid=${encodeURIComponent(gid)}` : ''}`;
}

type Fetch = typeof fetch;

export async function loadPublicSheet(url: string, f: Fetch = fetch): Promise<ImportedSheet[]> {
  const p = parseSheetUrl(url);
  if (!p) throw new Error('Paste a Google Sheets link (https://docs.google.com/spreadsheets/d/…)');
  const res = await f(csvExportUrl(p.id, p.gid), { credentials: 'omit', redirect: 'follow' });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || ct.includes('text/html')) throw new Error('The sheet is not public. Share it as "Anyone with the link can view", or connect your Google account to read private sheets.');
  const text = await res.text();
  return [{ name: 'Google Sheet', rows: parseDelimited(text, ','), source: { kind: 'gsheet-public', ref: url, importedAt: Date.now() } }];
}

export async function apiGet(token: string, path: string, f: Fetch = fetch) {
  const res = await f(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error('Google sign-in expired — connect your Google account again');
  if (res.status === 403) throw new Error('No access to this spreadsheet with the connected Google account');
  if (res.status === 404) throw new Error('Spreadsheet not found');
  if (!res.ok) throw new Error(`Google Sheets API error ${res.status}`);
  return res.json();
}

export async function listSheetTabs(token: string, id: string, f: Fetch = fetch): Promise<{ title: string; gid: number }[]> {
  const j = await apiGet(token, `${encodeURIComponent(id)}?fields=sheets.properties(title,sheetId)`, f);
  return (j.sheets || []).map((s: any) => ({ title: s.properties.title, gid: s.properties.sheetId }));
}

export async function loadPrivateSheet(token: string, url: string, tab?: string, f: Fetch = fetch): Promise<ImportedSheet[]> {
  const p = parseSheetUrl(url);
  if (!p) throw new Error('Invalid Google Sheets link');
  let title = tab;
  if (!title) {
    const tabs = await listSheetTabs(token, p.id, f);
    title = (p.gid ? tabs.find((t) => String(t.gid) === p.gid)?.title : undefined) || tabs[0]?.title;
  }
  if (!title) throw new Error('The spreadsheet has no sheets');
  const j = await apiGet(token, `${encodeURIComponent(p.id)}/values/${encodeURIComponent(`'${title.replace(/'/g, "''")}'`)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`, f);
  const values: any[][] = j.values || [];
  const width = Math.max(0, ...values.map((r) => r.length));
  const rows = values.map((r) => Array.from({ length: width }, (_, i) => (r[i] === undefined || r[i] === null ? '' : String(r[i]))));
  return [{ name: title, rows, source: { kind: 'gsheet', ref: p.id, sheet: title, importedAt: Date.now() } }];
}

/** Appends rows (e.g. an execution report) to a sheet tab. */
export async function appendRows(token: string, spreadsheetId: string, tab: string, rows: (string | number | boolean)[][], f: Fetch = fetch) {
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'!A1`);
  const res = await f(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) throw new Error(`Could not write to Google Sheets (${res.status})`);
  return res.json();
}

/** OAuth token via the browser's identity flow (implicit grant, no client secret in the extension). */
export async function googleAccessToken(clientId: string, scopes: string[], interactive = true): Promise<string> {
  const chromeApi = (globalThis as any).chrome;
  if (!chromeApi?.identity?.launchWebAuthFlow) throw new Error('Google sign-in is only available inside the extension');
  if (!clientId) throw new Error('Add your Google OAuth client ID in Settings → Cloud & Account first');
  const redirect = chromeApi.identity.getRedirectURL('google');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&response_type=token&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(scopes.join(' '))}&include_granted_scopes=true&prompt=select_account`;
  const resp: string = await new Promise((resolve, reject) => chromeApi.identity.launchWebAuthFlow({ url, interactive }, (r: string) => { const e = chromeApi.runtime.lastError; if (e || !r) reject(new Error(e?.message || 'Google sign-in was cancelled')); else resolve(r); }));
  const token = new URLSearchParams(new URL(resp).hash.slice(1)).get('access_token');
  if (!token) throw new Error('Google did not return an access token');
  return token;
}

export const gsheetPublicSource: DataSourceAdapter<{ url: string }> = {
  kind: 'gsheet-public',
  label: 'Google Sheets (public link)',
  load: ({ url }) => loadPublicSheet(url),
};
export const gsheetSource: DataSourceAdapter<{ url: string; token: string; tab?: string }> = {
  kind: 'gsheet',
  label: 'Google Sheets (signed in)',
  load: ({ url, token, tab }) => loadPrivateSheet(token, url, tab),
};
