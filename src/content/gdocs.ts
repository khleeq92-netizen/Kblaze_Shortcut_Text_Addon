// EXPERIMENTAL Google Docs adapter (opt-in via Settings). Google Docs renders on a
// canvas and receives keystrokes through a hidden contenteditable iframe
// (.docs-texteventtarget-iframe). We track typed characters there and, when a
// shortcut is completed, remove it with Backspace key events and paste the
// expansion. Google may change this behaviour at any time; when it does not
// work, use the snippet assistant + clipboard instead.
export function isGoogleDocsFrame(): boolean {
  try {
    return location.hostname === 'docs.google.com' && !!window.frameElement?.classList.contains('docs-texteventtarget-iframe');
  } catch {
    return false;
  }
}

export class TypedBuffer {
  buf = '';
  push(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) { this.buf = ''; return; }
    if (e.key.length === 1) this.buf = (this.buf + e.key).slice(-64);
    else if (e.key === 'Backspace') this.buf = this.buf.slice(0, -1);
    else if (e.key === 'Enter') this.buf += '\n';
    else if (!['Shift', 'CapsLock'].includes(e.key)) this.buf = '';
  }
}

export async function gdocsReplace(target: HTMLElement, deleteCount: number, text: string) {
  for (let i = 0; i < deleteCount; i++) {
    for (const type of ['keydown', 'keyup']) target.dispatchEvent(new KeyboardEvent(type, { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true } as any));
    await new Promise((r) => setTimeout(r, 5));
  }
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}
