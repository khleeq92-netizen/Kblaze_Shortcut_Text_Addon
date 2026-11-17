// Injected into the page's MAIN world (chrome.scripting, world: "MAIN") only when
// the user runs a K-Flow script. It has no extension privileges: it can do only
// what the page itself can do, and it never evaluates code with eval/Function.
import { runScriptPayload, type ScriptPayload } from '../automation/script/host';

declare global { interface Window { __kfScriptHost?: { run: (p: ScriptPayload) => Promise<any>; v: number } } }

if (!window.__kfScriptHost) {
  Object.defineProperty(window, '__kfScriptHost', {
    value: Object.freeze({ v: 1, run: (p: ScriptPayload) => runScriptPayload(p, document) }),
    configurable: false,
    writable: false,
    enumerable: false,
  });
}
