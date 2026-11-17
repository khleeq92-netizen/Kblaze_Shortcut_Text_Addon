const _ = typeof browser < "u" && browser?.runtime ? browser : globalThis.chrome;
function Zr(e) {
  return new Promise((t) => _.storage.local.get(e, (a) => t(a?.[e])));
}
const es = "k-flow-db", ts = 2, Ct = {
  settings: "kf.settings",
  cloud: "kf.cloudConfig",
  revision: "kf.revision",
  sync: "kf.syncState",
  picked: "kf.pickedElement",
  pausedSites: "kf.pausedSites"
}, _e = {
  getIndex: "kf/getIndex",
  expand: "kf/expand",
  claimForm: "kf/claimForm",
  recordUsage: "kf/recordUsage",
  openDashboard: "kf/openDashboard",
  listForAssistant: "kf/listForAssistant",
  getWorkflow: "kf/getWorkflow",
  listWorkflows: "kf/listWorkflows",
  picked: "kf/picked",
  // background -> content
  openAssistant: "kf/openAssistant"
}, as = [
  "snippets",
  "folders",
  "tables",
  "workflows",
  "templates",
  "usage",
  "meta",
  "workspaces",
  "autofill",
  "macros",
  "scripts",
  "variables",
  "vault",
  "executions",
  "audit",
  "versions",
  "keys"
], is = /* @__PURE__ */ new Set(["executions", "audit", "versions"]);
let kt = null;
function Lt() {
  return kt || (kt = new Promise((e, t) => {
    const a = indexedDB.open(es, ts);
    a.onupgradeneeded = () => {
      const i = a.result;
      for (const r of as)
        if (!i.objectStoreNames.contains(r))
          if (r === "usage") i.createObjectStore(r, { keyPath: "snippetId" });
          else if (r === "meta" || r === "keys") i.createObjectStore(r);
          else if (is.has(r)) {
            const s = i.createObjectStore(r, { keyPath: "id" });
            s.createIndex(r === "executions" ? "startedAt" : "at", r === "executions" ? "startedAt" : "at"), r === "versions" && s.createIndex("recordId", "recordId");
          } else
            i.createObjectStore(r, { keyPath: "id" }).createIndex("updatedAt", "updatedAt");
    }, a.onsuccess = () => {
      const i = a.result;
      i.onversionchange = () => {
        i.close(), kt = null;
      }, e(i);
    }, a.onerror = () => t(a.error);
  }), kt);
}
function Ua(e) {
  return new Promise((t, a) => {
    e.onsuccess = () => t(e.result), e.onerror = () => a(e.error);
  });
}
async function ut(e) {
  const t = await Lt();
  return Ua(t.transaction(e, "readonly").objectStore(e).getAll());
}
async function Pe(e, t) {
  const a = await Lt();
  return Ua(a.transaction(e, "readonly").objectStore(e).get(t));
}
async function qa(e, t, a) {
  if (!t.length) return;
  const i = await Lt();
  await new Promise((r, s) => {
    const n = i.transaction(e, "readwrite"), u = n.objectStore(e);
    for (const l of t) a !== void 0 ? u.put(l, a) : u.put(l);
    n.oncomplete = () => r(), n.onerror = () => s(n.error), n.onabort = () => s(n.error);
  });
}
async function ct(e, t, a) {
  return qa(e, [t], a);
}
async function Ei(e, t) {
  if (!t.length) return;
  const a = await Lt();
  await new Promise((i, r) => {
    const s = a.transaction(e, "readwrite");
    for (const n of t) s.objectStore(e).delete(n);
    s.oncomplete = () => i(), s.onerror = () => r(s.error);
  });
}
const rs = /* @__PURE__ */ new Set();
async function Nt(e, t = "local") {
  rs.forEach((a) => {
    try {
      a({ collections: e, origin: t });
    } catch {
    }
  });
  try {
    _?.storage?.local && await new Promise((a) => _.storage.local.set({ [Ct.revision]: { at: Date.now(), collections: e, origin: t } }, () => a()));
  } catch {
  }
}
async function Z(e, t = !1) {
  const a = await ut(e);
  return t ? a : a.filter((i) => !i.deleted);
}
const ss = /* @__PURE__ */ new Set(["snippets", "autofill", "macros", "scripts", "variables", "workspaces", "templates", "workflows"]), ui = 25;
let ns = "local";
async function be(e, t, a = {}) {
  const i = Date.now(), r = t.map((s) => a.touch === !1 ? s : { ...s, createdAt: s.createdAt || i, updatedAt: i, version: (s.version || 0) + 1 });
  return await qa(e, r), ss.has(e) && a.origin !== "sync" && a.snapshot !== !1 && await os(e, r), await Nt([e], a.origin || "local"), r;
}
async function os(e, t) {
  try {
    const a = t.filter((r) => !r.deleted).map((r) => ({ id: `${r.id}@${r.version || 1}@${r.updatedAt}`, collection: e, recordId: r.id, version: r.version || 1, at: r.updatedAt, actor: ns, name: r.name || r.id, snapshot: r }));
    if (!a.length) return;
    await qa("versions", a);
    const i = await Lt();
    for (const r of new Set(a.map((s) => s.recordId))) {
      const s = await Ua(i.transaction("versions", "readonly").objectStore("versions").index("recordId").getAll(r));
      s.length > ui && await Ei("versions", s.sort((n, u) => n.at - u.at).slice(0, s.length - ui).map((n) => n.id));
    }
  } catch {
  }
}
async function Pi(e) {
  const t = /* @__PURE__ */ new Date(), a = t.toISOString().slice(0, 10), i = await Pe("usage", e) || { snippetId: e, count: 0, lastUsedAt: 0, daily: {} };
  i.count++, i.lastUsedAt = t.getTime(), i.daily[a] = (i.daily[a] || 0) + 1;
  const r = Object.keys(i.daily).sort();
  for (; r.length > 90; ) delete i.daily[r.shift()];
  await ct("usage", i), await Nt(["usage"]);
}
async function Di(e) {
  return Pe("meta", e);
}
async function Li(e, t) {
  return ct("meta", t, e);
}
const _t = {
  theme: "system",
  expansionEnabled: !0,
  triggerMode: "immediate",
  delimiters: ` 	
.,;:!?)]}'"`,
  keepDelimiter: !0,
  caseSensitive: !0,
  wordBoundary: !0,
  assistantHotkey: "Ctrl+Shift+Space",
  showFloatingButton: !1,
  showToasts: !0,
  blockedSites: [],
  dateFormat: "DD MMM YYYY",
  timeFormat: "h:mm A",
  locale: "en-US",
  currency: "USD",
  profile: { name: "", email: "", phone: "", company: "", title: "", website: "", signature: "" },
  // No billing exists yet. "pro" keeps personal use unrestricted while plan limits
  // stay fully configurable in src/shared/plans.ts.
  plan: "enterprise",
  enforcePlanLimits: !0,
  googleDocsExperimental: !1,
  autoSync: !0,
  conflictStrategy: "newest",
  syncSettings: !0,
  onboarded: !1,
  actionOpens: "popup",
  activeWorkspaceId: "ws_general",
  automation: {
    waitTimeoutMs: 8e3,
    stepDelayMs: 150,
    highlight: !0,
    autoRunEnabled: !0,
    autofillHotkey: "Alt+Shift+F",
    historyLimit: 500,
    respectExistingValues: !1
  },
  ai: { provider: "none", model: "", baseUrl: "", allowPageContext: !0 },
  security: {
    automationAllowlist: [],
    officialDomains: ["gov.in", "nic.in", "udiseplus.gov.in", "mahahsscboard.in", "mahafyjcadmissions.in", "maharashtra.gov.in", "mahadbt.maharashtra.gov.in"],
    scriptsEnabled: !0,
    vaultAutoLockMin: 15,
    auditEnabled: !0,
    syncSensitive: !1
  }
};
function us(e) {
  return {
    ..._t,
    ...e || {},
    profile: { ..._t.profile, ...e?.profile || {} },
    automation: { ..._t.automation, ...e?.automation || {} },
    ai: { ..._t.ai, ...e?.ai || {} },
    security: { ..._t.security, ...e?.security || {} }
  };
}
async function Rt() {
  const e = await new Promise((t) => _.storage.local.get(Ct.settings, t));
  return us(e?.[Ct.settings]);
}
function Ni(e, t) {
  const a = t.toLowerCase();
  return e.blockedSites.some((i) => {
    const r = i.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return r && (a === r || a.endsWith("." + r));
  });
}
function st(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function va(e) {
  return st(e).replace(/\r?\n/g, "<br>");
}
const ls = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function Ta(e) {
  return e.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (t, a) => {
    if (a[0] === "#") {
      const i = a[1].toLowerCase() === "x" ? parseInt(a.slice(2), 16) : parseInt(a.slice(1), 10);
      return Number.isFinite(i) ? String.fromCodePoint(i) : t;
    }
    return ls[a.toLowerCase()] ?? t;
  });
}
const cs = /^(p|div|h[1-6]|li|tr|blockquote|pre|ul|ol|table|section|article|header|footer)$/i;
function li(e) {
  let t = "";
  const a = [], i = /<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let r, s = null, n = "", u = !1;
  const l = () => {
    t && !t.endsWith(`
`) && (t += `
`);
  };
  for (; r = i.exec(e); ) {
    if (r[3] !== void 0) {
      const h = Ta(r[3].replace(/[\r\n\t ]+/g, " "));
      t += h, u && (n += h);
      continue;
    }
    const c = r[1].toLowerCase(), d = r[0][1] === "/";
    if (c === "br") {
      t += `
`;
      continue;
    }
    if (c === "a") {
      if (d)
        s && n.trim() !== s && !/^mailto:/i.test(s) && (t += ` (${s})`), u = !1, s = null;
      else {
        const h = /href\s*=\s*["']([^"']*)["']/i.exec(r[2]);
        s = h ? Ta(h[1]) : null, u = !0, n = "";
      }
      continue;
    }
    if (c === "ul" || c === "ol") {
      d ? (a.pop(), l()) : (l(), a.push({ ordered: c === "ol", n: 0 }));
      continue;
    }
    if (c === "li" && !d) {
      l();
      const h = a[a.length - 1];
      t += "  ".repeat(Math.max(0, a.length - 1)) + (h?.ordered ? `${++h.n}. ` : "• ");
      continue;
    }
    if (c === "td" || c === "th") {
      d && (t += "	");
      continue;
    }
    cs.test(c) && l();
  }
  return t.replace(/\t\n/g, `
`).replace(/[  ]+\n/g, `
`).replace(/\n{3,}/g, `

`).replace(/^\n+|\n+$/g, "");
}
class Fe extends Error {
  constructor(t, a) {
    super(t), this.pos = a;
  }
}
function ds(e, t = !1) {
  const a = [];
  let i = 0, r = "", s = 0;
  for (; i < e.length; ) {
    if (e[i] === "\\" && e.startsWith("{{", i + 1)) {
      r += "{{", i += 3;
      continue;
    }
    if (e.startsWith("{{", i)) {
      let n = i + 2, u = null;
      for (; n < e.length; n++) {
        const c = e[n];
        if (u) {
          c === "\\" ? n++ : c === u && (u = null);
          continue;
        }
        if (c === '"' || c === "'") u = c;
        else if (c === "}" && e[n + 1] === "}") break;
      }
      if (n >= e.length) {
        const c = e.indexOf("}}", i + 2);
        if (c < 0) throw new Fe('A command starting with "{{" is never closed with "}}"', i);
        n = c;
      }
      if (r && a.push({ type: "text", value: r, start: s, end: i }), e.slice(i + 2, n).includes("{{")) throw new Fe('Commands cannot be nested inside other commands. Use a formula instead, e.g. {{link: ="https://site.com/" & id}}', i);
      let l = e.slice(i + 2, n);
      t && (l = Ta(l.replace(/<[^>]*>/g, "")).replace(/\u00a0/g, " ")), a.push({ type: "cmd", value: l.trim(), start: i, end: n + 2 }), i = n + 2, r = "", s = i;
      continue;
    }
    r += e[i++];
  }
  return r && a.push({ type: "text", value: r, start: s, end: e.length }), a;
}
function At(e, t) {
  const a = [];
  let i = "", r = null, s = 0;
  for (let n = 0; n < e.length; n++) {
    const u = e[n];
    if (r) {
      i += u, u === "\\" ? i += e[++n] ?? "" : u === r && (r = null);
      continue;
    }
    if (u === '"' || u === "'") {
      r = u, i += u;
      continue;
    }
    if ((u === "(" || u === "[") && s++, (u === ")" || u === "]") && s--, u === t && s <= 0) {
      a.push(i), i = "";
      continue;
    }
    i += u;
  }
  return a.push(i), a;
}
function Ri(e) {
  const t = e.trim();
  return t.length >= 2 && (t[0] === '"' && t.endsWith('"') || t[0] === "'" && t.endsWith("'")) ? t.slice(1, -1).replace(/\\(["'\\])/g, "$1").replace(/\\n/g, `
`) : t;
}
function ps(e) {
  const t = e.trim();
  if (t.startsWith("=")) {
    const u = At(t.slice(1), ";");
    return { name: "=", args: { main: u[0].trim(), ...ci(u.slice(1)) } };
  }
  if (t.startsWith("#")) return { name: "#", args: { main: t.slice(1), opts: {}, flags: /* @__PURE__ */ new Set() } };
  const a = At(t, ";"), i = a[0].trim(), r = /^([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/.exec(i);
  let s, n = "";
  if (r)
    s = r[1].toLowerCase(), n = r[2].trim();
  else if (/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(i)) {
    const u = i.toLowerCase();
    ["else", "endif", "endrepeat", "endsection", "cursor", "today", "now", "time", "date", "index"].includes(u) && !i.includes(".") ? s = u : (s = "ref", n = i);
  } else {
    const u = /^([A-Za-z][\w-]*)\s+([\s\S]*)$/.exec(i);
    if (u && ["if", "elseif", "repeat", "section"].includes(u[1].toLowerCase()))
      s = u[1].toLowerCase(), n = u[2].trim();
    else throw new Fe(`Cannot understand command "{{${e}}}"`);
  }
  return { name: s, args: { main: s === "if" || s === "elseif" || s === "set" ? n : Ri(n), ...ci(a.slice(1)) } };
}
function ci(e) {
  const t = {}, a = /* @__PURE__ */ new Set();
  for (const i of e) {
    const r = i.trim();
    if (!r) continue;
    const s = r.indexOf("=");
    s > 0 && /^[\w-]+$/.test(r.slice(0, s).trim()) ? t[r.slice(0, s).trim().toLowerCase()] = Ri(r.slice(s + 1)) : a.add(r.toLowerCase());
  }
  return { opts: t, flags: a };
}
function Ma(e, t = !1) {
  const a = ds(e, t);
  let i = 0;
  function r(n) {
    const u = [];
    for (; i < a.length; ) {
      const l = a[i++];
      if (l.type === "text") {
        u.push({ k: "text", text: l.value });
        continue;
      }
      if (!l.value) {
        u.push({ k: "text", text: "" });
        continue;
      }
      const { name: c, args: d } = ps(l.value);
      if (n.includes(c)) return { nodes: u, term: { name: c, args: d, end: l.end } };
      if (c === "if") {
        const h = [];
        let p = d.main, y = null;
        for (; ; ) {
          const w = r(["elseif", "else", "endif"]);
          if (!w.term) throw new Fe(`{{if: ${d.main}}} is missing {{endif}}`, l.start);
          if (h.push({ cond: p, body: w.nodes }), w.term.name === "endif") break;
          if (w.term.name === "elseif") {
            p = w.term.args.main;
            continue;
          }
          const V = r(["endif"]);
          if (!V.term) throw new Fe(`{{if: ${d.main}}} is missing {{endif}}`, l.start);
          y = V.nodes;
          break;
        }
        if (h.some((w) => !w.cond.trim())) throw new Fe("{{if}} / {{elseif}} needs a condition, e.g. {{if: amount > 100}}", l.start);
        u.push({ k: "if", branches: h, elseBody: y, start: l.start });
        continue;
      }
      if (c === "repeat" || c === "section") {
        const h = c === "repeat" ? "endrepeat" : "endsection", p = r([h]);
        if (!p.term) throw new Fe(`{{${c}: ${d.main}}} is missing {{${h}}}`, l.start);
        u.push({ k: c, args: d, body: p.nodes, start: l.start, end: l.end, raw: l.value });
        continue;
      }
      if (["else", "elseif", "endif", "endrepeat", "endsection"].includes(c)) throw new Fe(`{{${c}}} without a matching opening command`, l.start);
      u.push({ k: "cmd", name: c, args: d, raw: l.value, start: l.start, end: l.end });
    }
    return { nodes: u, term: null };
  }
  return r([]).nodes;
}
const di = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], pi = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], Me = (e, t = 2) => String(e).padStart(t, "0"), hs = (e) => {
  const t = ["th", "st", "nd", "rd"], a = e % 100;
  return e + (t[(a - 20) % 10] || t[a] || t[0]);
};
function fe(e, t) {
  if (!(e instanceof Date) || isNaN(e.getTime())) return "";
  const a = {
    YYYY: () => String(e.getFullYear()),
    YY: () => String(e.getFullYear()).slice(-2),
    MMMM: () => di[e.getMonth()],
    MMM: () => di[e.getMonth()].slice(0, 3),
    MM: () => Me(e.getMonth() + 1),
    M: () => String(e.getMonth() + 1),
    Do: () => hs(e.getDate()),
    DD: () => Me(e.getDate()),
    D: () => String(e.getDate()),
    dddd: () => pi[e.getDay()],
    ddd: () => pi[e.getDay()].slice(0, 3),
    HH: () => Me(e.getHours()),
    H: () => String(e.getHours()),
    hh: () => Me(e.getHours() % 12 || 12),
    h: () => String(e.getHours() % 12 || 12),
    mm: () => Me(e.getMinutes()),
    m: () => String(e.getMinutes()),
    ss: () => Me(e.getSeconds()),
    s: () => String(e.getSeconds()),
    A: () => e.getHours() < 12 ? "AM" : "PM",
    a: () => e.getHours() < 12 ? "am" : "pm",
    Q: () => String(Math.floor(e.getMonth() / 3) + 1)
  };
  return t.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a|Q/g, (i, r) => r !== void 0 ? r : a[i]());
}
function nt(e, t) {
  const a = new Date(e.getTime()), i = /([+-])\s*(\d+)\s*(y|M|w|d|h|m|s|bd)/g;
  let r, s = !1;
  for (; r = i.exec(t); ) {
    s = !0;
    const n = parseInt(r[2], 10) * (r[1] === "-" ? -1 : 1);
    switch (r[3]) {
      case "y":
        a.setFullYear(a.getFullYear() + n);
        break;
      case "M":
        Ya(a, n);
        break;
      case "w":
        a.setDate(a.getDate() + 7 * n);
        break;
      case "d":
        a.setDate(a.getDate() + n);
        break;
      case "bd":
        Fi(a, n);
        break;
      case "h":
        a.setHours(a.getHours() + n);
        break;
      case "m":
        a.setMinutes(a.getMinutes() + n);
        break;
      case "s":
        a.setSeconds(a.getSeconds() + n);
        break;
    }
  }
  if (!s && t.trim()) throw new Error(`Invalid date shift "${t}". Use e.g. +3d, -1w, +1M, +2bd`);
  return a;
}
function Ya(e, t) {
  const a = e.getDate();
  e.setDate(1), e.setMonth(e.getMonth() + t);
  const i = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  return e.setDate(Math.min(a, i)), e;
}
function Fi(e, t) {
  const a = t < 0 ? -1 : 1;
  let i = Math.abs(t);
  for (; i > 0; )
    e.setDate(e.getDate() + a), e.getDay() !== 0 && e.getDay() !== 6 && i--;
  return e;
}
function se(e, t = /* @__PURE__ */ new Date()) {
  if (e instanceof Date) return isNaN(e.getTime()) ? null : e;
  if (typeof e == "number") return new Date(e);
  if (typeof e != "string") return null;
  const a = e.trim();
  if (!a) return null;
  const i = a.toLowerCase(), r = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  if (i === "now") return new Date(t.getTime());
  if (i === "today") return r;
  if (i === "tomorrow") return nt(r, "+1d");
  if (i === "yesterday") return nt(r, "-1d");
  if (/^[+-]\s*\d/.test(a)) return nt(/[hms]\b/.test(a) && !/bd/.test(a) ? t : r, a);
  const s = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(a);
  if (s) return new Date(+s[1], +s[2] - 1, +s[3], +(s[4] || 0), +(s[5] || 0), +(s[6] || 0));
  const n = /^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i.exec(a);
  if (n) {
    let c = +n[1];
    return n[3] && (c = c % 12 + (n[3].toLowerCase() === "pm" ? 12 : 0)), new Date(t.getFullYear(), t.getMonth(), t.getDate(), c, +n[2]);
  }
  const u = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(a);
  if (u) return new Date(+u[3], +u[2] - 1, +u[1]);
  const l = Date.parse(a);
  return isNaN(l) ? null : new Date(l);
}
function Gt(e) {
  return `${e.getFullYear()}-${Me(e.getMonth() + 1)}-${Me(e.getDate())}`;
}
function hi(e) {
  return `${Me(e.getHours())}:${Me(e.getMinutes())}`;
}
function Vi(e, t, a = "days") {
  const i = t.getTime() - e.getTime();
  switch (a.toLowerCase()) {
    case "seconds":
      return Math.floor(i / 1e3);
    case "minutes":
      return Math.floor(i / 6e4);
    case "hours":
      return Math.floor(i / 36e5);
    case "weeks":
      return Math.floor(i / (7 * 864e5));
    case "months":
      return (t.getFullYear() - e.getFullYear()) * 12 + (t.getMonth() - e.getMonth()) - (t.getDate() < e.getDate() ? 1 : 0);
    case "years":
      return Math.floor(((t.getFullYear() - e.getFullYear()) * 12 + (t.getMonth() - e.getMonth()) - (t.getDate() < e.getDate() ? 1 : 0)) / 12);
    default: {
      const r = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()), s = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
      return Math.round((s - r) / 864e5);
    }
  }
}
function z(e) {
  return Array.isArray(e);
}
function ea(e) {
  return !!e && typeof e == "object" && !Array.isArray(e) && !(e instanceof Date);
}
function ne(e) {
  if (typeof e == "number") return e;
  if (typeof e == "boolean") return e ? 1 : 0;
  if (e == null) return 0;
  if (e instanceof Date) return e.getTime();
  if (Array.isArray(e)) return e.length === 1 ? ne(e[0]) : NaN;
  if (typeof e == "string") {
    const t = e.trim();
    if (t === "") return 0;
    const a = t.endsWith("%"), i = t.replace(/[%\s ]/g, "").replace(/^[^\d+\-.(]+/, "").replace(/[^\d.]+$/, "").replace(/,(?=\d{3}(\D|$))/g, ""), r = /^\(.*\)$/.test(i), s = Number(r ? "-" + i.slice(1, -1) : i);
    return i === "" || isNaN(s) ? NaN : a ? s / 100 : s;
  }
  return NaN;
}
function Tt(e) {
  return typeof e == "number" ? Number.isFinite(e) : typeof e == "string" ? e.trim() !== "" && !isNaN(ne(e)) : !1;
}
function G(e) {
  if (e == null) return !1;
  if (typeof e == "boolean") return e;
  if (typeof e == "number") return e !== 0 && !isNaN(e);
  if (typeof e == "string") {
    const t = e.trim().toLowerCase();
    return !(t === "" || t === "false" || t === "no" || t === "off" || t === "0");
  }
  return Array.isArray(e) ? e.length > 0 : !0;
}
function Oi(e) {
  if (!Number.isFinite(e)) return isNaN(e) ? "NaN" : e > 0 ? "∞" : "-∞";
  const t = Math.round(e * 1e10) / 1e10;
  return String(t);
}
function b(e, t) {
  if (e == null) return "";
  if (typeof e == "string") return e;
  if (typeof e == "number") return Oi(e);
  if (typeof e == "boolean") return e ? "yes" : "no";
  if (e instanceof Date) {
    const a = e.getHours() !== 0 || e.getMinutes() !== 0;
    return fe(e, t ? a && e.__time ? `${t.dateFormat} ${t.timeFormat}` : t.dateFormat : "YYYY-MM-DD");
  }
  return Array.isArray(e) ? e.map((a) => b(a, t)).join(", ") : ea(e) ? "__label" in e ? b(e.__label, t) : Object.values(e).filter((a) => typeof a != "object").map((a) => b(a, t)).join(", ") : String(e);
}
function Ae(e, t, a) {
  if (!t) return b(e, a);
  const [i, ...r] = t.split(":"), s = r.join(":").trim(), n = i.trim().toLowerCase(), u = () => {
    const l = ne(e);
    if (isNaN(l)) throw new Error(`Cannot format "${b(e)}" as a number`);
    return l;
  };
  switch (n) {
    case "currency":
      return new Intl.NumberFormat(a.locale, { style: "currency", currency: (s || a.currency).toUpperCase() }).format(u());
    case "number":
    case "decimal": {
      const l = s === "" ? void 0 : parseInt(s, 10);
      return new Intl.NumberFormat(a.locale, l === void 0 ? { maximumFractionDigits: 10 } : { minimumFractionDigits: l, maximumFractionDigits: l }).format(u());
    }
    case "integer":
      return new Intl.NumberFormat(a.locale, { maximumFractionDigits: 0 }).format(u());
    case "plain":
      return Oi(u());
    case "percent": {
      const l = s === "" ? 0 : parseInt(s, 10);
      return new Intl.NumberFormat(a.locale, { style: "percent", minimumFractionDigits: l, maximumFractionDigits: l }).format(u());
    }
    case "upper":
      return b(e, a).toUpperCase();
    case "lower":
      return b(e, a).toLowerCase();
    case "title":
      return $a(b(e, a));
    case "date": {
      const l = se(e);
      return l ? fe(l, s || a.dateFormat) : b(e, a);
    }
    case "time": {
      const l = se(e);
      return l ? fe(l, s || a.timeFormat) : b(e, a);
    }
    case "datetime": {
      const l = se(e);
      return l ? fe(l, s || `${a.dateFormat} ${a.timeFormat}`) : b(e, a);
    }
    default: {
      const l = e instanceof Date ? e : typeof e == "string" ? se(e) : null;
      return l ? fe(l, t) : b(e, a);
    }
  }
}
function $a(e) {
  return e.toLowerCase().replace(/(^|[\s\-_/(])(\p{L})/gu, (t, a, i) => a + i.toUpperCase());
}
class J extends Error {
}
function fs(e) {
  const t = [];
  let a = 0;
  for (; a < e.length; ) {
    const i = e[a];
    if (/\s/.test(i)) {
      a++;
      continue;
    }
    if (/\d/.test(i) || i === "." && /\d/.test(e[a + 1] || "")) {
      const s = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(e.slice(a));
      t.push({ k: "num", v: s[0], pos: a }), a += s[0].length;
      continue;
    }
    if (i === '"' || i === "'" || i === "“" || i === "”") {
      const s = i === "“" ? "”" : i;
      let n = a + 1, u = "";
      for (; n < e.length && e[n] !== s && !(s === "”" && e[n] === '"'); )
        if (e[n] === "\\" && n + 1 < e.length) {
          const l = e[n + 1];
          u += l === "n" ? `
` : l === "t" ? "	" : l, n += 2;
        } else u += e[n++];
      if (n >= e.length) throw new J(`Unterminated text starting at position ${a + 1}`);
      t.push({ k: "str", v: u, pos: a }), a = n + 1;
      continue;
    }
    if (/[\p{L}_$]/u.test(i)) {
      const s = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(e.slice(a));
      t.push({ k: "id", v: s[0], pos: a }), a += s[0].length;
      continue;
    }
    const r = e.slice(a, a + 2);
    if (["==", "!=", "<>", "<=", ">=", "&&", "||"].includes(r)) {
      t.push({ k: "op", v: r, pos: a }), a += 2;
      continue;
    }
    if ("+-*/%^&=<>!(),.[]?:".includes(i)) {
      t.push({ k: "op", v: i, pos: a }), a++;
      continue;
    }
    throw new J(`Unexpected character "${i}" at position ${a + 1}`);
  }
  return t.push({ k: "eof", v: "", pos: e.length }), t;
}
const fi = {
  or: 1,
  "||": 1,
  and: 2,
  "&&": 2,
  "=": 4,
  "==": 4,
  "!=": 4,
  "<>": 4,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "&": 5,
  "+": 6,
  "-": 6,
  "*": 7,
  "/": 7,
  "%": 7,
  "^": 8
};
function ja(e) {
  const t = fs(e);
  let a = 0;
  const i = () => t[a], r = () => t[a++], s = (p) => {
    const y = r();
    if (y.v !== p) throw new J(`Expected "${p}" at position ${y.pos + 1}${y.k === "eof" ? " (end of formula)" : ""}`);
  }, n = (p) => p.k === "op" && p.v in fi ? p.v : p.k === "id" && (p.v.toLowerCase() === "and" || p.v.toLowerCase() === "or") ? p.v.toLowerCase() : null;
  function u(p) {
    let y = l();
    for (; ; ) {
      const w = i();
      if (w.k === "op" && w.v === "?" && p <= 0) {
        r();
        const te = u(0);
        s(":");
        const et = u(0);
        y = { t: "call", fn: "if", args: [y, te, et] };
        continue;
      }
      const V = n(w);
      if (!V) break;
      const j = fi[V];
      if (j < p) break;
      r();
      const K = u(V === "^" ? j : j + 1);
      y = { t: "bin", op: V, left: y, right: K };
    }
    return y;
  }
  function l() {
    const p = i();
    return p.k === "op" && (p.v === "-" || p.v === "+" || p.v === "!") ? (r(), { t: "unary", op: p.v === "!" ? "not" : p.v, arg: l() }) : p.k === "id" && p.v.toLowerCase() === "not" ? (r(), { t: "unary", op: "not", arg: u(3) }) : c(d());
  }
  function c(p) {
    for (; ; ) {
      const y = i();
      if (y.k === "op" && y.v === ".") {
        r();
        const w = r();
        if (w.k !== "id" && w.k !== "num") throw new J(`Expected a field name after "." at position ${w.pos + 1}`);
        p = { t: "member", obj: p, prop: w.v };
      } else if (y.k === "op" && y.v === "[") {
        r();
        const w = u(0);
        s("]"), p = { t: "index", obj: p, index: w };
      } else return p;
    }
  }
  function d() {
    const p = r();
    if (p.k === "num") return { t: "num", v: parseFloat(p.v) };
    if (p.k === "str") return { t: "str", v: p.v };
    if (p.k === "id") {
      const y = p.v.toLowerCase();
      if (y === "true" || y === "yes") return { t: "bool", v: !0 };
      if (y === "false" || y === "no") return { t: "bool", v: !1 };
      if (y === "null") return { t: "null" };
      if (i().v === "(" && i().k === "op") {
        r();
        const w = [];
        if (!(i().k === "op" && i().v === ")"))
          for (; ; ) {
            if (w.push(u(0)), i().k === "op" && i().v === ",") {
              r();
              continue;
            }
            break;
          }
        return s(")"), { t: "call", fn: y, args: w };
      }
      return { t: "name", name: p.v };
    }
    if (p.k === "op" && p.v === "(") {
      const y = u(0);
      return s(")"), y;
    }
    if (p.k === "op" && p.v === "[") {
      const y = [];
      if (!(i().k === "op" && i().v === "]"))
        for (; ; ) {
          if (y.push(u(0)), i().k === "op" && i().v === ",") {
            r();
            continue;
          }
          break;
        }
      return s("]"), { t: "list", items: y };
    }
    throw new J(p.k === "eof" ? "Formula ended unexpectedly" : `Unexpected "${p.v}" at position ${p.pos + 1}`);
  }
  const h = u(0);
  if (i().k !== "eof") throw new J(`Unexpected "${i().v}" at position ${i().pos + 1}`);
  return h;
}
function Te(e, t = /* @__PURE__ */ new Set()) {
  switch (e.t) {
    case "name":
      t.add(e.name);
      break;
    case "member":
      Te(e.obj, t);
      break;
    case "index":
      Te(e.obj, t), Te(e.index, t);
      break;
    case "call":
      e.args.forEach((a) => Te(a, t));
      break;
    case "unary":
      Te(e.arg, t);
      break;
    case "bin":
      Te(e.left, t), Te(e.right, t);
      break;
    case "list":
      e.items.forEach((a) => Te(a, t));
      break;
  }
  return t;
}
function Xe(e, t) {
  if (z(e))
    return t === "length" || t === "count" ? e.length : e.map((a) => Xe(a, t));
  if (ea(e)) {
    if (t in e) return e[t];
    const a = Object.keys(e).find((i) => i.toLowerCase() === t.toLowerCase());
    return a ? e[a] : null;
  }
  return typeof e == "string" && t === "length" ? e.length : null;
}
function D(e, t = "value") {
  const a = ne(e);
  if (isNaN(a)) throw new J(`"${b(e)}" is not a number (${t})`);
  return a;
}
function Bi(e, t, a) {
  if (z(t) || z(a)) {
    const s = z(t) ? t : null, n = z(a) ? a : null, u = Math.max(s?.length ?? 0, n?.length ?? 0);
    return Array.from({ length: u }, (l, c) => Bi(e, s ? s[c] ?? null : t, n ? n[c] ?? null : a));
  }
  if (t instanceof Date && (e === "+" || e === "-") && !(a instanceof Date)) {
    const s = new Date(t.getTime());
    return s.setDate(s.getDate() + (e === "+" ? 1 : -1) * D(a, "days")), s;
  }
  if (t instanceof Date && a instanceof Date && e === "-") return Vi(a, t, "days");
  const i = D(t, "left side of " + e), r = D(a, "right side of " + e);
  switch (e) {
    case "+":
      return i + r;
    case "-":
      return i - r;
    case "*":
      return i * r;
    case "/":
      if (r === 0) throw new J("Division by zero");
      return i / r;
    case "%":
      return i % r;
    case "^":
      return Math.pow(i, r);
  }
  throw new J("Unknown operator " + e);
}
function Be(e, t) {
  if (e == null || e === "") return t == null || t === "";
  if (typeof e == "boolean" || typeof t == "boolean") return G(e) === G(t);
  if (e instanceof Date || t instanceof Date) {
    const a = se(e), i = se(t);
    return !!a && !!i && Gt(a) === Gt(i);
  }
  return Tt(e) && Tt(t) ? Math.abs(ne(e) - ne(t)) < 1e-9 : b(e).trim().toLowerCase() === b(t).trim().toLowerCase();
}
function Oe(e, t) {
  if (e instanceof Date || t instanceof Date) {
    const a = se(e), i = se(t);
    if (!a || !i) throw new J("Cannot compare a date with a non-date");
    return a.getTime() - i.getTime();
  }
  return Tt(e) && Tt(t) ? ne(e) - ne(t) : b(e).localeCompare(b(t));
}
function ta(e) {
  return e.flatMap((t) => z(t) ? ta(t) : [t]);
}
function aa(e) {
  return ta(e).filter((t) => t !== null && t !== "").map((t) => D(t));
}
function ee(e, t, a) {
  const i = se(e, t);
  if (!i) throw new J(`${a}: "${b(e)}" is not a valid date`);
  return i;
}
function Wa(e, t) {
  if (!z(e)) throw new J(`${t}: first argument must be a list or table`);
  return e.filter(ea);
}
const Ui = {};
function g(e, t, a, i, r) {
  Ui[e] = { fn: r, sig: a, doc: i, group: t };
}
g("upper", "Text", "upper(text)", "UPPERCASE text", ([e]) => b(e).toUpperCase());
g("lower", "Text", "lower(text)", "lowercase text", ([e]) => b(e).toLowerCase());
g("title", "Text", "title(text)", "Title Case Each Word", ([e]) => $a(b(e)));
g("capitalize", "Text", "capitalize(text)", "Capitalize the first letter", ([e]) => {
  const t = b(e);
  return t.charAt(0).toUpperCase() + t.slice(1);
});
g("trim", "Text", "trim(text)", "Remove surrounding spaces", ([e]) => b(e).trim());
g("len", "Text", "len(text)", "Number of characters (or items in a list)", ([e]) => z(e) ? e.length : b(e).length);
g("replace", "Text", "replace(text, find, with)", "Replace every occurrence of find", ([e, t, a]) => b(e).split(b(t)).join(b(a)));
g("left", "Text", "left(text, n)", "First n characters", ([e, t]) => b(e).slice(0, D(t)));
g("right", "Text", "right(text, n)", "Last n characters", ([e, t]) => {
  const a = b(e), i = D(t);
  return i <= 0 ? "" : a.slice(-i);
});
g("mid", "Text", "mid(text, start, length)", "Substring (start at 1)", ([e, t, a]) => b(e).substr(D(t) - 1, a === void 0 ? void 0 : D(a)));
g("contains", "Text", "contains(text, part)", "True if text contains part (case-insensitive) or list contains item", ([e, t]) => z(e) ? e.some((a) => Be(a, t)) : b(e).toLowerCase().includes(b(t).toLowerCase()));
g("startswith", "Text", "startswith(text, part)", "True if text starts with part", ([e, t]) => b(e).toLowerCase().startsWith(b(t).toLowerCase()));
g("endswith", "Text", "endswith(text, part)", "True if text ends with part", ([e, t]) => b(e).toLowerCase().endsWith(b(t).toLowerCase()));
g("split", "Text", "split(text, separator)", "Split text into a list", ([e, t]) => b(e).split(t === void 0 ? "," : b(t)).map((a) => a.trim()));
g("join", "Text", "join(list, separator)", "Join list items into text", ([e, t], a) => (z(e) ? e : [e]).map((i) => b(i, a.fo)).join(t === void 0 ? ", " : b(t)));
g("concat", "Text", "concat(a, b, ...)", "Join values together", (e, t) => ta(e).map((a) => b(a, t.fo)).join(""));
g("repeat", "Text", "repeat(text, n)", "Repeat text n times", ([e, t]) => b(e).repeat(Math.max(0, Math.min(1e3, D(t)))));
g("pad", "Text", "pad(text, length, char)", "Left-pad to a length", ([e, t, a]) => b(e).padStart(D(t), a === void 0 ? " " : b(a)));
g("truncate", "Text", "truncate(text, n)", "Shorten to n characters with …", ([e, t]) => {
  const a = b(e), i = D(t);
  return a.length > i ? a.slice(0, Math.max(0, i - 1)) + "…" : a;
});
g("initials", "Text", "initials(name)", 'Initials of a name: "Ada Lovelace" → "AL"', ([e]) => b(e).split(/\s+/).filter(Boolean).map((t) => t[0].toUpperCase()).join(""));
g("firstname", "Text", "firstname(name)", "First word of a full name", ([e]) => b(e).trim().split(/\s+/)[0] || "");
g("lastname", "Text", "lastname(name)", "Last word of a full name", ([e]) => {
  const t = b(e).trim().split(/\s+/);
  return t.length > 1 ? t[t.length - 1] : "";
});
g("urlencode", "Text", "urlencode(text)", "Encode text for use inside a link", ([e]) => encodeURIComponent(b(e)));
g("text", "Text", "text(value)", "Convert to text", ([e], t) => b(e, t.fo));
g("format", "Text", 'format(value, "currency:EUR")', "Format a value (currency, number:2, percent, date:DD/MM/YYYY, upper …)", ([e, t], a) => Ae(e, b(t), a.fo));
g("if", "Logic", "if(condition, then, else)", "Choose a value based on a condition", ([e, t, a]) => G(e) ? t ?? "" : a ?? "");
g("and", "Logic", "and(a, b, ...)", "True if all are true", (e) => e.every(G));
g("or", "Logic", "or(a, b, ...)", "True if any is true", (e) => e.some(G));
g("not", "Logic", "not(a)", "Negate", ([e]) => !G(e));
g("isempty", "Logic", "isempty(value)", "True if blank", ([e]) => e == null || typeof e == "string" && e.trim() === "" || z(e) && e.length === 0);
g("coalesce", "Logic", "coalesce(a, b, ...)", "First non-blank value", (e) => e.find((t) => !(t == null || t === "")) ?? "");
g("choose", "Logic", 'choose(value, "a", "A", "b", "B", default)', "Map a value to a result", ([e, ...t]) => {
  for (let a = 0; a + 1 < t.length; a += 2) if (Be(e, t[a])) return t[a + 1];
  return t.length % 2 ? t[t.length - 1] : "";
});
g("matches", "Logic", "matches(text, pattern)", "True if text matches a regular expression", ([e, t]) => {
  const a = b(t);
  if (a.length > 300) throw new J("matches: pattern too long");
  try {
    return new RegExp(a, "i").test(b(e));
  } catch {
    throw new J("matches: invalid pattern");
  }
});
g("isemail", "Logic", "isemail(text)", "True if text looks like an e-mail address", ([e]) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b(e).trim()));
g("isnumber", "Logic", "isnumber(value)", "True if value is numeric", ([e]) => Tt(e));
g("round", "Math", "round(n, decimals)", "Round to decimals (default 0)", ([e, t]) => {
  const a = Math.pow(10, t === void 0 ? 0 : D(t));
  return Math.round(D(e) * a + Number.EPSILON) / a;
});
g("floor", "Math", "floor(n)", "Round down", ([e]) => Math.floor(D(e)));
g("ceil", "Math", "ceil(n)", "Round up", ([e]) => Math.ceil(D(e)));
g("abs", "Math", "abs(n)", "Absolute value", ([e]) => Math.abs(D(e)));
g("sqrt", "Math", "sqrt(n)", "Square root", ([e]) => Math.sqrt(D(e)));
g("min", "Math", "min(a, b, ...)", "Smallest number (lists allowed)", (e) => Math.min(...aa(e)));
g("max", "Math", "max(a, b, ...)", "Largest number (lists allowed)", (e) => Math.max(...aa(e)));
g("sum", "Math", "sum(list or numbers)", "Total", (e) => aa(e).reduce((t, a) => t + a, 0));
g("avg", "Math", "avg(list or numbers)", "Average", (e) => {
  const t = aa(e);
  return t.length ? t.reduce((a, i) => a + i, 0) / t.length : 0;
});
g("count", "Math", "count(list)", "Number of items", (e) => ta(e).filter((t) => t !== null && t !== "").length);
g("number", "Math", "number(value)", "Convert to number", ([e]) => D(e));
g("percent", "Math", "percent(part, whole)", "part as a percentage of whole (0-100)", ([e, t]) => {
  const a = D(t);
  if (a === 0) throw new J("percent: whole is zero");
  return D(e) / a * 100;
});
g("percentof", "Math", "percentof(pct, amount)", "pct % of amount", ([e, t]) => D(e) / 100 * D(t));
g("addpercent", "Math", "addpercent(amount, pct)", "amount increased by pct % (e.g. tax)", ([e, t]) => D(e) * (1 + D(t) / 100));
g("discount", "Math", "discount(amount, pct)", "amount reduced by pct %", ([e, t]) => D(e) * (1 - D(t) / 100));
g("currency", "Math", 'currency(amount, "USD")', "Format as currency", ([e, t], a) => Ae(e, "currency" + (t ? ":" + b(t) : ""), a.fo));
g("random", "Math", "random(min, max)", "Random whole number between min and max", ([e, t]) => {
  const a = D(e ?? 0), i = D(t ?? 100);
  return Math.floor(a + Math.random() * (i - a + 1));
});
g("today", "Date", "today()", "Today (midnight)", (e, t) => new Date(t.now.getFullYear(), t.now.getMonth(), t.now.getDate()));
g("now", "Date", "now()", "Current date and time", (e, t) => {
  const a = new Date(t.now.getTime());
  return a.__time = !0, a;
});
g("date", "Date", 'date("2025-01-31" | "+3d")', "Make a date from text or a shift", ([e], t) => ee(e ?? "today", t.now, "date"));
g("adddays", "Date", "adddays(date, n)", "Add (or subtract) days", ([e, t], a) => {
  const i = new Date(ee(e, a.now, "adddays"));
  return i.setDate(i.getDate() + D(t)), i;
});
g("addhours", "Date", "addhours(date, n)", "Add hours", ([e, t], a) => {
  const i = new Date(ee(e, a.now, "addhours").getTime() + D(t) * 36e5);
  return i.__time = !0, i;
});
g("addminutes", "Date", "addminutes(date, n)", "Add minutes", ([e, t], a) => {
  const i = new Date(ee(e, a.now, "addminutes").getTime() + D(t) * 6e4);
  return i.__time = !0, i;
});
g("addweeks", "Date", "addweeks(date, n)", "Add weeks", ([e, t], a) => {
  const i = new Date(ee(e, a.now, "addweeks"));
  return i.setDate(i.getDate() + 7 * D(t)), i;
});
g("addmonths", "Date", "addmonths(date, n)", "Add months (clamps to month end)", ([e, t], a) => Ya(new Date(ee(e, a.now, "addmonths")), D(t)));
g("addyears", "Date", "addyears(date, n)", "Add years", ([e, t], a) => Ya(new Date(ee(e, a.now, "addyears")), 12 * D(t)));
g("addbusinessdays", "Date", "addbusinessdays(date, n)", "Add working days (skips weekends)", ([e, t], a) => Fi(new Date(ee(e, a.now, "addbusinessdays")), D(t)));
g("shift", "Date", 'shift(date, "+1M +2d")', "Shift a date using shift syntax", ([e, t], a) => nt(ee(e, a.now, "shift"), b(t)));
g("datediff", "Date", 'datediff(start, end, "days")', "Difference in days|weeks|months|years|hours|minutes", ([e, t, a], i) => Vi(ee(e, i.now, "datediff"), ee(t, i.now, "datediff"), a ? b(a) : "days"));
g("formatdate", "Date", 'formatdate(date, "DD/MM/YYYY")', "Format a date", ([e, t], a) => fe(ee(e, a.now, "formatdate"), t === void 0 ? a.fo.dateFormat : b(t)));
g("weekday", "Date", "weekday(date)", "Day name, e.g. Monday", ([e], t) => fe(ee(e ?? "today", t.now, "weekday"), "dddd"));
g("year", "Date", "year(date)", "Year number", ([e], t) => ee(e ?? "today", t.now, "year").getFullYear());
g("month", "Date", "month(date)", "Month number 1-12", ([e], t) => ee(e ?? "today", t.now, "month").getMonth() + 1);
g("day", "Date", "day(date)", "Day of month", ([e], t) => ee(e ?? "today", t.now, "day").getDate());
g("endofmonth", "Date", "endofmonth(date)", "Last day of the month", ([e], t) => {
  const a = ee(e ?? "today", t.now, "endofmonth");
  return new Date(a.getFullYear(), a.getMonth() + 1, 0);
});
g("greeting", "Date", "greeting()", "Good morning / afternoon / evening", (e, t) => {
  const a = t.now.getHours();
  return a < 12 ? "Good morning" : a < 17 ? "Good afternoon" : "Good evening";
});
g("list", "Lists", "list(a, b, ...)", "Make a list", (e) => e);
g("first", "Lists", "first(list)", "First item", ([e]) => z(e) ? e[0] ?? null : e);
g("last", "Lists", "last(list)", "Last item", ([e]) => z(e) ? e[e.length - 1] ?? null : e);
g("item", "Lists", "item(list, n)", "Item number n (1-based)", ([e, t]) => z(e) ? e[D(t) - 1] ?? null : null);
g("unique", "Lists", "unique(list)", "Remove duplicates", ([e]) => z(e) ? e.filter((t, a) => e.findIndex((i) => Be(t, i)) === a) : e);
g("sort", "Lists", "sort(list)", "Sort ascending", ([e]) => z(e) ? [...e].sort(Oe) : e);
g("filter", "Lists", 'filter(table, "column", value)', "Rows whose column equals value", ([e, t, a]) => Wa(e, "filter").filter((i) => Be(Xe(i, b(t)), a)));
g("lookup", "Lists", 'lookup(table, "matchColumn", value, "resultColumn")', "Find a row and return one column", ([e, t, a, i]) => {
  const r = Wa(e, "lookup").find((s) => Be(Xe(s, b(t)), a));
  return r ? i === void 0 ? r : Xe(r, b(i)) : "";
});
function qi(e, t, a) {
  switch (t) {
    case ">":
      return Oe(e, a) > 0;
    case ">=":
      return Oe(e, a) >= 0;
    case "<":
      return Oe(e, a) < 0;
    case "<=":
      return Oe(e, a) <= 0;
    case "!=":
    case "<>":
      return !Be(e, a);
    default:
      return Be(e, a);
  }
}
g("countif", "Lists", 'countif(list, ">", 0)', "Count items matching a comparison (= != > >= < <=)", ([e, t, a]) => (z(e) ? e : [e]).filter((i) => qi(i, b(t), a)).length);
g("sumif", "Lists", 'sumif(list, ">", 0)', "Sum items matching a comparison", ([e, t, a]) => (z(e) ? e : [e]).filter((i) => qi(i, b(t), a)).reduce((i, r) => i + D(r), 0));
g("pluck", "Lists", 'pluck(table, "column")', "One column of a table as a list", ([e, t]) => Wa(e, "pluck").map((a) => Xe(a, b(t))));
function ie(e, t) {
  switch (e.t) {
    case "num":
      return e.v;
    case "str":
      return e.v;
    case "bool":
      return e.v;
    case "null":
      return null;
    case "list":
      return e.items.map((a) => ie(a, t));
    case "name": {
      const a = t.lookup(e.name);
      if (!a.found) throw new J(`Unknown name "${e.name}"`);
      return a.value;
    }
    case "member":
      return Xe(ie(e.obj, t), e.prop);
    case "index": {
      const a = ie(e.obj, t), i = ie(e.index, t);
      return z(a) ? a[D(i) - 1] ?? null : Xe(a, b(i));
    }
    case "unary": {
      const a = ie(e.arg, t);
      return e.op === "not" ? !G(a) : e.op === "-" ? z(a) ? a.map((i) => -D(i)) : -D(a) : D(a);
    }
    case "call": {
      const a = Ui[e.fn];
      if (!a) throw new J(`Unknown function "${e.fn}()"`);
      return e.fn === "if" ? G(ie(e.args[0], t)) ? e.args[1] ? ie(e.args[1], t) : "" : e.args[2] ? ie(e.args[2], t) : "" : a.fn(e.args.map((i) => ie(i, t)), t);
    }
    case "bin": {
      if (e.op === "and" || e.op === "&&") return G(ie(e.left, t)) && G(ie(e.right, t));
      if (e.op === "or" || e.op === "||") return G(ie(e.left, t)) || G(ie(e.right, t));
      const a = ie(e.left, t), i = ie(e.right, t);
      switch (e.op) {
        case "&":
          return b(a, t.fo) + b(i, t.fo);
        case "=":
        case "==":
          return Be(a, i);
        case "!=":
        case "<>":
          return !Be(a, i);
        case "<":
          return Oe(a, i) < 0;
        case "<=":
          return Oe(a, i) <= 0;
        case ">":
          return Oe(a, i) > 0;
        case ">=":
          return Oe(a, i) >= 0;
        default:
          return Bi(e.op, a, i);
      }
    }
  }
}
const Yt = /* @__PURE__ */ new Map();
function xe(e, t) {
  let a = Yt.get(e);
  return a || (a = ja(e), Yt.size > 500 && Yt.clear(), Yt.set(e, a)), ie(a, t);
}
function $t(e) {
  if (!e) return [];
  try {
    return [...Te(ja(e.startsWith("=") ? e.slice(1) : e))];
  } catch {
    return [];
  }
}
const jt = "⁣⁣KFCURSOR⁣⁣", Yi = {
  text: "text",
  input: "text",
  textarea: "textarea",
  paragraph: "textarea",
  multiline: "textarea",
  select: "select",
  dropdown: "select",
  choice: "select",
  checkbox: "checkbox",
  toggle: "toggle",
  switch: "toggle",
  date: "date",
  time: "time",
  datetime: "datetime",
  number: "number",
  currency: "currency",
  money: "currency",
  pick: "pick"
}, ms = /* @__PURE__ */ new Set(["me", "data", "page", "index", "rownumber"]), Wt = /^[\p{L}_][\p{L}\p{N}_]*$/u;
function ka(e) {
  const t = e.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function _a(e) {
  const t = e.includes("|") ? "|" : ",";
  return At(e, t).map((a) => a.trim().replace(/^["']|["']$/g, "")).filter((a) => a !== "");
}
function Ea(e, t, a, i, r, s) {
  const n = () => i ? a.repeats.get(i) : a, u = (l) => {
    for (const c of l)
      if (c.k === "cmd") {
        const d = Yi[c.name];
        if (d && c.args.main) n().fields.has(c.args.main) || n().fields.set(c.args.main, { type: d, args: c.args, start: c.start, end: c.end });
        else if (c.name === "set") {
          const h = c.args.main.split("=")[0].trim();
          h && n().sets.add(h);
        } else c.name === "ref" && a.pendingRefs.push({ name: c.args.main.split(".")[0], repeat: i });
        (c.name === "=" || c.name === "validate" || ["upper", "lower", "title", "capitalize", "trim", "replace"].includes(c.name)) && $t(c.args.main).forEach((h) => a.pendingRefs.push({ name: h, repeat: i })), c.name === "set" && $t(c.args.main.split("=").slice(1).join("=")).forEach((h) => a.pendingRefs.push({ name: h, repeat: i }));
        for (const h of [c.args.main, ...Object.values(c.args.opts)]) if (c.name !== "=" && h.startsWith("=")) $t(h).forEach((p) => a.pendingRefs.push({ name: p, repeat: i }));
        else if ((c.name === "snippet" || c.name === "include") && t.resolveSnippet && r < 5 && !s.has(c.args.main)) {
          const p = t.resolveSnippet(c.args.main);
          if (p) {
            s.add(c.args.main);
            try {
              Ea(Ma(p.content, p.contentType === "html"), t, a, i, r + 1, s);
            } catch {
            }
            s.delete(c.args.main);
          }
        }
      } else c.k === "if" ? (c.branches.forEach((d) => {
        $t(d.cond).forEach((h) => a.pendingRefs.push({ name: h, repeat: i })), u(d.body);
      }), c.elseBody && u(c.elseBody)) : c.k === "section" ? (a.fields.has(c.args.main) || n().fields.set(c.args.main, { type: "section", args: c.args, start: c.start, end: c.end }), u(c.body)) : c.k === "repeat" && (/^\d+$/.test(c.args.main) || c.args.opts.count ? u(c.body) : (a.repeats.has(c.args.main) || a.repeats.set(c.args.main, { fields: /* @__PURE__ */ new Map(), sets: /* @__PURE__ */ new Set() }), Ea(c.body, t, a, c.args.main, r, s)));
  };
  u(e);
}
function gs(e, t) {
  for (const { name: a, repeat: i } of e.pendingRefs)
    if (!(e.fields.has(a) || e.sets.has(a) || e.repeats.has(a) || e.implicit.has(a) || ms.has(a)) && !(t && Object.prototype.hasOwnProperty.call(t, a)))
      if (i) {
        const r = e.repeats.get(i);
        !r.fields.has(a) && !r.sets.has(a) && r.fields.set(a, { type: "text", args: { main: a, opts: {}, flags: /* @__PURE__ */ new Set() }, start: -1, end: -1 });
      } else e.implicit.add(a);
}
function ia(e, t, a = {}) {
  const i = t === "html";
  let r = i;
  const s = { locale: "en-US", currency: "USD", dateFormat: "DD MMM YYYY", timeFormat: "h:mm A", ...a.fo || {} }, n = a.now || /* @__PURE__ */ new Date(), u = a.values || {}, l = { forms: !0, formulas: !0, conditionals: !0, ...a.features || {} }, c = [], d = [], h = [], p = /* @__PURE__ */ new Set();
  let y;
  try {
    y = Ma(e, i);
  } catch (f) {
    return { text: "", html: "", cursor: null, form: [], errors: [f.message], validation: [], needsForm: !1, isRich: !1 };
  }
  const w = { fields: /* @__PURE__ */ new Map(), sets: /* @__PURE__ */ new Set(), repeats: /* @__PURE__ */ new Map(), implicit: /* @__PURE__ */ new Set(), pendingRefs: [] };
  Ea(y, a, w, null, 0, /* @__PURE__ */ new Set()), gs(w, a.globals);
  const V = a.globals || {}, j = {}, K = {};
  for (const [f, m] of Object.entries(a.data || {})) K[f] = m.rows.map((A) => ({ ...A }));
  const te = a.profile || {}, et = a.page || { url: "", title: "", host: "" }, T = [], me = () => {
    for (let f = T.length - 1; f >= 0; f--) if (!T[f].repeat.startsWith("__")) return T[f];
  };
  function Bt(f, m) {
    const A = m.opts.default ?? m.opts.value_default;
    switch (f) {
      case "checkbox":
      case "toggle":
      case "section":
        return A !== void 0 ? G(A) : m.flags.has("checked") || m.flags.has("on");
      case "date": {
        const v = se(A ?? "", n);
        return v ? Gt(v) : "";
      }
      case "time": {
        if (A === void 0) return "";
        const v = se(A === "now" ? "now" : A, n);
        return v ? hi(v) : "";
      }
      case "datetime": {
        const v = A ? se(A, n) : null;
        return v ? `${Gt(v)}T${hi(v)}` : "";
      }
      case "select":
        return m.flags.has("multiple") ? A ? _a(A) : [] : A ?? (m.flags.has("required") || m.opts.required ? "" : _a(m.opts.options || "")[0] ?? "");
      default:
        return A ?? "";
    }
  }
  function Ut(f, m, A) {
    switch (f) {
      case "checkbox":
      case "toggle":
      case "section":
        return !!m && m !== "false";
      case "number":
      case "currency": {
        if (m === "" || m === null || m === void 0) return null;
        const v = ne(m);
        return isNaN(v) ? String(m) : v;
      }
      case "date":
      case "datetime": {
        const v = m ? se(m, n) : null;
        return v && f === "datetime" && (v.__time = !0), v;
      }
      case "time": {
        const v = m ? se(m, n) : null;
        return v && (v.__time = !0), v;
      }
      case "pick": {
        const v = a.data?.[A.opts.table || ""], E = v?.rows.find((ae) => ae.__id === m || ae.id === m);
        if (!E) return null;
        const I = A.opts.display || v?.columns?.[0] || Object.keys(E)[0];
        return { ...E, __label: E[I] ?? "" };
      }
      case "select":
        return Array.isArray(m) ? m : m ?? "";
      default:
        return m ?? "";
    }
  }
  function qt(f, m, A, v) {
    const E = v ? v.row : u;
    return E[f] !== void 0 ? E[f] : Bt(m, A);
  }
  function ya(f) {
    for (let v = T.length - 1; v >= 0; v--) {
      const E = T[v];
      if (f in E.rowVars) return { found: !0, value: E.rowVars[f] };
      if (f === "index" || f === "rownumber") return { found: !0, value: E.index + 1 };
      const I = w.repeats.get(E.repeat)?.fields.get(f);
      if (I && I.start >= 0 && E === me())
        try {
          at(f, I.type, I.args, T.length, I.start, I.end);
        } catch {
        }
      if (I) return { found: !0, value: Ut(I.type, qt(f, I.type, I.args, E), I.args) };
    }
    if (f in j) return { found: !0, value: j[f] };
    if (w.sets.has(f)) return { found: !0, value: "" };
    const m = w.fields.get(f);
    if (m)
      try {
        at(f, m.type, m.args, 0, m.start, m.end, !1, !0);
      } catch {
      }
    if (m) return { found: !0, value: Ut(m.type, qt(f, m.type, m.args), m.args) };
    if (Object.prototype.hasOwnProperty.call(V, f)) return { found: !0, value: V[f] };
    if (w.implicit.has(f)) {
      try {
        at(f, "text", { main: f, opts: {}, flags: /* @__PURE__ */ new Set() }, 0, void 0, void 0, !0, !0);
      } catch {
      }
      return { found: !0, value: u[f] ?? "" };
    }
    const A = w.repeats.get(f);
    return A ? {
      found: !0,
      value: ii(f, { opts: {} }).map((E, I) => {
        const ae = { index: I + 1 };
        for (const [x, M] of A.fields) ae[x] = Ut(M.type, E[x] !== void 0 ? E[x] : Bt(M.type, M.args), M.args);
        return ae;
      })
    } : f === "me" ? { found: !0, value: te } : f === "data" ? { found: !0, value: K } : f === "page" ? { found: !0, value: et } : { found: !1, value: null };
  }
  const tt = { lookup: ya, fo: s, now: n }, je = (f) => {
    if (!l.formulas) throw new Error("Formulas require the Pro plan");
    return xe(f, tt);
  }, wt = (f) => f === void 0 ? "" : f.startsWith("=") ? b(je(f.slice(1)), s) : f;
  function ii(f, m) {
    const A = Math.max(0, parseInt(m.opts.min ?? "1", 10) || 0), v = u[f];
    return Array.isArray(v) ? v : Array.from({ length: Math.max(A, 1) }, () => ({}));
  }
  function at(f, m, A, v, E, I, ae = !1, x = !1) {
    if (!l.forms) throw new Error("Dynamic form fields require an upgraded plan");
    const M = x ? void 0 : me(), H = M ? `${M.repeat}#${M.index}.${f}` : f;
    if (p.has(H)) return;
    p.add(H);
    const le = qt(f, m, A, M), N = A.opts, W = {
      name: f,
      type: m,
      depth: v,
      value: le,
      implicit: ae,
      start: E,
      end: I,
      label: N.label || ka(f),
      required: A.flags.has("required") || G(N.required ?? ""),
      defaultRaw: N.default,
      options: m === "select" ? _a(wt(N.options) || "") : void 0,
      multiple: A.flags.has("multiple"),
      placeholder: N.placeholder,
      min: N.min !== void 0 ? ne(N.min) : void 0,
      max: N.max !== void 0 ? ne(N.max) : void 0,
      step: N.step !== void 0 ? ne(N.step) : void 0,
      minLength: N.minlength !== void 0 ? parseInt(N.minlength, 10) : void 0,
      maxLength: N.maxlength !== void 0 ? parseInt(N.maxlength, 10) : void 0,
      pattern: N.pattern,
      message: N.message,
      rows: N.rows ? parseInt(N.rows, 10) : void 0,
      currency: N.currency,
      table: N.table,
      display: N.display,
      hint: N.hint || N.help
    };
    if (m === "pick") {
      const Ie = a.data?.[N.table || ""];
      if (!Ie) throw new Error(`Data Hub table "${N.table}" was not found`);
      const ba = N.display || Ie.columns?.[0] || "name";
      W.options = Ie.rows.map((L) => `${L.__id}\0${b(L[ba] ?? "")}`);
    }
    const ce = Gr(W);
    ce && (W.error = ce, d.push(`${W.label}: ${ce}`)), M ? M.formRow.push(W) : h.push(W);
  }
  function Gr(f) {
    const m = f.value, A = m === "" || m === null || m === void 0 || Array.isArray(m) && m.length === 0 || (f.type === "checkbox" || f.type === "toggle") && f.required && !m;
    if (f.required && A) return f.message || "This field is required";
    if (!A) {
      if (f.type === "number" || f.type === "currency") {
        const v = ne(m);
        if (isNaN(v)) return "Enter a valid number";
        if (f.min !== void 0 && v < f.min) return f.message || `Must be at least ${f.min}`;
        if (f.max !== void 0 && v > f.max) return f.message || `Must be at most ${f.max}`;
      }
      if (typeof m == "string") {
        if (f.minLength !== void 0 && m.length < f.minLength) return f.message || `Use at least ${f.minLength} characters`;
        if (f.maxLength !== void 0 && m.length > f.maxLength) return f.message || `Use at most ${f.maxLength} characters`;
        if (f.pattern) {
          const v = { email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, phone: /^\+?[\d\s().-]{6,20}$/, url: /^https?:\/\/\S+$/i, digits: /^\d+$/ };
          let E = v[f.pattern.toLowerCase()];
          if (!E)
            try {
              E = new RegExp(`^(?:${f.pattern})$`);
            } catch {
              return "Invalid validation pattern";
            }
          if (!E.test(m.trim())) return f.message || `Invalid format${v[f.pattern.toLowerCase()] ? ` (${f.pattern})` : ""}`;
        }
      }
    }
  }
  let he = "";
  const Se = (f) => {
    he += r ? va(f) : f;
  }, ri = (f, m) => {
    r ? he += f : he += m;
  };
  function si(f, m, A) {
    const v = A.opts.format;
    switch (f) {
      case "checkbox":
      case "toggle":
        return G(m) ? wt(A.opts.value ?? A.opts.on ?? "") : wt(A.opts.off ?? "");
      case "currency":
        return m === null || m === "" ? "" : typeof m == "number" ? Ae(m, v || `currency:${A.opts.currency || s.currency}`, s) : b(m, s);
      case "number":
        return m === null ? "" : Ae(m, v, s);
      case "date":
        return m ? fe(m, v || s.dateFormat) : "";
      case "time":
        return m ? fe(m, v || s.timeFormat) : "";
      case "datetime":
        return m ? fe(m, v || `${s.dateFormat} ${s.timeFormat}`) : "";
      case "select":
        return Array.isArray(m) ? m.join(A.opts.separator ?? ", ") : Ae(m, v, s);
      default:
        return Ae(m, v, s);
    }
  }
  function zr(f) {
    const m = je(f.main);
    if (!z(m)) throw new Error("{{table}} source must be a list (a repeat section or data.<table>)");
    let A = m.filter((L) => ea(L));
    const E = (f.opts.columns ? At(f.opts.columns, "|").map((L) => L.trim()).filter(Boolean) : Object.keys(A[0] || {}).filter((L) => !L.startsWith("__") && L !== "index")).map((L) => {
      const Q = L.indexOf(":");
      return Q > 0 ? { header: L.slice(0, Q).trim(), expr: L.slice(Q + 1).trim() } : { header: ka(L), expr: L };
    }), I = (L, Q, Ce) => {
      T.push({ repeat: "__table", row: {}, rowVars: { ...L, index: Q + 1 }, index: Q, formRow: [] });
      try {
        return Ce();
      } finally {
        T.pop();
      }
    };
    f.opts.where && (A = A.filter((L, Q) => I(L, Q, () => G(je(f.opts.where))))), f.opts.limit && (A = A.slice(0, parseInt(f.opts.limit, 10) || A.length));
    const ae = (f.opts.formats || "").split("|").map((L) => L.trim()), x = A.map((L, Q) => E.map((Ce, xa) => I(L, Q, () => Ae(je(Ce.expr), ae[xa] || void 0, s)))), M = f.opts.total ? E.map((L, Q) => {
      const Ce = At(f.opts.total, "|").map((wa) => wa.trim().toLowerCase());
      if (Q === 0 && !Ce.includes(L.header.toLowerCase())) return f.opts.totallabel || "Total";
      if (!Ce.includes(L.header.toLowerCase())) return "";
      const xa = A.reduce((wa, Xr, Jr) => wa + (ne(I(Xr, Jr, () => je(L.expr))) || 0), 0);
      return Ae(xa, ae[Q] || void 0, s);
    }) : null, H = E.map((L) => L.header), le = [H, ...x, ...M ? [M] : []], N = H.map((L, Q) => Math.max(...le.map((Ce) => (Ce[Q] || "").length))), W = (L) => "| " + L.map((Q, Ce) => (Q || "").padEnd(N[Ce])).join(" | ") + " |", ce = [W(H), "|" + N.map((L) => "-".repeat(L + 2)).join("|") + "|", ...x.map(W), ...M ? [W(M)] : []].join(`
`), Ie = 'style="border:1px solid #bbb;padding:4px 8px"', ba = `<table style="border-collapse:collapse"><thead><tr>${H.map((L) => `<th ${Ie}>${st(L)}</th>`).join("")}</tr></thead><tbody>${x.map((L) => `<tr>${L.map((Q) => `<td ${Ie}>${st(Q)}</td>`).join("")}</tr>`).join("")}${M ? `<tr>${M.map((L) => `<td ${Ie}><b>${st(L)}</b></td>`).join("")}</tr>` : ""}</tbody></table>`;
    ri(ba, ce);
  }
  function We(f, m, A) {
    for (const v of f)
      try {
        Kr(v, m, A);
      } catch (E) {
        const I = E instanceof Fe || E instanceof Error ? E.message : String(E), ae = v.k === "cmd" ? `{{${v.raw}}}` : v.k === "if" ? "{{if}}" : `{{${v.k}}}`;
        c.push(`${ae}: ${I}`);
      }
  }
  function Kr(f, m, A) {
    const v = me();
    switch (f.k) {
      case "text":
        he += f.text;
        return;
      case "if": {
        if (!l.conditionals) throw new Error("Conditional rules require the Pro plan");
        for (const x of f.branches)
          if (G(xe(x.cond, tt))) {
            We(x.body, m, A);
            return;
          }
        f.elseBody && We(f.elseBody, m, A);
        return;
      }
      case "section": {
        const x = f.args.main;
        if (!Wt.test(x)) throw new Error("Section needs a name, e.g. {{section: extras; label=Add extras?}}");
        at(x, "section", f.args, m, f.start, f.end), G(Ut("section", qt(x, "section", f.args, v), f.args)) && We(f.body, m + 1, A);
        return;
      }
      case "repeat": {
        const x = f.args.main, M = f.args.opts.separator ?? "", H = /^\d+$/.test(x) ? parseInt(x, 10) : f.args.opts.count ? Math.round(ne(je(f.args.opts.count))) : null;
        if (H !== null) {
          const W = Math.max(0, Math.min(500, isNaN(H) ? 0 : H));
          for (let ce = 0; ce < W; ce++) {
            ce && M && Se(M), T.push({ repeat: "__static", row: {}, rowVars: { index: ce + 1 }, index: ce, formRow: [] });
            try {
              We(f.body, m, A);
            } finally {
              T.pop();
            }
          }
          return;
        }
        if (!Wt.test(x)) throw new Error("Repeat needs a name, e.g. {{repeat: items; label=Item}}");
        if (!l.forms) throw new Error("Repeating sections require an upgraded plan");
        const le = ii(x, f.args), N = {
          type: "repeat",
          name: x,
          label: f.args.opts.label || ka(x),
          min: parseInt(f.args.opts.min ?? "1", 10) || 0,
          max: parseInt(f.args.opts.max ?? "50", 10) || 50,
          depth: m,
          rows: []
        };
        h.push(N), le.forEach((W, ce) => {
          ce && M && Se(M);
          const Ie = { repeat: x, row: W || {}, rowVars: {}, index: ce, formRow: [] };
          T.push(Ie);
          try {
            We(f.body, m + 1, A);
          } finally {
            T.pop(), N.rows.push(Ie.formRow);
          }
        });
        return;
      }
    }
    const { name: E, args: I } = f, ae = Yi[E];
    if (ae && (I.main || !["date", "time"].includes(E))) {
      const x = I.main;
      if (!x || !Wt.test(x)) throw new Error(`Field name "${x}" may only contain letters, numbers and _ (use label=… for display text)`);
      if (at(x, ae, I, m, f.start, f.end), I.flags.has("hidden") || I.opts.show === "no" || I.opts.show === "false") return;
      const M = ya(x).value;
      Se(si(ae, M, I));
      return;
    }
    switch (E) {
      case "#":
        return;
      case "ref": {
        const x = I.main, M = x.split(".")[0];
        (w.implicit.has(M) || v && w.repeats.get(v.repeat)?.fields.get(M)?.start === -1) && !x.includes(".") && at(M, "text", I, m, f.start, f.end, !0);
        let le;
        if (x.includes(".")) le = xe(x, tt);
        else {
          const N = ya(M);
          if (!N.found) throw new Error(`Unknown name "${M}"`);
          le = N.value;
          const W = w.fields.get(M) || (v ? w.repeats.get(v.repeat)?.fields.get(M) : void 0);
          if (W && !I.opts.format) {
            Se(si(W.type, le, { ...W.args, opts: { ...W.args.opts } }));
            return;
          }
        }
        Se(Ae(le, I.opts.format, s));
        return;
      }
      case "=": {
        const x = je(I.main);
        Se(Ae(x, I.opts.format, s));
        return;
      }
      case "set": {
        const x = I.main.indexOf("=");
        if (x < 1) throw new Error("Use {{set: name = formula}}");
        const M = I.main.slice(0, x).trim();
        if (!Wt.test(M)) throw new Error(`Invalid variable name "${M}"`);
        const H = je(I.main.slice(x + 1));
        v ? v.rowVars[M] = H : j[M] = H;
        return;
      }
      case "upper":
      case "lower":
      case "title":
      case "capitalize":
      case "trim": {
        const x = b(xe(I.main, tt), s);
        Se(E === "upper" ? x.toUpperCase() : E === "lower" ? x.toLowerCase() : E === "title" ? $a(x) : E === "trim" ? x.trim() : x.charAt(0).toUpperCase() + x.slice(1));
        return;
      }
      case "replace": {
        const x = b(xe(I.main, tt), s);
        Se(x.split(I.opts.find ?? "").join(I.opts.with ?? I.opts.by ?? ""));
        return;
      }
      case "today":
      case "date":
      case "now":
      case "time": {
        let x = new Date(n.getTime());
        (E === "today" || E === "date") && (x = new Date(n.getFullYear(), n.getMonth(), n.getDate())), I.opts.shift && (x = nt(x, I.opts.shift)), I.main && E !== "date" && (x = nt(x, I.main));
        const M = I.opts.format || (E === "time" ? s.timeFormat : E === "now" ? `${s.dateFormat} ${s.timeFormat}` : s.dateFormat);
        Se(fe(x, M));
        return;
      }
      case "cursor":
        he += jt;
        return;
      case "link": {
        const x = wt(I.opts.url ?? (I.main.startsWith("="), I.main)), M = wt(I.opts.text ?? "") || x;
        if (!/^(https?:|mailto:|tel:)/i.test(x)) throw new Error(`Links must start with https://, http://, mailto: or tel: (got "${x}")`);
        const H = I.opts.plain || "both", le = M === x || H === "url" ? x : H === "text" ? M : `${M} (${x})`;
        ri(`<a href="${st(x)}">${st(M)}</a>`, le);
        return;
      }
      case "table":
        zr(I);
        return;
      case "snippet":
      case "include": {
        if (A >= 5) throw new Error("Snippets are nested too deeply (max 5)");
        const x = a.resolveSnippet?.(I.main);
        if (!x) throw new Error(`No snippet with shortcut "${I.main}"`);
        const M = x.contentType === "html", H = Ma(x.content, M);
        if (M === r) {
          We(H, m, A + 1);
          return;
        }
        const le = he, N = r;
        he = "", r = M;
        try {
          We(H, m, A + 1);
        } finally {
          r = N;
        }
        const W = he;
        he = le + (M ? li(W) : va(W));
        return;
      }
      case "validate": {
        G(xe(I.main, tt)) || d.push(I.opts.message || `Check failed: ${I.main}`);
        return;
      }
      case "index": {
        if (!T.length) throw new Error("{{index}} can only be used inside {{repeat}}");
        Se(String(T[T.length - 1].index + 1));
        return;
      }
      case "else":
      case "endif":
      case "elseif":
      case "endrepeat":
      case "endsection":
        throw new Error("Misplaced block command");
      default:
        throw new Error(`Unknown command "${E}". See the syntax guide for available commands.`);
    }
  }
  We(y, 0, 0);
  let it, vt;
  i ? (vt = he, it = li(he)) : (it = he, vt = va(he));
  let ni = null;
  const oi = it.indexOf(jt);
  oi >= 0 && (ni = oi), it = it.split(jt).join(""), vt = vt.split(jt).join("");
  const Qr = h.length > 0;
  return { text: it, html: vt, cursor: ni, form: h, errors: c, validation: d, needsForm: Qr, isRich: i };
}
const Sa = ["dynamicForms", "formulas", "conditionals", "richText", "dataHub", "autopilot", "analytics", "sharing", "marketplaceSubmit", "cloudSync"], mi = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Basic text expansion for individuals",
    limits: { snippets: 40, folders: 5, tables: 1, workflows: 1, libraryTemplates: 10, teamMembers: 0 },
    features: ["dynamicForms", "sharing", "cloudSync"]
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Advanced forms, formulas, rich content and analytics",
    limits: { snippets: 5e3, folders: 500, tables: 50, workflows: 100, libraryTemplates: 1 / 0, teamMembers: 0 },
    features: Sa
  },
  business: {
    id: "business",
    name: "Business",
    tagline: "Teams, shared folders, roles and team analytics",
    limits: { snippets: 2e4, folders: 2e3, tables: 200, workflows: 500, libraryTemplates: 1 / 0, teamMembers: 250 },
    features: [...Sa, "teams", "teamAnalytics", "roles"]
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Custom limits, access management and audit logs",
    limits: { snippets: 1 / 0, folders: 1 / 0, tables: 1 / 0, workflows: 1 / 0, libraryTemplates: 1 / 0, teamMembers: 1 / 0 },
    features: [...Sa, "teams", "teamAnalytics", "roles", "auditLogs"]
  }
};
function ys(e) {
  return mi[e || "pro"] || mi.pro;
}
function Ht(e, t, a = !0) {
  return !a || ys(e).features.includes(t);
}
function $i(e) {
  const { settings: t } = e, a = new Map(e.snippets.filter((s) => !s.deleted).map((s) => [s.shortcut, s])), i = {};
  for (const s of e.tables)
    s.deleted || (i[s.key] = { label: s.name, columns: s.columns.map((n) => n.key), rows: s.rows.map((n) => ({ __id: n.id, ...n.values })) });
  const r = t.enforcePlanLimits;
  return {
    values: e.values || {},
    profile: { ...t.profile },
    data: Ht(t.plan, "dataHub", r) ? i : {},
    page: e.page,
    resolveSnippet: (s) => {
      const n = a.get(s);
      return n ? { content: n.content, contentType: n.contentType } : null;
    },
    fo: { locale: t.locale, currency: t.currency, dateFormat: t.dateFormat, timeFormat: t.timeFormat },
    features: {
      forms: Ht(t.plan, "dynamicForms", r),
      formulas: Ht(t.plan, "formulas", r),
      conditionals: Ht(t.plan, "conditionals", r)
    }
  };
}
const St = "⚠️ _Not financial advice. Trade at your own risk and always use a stop loss._", Re = "{{number: pip_factor; label=Pips per 1.00 move (Gold 10 · EURUSD 10000 · JPY pairs 100); default=10; hidden}}", bs = [
  // ───────────────────────── Market analysis
  {
    id: "lib-xau-weekly",
    name: "Gold weekly outlook (high timeframe)",
    category: "Market analysis",
    shortcut: "/xauw",
    contentType: "text",
    description: "Weekly HTF post: context, key level, bearish & bullish scenarios with targets.",
    content: `🟡 *{{text: symbol; default=XAUUSD}} Weekly Outlook*
*High Timeframe Analysis*
━━━━━━━━━━━━━━━

*📊 Context*
{{textarea: context; label=Last week recap; required; rows=4; placeholder=Gold saw strong selling pressure last week…}}

*🔑 Key level: {{number: key_level; label=Key level; required; format=number}}*
{{textarea: key_note; label=Why this level matters; default=This is the level that decides the next leg. Everything depends on how the daily and weekly candles close around it.}}
━━━━━━━━━━━━━━━

*🔻 Scenario 1 — Breakdown*
• Bearish daily candle close below *{{key_level}}*
• Look for sell setups after the close is confirmed
• Target zone: *{{text: bear_targets; label=Bearish target zone; required; placeholder=3,600 – 3,350}}*

*🔺 Scenario 2 — Hold & bounce*
• Rejection / daily close back above *{{key_level}}*
• Look for buy setups on lower-timeframe confirmation
• Target zone: *{{text: bull_targets; label=Bullish target zone; required; placeholder=3,950 – 4,050}}*
{{section: extra; label=Add extra notes?}}
*📝 Notes*
{{textarea: notes}}
{{endsection}}
━━━━━━━━━━━━━━━
📅 Week of {{today; format=D MMM YYYY}}{{section: credit; label=Add credit line?}}
Credits: {{text: credit_name; label=Credit to}}{{endsection}}

${St}`
  },
  {
    id: "lib-xau-daily",
    name: "Gold daily trading plan",
    category: "Market analysis",
    shortcut: "/xaud",
    contentType: "text",
    description: "Intraday plan with bias, Asian range, levels and session notes.",
    content: `🟡 *{{text: symbol; default=XAUUSD}} Daily Plan — {{today; format=ddd, D MMM}}*

*Bias:* {{select: bias; options=🔺 Bullish,🔻 Bearish,➖ Neutral / range; required}}
*Asian range:* {{number: asia_low; label=Asian low; format=number}} – {{number: asia_high; label=Asian high; format=number}}  ({{= round(abs(asia_high - asia_low) * pip_factor)}} pips)

*Resistance:* {{text: resistance; required; placeholder=3,860 / 3,885}}
*Support:* {{text: support; required; placeholder=3,810 / 3,790}}

*Plan*
{{textarea: plan; required; rows=3; placeholder=Wait for London to sweep the Asian high, then look for sells back into the range…}}
{{checkbox: news_day; label=High-impact news today?; hidden}}{{if: news_day}}
📰 *News:* {{text: news_event; label=News event & time}} — avoid entries 15 min before/after.
{{endif}}
${Re}${St}`
  },
  {
    id: "lib-levels",
    name: "Key levels update",
    category: "Market analysis",
    shortcut: "/levels",
    contentType: "text",
    description: "Quick support/resistance list with current price.",
    content: `📍 *{{text: symbol; default=XAUUSD}} key levels* — {{now; format=D MMM, HH:mm}}

Current price: *{{number: price; required; format=number}}*

🔴 Resistance
{{repeat: res; label=Resistance; min=1}}  R{{index}}: {{number: level; format=number}}
{{endrepeat}}
🟢 Support
{{repeat: sup; label=Support; min=1}}  S{{index}}: {{number: level; format=number}}
{{endrepeat}}
{{textarea: comment; label=Comment (optional)}}`
  },
  {
    id: "lib-news-alert",
    name: "High-impact news alert",
    category: "Market analysis",
    shortcut: "/news",
    contentType: "text",
    description: "NFP / CPI / FOMC warning with time and forecast.",
    content: `📰 *NEWS ALERT — {{select: event; options=NFP (Non-Farm Payrolls),CPI (Inflation),FOMC Rate Decision,Fed Chair Speech,GDP,Unemployment Claims,PPI,Retail Sales; required}}*

🕒 Time: *{{time: at; label=Release time; required}}* ({{date: on; default=today; format=ddd D MMM}})
Forecast: {{text: forecast; placeholder=e.g. 180K}} | Previous: {{text: previous; placeholder=e.g. 150K}}

Expect high volatility on {{text: pairs; label=Affected pairs; default=XAUUSD and USD pairs}}.
✅ Close or protect open trades
✅ No new entries 15 minutes before and after
✅ Wait for the first candle to close before reacting

Stay safe, traders 🙏`
  },
  {
    id: "lib-gm-traders",
    name: "Good morning / market open",
    category: "Market analysis",
    shortcut: "/gm",
    contentType: "text",
    description: "Daily greeting with day name and focus for the session.",
    content: `{{= greeting()}} traders ☀️

Happy {{= weekday(today())}}! {{select: focus; options=Patience is a position — wait for your setup.,Protect your capital first — profits follow.,Plan the trade and trade the plan.,No setup = no trade. Stay disciplined.}}

Today we're watching *{{text: symbol; default=XAUUSD}}*{{text: watch_note; label=What are you watching? (optional); hidden}}{{if: watch_note}} — {{watch_note}}{{endif}}.
Analysis coming before the {{select: session; options=London,New York,Asian}} session. 📊`
  },
  {
    id: "lib-session",
    name: "Session update",
    category: "Market analysis",
    shortcut: "/session",
    contentType: "text",
    description: "London / New York session recap with price move.",
    content: `⏱ *{{select: session; options=London,New York,Asian}} session update — {{text: symbol; default=XAUUSD}}*

Open: {{number: open; required; format=number}} → Now: {{number: now_price; label=Current price; required; format=number}}
Move: *{{= now_price - open > 0 ? "+" : ""}}{{= round((now_price - open) * pip_factor)}} pips* {{= now_price >= open ? "🟢" : "🔴"}}

{{textarea: summary; label=What happened; required}}
${Re}`
  },
  // ───────────────────────── Trade signals
  {
    id: "lib-signal",
    name: "Trade signal (entry, SL, TPs, R:R)",
    category: "Trade signals",
    shortcut: "/entry",
    contentType: "text",
    description: "Full signal with pips risk and risk/reward calculated; validates SL side.",
    content: `🚨 *{{select: side; options=BUY,SELL; required}} {{text: symbol; default=XAUUSD}}* {{select: kind; label=Order type; options=NOW,LIMIT,STOP; default=NOW}}

📍 Entry: *{{number: entry; required; format=number}}*
🛑 SL: *{{number: sl; label=Stop loss; required; format=number}}*  ({{= round(abs(entry - sl) * pip_factor)}} pips)
🎯 TP1: *{{number: tp1; required; format=number}}*  (+{{= round(abs(tp1 - entry) * pip_factor)}} pips · R:R 1:{{= round(abs(tp1 - entry) / abs(entry - sl), 1)}})
{{number: tp2; label=TP2 (optional); format=number; hidden}}{{if: tp2}}🎯 TP2: *{{tp2}}*  (+{{= round(abs(tp2 - entry) * pip_factor)}} pips)
{{endif}}{{number: tp3; label=TP3 (optional); format=number; hidden}}{{if: tp3}}🎯 TP3: *{{tp3}}*  (+{{= round(abs(tp3 - entry) * pip_factor)}} pips)
{{endif}}
Risk: {{select: risk; label=Suggested risk; options=1%,0.5%,2%; default=1%}} per trade · Move SL to entry after TP1 ✅
{{validate: if(side = "BUY", sl < entry, sl > entry); message=Stop loss must be below entry for BUY and above entry for SELL}}${Re}
${St}`
  },
  {
    id: "lib-pending",
    name: "Pending order placed",
    category: "Trade signals",
    shortcut: "/pending",
    contentType: "text",
    description: "Limit / stop order alert with expiry.",
    content: `⏳ *PENDING ORDER — {{select: side; options=BUY LIMIT,SELL LIMIT,BUY STOP,SELL STOP}} {{text: symbol; default=XAUUSD}}*

Entry: *{{number: entry; required; format=number}}*
SL: {{number: sl; required; format=number}} · TP: {{number: tp; required; format=number}}
R:R 1:{{= round(abs(tp - entry) / abs(entry - sl), 1)}}

Cancel if not triggered by *{{select: expiry; options=end of today,London close,New York close,end of week}}*.`
  },
  {
    id: "lib-signal-short",
    name: "Quick signal (one line)",
    category: "Trade signals",
    shortcut: "/qs",
    contentType: "text",
    description: "Compact signal for fast-moving markets.",
    content: "{{select: side; options=🟢 BUY,🔴 SELL}} *{{text: symbol; default=XAUUSD}}* @ {{number: entry; required; format=number}} | SL {{number: sl; required; format=number}} | TP {{number: tp; required; format=number}} | R:R 1:{{= round(abs(tp - entry) / abs(entry - sl), 1)}}"
  },
  // ───────────────────────── Trade management
  {
    id: "lib-tp-hit",
    name: "TP hit 🎯",
    category: "Trade management",
    shortcut: "/tphit",
    contentType: "text",
    description: "Celebrate a target hit with pips and next instruction.",
    content: `🎯 *{{select: which; options=TP1,TP2,TP3,FINAL TP}} HIT — {{text: symbol; default=XAUUSD}} {{select: side; options=BUY,SELL}}* ✅

+{{= round(abs(exit - entry) * pip_factor)}} pips secured 💰 (entry {{number: entry; required; format=number}} → {{number: exit; label=Target price; required; format=number}})

{{select: next; label=Next instruction; options=Move SL to entry (risk-free) and let the rest run 🚀,Close 50% and trail the stop,Trade fully closed — congratulations!}}
${Re}`
  },
  {
    id: "lib-sl-hit",
    name: "Stop loss hit",
    category: "Trade management",
    shortcut: "/slhit",
    contentType: "text",
    description: "Professional loss update keeping the group calm.",
    content: `🛑 *SL hit — {{text: symbol; default=XAUUSD}} {{select: side; options=BUY,SELL}}*

−{{= round(abs(entry - sl) * pip_factor)}} pips (entry {{number: entry; required; format=number}}, SL {{number: sl; required; format=number}}).

Losses are part of trading — the stop did its job and protected our capital. 🙏
{{select: next; options=We wait for the next clean setup.,Re-entry plan will be shared if conditions are met.,No more trades today — protecting the week.}}
${Re}`
  },
  {
    id: "lib-breakeven",
    name: "Move SL to breakeven",
    category: "Trade management",
    shortcut: "/beven",
    contentType: "text",
    description: "Instruction to secure a trade at entry.",
    content: `🔒 *{{text: symbol; default=XAUUSD}} update* — price moved +{{= round(abs(price - entry) * pip_factor)}} pips in our favour.

Move SL to *entry ({{number: entry; required; format=number}})* now. Trade is risk-free ✅
Current price: {{number: price; required; format=number}}
${Re}`
  },
  {
    id: "lib-partial",
    name: "Partial close",
    category: "Trade management",
    shortcut: "/partial",
    contentType: "text",
    description: "Book partial profits and trail the rest.",
    content: `💰 *Partial close — {{text: symbol; default=XAUUSD}}*

Close *{{select: pct; options=50%,30%,70%,25%}}* at {{number: price; required; format=number}} (+{{= round(abs(price - entry) * pip_factor)}} pips from entry {{number: entry; required; format=number}}).
Trail the remaining position with SL at {{number: new_sl; label=New stop loss; required; format=number}}.
${Re}`
  },
  {
    id: "lib-running",
    name: "Trade running in profit",
    category: "Trade management",
    shortcut: "/running",
    contentType: "text",
    description: "Live update of an open trade.",
    content: `📈 *{{text: symbol; default=XAUUSD}} {{select: side; options=BUY,SELL}}* running +{{= round(abs(price - entry) * pip_factor)}} pips 🔥

Entry {{number: entry; required; format=number}} → now {{number: price; required; format=number}}
{{select: tip; options=Hold — targets still valid.,Consider securing partials here.,SL already at breakeven — let it run.}}
${Re}`
  },
  {
    id: "lib-trade-closed",
    name: "Trade closed — result",
    category: "Trade management",
    shortcut: "/tclose",
    contentType: "text",
    description: "Final result with pips and money for a chosen lot size.",
    content: `✅ *Trade closed — {{text: symbol; default=XAUUSD}} {{select: side; options=BUY,SELL}}*

Entry {{number: entry; required; format=number}} → Exit {{number: exit; required; format=number}}
{{set: pips = round((exit - entry) * pip_factor * if(side = "BUY", 1, -1))}}Result: *{{= pips > 0 ? "+" : ""}}{{= pips}} pips* {{= pips > 0 ? "🟢" : pips < 0 ? "🔴" : "⚪"}}
{{number: lots; label=Lot size (optional, for $ result); hidden}}{{number: pip_value; label=Pip value per lot ($); default=10; hidden}}{{if: lots}}≈ {{= pips * pip_value * lots; format=currency}} on {{lots}} lot(s)
{{endif}}
{{textarea: note; label=Comment (optional)}}
${Re}`
  },
  {
    id: "lib-cancel",
    name: "Signal cancelled",
    category: "Trade management",
    shortcut: "/cancel",
    contentType: "text",
    description: "Cancel a pending order / idea with reason.",
    content: `❌ *Cancel {{text: symbol; default=XAUUSD}} {{select: what; options=pending order,signal,re-entry idea}}*

Reason: {{select: reason; options=Price moved too far before entry,Setup invalidated on the close,High-impact news ahead,Market conditions changed}}.
We wait for a better opportunity. 🙏`
  },
  // ───────────────────────── Risk & journal
  {
    id: "lib-lots",
    name: "Position size calculator",
    category: "Risk & journal",
    shortcut: "/lots",
    contentType: "text",
    description: "Lot size from balance, risk % and stop loss in pips.",
    content: `🧮 *Position size*

Balance: {{currency: balance; required; min=1}}
Risk: {{number: risk_pct; label=Risk %; default=1; min=0.1; max=10; step=0.1}}% = *{{= percentof(risk_pct, balance); format=currency}}*
Stop loss: {{number: sl_pips; label=Stop loss (pips); required; min=1}} pips
Pip value per 1.00 lot: {{number: pip_value; label=Pip value per lot ($) — Gold 10 (0.1 pip) · majors 10; default=10; min=0.01}} $

👉 Lot size: *{{= floor(percentof(risk_pct, balance) / (sl_pips * pip_value) * 100) / 100}} lots*`
  },
  {
    id: "lib-weekly-perf",
    name: "Weekly performance report",
    category: "Risk & journal",
    shortcut: "/wkperf",
    contentType: "text",
    description: "Table of the week’s trades with total pips and win rate.",
    content: `📊 *Weekly results — {{= formatdate(addbusinessdays(today(), -4), "D MMM")}} to {{today; format=D MMM YYYY}}*

{{repeat: trades; label=Trade; min=1}}{{text: symbol; default=XAUUSD; hidden}}{{select: side; options=BUY,SELL; hidden}}{{number: pips; label=Result (pips, negative for loss); hidden}}{{endrepeat}}{{table: trades; columns=#:index|Pair:symbol|Side:side|Pips:pips; total=Pips}}

✅ Wins: {{= countif(trades.pips, ">", 0)}} · ❌ Losses: {{= countif(trades.pips, "<", 0)}} · ⚪ BE: {{= countif(trades.pips, "=", 0)}}
🎯 Win rate: *{{= round(percent(countif(trades.pips, ">", 0), count(trades.pips)))}}%*
💰 Net: *{{= sum(trades.pips) > 0 ? "+" : ""}}{{= sum(trades.pips)}} pips*

Thank you for trading with us 🙏`
  },
  {
    id: "lib-monthly-report",
    name: "Monthly performance summary",
    category: "Risk & journal",
    shortcut: "/mreport",
    contentType: "text",
    description: "Month totals, win rate, best week and growth %.",
    content: `🏆 *{{today; format=MMMM YYYY}} performance*

Total signals: {{number: total; required; min=1}}
Wins: {{number: wins; required; min=0}} · Losses: {{= total - wins}}
Win rate: *{{= round(percent(wins, total))}}%*
Net pips: *{{number: net_pips; label=Net pips; required}}*
{{number: growth; label=Account growth % (optional); hidden}}{{if: growth}}Account growth: *{{growth}}%* 📈
{{endif}}Best trade: {{text: best; label=Best trade; placeholder=XAUUSD sell +420 pips}}

Grateful for this community — next month, same discipline. 💪
${St}`
  },
  {
    id: "lib-journal",
    name: "Trade journal entry",
    category: "Risk & journal",
    shortcut: "/journal",
    contentType: "text",
    description: "Personal journal: setup, execution, emotions, lesson.",
    content: `📓 Journal — {{now; format=ddd D MMM YYYY, HH:mm}}
Pair: {{text: symbol; default=XAUUSD}} | {{select: side; options=BUY,SELL}} | Result: {{number: pips; label=Result (pips)}} pips
Setup: {{select: setup; options=Break & retest,Liquidity sweep,Supply/demand zone,Trendline bounce,Breakout,Other}}
Followed plan? {{select: plan; options=Yes,Partly,No}}
Emotion: {{select: emotion; options=Calm,Confident,Anxious,FOMO,Revenge,Bored}}
What went well: {{textarea: good; rows=2}}
Mistake: {{textarea: mistake; rows=2}}
Lesson: {{text: lesson; required}}
Screenshot: {{text: chart; label=Chart link (optional)}}`
  },
  {
    id: "lib-disclaimer",
    name: "Risk disclaimer",
    category: "Risk & journal",
    shortcut: "/nfa",
    contentType: "text",
    description: "Standard trading disclaimer.",
    content: `⚠️ *Disclaimer*
All content shared here is for educational purposes only and is not financial advice. Trading forex, gold and CFDs carries a high level of risk and may not be suitable for everyone. Never risk money you cannot afford to lose. Past performance does not guarantee future results.`
  },
  {
    id: "lib-tip",
    name: "Trading tip of the day",
    category: "Risk & journal",
    shortcut: "/tip",
    contentType: "text",
    description: "Educational post for your channel.",
    content: `💡 *Trading tip #{{number: n; label=Tip number; default=1}}* — {{text: title; required; placeholder=Wait for the candle close}}

{{textarea: body; required; rows=4}}

{{select: cta; options=Save this for later 📌,Share with a trader friend 🤝,Questions? Reply below 👇}}`
  },
  // ───────────────────────── VIP channel
  {
    id: "lib-vip-welcome",
    name: "Welcome new VIP member",
    category: "VIP channel",
    shortcut: "/welcome",
    contentType: "text",
    description: "Onboarding message with plan and automatic expiry date.",
    content: `🎉 Welcome to *{{text: group; label=Group name; default=Gold VIP}}*, {{text: name; required}}!

✅ Plan: *{{select: plan; options=1 Month,3 Months,6 Months,12 Months; default=1 Month}}*
📅 Valid until: *{{= formatdate(addmonths(today(), number(left(plan, 2))), "D MMMM YYYY")}}*

What you get:
• Daily gold analysis & signals with entry, SL and TPs
• Live trade management updates
• Weekly & monthly performance reports

📌 Please read the pinned rules and set notifications to *All*.
Let's grow together 💪`
  },
  {
    id: "lib-vip-pay",
    name: "VIP subscription — payment details",
    category: "VIP channel",
    shortcut: "/vippay",
    contentType: "text",
    description: "Price, discount and payment instructions.",
    content: `💎 *{{text: group; label=Group name; default=Gold VIP}} — Subscription*

Plan: *{{select: plan; options=1 Month,3 Months,6 Months,12 Months}}*
Price: {{currency: price; required; min=0}}{{number: disc; label=Discount % (optional); default=0; min=0; max=90; hidden}}{{if: disc > 0}} → *{{= discount(price, disc); format=currency}}* ({{disc}}% off 🔥){{endif}}

*How to pay*
{{textarea: methods; label=Payment details (UPI / bank / USDT); required; rows=3; placeholder=UPI: yourname@bank
USDT (TRC20): …}}

After paying, send the screenshot here and you'll be added within {{select: eta; options=30 minutes,1 hour,a few hours}}. ✅`
  },
  {
    id: "lib-vip-renew",
    name: "Subscription renewal reminder",
    category: "VIP channel",
    shortcut: "/renew",
    contentType: "text",
    description: "Days-left countdown computed from the expiry date.",
    content: `⏰ Hi {{name}}, your *{{text: group; label=Group name; default=Gold VIP}}* membership {{date: expiry; label=Expiry date; default=+3d; hidden}}{{if: datediff(today(), expiry) > 0}}expires in *{{= datediff(today(), expiry)}} day(s)* — on {{= formatdate(expiry, "dddd, D MMM")}}{{elseif: datediff(today(), expiry) = 0}}expires *today*{{else}}expired on {{= formatdate(expiry, "D MMM")}}{{endif}}.

Renew now to keep receiving signals without interruption:
Renewal price: {{currency: price; required}}
{{text: pay; label=Payment details; default=Same UPI / bank as before}}

Thank you for being part of the community 🙏`
  },
  {
    id: "lib-vip-expired",
    name: "Membership expired",
    category: "VIP channel",
    shortcut: "/expired",
    contentType: "text",
    description: "Polite removal notice with re-join offer.",
    content: `Hi {{name}}, your VIP membership ended on {{date: ended; default=today; format=D MMM YYYY}}, so access has been paused.

Rejoin any time — {{select: offer; options=renew within 48 hours and get 10% off 🎁,the same price applies,reply here and I'll share the payment details}}.
Hope to see you back soon! 🙏`
  },
  {
    id: "lib-vip-access",
    name: "Payment received — access granted",
    category: "VIP channel",
    shortcut: "/access",
    contentType: "text",
    description: "Confirms payment and shares the joining link.",
    content: `✅ Payment of {{currency: amount; required}} received — thank you, {{name}}!

Your *{{select: plan; options=1 Month,3 Months,6 Months,12 Months}}* access is active until *{{= formatdate(addmonths(today(), number(left(plan, 2))), "D MMM YYYY")}}*.
Join here: {{text: link; label=Group invite link; required; pattern=url}}

Please don't share the link — it's personal. Welcome aboard 🚀`
  },
  {
    id: "lib-vip-promo",
    name: "Promo / offer announcement",
    category: "VIP channel",
    shortcut: "/promo",
    contentType: "text",
    description: "Limited-time offer with discounted price and deadline.",
    content: `🔥 *{{text: title; label=Offer name; default=Limited-time VIP offer}}* 🔥

{{select: plan; options=1 Month,3 Months,6 Months,12 Months}} VIP access: ~{{currency: price; required}}~ → *{{= discount(price, disc); format=currency}}*
That's *{{number: disc; label=Discount %; required; min=1; max=90}}% OFF* 🎁

⏳ Offer ends *{{date: ends; default=+3d; format=dddd, D MMM}}* — only {{number: seats; label=Seats available; default=20}} seats.
DM "{{text: keyword; default=VIP}}" to grab it 👇`
  },
  {
    id: "lib-vip-rules",
    name: "Group rules",
    category: "VIP channel",
    shortcut: "/rules",
    contentType: "text",
    description: "Pinned rules for a signals group.",
    content: `📌 *{{text: group; label=Group name; default=Gold VIP}} — Rules*

1️⃣ Always use a stop loss and risk max {{number: max_risk; label=Max risk %; default=2}}% per trade.
2️⃣ Signals are posted with entry, SL and TP — don't enter late if price has moved more than {{number: late_pips; label=Late-entry limit (pips); default=30}} pips.
3️⃣ Follow trade-management updates (BE, partials, closes).
4️⃣ No spam, links or promotions.
5️⃣ Respect all members — no rude language.
6️⃣ Membership is personal — sharing content leads to removal without refund.

Questions? Contact {{text: admin; label=Admin contact; default=@admin}}. Happy trading 📈`
  },
  {
    id: "lib-vip-howjoin",
    name: "“How do I join?” reply",
    category: "VIP channel",
    shortcut: "/howjoin",
    contentType: "text",
    description: "Answer to people asking how to join.",
    content: `Hi {{name}} 👋 Thanks for your interest!

Here's how to join *{{text: group; label=Group name; default=Gold VIP}}*:
1. Choose a plan — {{text: plans; label=Plans & prices; default=1 month / 3 months / 12 months}}
2. Pay via {{text: methods; label=Payment methods; default=UPI, bank transfer or USDT}}
3. Send the payment screenshot here
4. Get your personal invite link ✅

{{checkbox: free; label=Mention free channel; default=yes; hidden}}{{if: free}}Want to see our work first? Free channel: {{text: free_link; label=Free channel link}}
{{endif}}Any questions, just ask 🙂`
  },
  {
    id: "lib-broker",
    name: "Broker account opening steps",
    category: "VIP channel",
    shortcut: "/broker",
    contentType: "text",
    description: "Referral / account opening instructions.",
    content: `🏦 *Open your trading account with {{text: broker; required}}*

1. Register here: {{text: link; label=Referral link; required; pattern=url}}
2. Complete verification (ID + address proof)
3. Choose account type: *{{select: acct; options=Standard,Raw/ECN,Cent,Pro}}*
4. Deposit at least {{currency: min_dep; label=Minimum deposit; default=100}}
5. Send me your account ID: {{text: idnote; label=What to send; default=your MT5 login number}}

{{text: bonus; label=Bonus / benefit (optional); hidden}}{{if: bonus}}🎁 Benefit: {{bonus}}
{{endif}}${St}`
  },
  // ───────────────────────── Payments & business
  {
    id: "lib-emi",
    name: "Instalment plan (EMI schedule)",
    category: "Payments",
    shortcut: "/emi",
    contentType: "text",
    description: "Splits a total into monthly instalments with due dates.",
    content: `Dear {{name}},

As discussed, your total of {{currency: total; required; min=1}} will be paid in *{{number: months; label=Number of instalments; default=3; min=1; max=24}} monthly instalments* of {{= total / months; format=currency}}:

{{date: first_due; label=First due date; default=+7d; hidden}}{{repeat: schedule; count=months}}{{index}}. {{= formatdate(addmonths(first_due, index - 1), "D MMM YYYY")}} — {{= total / months; format=currency}}
{{endrepeat}}
Kindly pay on or before each date. Thank you!
{{me.name}}`
  },
  {
    id: "lib-bank",
    name: "Share payment details",
    category: "Payments",
    shortcut: "/bank",
    contentType: "text",
    description: "Bank / UPI details with amount and reference.",
    content: `Please make the payment of *{{currency: amount; required}}* using:

{{select: method; options=UPI,Bank transfer,USDT (crypto),Card link}}{{if: method = "UPI"}}
UPI ID: *{{text: upi; label=UPI ID; default=yourname@bank}}*{{elseif: method = "Bank transfer"}}
Bank: {{text: bank_name; label=Bank name}}
A/C name: {{text: acct_name; label=Account name}}
A/C no: {{text: acct_no; label=Account number}}
IFSC/SWIFT: {{text: ifsc; label=IFSC / SWIFT}}{{elseif: method = "USDT (crypto)"}}
USDT address ({{select: network; options=TRC20,ERC20,BEP20}}): {{text: wallet; label=Wallet address}}{{else}}
Pay here: {{text: card_link; label=Payment link}}{{endif}}

Reference: *{{text: ref; label=Reference / invoice no.; required}}*
Please share the screenshot once done. Thank you! 🙏`
  },
  {
    id: "lib-payment-followup",
    name: "Payment follow-up (2nd reminder)",
    category: "Payments",
    shortcut: "/payfup",
    contentType: "text",
    description: "Firmer reminder with days overdue computed.",
    content: `Hi {{name}},

Following up on the payment of *{{currency: amount; required}}* that was due on {{date: due; label=Original due date; default=-5d; format=D MMM YYYY}}{{if: datediff(due, today()) > 0}} — now *{{= datediff(due, today())}} day(s) overdue*{{endif}}.

Please clear it by {{date: final; label=New deadline; default=+2d; format=dddd, D MMM}}{{checkbox: late_fee; label=Mention late fee; hidden}}{{if: late_fee}} to avoid a late fee of {{currency: fee; label=Late fee}}{{endif}}. If already paid, kindly share the receipt.

Thank you,
{{me.name}}`
  },
  {
    id: "lib-shortly",
    name: "Quick reply: will get back shortly",
    category: "Customer support",
    shortcut: "/shortly",
    contentType: "text",
    description: "Holding reply with ETA.",
    content: "Hi {{name}}, thanks for your message! I'm checking this and will get back to you within {{select: eta; options=15 minutes,1 hour,a few hours,today,24 hours}}. 🙏"
  },
  {
    id: "lib-screenshot",
    name: "Quick reply: please share a screenshot",
    category: "Customer support",
    shortcut: "/sshot",
    contentType: "text",
    description: "Ask for screenshot / details to resolve an issue.",
    content: "Hi {{name}}, could you please share {{select: what; options=a screenshot of the issue,your payment screenshot,your account ID,the error message}}? That will help me sort this out quickly. Thank you!"
  },
  {
    id: "lib-order-status",
    name: "Order / request status update",
    category: "Customer support",
    shortcut: "/status",
    contentType: "text",
    description: "Status with stage and expected date.",
    content: `Hi {{name}}, update on your {{select: kind; options=order,request,application,refund}} *#{{text: ref; label=Reference no.; required}}*:

Status: *{{select: status; options=Received ✅,In progress ⏳,Shipped 🚚,Completed 🎉,On hold ⚠️}}*
Expected by: {{date: eta; default=+2bd; format=ddd, D MMM}}
{{text: note; label=Note (optional); hidden}}{{if: note}}Note: {{note}}
{{endif}}
Thanks for your patience!`
  },
  // ───────────────────────── College / admissions administration
  {
    id: "lib-fee-receipt",
    name: "Fee receipt confirmation",
    category: "College administration",
    shortcut: "/receipt",
    contentType: "text",
    description: "Receipt with balance due computed.",
    content: `🧾 *Fee receipt — {{me.company}}*
Receipt no: {{text: receipt; required}}   Date: {{today; format=DD/MM/YYYY}}

Student: {{student}}   Class/Course: {{text: course; required}}
Amount received: *{{currency: paid; required}}* via {{select: mode; options=Cash,UPI,Bank transfer,Cheque,Card}}
{{currency: total; label=Total fee for the term; hidden}}{{if: total > paid}}Balance due: *{{= total - paid; format=currency}}* by {{date: due; default=+30d; format=D MMM YYYY}}{{else}}Fees fully paid ✅{{endif}}

Thank you.
Accounts Office`
  },
  {
    id: "lib-exam-notice",
    name: "Exam timetable notice",
    category: "College administration",
    shortcut: "/exam",
    contentType: "text",
    description: "Exam schedule table built from rows.",
    content: `*{{select: exam; options=Mid-term,Final,Unit test,Practical,Internal}} Examination — {{text: course; label=Class / course; required}}*

{{repeat: papers; label=Paper; min=1}}{{date: on; label=Date; default=+7d; hidden}}{{text: subject; hidden}}{{text: timing; label=Time; default=10:00 – 13:00; hidden}}{{endrepeat}}{{table: papers; columns=Date:formatdate(on, "ddd D MMM")|Subject:subject|Time:timing}}

Report 30 minutes early with your ID card and admit card.
{{me.title}}, {{me.company}}`
  },
  {
    id: "lib-ptm",
    name: "Parent-teacher meeting invitation",
    category: "College administration",
    shortcut: "/ptm",
    contentType: "text",
    description: "PTM invite with date, time and venue.",
    content: `Dear Parent,

You are invited to the Parent-Teacher Meeting for *{{text: class; label=Class; required}}* on *{{date: on; default=+7d; format=dddd, D MMMM}}* from {{time: from; default=10:00}} to {{time: to; default=13:00}} at {{text: venue; default=the school auditorium}}.

{{checkbox: report; label=Report cards will be shared; default=yes; hidden}}{{if: report}}Report cards will be shared during the meeting. {{endif}}Your presence is important.

Regards,
{{me.name}}, {{me.company}}`
  },
  {
    id: "lib-holiday",
    name: "Holiday notice",
    category: "College administration",
    shortcut: "/holiday",
    contentType: "text",
    description: "Holiday announcement with reopening date.",
    content: `📢 *Holiday Notice*

The {{select: inst; options=college,school,office,institute}} will remain closed from *{{date: from; default=+1d; format=D MMM}}* to *{{date: to; default=+2d; format=D MMM YYYY}}* ({{= datediff(from, to) + 1}} day(s)) on account of {{text: reason; required; placeholder=Diwali}}.
Classes resume on *{{= formatdate(addbusinessdays(to, 1), "dddd, D MMM")}}*.

{{me.company}}`
  },
  {
    id: "lib-result",
    name: "Result announcement",
    category: "College administration",
    shortcut: "/result",
    contentType: "text",
    description: "Individual result with percentage and grade.",
    content: `Dear {{student}},

Your {{text: exam; default=final examination}} result: *{{number: marks; required; min=0}} / {{number: max_marks; label=Out of; default=500; min=1}}* = *{{= round(percent(marks, max_marks), 1)}}%*
Grade: *{{= choose(true, percent(marks, max_marks) >= 90, "A+", percent(marks, max_marks) >= 75, "A", percent(marks, max_marks) >= 60, "B", percent(marks, max_marks) >= 45, "C", percent(marks, max_marks) >= 33, "D", "Needs improvement")}}*

{{= percent(marks, max_marks) >= 33 ? "Congratulations! 🎉" : "Please meet your class teacher to plan improvement."}}
{{me.company}}`
  },
  {
    id: "lib-docs",
    name: "Document submission reminder",
    category: "Admissions",
    shortcut: "/docs",
    contentType: "text",
    description: "List of pending documents with deadline.",
    content: `Dear {{applicant}},

To complete your admission for {{text: course; required}}, please submit the following by *{{date: by; default=+5d; format=dddd, D MMM}}*:
{{repeat: docs; label=Document; min=1}}  ☐ {{text: doc; default=Photocopy of Aadhaar}}
{{endrepeat}}
Submit at the admission office ({{text: hours; label=Office hours; default=10 am – 4 pm, Mon–Sat}}) or reply here with scans.

Admissions Office, {{me.company}}`
  },
  {
    id: "lib-admit-confirm",
    name: "Admission confirmed + fee breakdown",
    category: "Admissions",
    shortcut: "/admit",
    contentType: "text",
    description: "Confirmation with itemised fee table and total.",
    content: `🎓 Dear {{applicant}}, your admission to *{{text: course; required}}* ({{text: session; default=2025-26}}) is confirmed!

Fee details:
{{repeat: fees; label=Fee item; min=1}}{{text: item; default=Tuition fee; hidden}}{{currency: amount; hidden}}{{endrepeat}}{{table: fees; columns=Item:item|Amount:amount; formats=|currency; total=Amount}}

Please pay by {{date: due; default=+7d; format=D MMM YYYY}} to secure your seat. Classes begin on {{date: start; label=Classes begin; default=+30d; format=D MMMM}}.

Welcome to {{me.company}}! 🎉`
  }
], xs = [
  {
    id: "lib-email-signature",
    name: "Email signature",
    category: "Professional email",
    shortcut: "/sig",
    contentType: "text",
    description: "Your signature from Settings → Profile.",
    content: "{{me.signature}}"
  },
  {
    id: "lib-email-intro",
    name: "Professional introduction",
    category: "Professional email",
    shortcut: "/intro",
    contentType: "text",
    description: "Introduce yourself to a new contact.",
    content: `Dear {{text: recipient; label=Recipient name; required}},

I hope this message finds you well. My name is {{me.name}}, {{me.title}} at {{me.company}}. I am reaching out regarding {{textarea: purpose; label=Purpose of the email; required}}.

I would welcome the opportunity to discuss this further at your convenience.

Kind regards,
{{me.name}}`
  },
  {
    id: "lib-email-ooo",
    name: "Out of office reply",
    category: "Professional email",
    shortcut: "/ooo",
    contentType: "text",
    description: "Auto-reply with return date and backup contact.",
    content: `Thank you for your email. I am out of the office until {{date: back; label=Back on; default=+7d; format=dddd, D MMMM}} with limited access to email.
{{section: backup; label=Add a backup contact?; default=yes}}
For urgent matters, please contact {{text: backup_name; label=Backup name}} at {{text: backup_email; label=Backup email; pattern=email}}.
{{endsection}}
I will respond as soon as possible after my return.

Best regards,
{{me.name}}`
  },
  {
    id: "lib-email-thanks",
    name: "Thank-you note",
    category: "Professional email",
    shortcut: "/thx",
    contentType: "html",
    description: "Rich-text thank-you email.",
    content: "<p>Hi {{name}},</p><p>Thank you so much for {{text: reason; label=Thank them for; placeholder=your time yesterday}}. I <b>really</b> appreciate it.</p><p>Best,<br>{{me.name}}</p>"
  },
  {
    id: "lib-wa-greeting",
    name: "WhatsApp greeting",
    category: "WhatsApp",
    shortcut: "/hi",
    contentType: "text",
    description: "Time-aware friendly greeting.",
    content: "{{= greeting()}} {{name}}! 👋 Hope you are doing well."
  },
  {
    id: "lib-wa-order",
    name: "WhatsApp order confirmation",
    category: "WhatsApp",
    shortcut: "/order",
    contentType: "text",
    description: "Itemised order with automatic total.",
    content: `Hi {{customer}}, your order is confirmed ✅

{{repeat: items; label=Item}}{{text: item; required; hidden}}{{number: qty; default=1; min=1; hidden}}{{currency: price; label=Unit price; required; hidden}}• {{item}} × {{qty}} = {{= qty * price; format=currency}}
{{endrepeat}}
{{currency: delivery; label=Delivery charge; default=0; hidden}}*Total: {{= sum(items.qty * items.price) + delivery; format=currency}}*
Expected delivery: {{date: eta; label=Delivery date; default=+2bd; format=ddd, D MMM}}

Thank you for shopping with {{me.company}}!`
  },
  {
    id: "lib-pay-reminder",
    name: "Payment reminder",
    category: "Payments",
    shortcut: "/payment",
    contentType: "text",
    description: "Polite reminder with amount and deadline; tone changes when overdue.",
    content: `Dear {{name}},

{{toggle: overdue; label=Payment is already overdue?}}{{if: overdue}}This is a reminder that your payment of {{currency: amount; required; min=0}} for invoice {{text: invoice; label=Invoice #}} is now overdue. Kindly settle it by {{date: deadline; default=+3d}} to avoid any late fees.{{else}}Your payment of {{amount}} for invoice {{invoice}} is pending. Kindly complete it before {{deadline}}.{{endif}}

If you have already made the payment, please ignore this message.

Regards,
{{me.name}}
{{me.company}}`
  },
  {
    id: "lib-pay-receipt",
    name: "Payment received",
    category: "Payments",
    shortcut: "/paid",
    contentType: "text",
    description: "Acknowledge a payment with remaining balance.",
    content: `Hi {{name}}, we have received your payment of {{currency: paid; required}} on {{date: on; default=today}}. Thank you!
{{currency: total; label=Total invoice amount; hidden}}{{if: total > paid}}Remaining balance: {{= total - paid; format=currency}}.{{else}}Your account is fully settled. ✅{{endif}}`
  },
  {
    id: "lib-pay-invoice",
    name: "Invoice summary with tax",
    category: "Payments",
    shortcut: "/invoice",
    contentType: "text",
    description: "Line items, discount and tax with a dynamic table.",
    content: `Invoice for {{text: client; required}} — {{today; format=DD MMM YYYY}}

{{repeat: lines; label=Line item}}{{text: description; hidden}}{{number: qty; default=1; hidden}}{{currency: rate; hidden}}{{endrepeat}}{{table: lines; columns=Description:description|Qty:qty|Rate:rate|Amount:qty*rate; formats=||currency|currency}}

{{set: subtotal = sum(lines.qty * lines.rate)}}{{number: discount_pct; label=Discount %; default=0; min=0; max=100; hidden}}{{number: tax_pct; label=Tax %; default=18; hidden}}Subtotal: {{= subtotal; format=currency}}
{{if: discount_pct > 0}}Discount ({{discount_pct}}%): -{{= percentof(discount_pct, subtotal); format=currency}}
{{endif}}Tax ({{tax_pct}}%): {{= percentof(tax_pct, discount(subtotal, discount_pct)); format=currency}}
Total due: {{= addpercent(discount(subtotal, discount_pct), tax_pct); format=currency}}
Due date: {{date: due; default=+14d}}`
  },
  {
    id: "lib-support-ack",
    name: "Ticket acknowledgement",
    category: "Customer support",
    shortcut: "/ack",
    contentType: "text",
    description: "Acknowledge a support ticket with SLA by priority.",
    content: `Hi {{customer}},

Thank you for contacting {{me.company}} support. Your ticket #{{text: ticket; required}} has been created.
{{select: priority; options=Low,Normal,High,Urgent; default=Normal; hidden}}Priority: {{priority}} — we aim to respond within {{= choose(priority, "Urgent", "2 hours", "High", "8 hours", "Normal", "1 business day", "3 business days")}}.

Best regards,
{{me.name}}`
  },
  {
    id: "lib-support-refund",
    name: "Refund approved",
    category: "Customer support",
    shortcut: "/refund",
    contentType: "text",
    description: "Confirms a refund and expected timeline.",
    content: 'Hi {{customer}}, your refund of {{currency: amount; required}} has been approved. It should reach your {{select: method; options=original payment method,bank account,store credit}} within {{number: days; default=5}} business days (by {{= formatdate(addbusinessdays(today(), days), "D MMM")}}).'
  },
  {
    id: "lib-support-close",
    name: "Ticket closing",
    category: "Customer support",
    shortcut: "/close",
    contentType: "text",
    description: "Close a ticket and ask for feedback.",
    content: `Hi {{customer}}, I'm glad we could resolve this for you! I'll mark this ticket as solved. If anything else comes up, just reply to this message.{{checkbox: survey; label=Include survey link; default=yes; hidden}}{{if: survey}}

We'd love your feedback: {{link: https://example.com/survey; text=2-minute survey; plain=url}}{{endif}}

{{me.name}}`
  },
  {
    id: "lib-office-leave",
    name: "Leave request",
    category: "Office",
    shortcut: "/leave",
    contentType: "text",
    description: "Leave application with automatic day count.",
    content: `Dear {{text: manager; label=Manager name}},

I would like to request {{select: type; options=annual leave,sick leave,personal leave,work from home}} from {{date: from; default=+1d; format=ddd D MMM}} to {{date: to; default=+2d; format=ddd D MMM YYYY}} ({{= datediff(from, to) + 1}} day(s)).

Reason: {{textarea: reason; required}}

{{checkbox: handover; label=Mention work handover; default=yes; hidden}}{{if: handover}}I will ensure my pending tasks are handed over to {{text: colleague}} before I leave.
{{endif}}
Thank you,
{{me.name}}`
  },
  {
    id: "lib-office-announce",
    name: "Team announcement",
    category: "Office",
    shortcut: "/announce",
    contentType: "html",
    description: "Formatted internal announcement.",
    content: "<p><b>📢 {{text: title; required}}</b></p><p>Hello team,</p><p>{{textarea: body; required}}</p><p><b>When:</b> {{datetime: when; default=+1d}}<br><b>Where:</b> {{text: where; default=Main conference room}}</p><p>Thanks,<br>{{me.name}}</p>"
  },
  {
    id: "lib-college-notice",
    name: "Circular / notice",
    category: "College administration",
    shortcut: "/notice",
    contentType: "text",
    description: "Official circular for students or staff.",
    content: `NOTICE
Ref: {{text: ref; label=Reference no.}}      Date: {{today; format=DD/MM/YYYY}}

To: {{select: audience; options=All students,All staff,Faculty members,Parents}}
Subject: {{text: subject; required}}

{{textarea: details; required; rows=5}}

{{me.name}}
{{me.title}}, {{me.company}}`
  },
  {
    id: "lib-college-fee",
    name: "Fee due reminder",
    category: "College administration",
    shortcut: "/fee",
    contentType: "text",
    description: "Fee reminder with late fine calculation.",
    content: `Dear Parent/Guardian of {{student}},

This is to remind you that the {{select: term; options=Term 1,Term 2,Annual}} fee of {{currency: fee; required}} is due on {{date: due; default=+10d}}.
{{number: fine_per_day; label=Late fine per day; default=50; hidden}}A late fine of {{= fine_per_day; format=currency}} per day applies after the due date.

Kindly ignore if already paid.
Accounts Office, {{me.company}}`
  },
  {
    id: "lib-admission-ack",
    name: "Admission enquiry reply",
    category: "Admissions",
    shortcut: "/enquiry",
    contentType: "text",
    description: "Respond to admission enquiries with program details.",
    content: `Dear {{applicant}},

Thank you for your interest in the {{select: program; options=B.Sc.,B.Com.,B.A.,BBA,BCA,M.Sc.,MBA; required}} program at {{me.company}}.

Applications for the {{text: session; default=2025-26}} session close on {{date: deadline; default=+30d}}. Documents required:
{{repeat: docs; label=Document; min=1}}  {{index}}. {{text: doc; default=Mark sheets}}
{{endrepeat}}
For any questions, call us at {{me.phone}}.

Admissions Office`
  },
  {
    id: "lib-admission-offer",
    name: "Admission offer",
    category: "Admissions",
    shortcut: "/offer",
    contentType: "text",
    description: "Offer letter with scholarship handling.",
    content: `Dear {{applicant}},

Congratulations! We are pleased to offer you admission to {{program}} for the {{session}} session.
{{section: scholarship; label=Scholarship awarded?}}You have also been awarded a scholarship of {{number: pct; label=Scholarship %; min=1; max=100}}%, reducing your tuition from {{currency: tuition}} to {{= discount(tuition, pct); format=currency}}.
{{endsection}}
Please confirm your acceptance by {{date: confirm_by; default=+14d}}.

Warm regards,
{{me.name}}, Admissions`
  },
  {
    id: "lib-attendance-absent",
    name: "Absence notification",
    category: "Attendance",
    shortcut: "/absent",
    contentType: "text",
    description: "Notify a parent about absence.",
    content: "Dear Parent, this is to inform you that {{student}} of class {{text: class}} was absent on {{date: on; default=today; format=dddd, D MMM}}{{text: periods; label=Periods missed (optional); hidden}}{{if: periods}} for {{periods}}{{endif}}. Kindly share the reason with the class teacher. — {{me.company}}"
  },
  {
    id: "lib-attendance-low",
    name: "Low attendance warning",
    category: "Attendance",
    shortcut: "/lowatt",
    contentType: "text",
    description: "Attendance percentage with shortfall calculation.",
    content: `Dear {{student}},

Your attendance is {{= percent(attended, total); format=number:1}}% ({{number: attended; required}} of {{number: total; label=Total classes; required; min=1}} classes).
{{number: required_pct; label=Required %; default=75; hidden}}{{if: percent(attended, total) < required_pct}}This is below the required {{required_pct}}%. You must attend the next {{= max(0, ceil((required_pct * total - 100 * attended) / (100 - required_pct)))}} classes without absence to reach the minimum.{{else}}You meet the required {{required_pct}}%. Keep it up!{{endif}}

{{me.name}}`
  },
  {
    id: "lib-trade-update",
    name: "Trading update",
    category: "Trading",
    shortcut: "/trade",
    contentType: "text",
    description: "Trade idea with risk/reward computed automatically.",
    content: `📈 {{select: side; options=BUY,SELL}} {{text: symbol; required; label=Symbol}}
Entry: {{number: entry; required}}
Stop loss: {{number: sl; label=Stop loss; required}}
Target: {{number: target; required}}
Risk/Reward: 1 : {{= round(abs(target - entry) / abs(entry - sl), 2)}}
{{textarea: notes; label=Notes (optional)}}
— {{now; format=DD MMM, HH:mm}}`
  },
  {
    id: "lib-trade-recap",
    name: "Daily trade recap",
    category: "Trading",
    shortcut: "/recap",
    contentType: "text",
    description: "P&L table and win-rate for the day.",
    content: `Trade recap — {{today; format=dddd, DD MMM YYYY}}

{{repeat: trades; label=Trade}}{{text: symbol; hidden}}{{number: pnl; label=P&L; hidden}}{{endrepeat}}{{table: trades; columns=#:index|Symbol:symbol|P&L:pnl; formats=||currency; total=P&L}}

Trades: {{= count(trades.symbol)}} | Winners: {{= countif(trades.pnl, ">", 0)}} | Win rate: {{= percent(countif(trades.pnl, ">", 0), count(trades.symbol)); format=number:0}}% | Net: {{= sum(trades.pnl); format=currency}}
Lesson of the day: {{textarea: lesson}}`
  },
  {
    id: "lib-social-launch",
    name: "Product launch post",
    category: "Social media",
    shortcut: "/launch",
    contentType: "text",
    description: "Launch announcement with hashtags.",
    content: `🚀 Big news! {{text: product; required}} is {{select: status; options=now live,coming soon,back in stock}}!

{{textarea: pitch; label=One-line pitch; required; maxlength=200}}

👉 {{text: url; label=Link; pattern=url}}
{{= join(split(hashtags, ","), " ")}}{{text: hashtags; default=#launch,#newproduct; hidden}}`
  },
  {
    id: "lib-social-event",
    name: "Event countdown post",
    category: "Social media",
    shortcut: "/event",
    contentType: "text",
    description: "Countdown that computes days remaining.",
    content: "⏳ Only {{= datediff(today(), date_of_event)}} days to go until {{text: event; required}}! Join us on {{date: date_of_event; label=Event date; default=+10d; format=dddd, D MMMM}}. {{text: cta; default=Register now!}}"
  },
  {
    id: "lib-meeting-notes",
    name: "Meeting notes",
    category: "Meetings",
    shortcut: "/notes",
    contentType: "text",
    description: "Structured notes with attendees and action items.",
    content: `Meeting notes — {{text: topic; required}}
Date: {{today; format=DD MMM YYYY}}   Attendees: {{text: attendees}}

Discussion:
{{textarea: discussion; rows=4}}

Action items:
{{repeat: actions; label=Action item}}☐ {{text: task}} — owner: {{text: owner}}, due {{date: due; default=+7d; format=D MMM}}
{{endrepeat}}
Next meeting: {{date: next; default=+7d; format=dddd D MMM}}`
  },
  {
    id: "lib-meeting-invite",
    name: "Meeting request",
    category: "Meetings",
    shortcut: "/meet",
    contentType: "text",
    description: "Request a meeting with time-slot options.",
    content: `Hi {{name}},

Would you be available for a {{select: length; options=15-minute,30-minute,45-minute,1-hour; default=30-minute}} {{select: medium; options=call,video meeting,in-person meeting}} to discuss {{text: topic; required}}? Any of these times work for me:
{{repeat: slots; label=Time slot; min=2}}• {{datetime: slot; default=+1d}}
{{endrepeat}}
Thanks,
{{me.name}}`
  },
  {
    id: "lib-followup-gentle",
    name: "Gentle follow-up",
    category: "Follow-up",
    shortcut: "/fup",
    contentType: "text",
    description: "Follow-up that adapts to how long ago you wrote.",
    content: `Hi {{name}},

{{date: sent; label=When did you last write?; default=-7d; hidden}}{{if: datediff(sent, today()) > 14}}It's been a while since my message on {{= formatdate(sent, "D MMMM")}}, so I wanted to check back in{{else}}Just following up on my previous email{{endif}} about {{text: topic; required}}. Please let me know if you need anything else from my side.

Best,
{{me.name}}`
  },
  {
    id: "lib-followup-sales",
    name: "Post-demo follow-up",
    category: "Follow-up",
    shortcut: "/demo",
    contentType: "text",
    description: "Sales follow-up after a product demo.",
    content: `Hi {{name}},

Thanks again for joining the demo of {{text: product; default=our platform}} {{select: when; options=today,yesterday,last week}}. As promised, here's a quick summary:
{{repeat: points; label=Key point}}  ✔ {{text: point}}
{{endrepeat}}
Would {{date: next; default=+3bd; format=dddd}} work for a quick call to discuss next steps?

{{me.name}} | {{me.phone}}`
  },
  {
    id: "lib-proposal",
    name: "Business proposal summary",
    category: "Sales & proposals",
    shortcut: "/proposal",
    contentType: "html",
    description: "Rich proposal with pricing table.",
    content: '<h3>Proposal for {{text: client; required}}</h3><p>Prepared by {{me.name}}, {{me.company}} — {{today}}</p><p><b>Objective:</b> {{textarea: objective; required}}</p><p><b>Scope &amp; pricing</b></p>{{repeat: items; label=Deliverable}}{{text: deliverable; hidden}}{{currency: price; hidden}}{{endrepeat}}{{table: items; columns=Deliverable:deliverable|Price:price; formats=|currency; total=Price}}<p><b>Timeline:</b> {{number: weeks; default=4}} weeks (estimated completion {{= formatdate(addweeks(today(), weeks), "D MMMM YYYY")}}).</p><p>This proposal is valid until {{date: valid; default=+30d}}.</p>'
  },
  {
    id: "lib-quote",
    name: "Price quote",
    category: "Sales & proposals",
    shortcut: "/quote",
    contentType: "text",
    description: "Quote with volume discount rule.",
    content: `Hi {{name}}, thank you for your enquiry. For {{number: units; required; min=1}} units of {{text: product; required}} at {{currency: unit_price; required}} each:
{{set: gross = units * unit_price}}{{set: pct = if(units >= 100, 15, if(units >= 50, 10, if(units >= 10, 5, 0)))}}
Subtotal: {{= gross; format=currency}}
{{if: pct > 0}}Volume discount ({{= pct}}%): -{{= percentof(pct, gross); format=currency}}
{{endif}}Total: {{= discount(gross, pct); format=currency}}
This quote is valid for {{number: valid_days; default=15; hidden}}{{valid_days}} days (until {{= formatdate(adddays(today(), valid_days), "D MMM YYYY")}}).`
  },
  {
    id: "lib-personal-birthday",
    name: "Birthday wishes",
    category: "Personal",
    shortcut: "/bday",
    contentType: "text",
    description: "Warm birthday message.",
    content: "Happy birthday, {{name}}! 🎉{{number: age; label=Age (optional); hidden}}{{if: age}} {{age}} looks great on you!{{endif}} Wishing you a year full of joy, health and success. {{select: closing; options=Have an amazing day!,Enjoy your special day!,Cheers to you!}}"
  },
  {
    id: "lib-personal-running-late",
    name: "Running late",
    category: "Personal",
    shortcut: "/late",
    contentType: "text",
    description: "Tells someone your new arrival time.",
    content: `Sorry, I'm running about {{number: mins; label=Minutes late; default=15}} minutes late — I should be there around {{= formatdate(addminutes(now(), mins), "h:mm A")}}.`
  },
  {
    id: "lib-personal-address",
    name: "My contact card",
    category: "Personal",
    shortcut: "/contact",
    contentType: "text",
    description: "Share your contact details.",
    content: `{{me.name}}
{{me.title}}, {{me.company}}
📞 {{me.phone}}  ✉ {{me.email}}
{{me.website}}`
  },
  {
    id: "lib-datahub-customer",
    name: "Customer details from Data Hub",
    category: "Customer support",
    shortcut: "/cust",
    contentType: "text",
    description: 'Pick a customer from the Data Hub "customers" table.',
    content: `Hi {{pick: customer; table=customers; display=name}},

We have the following details on file:
Email: {{customer.email}}
Phone: {{customer.phone}}
Plan: {{customer.plan}}

Please reply if anything needs to be updated.
{{me.name}}`
  }
], ji = [...xs, ...bs], U = "ws_college", Y = "ws_trading", Ve = "ws_general", Je = () => Date.now(), ra = { stepDelayMs: 150, retries: 1, retryDelayMs: 800, timeoutMs: 1e4, onError: "stop", speed: 1 };
function ws() {
  const e = Je();
  return [
    {
      id: U,
      name: "College Administration",
      kind: "college",
      color: "#2563eb",
      icon: "GraduationCap",
      expansionActive: !0,
      description: "Dr M.A. Aziz Jr College of Science, Phulambri — UDISE+, FYJC/CAP admissions, HSC exam forms, student & staff records, letters and certificates.",
      domains: ["udiseplus.gov.in", "11thadmission.org.in", "mahahsscboard.in", "shikshadesk.com"],
      officialDomains: ["udiseplus.gov.in", "11thadmission.org.in", "mahahsscboard.in", "gov.in", "nic.in"],
      createdAt: e,
      updatedAt: e
    },
    {
      id: Y,
      name: "Trading & Business",
      kind: "trading",
      color: "#059669",
      icon: "CandlestickChart",
      expansionActive: !0,
      description: "Mr K Technical Levels — XAUUSD signals, trade journal, risk & lot-size calculations, Telegram/WhatsApp community messages and reports. Assists with reporting only; it never places trades.",
      domains: ["tradingview.com", "web.telegram.org", "web.whatsapp.com"],
      officialDomains: [],
      createdAt: e,
      updatedAt: e
    },
    {
      id: Ve,
      name: "General Productivity",
      kind: "general",
      color: "#7c3aed",
      icon: "Sparkles",
      expansionActive: !0,
      description: "Personal autofill, email templates, text expansion, browser macros and spreadsheet-driven workflows for any website.",
      domains: [],
      officialDomains: [],
      createdAt: e,
      updatedAt: e
    }
  ];
}
const C = (e, t, a = "text", i) => ({ id: "col_" + t, name: e, key: t, type: a, options: i });
function Mt(e, t, a, i, r, s, n = {}) {
  const u = Je();
  return { id: e, name: a, key: i, description: r, columns: s, rows: [], workspaceId: t, source: { kind: "manual" }, createdAt: u, updatedAt: u, currentRowId: null, ...n };
}
function q(e, t, a, i, r, s = {}) {
  const n = Je();
  return { id: e, workspaceId: t, name: a, kind: i, value: r, createdAt: n, updatedAt: n, ...s };
}
let Et = 0;
function B(e, t, a, i = "fill", r = {}) {
  return Et++, {
    id: `rul_preset_${Et}`,
    enabled: !0,
    label: e,
    action: i,
    value: a,
    overwrite: "always",
    fieldKind: "auto",
    target: { by: "label", value: e, fallbacks: [{ by: "regex", value: t }] },
    ...r
  };
}
function He(e, t, a, i, r, s = {}) {
  const n = Je();
  return { id: e, workspaceId: t, name: a, enabled: !0, sites: i.map((u) => ({ kind: "domain", value: u })), rules: r, datasetId: null, runMode: "manual", tags: [], fieldDelayMs: 60, createdAt: n, updatedAt: n, ...s };
}
const vs = [
  C("GR No", "gr_no"),
  C("Student Name", "student_name"),
  C("First Name", "first_name"),
  C("Middle Name", "middle_name"),
  C("Last Name", "last_name"),
  C("Mother's Name", "mother_name"),
  C("Father's Name", "father_name"),
  C("Gender", "gender", "category", ["Male", "Female", "Transgender"]),
  C("Date of Birth", "student_dob", "date"),
  C("Category", "category", "category", ["OPEN", "SC", "ST", "VJ/DT(A)", "NT(B)", "NT(C)", "NT(D)", "OBC", "SBC", "EWS"]),
  C("Religion", "religion"),
  C("Caste", "caste"),
  C("Mother Tongue", "mother_tongue"),
  C("Aadhaar No", "aadhaar_no"),
  C("Mobile", "mobile", "phone"),
  C("Email", "email", "email"),
  C("Address", "address"),
  C("Taluka", "taluka"),
  C("District", "district"),
  C("Pincode", "pincode"),
  C("Class", "class", "category", ["11th", "12th"]),
  C("Stream", "stream", "category", ["Science"]),
  C("Division", "division"),
  C("Admission Date", "admission_date", "date"),
  C("Application ID", "application_id"),
  C("SSC Seat No", "ssc_seat_no"),
  C("SSC Marks %", "ssc_percent", "number"),
  C("Blood Group", "blood_group"),
  C("PEN / UDISE Student ID", "pen_id")
], ks = (e) => [
  {
    id: "snp_col_bonafide",
    name: "Bonafide certificate text",
    shortcut: "/bonafide",
    contentType: "text",
    folderId: "fld_col_letters",
    workspaceId: U,
    content: `BONAFIDE CERTIFICATE

This is to certify that {{text: student; label=Student name; required}} is a bonafide student of {{college_name}}, studying in {{select: class; options=11th Science,12th Science; label=Class}} during the academic year {{academic_year}}. As per our General Register (GR No. {{text: gr; label=GR No}}), the date of birth is {{date: dob; format=DD/MM/YYYY; label=Date of birth}}.

This certificate is issued on request for {{text: purpose; label=Purpose; default=scholarship purpose}}.

Date: {{today; format=DD/MM/YYYY}}
Place: {{college_place}}

Principal
{{college_name}}`,
    enabled: !0,
    favorite: !0,
    pinned: !1,
    tags: ["certificate"],
    trigger: "default",
    createdAt: e,
    updatedAt: e
  },
  {
    id: "snp_col_lc_request",
    name: "Leaving certificate – office note",
    shortcut: "/lcnote",
    contentType: "text",
    folderId: "fld_col_letters",
    workspaceId: U,
    content: `Office note — Leaving Certificate
Student: {{text: student; required}}
GR No: {{text: gr}}
Class: {{select: class; options=11th Science,12th Science}}
Reason for leaving: {{select: reason; options=Passed HSC,Transfer,Personal reasons,Other}}
Fees cleared: {{checkbox: fees; label=All fees cleared}}{{if: fees}} ✔{{else}} ✘ (pending){{endif}}
Prepared on {{today; format=DD/MM/YYYY}} by {{me.name}}`,
    enabled: !0,
    favorite: !1,
    pinned: !1,
    tags: ["certificate"],
    trigger: "default",
    createdAt: e,
    updatedAt: e
  },
  {
    id: "snp_col_letter",
    name: "Official letter (letterhead text)",
    shortcut: "/colletter",
    contentType: "text",
    folderId: "fld_col_letters",
    workspaceId: U,
    content: `{{college_name}}
{{college_place}}, Dist. {{college_district}}  ·  UDISE: {{udise_code}}

Outward No: {{text: outward; label=Outward No}}
Date: {{today; format=DD/MM/YYYY}}

To,
{{textarea: to; label=To (name & address); required}}

Subject: {{text: subject; required}}

Respected Sir/Madam,

{{textarea: body; label=Letter body; required}}

Thanking you,

Yours faithfully,

{{principal_name}}
Principal`,
    enabled: !0,
    favorite: !0,
    pinned: !0,
    tags: ["letter"],
    trigger: "default",
    createdAt: e,
    updatedAt: e
  },
  {
    id: "snp_col_staff",
    name: "Staff information summary",
    shortcut: "/staffinfo",
    contentType: "text",
    folderId: "fld_col_staff",
    workspaceId: U,
    content: `Staff: {{text: name; required}}
Designation: {{select: desig; options=Principal,Lecturer,Lab Assistant,Clerk,Peon,Librarian}}
Subject: {{text: subject}}
Date of joining: {{date: doj; format=DD/MM/YYYY}}
Qualification: {{text: qual}}
Mobile: {{text: mobile}}`,
    enabled: !0,
    favorite: !1,
    pinned: !1,
    tags: ["staff"],
    trigger: "default",
    createdAt: e,
    updatedAt: e
  },
  {
    id: "snp_col_admit_wa",
    name: "Admission reminder (WhatsApp)",
    shortcut: "/fyjcwa",
    contentType: "text",
    folderId: "fld_col_msgs",
    workspaceId: U,
    content: `Dear Parent,
{{student_name}}'s FYJC admission at {{college_name}} is pending. Please visit the college office before {{date: last; format=DD MMM YYYY; label=Last date}} with the original documents (SSC marksheet, LC, Aadhaar, 2 photos).
— College Office, {{college_place}}`,
    enabled: !0,
    favorite: !1,
    pinned: !1,
    tags: ["whatsapp"],
    trigger: "default",
    createdAt: e,
    updatedAt: e
  }
];
function _s() {
  const e = Je();
  Et = 1e3;
  const t = [
    { id: "fld_col_root", name: "College Administration", parentId: null, order: 10, color: "#2563eb", workspaceId: U, createdAt: e, updatedAt: e },
    { id: "fld_col_letters", name: "Letters & certificates", parentId: "fld_col_root", order: 0, color: "#2563eb", workspaceId: U, createdAt: e, updatedAt: e },
    { id: "fld_col_msgs", name: "Notices & messages", parentId: "fld_col_root", order: 1, color: "#2563eb", workspaceId: U, createdAt: e, updatedAt: e },
    { id: "fld_col_staff", name: "Staff", parentId: "fld_col_root", order: 2, color: "#2563eb", workspaceId: U, createdAt: e, updatedAt: e }
  ], a = [
    q("var_col_name", U, "college_name", "static", "Dr M.A. Aziz Jr College of Science, Phulambri", { label: "College name" }),
    q("var_col_place", U, "college_place", "static", "Phulambri", { label: "Place" }),
    q("var_col_dist", U, "college_district", "static", "Chhatrapati Sambhajinagar", { label: "District" }),
    q("var_col_udise", U, "udise_code", "static", "", { label: "College UDISE code", description: "Enter your 11-digit UDISE code" }),
    q("var_col_principal", U, "principal_name", "static", "", { label: "Principal name" }),
    q("var_col_ay", U, "academic_year", "formula", 'if(month(today()) >= 6, concat(year(today()), "-", right(text(year(today()) + 1), 2)), concat(year(today()) - 1, "-", right(text(year(today())), 2)))', { label: "Academic year (June–May)" }),
    q("var_col_date", U, "current_date", "date", "today", { format: "DD/MM/YYYY", label: "Today's date" }),
    q("var_col_fullname", U, "full_name_caps", "formula", 'upper(coalesce(student_name, concat(first_name, " ", middle_name, " ", last_name)))', { label: "Student name in CAPITALS (from dataset)" }),
    q("var_col_gender_short", U, "gender_code", "conditional", "", { label: "Gender code (M/F/T)", branches: [{ when: 'lower(gender) = "male"', then: "M" }, { when: 'lower(gender) = "female"', then: "F" }, { when: 'lower(gender) = "transgender"', then: "T" }] })
  ], i = [
    Mt("tbl_col_students", U, "Students (FYJC / 12th)", "students", "Import your student register (Excel/CSV/Google Sheets). Columns can be mapped on import.", vs, { keyColumn: "gr_no", requiredColumns: ["student_name", "student_dob", "gender"], sensitiveColumns: ["aadhaar_no", "mobile", "email", "student_dob", "address", "caste", "religion"] }),
    Mt("tbl_col_staff", U, "Staff", "staff", "Teaching and non-teaching staff", [C("Staff ID", "staff_id"), C("Name", "name"), C("Designation", "designation"), C("Subject", "subject"), C("Date of joining", "doj", "date"), C("Mobile", "mobile", "phone"), C("Email", "email", "email"), C("Aadhaar No", "aadhaar_no"), C("Qualification", "qualification")], { keyColumn: "staff_id", sensitiveColumns: ["mobile", "email", "aadhaar_no"] })
  ], r = () => [
    B("Student Name", "(student|candidate|applicant).*name|^name$|full ?name", "{{student_name}}"),
    B("Mother's Name", "mother", "{{mother_name}}"),
    B("Father's Name", "father|guardian", "{{father_name}}"),
    B("Gender", "gender|sex", "{{gender}}", "select"),
    B("Date of Birth", "birth|dob", "{{student_dob}}", "fill", { dateFormat: "DD/MM/YYYY" }),
    B("Category", "social.?category|caste.?category|^category", "{{category}}", "select"),
    B("Religion", "religion", "{{religion}}", "select"),
    B("Mother Tongue", "mother.?tongue", "{{mother_tongue}}", "select"),
    B("Aadhaar", "aadh?a?a?r|uid", "{{aadhaar_no}}", "fill", { sensitive: !0 }),
    B("Mobile Number", "mobile|contact|phone", "{{mobile}}"),
    B("Email", "e.?mail", "{{email}}"),
    B("Address", "address", "{{address}}"),
    B("Pincode", "pin.?code|postal", "{{pincode}}")
  ], s = [
    He("afp_udise_s02", U, "UDISE+ S02 – Student general profile", ["udiseplus.gov.in"], [...r(), B("PEN", "pen|student.?id", "{{pen_id}}")], { datasetId: "tbl_col_students", portal: "UDISE+", academicYear: "", starter: !0, description: "Starter mapping for the student general-profile section. Verify each field with the Field Selector on the live portal and save." }),
    He("afp_udise_s03", U, "UDISE+ S03 – Enrolment & schooling details", ["udiseplus.gov.in"], [
      B("Class", "class|grade|standard", "{{class}}", "select"),
      B("Stream", "stream|faculty", "{{stream}}", "select"),
      B("Section", "section|division", "{{division}}", "select"),
      B("Admission Number", "admission.?(no|number)|gr", "{{gr_no}}"),
      B("Date of Admission", "admission.?date|date.?of.?admission", "{{admission_date}}", "fill", { dateFormat: "DD/MM/YYYY" }),
      B("Previous class marks %", "percent|marks", "{{ssc_percent}}")
    ], { datasetId: "tbl_col_students", portal: "UDISE+", starter: !0, description: "Starter mapping for the enrolment section. Verify on the live portal." }),
    He("afp_fyjc", U, "FYJC Online Admission – Part 1 (student details)", ["11thadmission.org.in"], [...r(), B("SSC Seat No", "seat.?no|ssc.?seat", "{{ssc_seat_no}}")], { datasetId: "tbl_col_students", portal: "FYJC", starter: !0, description: "Fills the student-details page. Never submits — review and click Save/Submit yourself." }),
    He("afp_cap", U, "CAP round – college admission confirmation", ["11thadmission.org.in"], [
      B("Application ID", "application.?(id|no)|form.?no", "{{application_id}}"),
      B("Student Name", "(student|candidate).*name", "{{student_name}}"),
      B("Mobile Number", "mobile", "{{mobile}}")
    ], { datasetId: "tbl_col_students", portal: "FYJC CAP", starter: !0, description: "Looks up the allotted student on the college login. Confirmation buttons always require your approval." }),
    He("afp_hsc", U, "HSC examination form – student details", ["mahahsscboard.in"], [...r(), B("Stream", "stream|faculty", "{{stream}}", "select")], { datasetId: "tbl_col_students", portal: "HSC Board", starter: !0, description: "Exam-form student details. Payment / final submit steps are never automated." }),
    He("afp_shiksha_desk", U, "Shiksha Desk – student registration", ["shikshadesk.com"], r(), { datasetId: "tbl_col_students", portal: "Shiksha Desk", starter: !0, description: "Generic label-based mapping for the Shiksha Desk student registration form." })
  ], n = [
    {
      id: "mac_col_batch",
      workspaceId: U,
      name: "Batch: fill student form for every record",
      enabled: !0,
      sites: [],
      datasetId: "tbl_col_students",
      tags: ["batch"],
      description: "Fills the current page with the active student, waits for you to review & submit manually, then moves to the next student. Stops after the last record.",
      settings: { ...ra },
      steps: [
        { id: "m1", type: "label", value: "next_student" },
        { id: "m2", type: "autofill", refId: "afp_fyjc", note: "Fill student details (FYJC profile)" },
        { id: "m3", type: "confirm", value: "Review the form for {{student_name}}, submit it yourself, then press Continue for the next student." },
        { id: "m4", type: "nextRecord" },
        { id: "m5", type: "goto", value: "next_student", maxIterations: 500 }
      ],
      createdAt: e,
      updatedAt: e
    }
  ], u = [
    {
      id: "scr_col_fields",
      workspaceId: U,
      name: "List all form fields on this page",
      enabled: !0,
      sites: [],
      runMode: "manual",
      timeoutMs: 15e3,
      maxLoopIterations: 5e3,
      tags: ["diagnostics"],
      description: "Logs every detected field with its label, name and selector — useful when mapping a new portal.",
      code: "const fields = kf.fields();\nkf.log(`Found ${fields.length} fields on ${kf.title}`);\nfor (const f of fields) kf.log(`${f.kind.padEnd(10)} ${f.label || '(no label)'}  →  ${f.css}`);\nreturn fields.length;",
      createdAt: e,
      updatedAt: e
    }
  ], c = [...Ha(/* @__PURE__ */ new Set(["College administration", "Admissions", "Attendance", "Office"]), "fld_col_msgs", U, e), ...ks(e)];
  return { folders: t, snippets: c, variables: a, tables: i, profiles: s, macros: n, scripts: u };
}
function Ss() {
  const e = Je();
  Et = 2e3;
  const t = [
    { id: "fld_trd_root", name: "Mr K Technical Levels", parentId: null, order: 20, color: "#059669", workspaceId: Y, createdAt: e, updatedAt: e },
    { id: "fld_trd_signals", name: "Signals & trade management", parentId: "fld_trd_root", order: 0, color: "#059669", workspaceId: Y, createdAt: e, updatedAt: e },
    { id: "fld_trd_reports", name: "Reports & journal", parentId: "fld_trd_root", order: 1, color: "#059669", workspaceId: Y, createdAt: e, updatedAt: e },
    { id: "fld_trd_community", name: "Community (Telegram / WhatsApp)", parentId: "fld_trd_root", order: 2, color: "#059669", workspaceId: Y, createdAt: e, updatedAt: e }
  ], a = [
    q("var_trd_brand", Y, "brand_name", "static", "Mr K Technical Levels", { label: "Brand" }),
    q("var_trd_symbol", Y, "symbol", "static", "XAUUSD", { label: "Symbol" }),
    q("var_trd_balance", Y, "account_balance", "static", "1000", { label: "Account balance (USD)" }),
    q("var_trd_risk", Y, "risk_percent", "static", "1", { label: "Risk per trade (%)" }),
    q("var_trd_entry", Y, "trade_entry", "static", "0", { label: "Entry price (update per trade)" }),
    q("var_trd_sl", Y, "stop_loss", "static", "0", { label: "Stop loss price" }),
    q("var_trd_tp", Y, "take_profit", "static", "0", { label: "Take profit price" }),
    q("var_trd_risk_amt", Y, "risk_amount", "formula", "round(number(account_balance) * number(risk_percent) / 100, 2)", { label: "Risk amount (USD)" }),
    q("var_trd_pips", Y, "sl_pips", "formula", "round(abs(number(trade_entry) - number(stop_loss)) * 10, 1)", { label: "SL distance in pips (XAUUSD: 1 pip = 0.10)" }),
    q("var_trd_lot", Y, "lot_size", "formula", "if(number(sl_pips) > 0, round(number(risk_amount) / (number(sl_pips) * 10), 2), 0)", { label: "Lot size (pip value $10 per lot)" }),
    q("var_trd_rr", Y, "risk_reward", "formula", "if(abs(number(trade_entry) - number(stop_loss)) > 0, round(abs(number(take_profit) - number(trade_entry)) / abs(number(trade_entry) - number(stop_loss)), 2), 0)", { label: "Risk : reward" }),
    q("var_trd_week", Y, "week_range", "formula", 'concat(formatdate(shift(today(), "-6d"), "DD MMM"), " – ", formatdate(today(), "DD MMM YYYY"))', { label: "Last 7 days" }),
    q("var_trd_session", Y, "session_name", "conditional", "New York session", { label: "Current trading session (IST)", branches: [{ when: 'number(formatdate(now(), "H")) < 12', then: "Asian session" }, { when: 'number(formatdate(now(), "H")) < 18', then: "London session" }] })
  ], i = [
    Mt("tbl_trd_journal", Y, "Trade journal", "journal", "One row per trade. Import from your broker export or add rows as you trade.", [
      C("Trade ID", "trade_id"),
      C("Date", "date", "date"),
      C("Symbol", "symbol", "category", ["XAUUSD"]),
      C("Direction", "direction", "category", ["BUY", "SELL"]),
      C("Entry", "entry", "number"),
      C("Stop loss", "sl", "number"),
      C("Take profit", "tp", "number"),
      C("Lots", "lots", "number"),
      C("Result (pips)", "pips", "number"),
      C("P/L (USD)", "pnl", "number"),
      C("Status", "status", "category", ["Running", "TP hit", "SL hit", "Breakeven", "Closed"]),
      C("Notes", "notes")
    ], { keyColumn: "trade_id", requiredColumns: ["date", "direction", "entry", "sl"] }),
    Mt("tbl_trd_members", Y, "VIP members", "members", "Community subscribers (for renewal reminders).", [C("Member ID", "member_id"), C("Name", "name"), C("Telegram", "telegram"), C("WhatsApp", "whatsapp", "phone"), C("Plan", "plan", "category", ["Monthly", "Quarterly", "Yearly"]), C("Expiry", "expiry", "date")], { keyColumn: "member_id", sensitiveColumns: ["whatsapp"] })
  ], r = [
    He("afp_tv_alert", Y, "TradingView – price alert form", ["tradingview.com"], [
      B("Value", "value|price", "{{trade_entry}}"),
      B("Alert name", "alert.?name|name", "{{symbol}} entry {{trade_entry}}"),
      B("Message", "message", "{{symbol}} reached {{trade_entry}} — SL {{stop_loss}} / TP {{take_profit}} ({{brand_name}})")
    ], { starter: !0, description: "Fills the alert dialog with your current levels. It only prepares the alert text — K-Flow never places or modifies trades." })
  ], s = [
    {
      id: "scr_trd_risk",
      workspaceId: Y,
      name: "Risk / lot-size check",
      enabled: !0,
      sites: [],
      runMode: "manual",
      timeoutMs: 1e4,
      maxLoopIterations: 1e3,
      tags: ["risk"],
      description: "Computes lot size from balance, risk % and SL distance and logs the result (calculation only).",
      code: `const bal = Number(kf.vars.account_balance), risk = Number(kf.vars.risk_percent);
const entry = Number(kf.vars.trade_entry), sl = Number(kf.vars.stop_loss);
const pips = Math.abs(entry - sl) * 10;
kf.assert(pips > 0, 'Set trade_entry and stop_loss variables first');
const lots = Math.round((bal * risk / 100) / (pips * 10) * 100) / 100;
kf.log(\`Risk $\${(bal * risk / 100).toFixed(2)} over \${pips.toFixed(1)} pips → \${lots} lots\`);
kf.setVar('calc_lots', lots);
return lots;`,
      createdAt: e,
      updatedAt: e
    }
  ], n = [], l = Ha(/* @__PURE__ */ new Set(["Market analysis", "Trade signals", "Trade management", "Risk & journal", "VIP channel", "Payments", "Trading"]), "fld_trd_signals", Y, e).map((c) => {
    const d = ji.find((h) => c.source?.ref === h.id);
    return d && ["Risk & journal"].includes(d.category) ? { ...c, folderId: "fld_trd_reports" } : d && ["VIP channel", "Payments"].includes(d.category) ? { ...c, folderId: "fld_trd_community" } : c;
  });
  return l.push({
    id: "snp_trd_levels_vars",
    name: "Signal from my levels (variables)",
    shortcut: "/mysignal",
    contentType: "text",
    folderId: "fld_trd_signals",
    workspaceId: Y,
    content: `🟡 {{symbol}} — {{select: dir; options=BUY,SELL; label=Direction}} NOW

📍 Entry: {{trade_entry}}
🛑 SL: {{stop_loss}} ({{sl_pips}} pips)
🎯 TP: {{take_profit}}
⚖️ R:R 1:{{risk_reward}}
📦 Suggested lot ({{risk_percent}}% of \${{account_balance}}): {{lot_size}}

— {{brand_name}} · Not financial advice.`,
    enabled: !0,
    favorite: !0,
    pinned: !0,
    tags: ["signal"],
    trigger: "default",
    createdAt: e,
    updatedAt: e
  }), { folders: t, snippets: l, variables: a, tables: i, profiles: r, macros: n, scripts: s };
}
function Is() {
  const e = Je();
  Et = 3e3;
  const t = [
    { id: "fld_gen_root", name: "Personal & email", parentId: null, order: 30, color: "#7c3aed", workspaceId: Ve, createdAt: e, updatedAt: e }
  ], a = [
    q("var_gen_today", void 0, "today_long", "date", "today", { format: "dddd, D MMMM YYYY", label: "Today (long) — global" }),
    q("var_gen_ref", void 0, "ref_no", "random", "alnum:8", { label: "Random reference number — global" }),
    q("var_gen_greeting", void 0, "greeting_now", "formula", "greeting()", { label: "Good morning/afternoon/evening — global" })
  ], i = [
    He("afp_gen_contact", Ve, "Contact form (any site)", [], [
      B("Name", "^(full ?)?name$|your.?name", "{{me.name}}"),
      B("Email", "e.?mail", "{{me.email}}"),
      B("Phone", "phone|mobile", "{{me.phone}}"),
      B("Company", "company|organi[sz]ation", "{{me.company}}")
    ], { description: "Uses your profile (Settings → Profile). Works on most contact / sign-up forms." })
  ], r = [], s = [
    {
      id: "scr_gen_highlight_empty",
      workspaceId: Ve,
      name: "Highlight empty required fields",
      enabled: !0,
      sites: [],
      runMode: "manual",
      timeoutMs: 1e4,
      maxLoopIterations: 5e3,
      tags: ["validation"],
      description: "Outlines required fields that are still empty before you submit.",
      code: `let n = 0;
for (const el of kf.$$('input[required],select[required],textarea[required]')) {
  if (!String(el.value || '').trim()) { el.style.outline = '3px solid #dc2626'; n++; }
}
kf.log(\`\${n} required field(s) empty\`);
return n;`,
      createdAt: e,
      updatedAt: e
    }
  ], n = [
    Mt("tbl_gen_customers", Ve, "Customers", "customers", "Used by the /cust template — import or add your customers.", [C("Name", "name"), C("Email", "email", "email"), C("Phone", "phone", "phone"), C("Plan", "plan", "category", ["Basic", "Pro", "Enterprise"])], { sensitiveColumns: ["email", "phone"] })
  ], l = Ha(/* @__PURE__ */ new Set(["Professional email", "Personal", "WhatsApp", "Customer support", "Follow-up", "Meetings", "Sales & proposals", "Social media"]), "fld_gen_root", Ve, e);
  return { folders: t, snippets: l, variables: a, tables: n, profiles: i, macros: r, scripts: s };
}
function Ha(e, t, a, i) {
  return ji.filter((r) => e.has(r.category)).map((r) => ({
    id: "snp_" + r.id.replace(/^lib-/, "").replace(/-/g, "_"),
    name: r.name,
    shortcut: r.shortcut,
    content: r.content,
    contentType: r.contentType,
    folderId: t,
    enabled: !0,
    favorite: !1,
    pinned: !1,
    description: r.description,
    tags: [r.category.toLowerCase()],
    trigger: "default",
    source: { kind: "template", ref: r.id },
    workspaceId: a,
    createdAt: i,
    updatedAt: i
  }));
}
function Cs() {
  return { workspaces: ws(), college: _s(), trading: Ss(), general: Is() };
}
function As(e) {
  const t = (i) => !i || i.kind === "focused" ? void 0 : { by: i.kind === "label" ? "label" : "css", value: i.value }, a = e.steps.map((i) => {
    const r = { id: i.id, note: i.note, target: t(i.target) };
    switch (i.type) {
      case "focus":
        return { ...r, type: "focus" };
      case "type":
        return { ...r, type: "type", value: i.value, clear: i.clear !== !1 };
      case "tab":
        return { ...r, type: "key", value: i.value === "shift" ? "Shift+Tab" : "Tab", target: void 0 };
      case "select":
        return { ...r, type: "select", value: i.value };
      case "check":
        return { ...r, type: i.checked === !1 ? "uncheck" : "check" };
      case "click":
        return { ...r, type: "click" };
      case "key":
        return { ...r, type: "key", value: i.value };
      case "wait":
        return { ...r, type: "delay", ms: i.ms };
      case "waitFor":
        return { ...r, type: "waitFor", ms: i.ms };
      case "snippet":
        return { ...r, type: "snippet", refId: i.snippetId };
      case "confirm":
        return { ...r, type: "confirm", value: i.value };
    }
    return { ...r, type: "delay", ms: 0 };
  });
  return {
    id: "mac_" + e.id.replace(/^wf_/, ""),
    name: e.name,
    description: e.description,
    enabled: e.enabled,
    workspaceId: e.workspaceId || Ve,
    sites: e.siteFilter ? [{ kind: "domain", value: e.siteFilter }] : [],
    steps: a,
    settings: { ...ra },
    tags: ["migrated"],
    createdAt: e.createdAt,
    updatedAt: Date.now()
  };
}
async function gi() {
  if (await Di("migrated:workflows")) return 0;
  const e = await Z("workflows"), t = new Set((await ut("macros")).map((i) => i.id)), a = e.map(As).filter((i) => !t.has(i.id));
  return a.length && await be("macros", a), await Li("migrated:workflows", !0), a.length;
}
async function Ts(e = {}) {
  const t = Cs(), a = e.only || ["college", "trading", "general"], i = new Set((await ut("workspaces")).filter((s) => !s.deleted).map((s) => s.id));
  await be("workspaces", t.workspaces.filter((s) => !i.has(s.id) && a.includes(s.kind)), { snapshot: !1 });
  const r = new Set((await Z("snippets")).map((s) => s.shortcut));
  for (const s of a) {
    const n = t[s], u = async (c, d) => {
      const h = new Set((await ut(c)).map((p) => p.id));
      return d.filter((p) => !h.has(p.id));
    };
    await be("folders", await u("folders", n.folders), { snapshot: !1 });
    const l = (await u("snippets", n.snippets)).filter((c) => !r.has(c.shortcut));
    l.forEach((c) => r.add(c.shortcut)), await be("snippets", l, { snapshot: !1 }), await be("variables", await u("variables", n.variables), { snapshot: !1 }), await be("tables", await u("tables", n.tables), { snapshot: !1 }), await be("autofill", await u("autofill", n.profiles), { snapshot: !1 }), await be("macros", await u("macros", n.macros), { snapshot: !1 }), await be("scripts", await u("scripts", n.scripts), { snapshot: !1 });
  }
}
async function Ms(e = !1) {
  if (!e && await Di("seeded"))
    return await gi(), !1;
  const t = Date.now();
  await Ts();
  const a = [
    { id: "snp_quick_thanks", name: "Quick thanks", shortcut: "/ty", content: "Thank you so much! 🙏", contentType: "text", folderId: "fld_gen_root", workspaceId: Ve, enabled: !0, favorite: !1, pinned: !1, tags: ["quick"], trigger: "default", createdAt: t, updatedAt: t },
    { id: "snp_today", name: "Today's date", shortcut: "/date", content: "{{today; format=dddd, D MMMM YYYY}}", contentType: "text", folderId: "fld_gen_root", workspaceId: Ve, enabled: !0, favorite: !1, pinned: !1, tags: ["date"], trigger: "default", createdAt: t, updatedAt: t }
  ], i = new Set((await Z("snippets")).map((r) => r.shortcut));
  return await be("snippets", a.filter((r) => !i.has(r.shortcut)), { snapshot: !1 }), await gi(), await Li("seeded", !0), !0;
}
function lt(e = "") {
  const t = new Uint8Array(12);
  crypto.getRandomValues(t);
  const a = Array.from(t, (i) => "abcdefghijklmnopqrstuvwxyz0123456789"[i % 36]).join("");
  return e ? `${e}_${a}` : a;
}
const Es = 5e3;
async function Ga(e, t = 500) {
  const a = { ...e, id: e.id || lt("exe") };
  return await ct("executions", a), await Hi("executions", "startedAt", t), await Nt(["executions"]), a;
}
async function Wi(e, t) {
  const a = await Pe("executions", e);
  if (!a) return null;
  const i = { ...a, ...t };
  return await ct("executions", i), await Nt(["executions"]), i;
}
async function Hi(e, t, a) {
  const i = await ut(e);
  i.length <= a || (i.sort((r, s) => r[t] - s[t]), await Ei(e, i.slice(0, i.length - a).map((r) => r.id)));
}
let Ps = "local user";
async function Ft(e, t, a = {}) {
  const i = { id: lt("aud"), at: Date.now(), actor: a.actor || Ps, action: e, resource: t, resourceId: a.resourceId, name: a.name, details: a.details?.slice(0, 2e3), workspaceId: a.workspaceId, orgId: a.orgId ?? null };
  try {
    await ct("audit", i), await Hi("audit", "at", Es), await Nt(["audit"]);
  } catch {
  }
  return i;
}
function yi(e) {
  return e.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/:?#].*$/, "").replace(/^\*\./, "").replace(/\.$/, "");
}
function sa(e, t) {
  const a = yi(e), i = yi(t);
  return i ? a === i || a.endsWith("." + i) : !1;
}
function Ds(e) {
  const t = e.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + t + "$", "i");
}
function Ls(e, t = "i") {
  if (!e || e.length > 500) return null;
  try {
    return new RegExp(e, t);
  } catch {
    return null;
  }
}
function Gi(e, t) {
  let a = null;
  try {
    a = new URL(t);
  } catch {
  }
  const i = t.replace(/#.*$/, "");
  switch (e.kind) {
    case "any":
      return !0;
    case "domain":
      return !!a && sa(a.hostname, e.value);
    case "prefix": {
      const r = e.value.trim();
      return r ? /^[a-z]+:\/\//i.test(r) ? i.toLowerCase().startsWith(r.toLowerCase()) : i.replace(/^[a-z]+:\/\//i, "").toLowerCase().startsWith(r.toLowerCase()) : !1;
    }
    case "wildcard": {
      const r = e.value.trim();
      if (!r) return !1;
      const s = Ds(r);
      return s.test(i) || s.test(i.replace(/^[a-z]+:\/\//i, ""));
    }
    case "regex": {
      const r = Ls(e.value);
      return !!r && r.test(i);
    }
  }
  return !1;
}
function Ns(e, t) {
  return !e || !e.length ? !0 : e.some((a) => Gi(a, t));
}
function bi(e, t) {
  const a = e.map((i) => i.trim()).filter(Boolean);
  return a.length ? a.some((i) => sa(t, i)) : !0;
}
function Rs(e, t) {
  return t.some((a) => a.trim() && sa(e, a));
}
function xi(e, t) {
  if (!e.includes("{{")) return { value: e };
  const a = ia(e, "text", { ...t.ctx || {}, fo: t.fo, now: t.now, globals: t.values, features: { forms: !0, formulas: !0, conditionals: !0 } });
  if (a.errors.length) return { value: "", error: a.errors[0] };
  if (a.needsForm) {
    const i = a.form.map((r) => r.name).filter(Boolean);
    return { value: "", error: `Unknown variable${i.length > 1 ? "s" : ""}: ${i.join(", ")} — define it under Variables or map a dataset column` };
  }
  return { value: a.text };
}
function zi(e, t) {
  if (!e || !e.trim()) return { ok: !0 };
  const a = {
    lookup: (i) => Object.prototype.hasOwnProperty.call(t.values, i) ? { found: !0, value: t.values[i] } : { found: !1, value: null },
    fo: t.fo,
    now: t.now || /* @__PURE__ */ new Date()
  };
  try {
    return { ok: G(xe(e, a)) };
  } catch (i) {
    return { ok: !1, error: `Condition error: ${i?.message || i}` };
  }
}
function Fs(e, t) {
  const a = [];
  for (const i of e.rules) {
    const r = {
      id: i.id,
      label: i.label || i.target.value,
      target: i.target,
      action: i.action,
      value: "",
      overwrite: i.overwrite,
      waitMs: i.waitMs,
      delayAfterMs: i.delayAfterMs,
      sensitive: i.sensitive,
      dateFormat: i.dateFormat,
      includeHidden: i.includeHidden,
      fieldKind: i.fieldKind
    };
    if (!i.enabled) {
      a.push({ ...r, skip: "Rule disabled" });
      continue;
    }
    if (i.page && i.page.value && !Gi(i.page, t.url)) {
      a.push({ ...r, skip: "Different page of the form" });
      continue;
    }
    const s = zi(i.condition, t);
    if (s.error) {
      a.push({ ...r, skip: s.error, error: s.error });
      continue;
    }
    if (!s.ok) {
      a.push({ ...r, skip: "Condition not met" });
      continue;
    }
    if (i.action === "click" || i.action === "focus" || i.action === "clear" || i.action === "check" || i.action === "uncheck") {
      a.push({ ...r, value: i.value ? xi(i.value, t).value : "" });
      continue;
    }
    const n = xi(i.value, t);
    if (n.error) {
      a.push({ ...r, skip: n.error, error: n.error });
      continue;
    }
    a.push({ ...r, value: n.value });
  }
  return a;
}
function Vs(e, t = [], a = Math.random) {
  const i = e.trim(), r = /^(int|float|alnum|digits|letters|hex)(?::(.*))?$/i.exec(i), s = (c, d) => Array.from({ length: Math.max(1, Math.min(256, d)) }, () => c[Math.floor(a() * c.length)]).join("");
  if (/^uuid$/i.test(i)) {
    const c = s("0123456789abcdef", 32);
    return `${c.slice(0, 8)}-${c.slice(8, 12)}-4${c.slice(13, 16)}-${"89ab"[Math.floor(a() * 4)]}${c.slice(17, 20)}-${c.slice(20, 32)}`;
  }
  if (/^choice$/i.test(i) || !r && t.length) return t.length ? t[Math.floor(a() * t.length)] : "";
  if (!r) throw new Error(`Unknown random spec "${e}". Use int:1-100, float:0-1:2, alnum:8, digits:6, letters:5, hex:8, uuid or choice`);
  const n = r[1].toLowerCase(), u = r[2] || "";
  if (n === "int" || n === "float") {
    const [c, d] = u.split(":"), [h, p] = (c || "0-100").split(/\s*-\s*(?=\d|-)/).map(Number), y = Math.min(h, p), w = Math.max(h, p);
    if (!Number.isFinite(y) || !Number.isFinite(w)) throw new Error(`Invalid range in "${e}"`);
    return n === "int" ? String(Math.floor(y + a() * (w - y + 1))) : (y + a() * (w - y)).toFixed(Math.max(0, Math.min(10, Number(d ?? 2))));
  }
  const l = parseInt(u || "8", 10);
  return s(n === "digits" ? "0123456789" : n === "letters" ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : n === "hex" ? "0123456789abcdef" : "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", l);
}
function Os(e, t) {
  if (!t) return null;
  const a = { __id: t.id };
  for (const i of e.columns) a[i.key] = t.values[i.key] ?? "";
  return a;
}
function Ki(e) {
  return !e || !e.rows.length ? null : e.rows.find((t) => t.id === e.currentRowId) || e.rows[0];
}
function Bs(e) {
  const t = new Map(e.map((u) => [u.name, u])), a = /* @__PURE__ */ new Map();
  for (const u of e) {
    const l = [];
    u.kind === "formula" && l.push(u.value), u.kind === "conditional" && (l.push(...(u.branches || []).flatMap((d) => [d.when, d.then.startsWith("=") ? d.then.slice(1) : ""])), u.value.startsWith("=") && l.push(u.value.slice(1)));
    const c = /* @__PURE__ */ new Set();
    for (const d of l)
      if (d)
        try {
          Te(ja(d)).forEach((h) => c.add(h));
        } catch {
        }
    a.set(u.name, [...c].filter((d) => t.has(d) && d !== u.name));
  }
  const i = [], r = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Set(), n = (u, l) => {
    const c = r.get(u);
    if (c !== 2) {
      if (c === 1) {
        l.slice(l.indexOf(u)).forEach((d) => s.add(d));
        return;
      }
      r.set(u, 1);
      for (const d of a.get(u) || []) n(d, [...l, u]);
      r.set(u, 2), i.push(t.get(u));
    }
  };
  for (const u of e) n(u.name, []);
  return { order: i, cycles: s };
}
function Us(e, t, a) {
  const i = e.filter((n) => !n.deleted), r = (n) => n.scopeRef ? n.scopeRef === a ? 3 : -1 : n.workspaceId ? n.workspaceId === t ? 2 : -1 : 1, s = /* @__PURE__ */ new Map();
  for (const n of i.filter((u) => r(u) >= 0).sort((u, l) => r(u) - r(l))) s.set(n.name, n);
  return [...s.values()];
}
function Qi(e, t) {
  const a = t.now || /* @__PURE__ */ new Date(), i = {}, r = {}, s = t.record || null;
  if (s)
    for (const [p, y] of Object.entries(s)) p !== "__id" && (i[p] = y);
  s && (i.row = { ...s }, i.record = i.row), t.vault && (i.vault = { ...t.vault });
  const n = Us(e, t.workspaceId, t.scopeRef), u = new Set((t.datasets || []).flatMap((p) => p.columns.map((y) => y.key))), { order: l, cycles: c } = Bs(n), d = {
    lookup: (p) => Object.prototype.hasOwnProperty.call(i, p) ? { found: !0, value: i[p] } : p === "page" && t.page ? { found: !0, value: t.page } : u.has(p) ? { found: !0, value: "" } : { found: !1, value: null },
    fo: t.fo,
    now: a
  }, h = new Map((t.datasets || []).map((p) => [p.id, p]));
  for (const p of l) {
    if (c.has(p.name)) {
      r[p.name] = "Circular reference between variables", i[p.name] = "";
      continue;
    }
    try {
      let y = "";
      switch (p.kind) {
        case "static":
          y = p.value;
          break;
        case "formula":
          y = xe(p.value, d), p.format && y instanceof Date && (y = fe(y, p.format));
          break;
        case "date": {
          const w = p.value.trim() || "today";
          let V = se(w.replace(/^(today|now)\s*(?=[+-])/i, ""), a);
          if (!V) {
            const j = xe(w, d);
            V = j instanceof Date ? j : se(j, a);
          }
          if (!V) throw new Error(`"${w}" is not a date`);
          y = fe(V, p.format || t.fo.dateFormat);
          break;
        }
        case "random":
          y = Vs(p.value, p.options || []);
          break;
        case "list":
          y = (p.options || []).join(", ");
          break;
        case "counter":
          y = String((p.counter ?? Number(p.value || 1)) || 1);
          break;
        case "dataset": {
          const w = p.datasetId ? h.get(p.datasetId) : void 0;
          if (!w) throw new Error("Dataset not found");
          const V = s && s.__id && w.rows.find((K) => K.id === s.__id) ? w.rows.find((K) => K.id === s.__id) : Ki(w);
          if (!V) throw new Error(`Dataset "${w.name}" has no records`);
          const j = w.columns.find((K) => K.key === p.column || K.name === p.column);
          if (!j) throw new Error(`Column "${p.column}" not found in "${w.name}"`);
          y = V.values[j.key] ?? "";
          break;
        }
        case "conditional": {
          let w = !1;
          for (const V of p.branches || [])
            if (V.when.trim() && G(xe(V.when, d))) {
              y = V.then.startsWith("=") ? xe(V.then.slice(1), d) : V.then, w = !0;
              break;
            }
          w || (y = p.value.startsWith("=") ? xe(p.value.slice(1), d) : p.value);
          break;
        }
        case "secret": {
          const w = p.value.replace(/^vault\./, "");
          if (!t.vault) throw new Error("Vault is locked — unlock it in K-Flow to use secret variables");
          if (!(w in t.vault)) throw new Error(`Vault entry "${w}" not found`);
          y = t.vault[w];
          break;
        }
      }
      i[p.name] = y;
    } catch (y) {
      r[p.name] = y?.message || String(y), i[p.name] = "";
    }
  }
  return { values: i, errors: r };
}
function Xi(e) {
  return { locale: e.locale, currency: e.currency, dateFormat: e.dateFormat, timeFormat: e.timeFormat };
}
var qs = [509, 0, 227, 0, 150, 4, 294, 9, 1368, 2, 2, 1, 6, 3, 41, 2, 5, 0, 166, 1, 574, 3, 9, 9, 7, 9, 32, 4, 318, 1, 80, 3, 71, 10, 50, 3, 123, 2, 54, 14, 32, 10, 3, 1, 11, 3, 46, 10, 8, 0, 46, 9, 7, 2, 37, 13, 2, 9, 6, 1, 45, 0, 13, 2, 49, 13, 9, 3, 2, 11, 83, 11, 7, 0, 3, 0, 158, 11, 6, 9, 7, 3, 56, 1, 2, 6, 3, 1, 3, 2, 10, 0, 11, 1, 3, 6, 4, 4, 68, 8, 2, 0, 3, 0, 2, 3, 2, 4, 2, 0, 15, 1, 83, 17, 10, 9, 5, 0, 82, 19, 13, 9, 214, 6, 3, 8, 28, 1, 83, 16, 16, 9, 82, 12, 9, 9, 7, 19, 58, 14, 5, 9, 243, 14, 166, 9, 71, 5, 2, 1, 3, 3, 2, 0, 2, 1, 13, 9, 120, 6, 3, 6, 4, 0, 29, 9, 41, 6, 2, 3, 9, 0, 10, 10, 47, 15, 343, 9, 54, 7, 2, 7, 17, 9, 57, 21, 2, 13, 123, 5, 4, 0, 2, 1, 2, 6, 2, 0, 9, 9, 49, 4, 2, 1, 2, 4, 9, 9, 330, 3, 10, 1, 2, 0, 49, 6, 4, 4, 14, 10, 5350, 0, 7, 14, 11465, 27, 2343, 9, 87, 9, 39, 4, 60, 6, 26, 9, 535, 9, 470, 0, 2, 54, 8, 3, 82, 0, 12, 1, 19628, 1, 4178, 9, 519, 45, 3, 22, 543, 4, 4, 5, 9, 7, 3, 6, 31, 3, 149, 2, 1418, 49, 513, 54, 5, 49, 9, 0, 15, 0, 23, 4, 2, 14, 1361, 6, 2, 16, 3, 6, 2, 1, 2, 4, 101, 0, 161, 6, 10, 9, 357, 0, 62, 13, 499, 13, 245, 1, 2, 9, 726, 6, 110, 6, 6, 9, 4759, 9, 787719, 239], Ji = [0, 11, 2, 25, 2, 18, 2, 1, 2, 14, 3, 13, 35, 122, 70, 52, 268, 28, 4, 48, 48, 31, 14, 29, 6, 37, 11, 29, 3, 35, 5, 7, 2, 4, 43, 157, 19, 35, 5, 35, 5, 39, 9, 51, 13, 10, 2, 14, 2, 6, 2, 1, 2, 10, 2, 14, 2, 6, 2, 1, 4, 51, 13, 310, 10, 21, 11, 7, 25, 5, 2, 41, 2, 8, 70, 5, 3, 0, 2, 43, 2, 1, 4, 0, 3, 22, 11, 22, 10, 30, 66, 18, 2, 1, 11, 21, 11, 25, 71, 55, 7, 1, 65, 0, 16, 3, 2, 2, 2, 28, 43, 28, 4, 28, 36, 7, 2, 27, 28, 53, 11, 21, 11, 18, 14, 17, 111, 72, 56, 50, 14, 50, 14, 35, 39, 27, 10, 22, 251, 41, 7, 1, 17, 2, 60, 28, 11, 0, 9, 21, 43, 17, 47, 20, 28, 22, 13, 52, 58, 1, 3, 0, 14, 44, 33, 24, 27, 35, 30, 0, 3, 0, 9, 34, 4, 0, 13, 47, 15, 3, 22, 0, 2, 0, 36, 17, 2, 24, 20, 1, 64, 6, 2, 0, 2, 3, 2, 14, 2, 9, 8, 46, 39, 7, 3, 1, 3, 21, 2, 6, 2, 1, 2, 4, 4, 0, 19, 0, 13, 4, 31, 9, 2, 0, 3, 0, 2, 37, 2, 0, 26, 0, 2, 0, 45, 52, 19, 3, 21, 2, 31, 47, 21, 1, 2, 0, 185, 46, 42, 3, 37, 47, 21, 0, 60, 42, 14, 0, 72, 26, 38, 6, 186, 43, 117, 63, 32, 7, 3, 0, 3, 7, 2, 1, 2, 23, 16, 0, 2, 0, 95, 7, 3, 38, 17, 0, 2, 0, 29, 0, 11, 39, 8, 0, 22, 0, 12, 45, 20, 0, 19, 72, 200, 32, 32, 8, 2, 36, 18, 0, 50, 29, 113, 6, 2, 1, 2, 37, 22, 0, 26, 5, 2, 1, 2, 31, 15, 0, 328, 18, 16, 0, 2, 12, 2, 33, 125, 0, 80, 921, 103, 110, 18, 195, 2637, 96, 16, 1071, 18, 5, 26, 3994, 6, 582, 6842, 29, 1763, 568, 8, 30, 18, 78, 18, 29, 19, 47, 17, 3, 32, 20, 6, 18, 433, 44, 212, 63, 129, 74, 6, 0, 67, 12, 65, 1, 2, 0, 29, 6135, 9, 1237, 42, 9, 8936, 3, 2, 6, 2, 1, 2, 290, 16, 0, 30, 2, 3, 0, 15, 3, 9, 395, 2309, 106, 6, 12, 4, 8, 8, 9, 5991, 84, 2, 70, 2, 1, 3, 0, 3, 1, 3, 3, 2, 11, 2, 0, 2, 6, 2, 64, 2, 3, 3, 7, 2, 6, 2, 27, 2, 3, 2, 4, 2, 0, 4, 6, 2, 339, 3, 24, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 7, 1845, 30, 7, 5, 262, 61, 147, 44, 11, 6, 17, 0, 322, 29, 19, 43, 485, 27, 229, 29, 3, 0, 496, 6, 2, 3, 2, 1, 2, 14, 2, 196, 60, 67, 8, 0, 1205, 3, 2, 26, 2, 1, 2, 0, 3, 0, 2, 9, 2, 3, 2, 0, 2, 0, 7, 0, 5, 0, 2, 0, 2, 0, 2, 2, 2, 1, 2, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 1, 2, 0, 3, 3, 2, 6, 2, 3, 2, 3, 2, 0, 2, 9, 2, 16, 6, 2, 2, 4, 2, 16, 4421, 42719, 33, 4153, 7, 221, 3, 5761, 15, 7472, 16, 621, 2467, 541, 1507, 4938, 6, 4191], Ys = "‌‍·̀-ͯ·҃-֑҇-ׇֽֿׁׂׅׄؐ-ًؚ-٩ٰۖ-ۜ۟-۪ۤۧۨ-ۭ۰-۹ܑܰ-݊ަ-ް߀-߉߫-߽߳ࠖ-࠙ࠛ-ࠣࠥ-ࠧࠩ-࡙࠭-࡛ࢗ-࢟࣊-ࣣ࣡-ःऺ-़ा-ॏ॑-ॗॢॣ०-९ঁ-ঃ়া-ৄেৈো-্ৗৢৣ০-৯৾ਁ-ਃ਼ਾ-ੂੇੈੋ-੍ੑ੦-ੱੵઁ-ઃ઼ા-ૅે-ૉો-્ૢૣ૦-૯ૺ-૿ଁ-ଃ଼ା-ୄେୈୋ-୍୕-ୗୢୣ୦-୯ஂா-ூெ-ைொ-்ௗ௦-௯ఀ-ఄ఼ా-ౄె-ైొ-్ౕౖౢౣ౦-౯ಁ-ಃ಼ಾ-ೄೆ-ೈೊ-್ೕೖೢೣ೦-೯ೳഀ-ഃ഻഼ാ-ൄെ-ൈൊ-്ൗൢൣ൦-൯ඁ-ඃ්ා-ුූෘ-ෟ෦-෯ෲෳัิ-ฺ็-๎๐-๙ັິ-ຼ່-໎໐-໙༘༙༠-༩༹༵༷༾༿ཱ-྄྆྇ྍ-ྗྙ-ྼ࿆ါ-ှ၀-၉ၖ-ၙၞ-ၠၢ-ၤၧ-ၭၱ-ၴႂ-ႍႏ-ႝ፝-፟፩-፱ᜒ-᜕ᜲ-᜴ᝒᝓᝲᝳ឴-៓៝០-៩᠋-᠍᠏-᠙ᢩᤠ-ᤫᤰ-᤻᥆-᥏᧐-᧚ᨗ-ᨛᩕ-ᩞ᩠-᩿᩼-᪉᪐-᪙᪰-᪽ᪿ-ᫎᬀ-ᬄ᬴-᭄᭐-᭙᭫-᭳ᮀ-ᮂᮡ-ᮭ᮰-᮹᯦-᯳ᰤ-᰷᱀-᱉᱐-᱙᳐-᳔᳒-᳨᳭᳴᳷-᳹᷀-᷿‌‍‿⁀⁔⃐-⃥⃜⃡-⃰⳯-⵿⳱ⷠ-〪ⷿ-゙゚〯・꘠-꘩꙯ꙴ-꙽ꚞꚟ꛰꛱ꠂ꠆ꠋꠣ-ꠧ꠬ꢀꢁꢴ-ꣅ꣐-꣙꣠-꣱ꣿ-꤉ꤦ-꤭ꥇ-꥓ꦀ-ꦃ꦳-꧀꧐-꧙ꧥ꧰-꧹ꨩ-ꨶꩃꩌꩍ꩐-꩙ꩻ-ꩽꪰꪲ-ꪴꪷꪸꪾ꪿꫁ꫫ-ꫯꫵ꫶ꯣ-ꯪ꯬꯭꯰-꯹ﬞ︀-️︠-︯︳︴﹍-﹏０-９＿･", Zi = "ªµºÀ-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮͰ-ʹͶͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁҊ-ԯԱ-Ֆՙՠ-ֈא-תׯ-ײؠ-يٮٯٱ-ۓەۥۦۮۯۺ-ۼۿܐܒ-ܯݍ-ޥޱߊ-ߪߴߵߺࠀ-ࠕࠚࠤࠨࡀ-ࡘࡠ-ࡪࡰ-ࢇࢉ-ࢎࢠ-ࣉऄ-हऽॐक़-ॡॱ-ঀঅ-ঌএঐও-নপ-রলশ-হঽৎড়ঢ়য়-ৡৰৱৼਅ-ਊਏਐਓ-ਨਪ-ਰਲਲ਼ਵਸ਼ਸਹਖ਼-ੜਫ਼ੲ-ੴઅ-ઍએ-ઑઓ-નપ-રલળવ-હઽૐૠૡૹଅ-ଌଏଐଓ-ନପ-ରଲଳଵ-ହଽଡ଼ଢ଼ୟ-ୡୱஃஅ-ஊஎ-ஐஒ-கஙசஜஞடணதந-பம-ஹௐఅ-ఌఎ-ఐఒ-నప-హఽౘ-ౚౝౠౡಀಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹಽೝೞೠೡೱೲഄ-ഌഎ-ഐഒ-ഺഽൎൔ-ൖൟ-ൡൺ-ൿඅ-ඖක-නඳ-රලව-ෆก-ะาำเ-ๆກຂຄຆ-ຊຌ-ຣລວ-ະາຳຽເ-ໄໆໜ-ໟༀཀ-ཇཉ-ཬྈ-ྌက-ဪဿၐ-ၕၚ-ၝၡၥၦၮ-ၰၵ-ႁႎႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚᎀ-ᎏᎠ-Ᏽᏸ-ᏽᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛮ-ᛸᜀ-ᜑᜟ-ᜱᝀ-ᝑᝠ-ᝬᝮ-ᝰក-ឳៗៜᠠ-ᡸᢀ-ᢨᢪᢰ-ᣵᤀ-ᤞᥐ-ᥭᥰ-ᥴᦀ-ᦫᦰ-ᧉᨀ-ᨖᨠ-ᩔᪧᬅ-ᬳᭅ-ᭌᮃ-ᮠᮮᮯᮺ-ᯥᰀ-ᰣᱍ-ᱏᱚ-ᱽᲀ-ᲊᲐ-ᲺᲽ-Ჿᳩ-ᳬᳮ-ᳳᳵᳶᳺᴀ-ᶿḀ-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼⁱⁿₐ-ₜℂℇℊ-ℓℕ℘-ℝℤΩℨK-ℹℼ-ℿⅅ-ⅉⅎⅠ-ↈⰀ-ⳤⳫ-ⳮⳲⳳⴀ-ⴥⴧⴭⴰ-ⵧⵯⶀ-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞ々-〇〡-〩〱-〵〸-〼ぁ-ゖ゛-ゟァ-ヺー-ヿㄅ-ㄯㄱ-ㆎㆠ-ㆿㇰ-ㇿ㐀-䶿一-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘟꘪꘫꙀ-ꙮꙿ-ꚝꚠ-ꛯꜗ-ꜟꜢ-ꞈꞋ-ꟍꟐꟑꟓꟕ-Ƛꟲ-ꠁꠃ-ꠅꠇ-ꠊꠌ-ꠢꡀ-ꡳꢂ-ꢳꣲ-ꣷꣻꣽꣾꤊ-ꤥꤰ-ꥆꥠ-ꥼꦄ-ꦲꧏꧠ-ꧤꧦ-ꧯꧺ-ꧾꨀ-ꨨꩀ-ꩂꩄ-ꩋꩠ-ꩶꩺꩾ-ꪯꪱꪵꪶꪹ-ꪽꫀꫂꫛ-ꫝꫠ-ꫪꫲ-ꫴꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭩꭰ-ꯢ가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-ﬨשׁ-זּטּ-לּמּנּסּףּפּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻﹰ-ﹴﹶ-ﻼＡ-Ｚａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ", Ia = {
  3: "abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",
  5: "class enum extends super const export import",
  6: "enum",
  strict: "implements interface let package private protected public static yield",
  strictBind: "eval arguments"
}, Ca = "break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this", $s = {
  5: Ca,
  "5module": Ca + " export import",
  6: Ca + " const class extends export import super"
}, js = /^in(stanceof)?$/, Ws = new RegExp("[" + Zi + "]"), Hs = new RegExp("[" + Zi + Ys + "]");
function Pa(e, t) {
  for (var a = 65536, i = 0; i < t.length; i += 2) {
    if (a += t[i], a > e)
      return !1;
    if (a += t[i + 1], a >= e)
      return !0;
  }
  return !1;
}
function Ee(e, t) {
  return e < 65 ? e === 36 : e < 91 ? !0 : e < 97 ? e === 95 : e < 123 ? !0 : e <= 65535 ? e >= 170 && Ws.test(String.fromCharCode(e)) : t === !1 ? !1 : Pa(e, Ji);
}
function ze(e, t) {
  return e < 48 ? e === 36 : e < 58 ? !0 : e < 65 ? !1 : e < 91 ? !0 : e < 97 ? e === 95 : e < 123 ? !0 : e <= 65535 ? e >= 170 && Hs.test(String.fromCharCode(e)) : t === !1 ? !1 : Pa(e, Ji) || Pa(e, qs);
}
var O = function(t, a) {
  a === void 0 && (a = {}), this.label = t, this.keyword = a.keyword, this.beforeExpr = !!a.beforeExpr, this.startsExpr = !!a.startsExpr, this.isLoop = !!a.isLoop, this.isAssign = !!a.isAssign, this.prefix = !!a.prefix, this.postfix = !!a.postfix, this.binop = a.binop || null, this.updateContext = null;
};
function ge(e, t) {
  return new O(e, { beforeExpr: !0, binop: t });
}
var ye = { beforeExpr: !0 }, de = { startsExpr: !0 }, za = {};
function F(e, t) {
  return t === void 0 && (t = {}), t.keyword = e, za[e] = new O(e, t);
}
var o = {
  num: new O("num", de),
  regexp: new O("regexp", de),
  string: new O("string", de),
  name: new O("name", de),
  privateId: new O("privateId", de),
  eof: new O("eof"),
  // Punctuation token types.
  bracketL: new O("[", { beforeExpr: !0, startsExpr: !0 }),
  bracketR: new O("]"),
  braceL: new O("{", { beforeExpr: !0, startsExpr: !0 }),
  braceR: new O("}"),
  parenL: new O("(", { beforeExpr: !0, startsExpr: !0 }),
  parenR: new O(")"),
  comma: new O(",", ye),
  semi: new O(";", ye),
  colon: new O(":", ye),
  dot: new O("."),
  question: new O("?", ye),
  questionDot: new O("?."),
  arrow: new O("=>", ye),
  template: new O("template"),
  invalidTemplate: new O("invalidTemplate"),
  ellipsis: new O("...", ye),
  backQuote: new O("`", de),
  dollarBraceL: new O("${", { beforeExpr: !0, startsExpr: !0 }),
  // Operators. These carry several kinds of properties to help the
  // parser use them properly (the presence of these properties is
  // what categorizes them as operators).
  //
  // `binop`, when present, specifies that this operator is a binary
  // operator, and will refer to its precedence.
  //
  // `prefix` and `postfix` mark the operator as a prefix or postfix
  // unary operator.
  //
  // `isAssign` marks all of `=`, `+=`, `-=` etcetera, which act as
  // binary operators with a very low precedence, that should result
  // in AssignmentExpression nodes.
  eq: new O("=", { beforeExpr: !0, isAssign: !0 }),
  assign: new O("_=", { beforeExpr: !0, isAssign: !0 }),
  incDec: new O("++/--", { prefix: !0, postfix: !0, startsExpr: !0 }),
  prefix: new O("!/~", { beforeExpr: !0, prefix: !0, startsExpr: !0 }),
  logicalOR: ge("||", 1),
  logicalAND: ge("&&", 2),
  bitwiseOR: ge("|", 3),
  bitwiseXOR: ge("^", 4),
  bitwiseAND: ge("&", 5),
  equality: ge("==/!=/===/!==", 6),
  relational: ge("</>/<=/>=", 7),
  bitShift: ge("<</>>/>>>", 8),
  plusMin: new O("+/-", { beforeExpr: !0, binop: 9, prefix: !0, startsExpr: !0 }),
  modulo: ge("%", 10),
  star: ge("*", 10),
  slash: ge("/", 10),
  starstar: new O("**", { beforeExpr: !0 }),
  coalesce: ge("??", 1),
  // Keyword token types.
  _break: F("break"),
  _case: F("case", ye),
  _catch: F("catch"),
  _continue: F("continue"),
  _debugger: F("debugger"),
  _default: F("default", ye),
  _do: F("do", { isLoop: !0, beforeExpr: !0 }),
  _else: F("else", ye),
  _finally: F("finally"),
  _for: F("for", { isLoop: !0 }),
  _function: F("function", de),
  _if: F("if"),
  _return: F("return", ye),
  _switch: F("switch"),
  _throw: F("throw", ye),
  _try: F("try"),
  _var: F("var"),
  _const: F("const"),
  _while: F("while", { isLoop: !0 }),
  _with: F("with"),
  _new: F("new", { beforeExpr: !0, startsExpr: !0 }),
  _this: F("this", de),
  _super: F("super", de),
  _class: F("class", de),
  _extends: F("extends", ye),
  _export: F("export"),
  _import: F("import", de),
  _null: F("null", de),
  _true: F("true", de),
  _false: F("false", de),
  _in: F("in", { beforeExpr: !0, binop: 7 }),
  _instanceof: F("instanceof", { beforeExpr: !0, binop: 7 }),
  _typeof: F("typeof", { beforeExpr: !0, prefix: !0, startsExpr: !0 }),
  _void: F("void", { beforeExpr: !0, prefix: !0, startsExpr: !0 }),
  _delete: F("delete", { beforeExpr: !0, prefix: !0, startsExpr: !0 })
}, pe = /\r\n?|\n|\u2028|\u2029/, Gs = new RegExp(pe.source, "g");
function dt(e) {
  return e === 10 || e === 13 || e === 8232 || e === 8233;
}
function er(e, t, a) {
  a === void 0 && (a = e.length);
  for (var i = t; i < a; i++) {
    var r = e.charCodeAt(i);
    if (dt(r))
      return i < a - 1 && r === 13 && e.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
  }
  return -1;
}
var tr = /[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/, re = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g, ar = Object.prototype, zs = ar.hasOwnProperty, Ks = ar.toString, pt = Object.hasOwn || (function(e, t) {
  return zs.call(e, t);
}), wi = Array.isArray || (function(e) {
  return Ks.call(e) === "[object Array]";
}), vi = /* @__PURE__ */ Object.create(null);
function Ge(e) {
  return vi[e] || (vi[e] = new RegExp("^(?:" + e.replace(/ /g, "|") + ")$"));
}
function Ue(e) {
  return e <= 65535 ? String.fromCharCode(e) : (e -= 65536, String.fromCharCode((e >> 10) + 55296, (e & 1023) + 56320));
}
var Qs = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/, Pt = function(t, a) {
  this.line = t, this.column = a;
};
Pt.prototype.offset = function(t) {
  return new Pt(this.line, this.column + t);
};
var na = function(t, a, i) {
  this.start = a, this.end = i, t.sourceFile !== null && (this.source = t.sourceFile);
};
function ir(e, t) {
  for (var a = 1, i = 0; ; ) {
    var r = er(e, i, t);
    if (r < 0)
      return new Pt(a, t - i);
    ++a, i = r;
  }
}
var Da = {
  // `ecmaVersion` indicates the ECMAScript version to parse. Must be
  // either 3, 5, 6 (or 2015), 7 (2016), 8 (2017), 9 (2018), 10
  // (2019), 11 (2020), 12 (2021), 13 (2022), 14 (2023), or `"latest"`
  // (the latest version the library supports). This influences
  // support for strict mode, the set of reserved words, and support
  // for new syntax features.
  ecmaVersion: null,
  // `sourceType` indicates the mode the code should be parsed in.
  // Can be either `"script"` or `"module"`. This influences global
  // strict mode and parsing of `import` and `export` declarations.
  sourceType: "script",
  // `onInsertedSemicolon` can be a callback that will be called when
  // a semicolon is automatically inserted. It will be passed the
  // position of the inserted semicolon as an offset, and if
  // `locations` is enabled, it is given the location as a `{line,
  // column}` object as second argument.
  onInsertedSemicolon: null,
  // `onTrailingComma` is similar to `onInsertedSemicolon`, but for
  // trailing commas.
  onTrailingComma: null,
  // By default, reserved words are only enforced if ecmaVersion >= 5.
  // Set `allowReserved` to a boolean value to explicitly turn this on
  // an off. When this option has the value "never", reserved words
  // and keywords can also not be used as property names.
  allowReserved: null,
  // When enabled, a return at the top level is not considered an
  // error.
  allowReturnOutsideFunction: !1,
  // When enabled, import/export statements are not constrained to
  // appearing at the top of the program, and an import.meta expression
  // in a script isn't considered an error.
  allowImportExportEverywhere: !1,
  // By default, await identifiers are allowed to appear at the top-level scope only if ecmaVersion >= 2022.
  // When enabled, await identifiers are allowed to appear at the top-level scope,
  // but they are still not allowed in non-async functions.
  allowAwaitOutsideFunction: null,
  // When enabled, super identifiers are not constrained to
  // appearing in methods and do not raise an error when they appear elsewhere.
  allowSuperOutsideMethod: null,
  // When enabled, hashbang directive in the beginning of file is
  // allowed and treated as a line comment. Enabled by default when
  // `ecmaVersion` >= 2023.
  allowHashBang: !1,
  // By default, the parser will verify that private properties are
  // only used in places where they are valid and have been declared.
  // Set this to false to turn such checks off.
  checkPrivateFields: !0,
  // When `locations` is on, `loc` properties holding objects with
  // `start` and `end` properties in `{line, column}` form (with
  // line being 1-based and column 0-based) will be attached to the
  // nodes.
  locations: !1,
  // A function can be passed as `onToken` option, which will
  // cause Acorn to call that function with object in the same
  // format as tokens returned from `tokenizer().getToken()`. Note
  // that you are not allowed to call the parser from the
  // callback—that will corrupt its internal state.
  onToken: null,
  // A function can be passed as `onComment` option, which will
  // cause Acorn to call that function with `(block, text, start,
  // end)` parameters whenever a comment is skipped. `block` is a
  // boolean indicating whether this is a block (`/* */`) comment,
  // `text` is the content of the comment, and `start` and `end` are
  // character offsets that denote the start and end of the comment.
  // When the `locations` option is on, two more parameters are
  // passed, the full `{line, column}` locations of the start and
  // end of the comments. Note that you are not allowed to call the
  // parser from the callback—that will corrupt its internal state.
  // When this option has an array as value, objects representing the
  // comments are pushed to it.
  onComment: null,
  // Nodes have their start and end characters offsets recorded in
  // `start` and `end` properties (directly on the node, rather than
  // the `loc` object, which holds line/column data. To also add a
  // [semi-standardized][range] `range` property holding a `[start,
  // end]` array with the same numbers, set the `ranges` option to
  // `true`.
  //
  // [range]: https://bugzilla.mozilla.org/show_bug.cgi?id=745678
  ranges: !1,
  // It is possible to parse multiple files into a single AST by
  // passing the tree produced by parsing the first file as
  // `program` option in subsequent parses. This will add the
  // toplevel forms of the parsed file to the `Program` (top) node
  // of an existing parse tree.
  program: null,
  // When `locations` is on, you can pass this to record the source
  // file in every node's `loc` object.
  sourceFile: null,
  // This value, if given, is stored in every node, whether
  // `locations` is on or off.
  directSourceFile: null,
  // When enabled, parenthesized expressions are represented by
  // (non-standard) ParenthesizedExpression nodes
  preserveParens: !1
}, ki = !1;
function Xs(e) {
  var t = {};
  for (var a in Da)
    t[a] = e && pt(e, a) ? e[a] : Da[a];
  if (t.ecmaVersion === "latest" ? t.ecmaVersion = 1e8 : t.ecmaVersion == null ? (!ki && typeof console == "object" && console.warn && (ki = !0, console.warn(`Since Acorn 8.0.0, options.ecmaVersion is required.
Defaulting to 2020, but this will stop working in the future.`)), t.ecmaVersion = 11) : t.ecmaVersion >= 2015 && (t.ecmaVersion -= 2009), t.allowReserved == null && (t.allowReserved = t.ecmaVersion < 5), (!e || e.allowHashBang == null) && (t.allowHashBang = t.ecmaVersion >= 14), wi(t.onToken)) {
    var i = t.onToken;
    t.onToken = function(r) {
      return i.push(r);
    };
  }
  return wi(t.onComment) && (t.onComment = Js(t, t.onComment)), t;
}
function Js(e, t) {
  return function(a, i, r, s, n, u) {
    var l = {
      type: a ? "Block" : "Line",
      value: i,
      start: r,
      end: s
    };
    e.locations && (l.loc = new na(this, n, u)), e.ranges && (l.range = [r, s]), t.push(l);
  };
}
var Dt = 1, ht = 2, Ka = 4, rr = 8, Qa = 16, sr = 32, oa = 64, nr = 128, Ze = 256, Vt = 512, ua = Dt | ht | Ze;
function Xa(e, t) {
  return ht | (e ? Ka : 0) | (t ? rr : 0);
}
var zt = 0, Ja = 1, $e = 2, or = 3, ur = 4, lr = 5, X = function(t, a, i) {
  this.options = t = Xs(t), this.sourceFile = t.sourceFile, this.keywords = Ge($s[t.ecmaVersion >= 6 ? 6 : t.sourceType === "module" ? "5module" : 5]);
  var r = "";
  t.allowReserved !== !0 && (r = Ia[t.ecmaVersion >= 6 ? 6 : t.ecmaVersion === 5 ? 5 : 3], t.sourceType === "module" && (r += " await")), this.reservedWords = Ge(r);
  var s = (r ? r + " " : "") + Ia.strict;
  this.reservedWordsStrict = Ge(s), this.reservedWordsStrictBind = Ge(s + " " + Ia.strictBind), this.input = String(a), this.containsEsc = !1, i ? (this.pos = i, this.lineStart = this.input.lastIndexOf(`
`, i - 1) + 1, this.curLine = this.input.slice(0, this.lineStart).split(pe).length) : (this.pos = this.lineStart = 0, this.curLine = 1), this.type = o.eof, this.value = null, this.start = this.end = this.pos, this.startLoc = this.endLoc = this.curPosition(), this.lastTokEndLoc = this.lastTokStartLoc = null, this.lastTokStart = this.lastTokEnd = this.pos, this.context = this.initialContext(), this.exprAllowed = !0, this.inModule = t.sourceType === "module", this.strict = this.inModule || this.strictDirective(this.pos), this.potentialArrowAt = -1, this.potentialArrowInForAwait = !1, this.yieldPos = this.awaitPos = this.awaitIdentPos = 0, this.labels = [], this.undefinedExports = /* @__PURE__ */ Object.create(null), this.pos === 0 && t.allowHashBang && this.input.slice(0, 2) === "#!" && this.skipLineComment(2), this.scopeStack = [], this.enterScope(Dt), this.regexpState = null, this.privateNameStack = [];
}, De = { inFunction: { configurable: !0 }, inGenerator: { configurable: !0 }, inAsync: { configurable: !0 }, canAwait: { configurable: !0 }, allowSuper: { configurable: !0 }, allowDirectSuper: { configurable: !0 }, treatFunctionsAsVar: { configurable: !0 }, allowNewDotTarget: { configurable: !0 }, inClassStaticBlock: { configurable: !0 } };
X.prototype.parse = function() {
  var t = this.options.program || this.startNode();
  return this.nextToken(), this.parseTopLevel(t);
};
De.inFunction.get = function() {
  return (this.currentVarScope().flags & ht) > 0;
};
De.inGenerator.get = function() {
  return (this.currentVarScope().flags & rr) > 0;
};
De.inAsync.get = function() {
  return (this.currentVarScope().flags & Ka) > 0;
};
De.canAwait.get = function() {
  for (var e = this.scopeStack.length - 1; e >= 0; e--) {
    var t = this.scopeStack[e], a = t.flags;
    if (a & (Ze | Vt))
      return !1;
    if (a & ht)
      return (a & Ka) > 0;
  }
  return this.inModule && this.options.ecmaVersion >= 13 || this.options.allowAwaitOutsideFunction;
};
De.allowSuper.get = function() {
  var e = this.currentThisScope(), t = e.flags;
  return (t & oa) > 0 || this.options.allowSuperOutsideMethod;
};
De.allowDirectSuper.get = function() {
  return (this.currentThisScope().flags & nr) > 0;
};
De.treatFunctionsAsVar.get = function() {
  return this.treatFunctionsAsVarInScope(this.currentScope());
};
De.allowNewDotTarget.get = function() {
  for (var e = this.scopeStack.length - 1; e >= 0; e--) {
    var t = this.scopeStack[e], a = t.flags;
    if (a & (Ze | Vt) || a & ht && !(a & Qa))
      return !0;
  }
  return !1;
};
De.inClassStaticBlock.get = function() {
  return (this.currentVarScope().flags & Ze) > 0;
};
X.extend = function() {
  for (var t = [], a = arguments.length; a--; ) t[a] = arguments[a];
  for (var i = this, r = 0; r < t.length; r++)
    i = t[r](i);
  return i;
};
X.parse = function(t, a) {
  return new this(a, t).parse();
};
X.parseExpressionAt = function(t, a, i) {
  var r = new this(i, t, a);
  return r.nextToken(), r.parseExpression();
};
X.tokenizer = function(t, a) {
  return new this(a, t);
};
Object.defineProperties(X.prototype, De);
var ue = X.prototype, Zs = /^(?:'((?:\\[^]|[^'\\])*?)'|"((?:\\[^]|[^"\\])*?)")/;
ue.strictDirective = function(e) {
  if (this.options.ecmaVersion < 5)
    return !1;
  for (; ; ) {
    re.lastIndex = e, e += re.exec(this.input)[0].length;
    var t = Zs.exec(this.input.slice(e));
    if (!t)
      return !1;
    if ((t[1] || t[2]) === "use strict") {
      re.lastIndex = e + t[0].length;
      var a = re.exec(this.input), i = a.index + a[0].length, r = this.input.charAt(i);
      return r === ";" || r === "}" || pe.test(a[0]) && !(/[(`.[+\-/*%<>=,?^&]/.test(r) || r === "!" && this.input.charAt(i + 1) === "=");
    }
    e += t[0].length, re.lastIndex = e, e += re.exec(this.input)[0].length, this.input[e] === ";" && e++;
  }
};
ue.eat = function(e) {
  return this.type === e ? (this.next(), !0) : !1;
};
ue.isContextual = function(e) {
  return this.type === o.name && this.value === e && !this.containsEsc;
};
ue.eatContextual = function(e) {
  return this.isContextual(e) ? (this.next(), !0) : !1;
};
ue.expectContextual = function(e) {
  this.eatContextual(e) || this.unexpected();
};
ue.canInsertSemicolon = function() {
  return this.type === o.eof || this.type === o.braceR || pe.test(this.input.slice(this.lastTokEnd, this.start));
};
ue.insertSemicolon = function() {
  if (this.canInsertSemicolon())
    return this.options.onInsertedSemicolon && this.options.onInsertedSemicolon(this.lastTokEnd, this.lastTokEndLoc), !0;
};
ue.semicolon = function() {
  !this.eat(o.semi) && !this.insertSemicolon() && this.unexpected();
};
ue.afterTrailingComma = function(e, t) {
  if (this.type === e)
    return this.options.onTrailingComma && this.options.onTrailingComma(this.lastTokStart, this.lastTokStartLoc), t || this.next(), !0;
};
ue.expect = function(e) {
  this.eat(e) || this.unexpected();
};
ue.unexpected = function(e) {
  this.raise(e ?? this.start, "Unexpected token");
};
var la = function() {
  this.shorthandAssign = this.trailingComma = this.parenthesizedAssign = this.parenthesizedBind = this.doubleProto = -1;
};
ue.checkPatternErrors = function(e, t) {
  if (e) {
    e.trailingComma > -1 && this.raiseRecoverable(e.trailingComma, "Comma is not permitted after the rest element");
    var a = t ? e.parenthesizedAssign : e.parenthesizedBind;
    a > -1 && this.raiseRecoverable(a, t ? "Assigning to rvalue" : "Parenthesized pattern");
  }
};
ue.checkExpressionErrors = function(e, t) {
  if (!e)
    return !1;
  var a = e.shorthandAssign, i = e.doubleProto;
  if (!t)
    return a >= 0 || i >= 0;
  a >= 0 && this.raise(a, "Shorthand property assignments are valid only in destructuring patterns"), i >= 0 && this.raiseRecoverable(i, "Redefinition of __proto__ property");
};
ue.checkYieldAwaitInDefaultParams = function() {
  this.yieldPos && (!this.awaitPos || this.yieldPos < this.awaitPos) && this.raise(this.yieldPos, "Yield expression cannot be a default value"), this.awaitPos && this.raise(this.awaitPos, "Await expression cannot be a default value");
};
ue.isSimpleAssignTarget = function(e) {
  return e.type === "ParenthesizedExpression" ? this.isSimpleAssignTarget(e.expression) : e.type === "Identifier" || e.type === "MemberExpression";
};
var S = X.prototype;
S.parseTopLevel = function(e) {
  var t = /* @__PURE__ */ Object.create(null);
  for (e.body || (e.body = []); this.type !== o.eof; ) {
    var a = this.parseStatement(null, !0, t);
    e.body.push(a);
  }
  if (this.inModule)
    for (var i = 0, r = Object.keys(this.undefinedExports); i < r.length; i += 1) {
      var s = r[i];
      this.raiseRecoverable(this.undefinedExports[s].start, "Export '" + s + "' is not defined");
    }
  return this.adaptDirectivePrologue(e.body), this.next(), e.sourceType = this.options.sourceType, this.finishNode(e, "Program");
};
var Za = { kind: "loop" }, en = { kind: "switch" };
S.isLet = function(e) {
  if (this.options.ecmaVersion < 6 || !this.isContextual("let"))
    return !1;
  re.lastIndex = this.pos;
  var t = re.exec(this.input), a = this.pos + t[0].length, i = this.input.charCodeAt(a);
  if (i === 91 || i === 92)
    return !0;
  if (e)
    return !1;
  if (i === 123 || i > 55295 && i < 56320)
    return !0;
  if (Ee(i, !0)) {
    for (var r = a + 1; ze(i = this.input.charCodeAt(r), !0); )
      ++r;
    if (i === 92 || i > 55295 && i < 56320)
      return !0;
    var s = this.input.slice(a, r);
    if (!js.test(s))
      return !0;
  }
  return !1;
};
S.isAsyncFunction = function() {
  if (this.options.ecmaVersion < 8 || !this.isContextual("async"))
    return !1;
  re.lastIndex = this.pos;
  var e = re.exec(this.input), t = this.pos + e[0].length, a;
  return !pe.test(this.input.slice(this.pos, t)) && this.input.slice(t, t + 8) === "function" && (t + 8 === this.input.length || !(ze(a = this.input.charCodeAt(t + 8)) || a > 55295 && a < 56320));
};
S.isUsingKeyword = function(e, t) {
  if (this.options.ecmaVersion < 17 || !this.isContextual(e ? "await" : "using"))
    return !1;
  re.lastIndex = this.pos;
  var a = re.exec(this.input), i = this.pos + a[0].length;
  if (pe.test(this.input.slice(this.pos, i)))
    return !1;
  if (e) {
    var r = i + 5, s;
    if (this.input.slice(i, r) !== "using" || r === this.input.length || ze(s = this.input.charCodeAt(r)) || s > 55295 && s < 56320)
      return !1;
    re.lastIndex = r;
    var n = re.exec(this.input);
    if (n && pe.test(this.input.slice(r, r + n[0].length)))
      return !1;
  }
  if (t) {
    var u = i + 2, l;
    if (this.input.slice(i, u) === "of" && (u === this.input.length || !ze(l = this.input.charCodeAt(u)) && !(l > 55295 && l < 56320)))
      return !1;
  }
  var c = this.input.charCodeAt(i);
  return Ee(c, !0) || c === 92;
};
S.isAwaitUsing = function(e) {
  return this.isUsingKeyword(!0, e);
};
S.isUsing = function(e) {
  return this.isUsingKeyword(!1, e);
};
S.parseStatement = function(e, t, a) {
  var i = this.type, r = this.startNode(), s;
  switch (this.isLet(e) && (i = o._var, s = "let"), i) {
    case o._break:
    case o._continue:
      return this.parseBreakContinueStatement(r, i.keyword);
    case o._debugger:
      return this.parseDebuggerStatement(r);
    case o._do:
      return this.parseDoStatement(r);
    case o._for:
      return this.parseForStatement(r);
    case o._function:
      return e && (this.strict || e !== "if" && e !== "label") && this.options.ecmaVersion >= 6 && this.unexpected(), this.parseFunctionStatement(r, !1, !e);
    case o._class:
      return e && this.unexpected(), this.parseClass(r, !0);
    case o._if:
      return this.parseIfStatement(r);
    case o._return:
      return this.parseReturnStatement(r);
    case o._switch:
      return this.parseSwitchStatement(r);
    case o._throw:
      return this.parseThrowStatement(r);
    case o._try:
      return this.parseTryStatement(r);
    case o._const:
    case o._var:
      return s = s || this.value, e && s !== "var" && this.unexpected(), this.parseVarStatement(r, s);
    case o._while:
      return this.parseWhileStatement(r);
    case o._with:
      return this.parseWithStatement(r);
    case o.braceL:
      return this.parseBlock(!0, r);
    case o.semi:
      return this.parseEmptyStatement(r);
    case o._export:
    case o._import:
      if (this.options.ecmaVersion > 10 && i === o._import) {
        re.lastIndex = this.pos;
        var n = re.exec(this.input), u = this.pos + n[0].length, l = this.input.charCodeAt(u);
        if (l === 40 || l === 46)
          return this.parseExpressionStatement(r, this.parseExpression());
      }
      return this.options.allowImportExportEverywhere || (t || this.raise(this.start, "'import' and 'export' may only appear at the top level"), this.inModule || this.raise(this.start, "'import' and 'export' may appear only with 'sourceType: module'")), i === o._import ? this.parseImport(r) : this.parseExport(r, a);
    // If the statement does not start with a statement keyword or a
    // brace, it's an ExpressionStatement or LabeledStatement. We
    // simply start parsing an expression, and afterwards, if the
    // next token is a colon and the expression was a simple
    // Identifier node, we switch to interpreting it as a label.
    default:
      if (this.isAsyncFunction())
        return e && this.unexpected(), this.next(), this.parseFunctionStatement(r, !0, !e);
      var c = this.isAwaitUsing(!1) ? "await using" : this.isUsing(!1) ? "using" : null;
      if (c)
        return t && this.options.sourceType === "script" && this.raise(this.start, "Using declaration cannot appear in the top level when source type is `script`"), c === "await using" && (this.canAwait || this.raise(this.start, "Await using cannot appear outside of async function"), this.next()), this.next(), this.parseVar(r, !1, c), this.semicolon(), this.finishNode(r, "VariableDeclaration");
      var d = this.value, h = this.parseExpression();
      return i === o.name && h.type === "Identifier" && this.eat(o.colon) ? this.parseLabeledStatement(r, d, h, e) : this.parseExpressionStatement(r, h);
  }
};
S.parseBreakContinueStatement = function(e, t) {
  var a = t === "break";
  this.next(), this.eat(o.semi) || this.insertSemicolon() ? e.label = null : this.type !== o.name ? this.unexpected() : (e.label = this.parseIdent(), this.semicolon());
  for (var i = 0; i < this.labels.length; ++i) {
    var r = this.labels[i];
    if ((e.label == null || r.name === e.label.name) && (r.kind != null && (a || r.kind === "loop") || e.label && a))
      break;
  }
  return i === this.labels.length && this.raise(e.start, "Unsyntactic " + t), this.finishNode(e, a ? "BreakStatement" : "ContinueStatement");
};
S.parseDebuggerStatement = function(e) {
  return this.next(), this.semicolon(), this.finishNode(e, "DebuggerStatement");
};
S.parseDoStatement = function(e) {
  return this.next(), this.labels.push(Za), e.body = this.parseStatement("do"), this.labels.pop(), this.expect(o._while), e.test = this.parseParenExpression(), this.options.ecmaVersion >= 6 ? this.eat(o.semi) : this.semicolon(), this.finishNode(e, "DoWhileStatement");
};
S.parseForStatement = function(e) {
  this.next();
  var t = this.options.ecmaVersion >= 9 && this.canAwait && this.eatContextual("await") ? this.lastTokStart : -1;
  if (this.labels.push(Za), this.enterScope(0), this.expect(o.parenL), this.type === o.semi)
    return t > -1 && this.unexpected(t), this.parseFor(e, null);
  var a = this.isLet();
  if (this.type === o._var || this.type === o._const || a) {
    var i = this.startNode(), r = a ? "let" : this.value;
    return this.next(), this.parseVar(i, !0, r), this.finishNode(i, "VariableDeclaration"), this.parseForAfterInit(e, i, t);
  }
  var s = this.isContextual("let"), n = !1, u = this.isUsing(!0) ? "using" : this.isAwaitUsing(!0) ? "await using" : null;
  if (u) {
    var l = this.startNode();
    return this.next(), u === "await using" && this.next(), this.parseVar(l, !0, u), this.finishNode(l, "VariableDeclaration"), this.parseForAfterInit(e, l, t);
  }
  var c = this.containsEsc, d = new la(), h = this.start, p = t > -1 ? this.parseExprSubscripts(d, "await") : this.parseExpression(!0, d);
  return this.type === o._in || (n = this.options.ecmaVersion >= 6 && this.isContextual("of")) ? (t > -1 ? (this.type === o._in && this.unexpected(t), e.await = !0) : n && this.options.ecmaVersion >= 8 && (p.start === h && !c && p.type === "Identifier" && p.name === "async" ? this.unexpected() : this.options.ecmaVersion >= 9 && (e.await = !1)), s && n && this.raise(p.start, "The left-hand side of a for-of loop may not start with 'let'."), this.toAssignable(p, !1, d), this.checkLValPattern(p), this.parseForIn(e, p)) : (this.checkExpressionErrors(d, !0), t > -1 && this.unexpected(t), this.parseFor(e, p));
};
S.parseForAfterInit = function(e, t, a) {
  return (this.type === o._in || this.options.ecmaVersion >= 6 && this.isContextual("of")) && t.declarations.length === 1 ? (this.options.ecmaVersion >= 9 && (this.type === o._in ? a > -1 && this.unexpected(a) : e.await = a > -1), this.parseForIn(e, t)) : (a > -1 && this.unexpected(a), this.parseFor(e, t));
};
S.parseFunctionStatement = function(e, t, a) {
  return this.next(), this.parseFunction(e, It | (a ? 0 : La), !1, t);
};
S.parseIfStatement = function(e) {
  return this.next(), e.test = this.parseParenExpression(), e.consequent = this.parseStatement("if"), e.alternate = this.eat(o._else) ? this.parseStatement("if") : null, this.finishNode(e, "IfStatement");
};
S.parseReturnStatement = function(e) {
  return !this.inFunction && !this.options.allowReturnOutsideFunction && this.raise(this.start, "'return' outside of function"), this.next(), this.eat(o.semi) || this.insertSemicolon() ? e.argument = null : (e.argument = this.parseExpression(), this.semicolon()), this.finishNode(e, "ReturnStatement");
};
S.parseSwitchStatement = function(e) {
  this.next(), e.discriminant = this.parseParenExpression(), e.cases = [], this.expect(o.braceL), this.labels.push(en), this.enterScope(0);
  for (var t, a = !1; this.type !== o.braceR; )
    if (this.type === o._case || this.type === o._default) {
      var i = this.type === o._case;
      t && this.finishNode(t, "SwitchCase"), e.cases.push(t = this.startNode()), t.consequent = [], this.next(), i ? t.test = this.parseExpression() : (a && this.raiseRecoverable(this.lastTokStart, "Multiple default clauses"), a = !0, t.test = null), this.expect(o.colon);
    } else
      t || this.unexpected(), t.consequent.push(this.parseStatement(null));
  return this.exitScope(), t && this.finishNode(t, "SwitchCase"), this.next(), this.labels.pop(), this.finishNode(e, "SwitchStatement");
};
S.parseThrowStatement = function(e) {
  return this.next(), pe.test(this.input.slice(this.lastTokEnd, this.start)) && this.raise(this.lastTokEnd, "Illegal newline after throw"), e.argument = this.parseExpression(), this.semicolon(), this.finishNode(e, "ThrowStatement");
};
var tn = [];
S.parseCatchClauseParam = function() {
  var e = this.parseBindingAtom(), t = e.type === "Identifier";
  return this.enterScope(t ? sr : 0), this.checkLValPattern(e, t ? ur : $e), this.expect(o.parenR), e;
};
S.parseTryStatement = function(e) {
  if (this.next(), e.block = this.parseBlock(), e.handler = null, this.type === o._catch) {
    var t = this.startNode();
    this.next(), this.eat(o.parenL) ? t.param = this.parseCatchClauseParam() : (this.options.ecmaVersion < 10 && this.unexpected(), t.param = null, this.enterScope(0)), t.body = this.parseBlock(!1), this.exitScope(), e.handler = this.finishNode(t, "CatchClause");
  }
  return e.finalizer = this.eat(o._finally) ? this.parseBlock() : null, !e.handler && !e.finalizer && this.raise(e.start, "Missing catch or finally clause"), this.finishNode(e, "TryStatement");
};
S.parseVarStatement = function(e, t, a) {
  return this.next(), this.parseVar(e, !1, t, a), this.semicolon(), this.finishNode(e, "VariableDeclaration");
};
S.parseWhileStatement = function(e) {
  return this.next(), e.test = this.parseParenExpression(), this.labels.push(Za), e.body = this.parseStatement("while"), this.labels.pop(), this.finishNode(e, "WhileStatement");
};
S.parseWithStatement = function(e) {
  return this.strict && this.raise(this.start, "'with' in strict mode"), this.next(), e.object = this.parseParenExpression(), e.body = this.parseStatement("with"), this.finishNode(e, "WithStatement");
};
S.parseEmptyStatement = function(e) {
  return this.next(), this.finishNode(e, "EmptyStatement");
};
S.parseLabeledStatement = function(e, t, a, i) {
  for (var r = 0, s = this.labels; r < s.length; r += 1) {
    var n = s[r];
    n.name === t && this.raise(a.start, "Label '" + t + "' is already declared");
  }
  for (var u = this.type.isLoop ? "loop" : this.type === o._switch ? "switch" : null, l = this.labels.length - 1; l >= 0; l--) {
    var c = this.labels[l];
    if (c.statementStart === e.start)
      c.statementStart = this.start, c.kind = u;
    else
      break;
  }
  return this.labels.push({ name: t, kind: u, statementStart: this.start }), e.body = this.parseStatement(i ? i.indexOf("label") === -1 ? i + "label" : i : "label"), this.labels.pop(), e.label = a, this.finishNode(e, "LabeledStatement");
};
S.parseExpressionStatement = function(e, t) {
  return e.expression = t, this.semicolon(), this.finishNode(e, "ExpressionStatement");
};
S.parseBlock = function(e, t, a) {
  for (e === void 0 && (e = !0), t === void 0 && (t = this.startNode()), t.body = [], this.expect(o.braceL), e && this.enterScope(0); this.type !== o.braceR; ) {
    var i = this.parseStatement(null);
    t.body.push(i);
  }
  return a && (this.strict = !1), this.next(), e && this.exitScope(), this.finishNode(t, "BlockStatement");
};
S.parseFor = function(e, t) {
  return e.init = t, this.expect(o.semi), e.test = this.type === o.semi ? null : this.parseExpression(), this.expect(o.semi), e.update = this.type === o.parenR ? null : this.parseExpression(), this.expect(o.parenR), e.body = this.parseStatement("for"), this.exitScope(), this.labels.pop(), this.finishNode(e, "ForStatement");
};
S.parseForIn = function(e, t) {
  var a = this.type === o._in;
  return this.next(), t.type === "VariableDeclaration" && t.declarations[0].init != null && (!a || this.options.ecmaVersion < 8 || this.strict || t.kind !== "var" || t.declarations[0].id.type !== "Identifier") && this.raise(
    t.start,
    (a ? "for-in" : "for-of") + " loop variable declaration may not have an initializer"
  ), e.left = t, e.right = a ? this.parseExpression() : this.parseMaybeAssign(), this.expect(o.parenR), e.body = this.parseStatement("for"), this.exitScope(), this.labels.pop(), this.finishNode(e, a ? "ForInStatement" : "ForOfStatement");
};
S.parseVar = function(e, t, a, i) {
  for (e.declarations = [], e.kind = a; ; ) {
    var r = this.startNode();
    if (this.parseVarId(r, a), this.eat(o.eq) ? r.init = this.parseMaybeAssign(t) : !i && a === "const" && !(this.type === o._in || this.options.ecmaVersion >= 6 && this.isContextual("of")) ? this.unexpected() : !i && (a === "using" || a === "await using") && this.options.ecmaVersion >= 17 && this.type !== o._in && !this.isContextual("of") ? this.raise(this.lastTokEnd, "Missing initializer in " + a + " declaration") : !i && r.id.type !== "Identifier" && !(t && (this.type === o._in || this.isContextual("of"))) ? this.raise(this.lastTokEnd, "Complex binding patterns require an initialization value") : r.init = null, e.declarations.push(this.finishNode(r, "VariableDeclarator")), !this.eat(o.comma))
      break;
  }
  return e;
};
S.parseVarId = function(e, t) {
  e.id = t === "using" || t === "await using" ? this.parseIdent() : this.parseBindingAtom(), this.checkLValPattern(e.id, t === "var" ? Ja : $e, !1);
};
var It = 1, La = 2, cr = 4;
S.parseFunction = function(e, t, a, i, r) {
  this.initFunction(e), (this.options.ecmaVersion >= 9 || this.options.ecmaVersion >= 6 && !i) && (this.type === o.star && t & La && this.unexpected(), e.generator = this.eat(o.star)), this.options.ecmaVersion >= 8 && (e.async = !!i), t & It && (e.id = t & cr && this.type !== o.name ? null : this.parseIdent(), e.id && !(t & La) && this.checkLValSimple(e.id, this.strict || e.generator || e.async ? this.treatFunctionsAsVar ? Ja : $e : or));
  var s = this.yieldPos, n = this.awaitPos, u = this.awaitIdentPos;
  return this.yieldPos = 0, this.awaitPos = 0, this.awaitIdentPos = 0, this.enterScope(Xa(e.async, e.generator)), t & It || (e.id = this.type === o.name ? this.parseIdent() : null), this.parseFunctionParams(e), this.parseFunctionBody(e, a, !1, r), this.yieldPos = s, this.awaitPos = n, this.awaitIdentPos = u, this.finishNode(e, t & It ? "FunctionDeclaration" : "FunctionExpression");
};
S.parseFunctionParams = function(e) {
  this.expect(o.parenL), e.params = this.parseBindingList(o.parenR, !1, this.options.ecmaVersion >= 8), this.checkYieldAwaitInDefaultParams();
};
S.parseClass = function(e, t) {
  this.next();
  var a = this.strict;
  this.strict = !0, this.parseClassId(e, t), this.parseClassSuper(e);
  var i = this.enterClassBody(), r = this.startNode(), s = !1;
  for (r.body = [], this.expect(o.braceL); this.type !== o.braceR; ) {
    var n = this.parseClassElement(e.superClass !== null);
    n && (r.body.push(n), n.type === "MethodDefinition" && n.kind === "constructor" ? (s && this.raiseRecoverable(n.start, "Duplicate constructor in the same class"), s = !0) : n.key && n.key.type === "PrivateIdentifier" && an(i, n) && this.raiseRecoverable(n.key.start, "Identifier '#" + n.key.name + "' has already been declared"));
  }
  return this.strict = a, this.next(), e.body = this.finishNode(r, "ClassBody"), this.exitClassBody(), this.finishNode(e, t ? "ClassDeclaration" : "ClassExpression");
};
S.parseClassElement = function(e) {
  if (this.eat(o.semi))
    return null;
  var t = this.options.ecmaVersion, a = this.startNode(), i = "", r = !1, s = !1, n = "method", u = !1;
  if (this.eatContextual("static")) {
    if (t >= 13 && this.eat(o.braceL))
      return this.parseClassStaticBlock(a), a;
    this.isClassElementNameStart() || this.type === o.star ? u = !0 : i = "static";
  }
  if (a.static = u, !i && t >= 8 && this.eatContextual("async") && ((this.isClassElementNameStart() || this.type === o.star) && !this.canInsertSemicolon() ? s = !0 : i = "async"), !i && (t >= 9 || !s) && this.eat(o.star) && (r = !0), !i && !s && !r) {
    var l = this.value;
    (this.eatContextual("get") || this.eatContextual("set")) && (this.isClassElementNameStart() ? n = l : i = l);
  }
  if (i ? (a.computed = !1, a.key = this.startNodeAt(this.lastTokStart, this.lastTokStartLoc), a.key.name = i, this.finishNode(a.key, "Identifier")) : this.parseClassElementName(a), t < 13 || this.type === o.parenL || n !== "method" || r || s) {
    var c = !a.static && Kt(a, "constructor"), d = c && e;
    c && n !== "method" && this.raise(a.key.start, "Constructor can't have get/set modifier"), a.kind = c ? "constructor" : n, this.parseClassMethod(a, r, s, d);
  } else
    this.parseClassField(a);
  return a;
};
S.isClassElementNameStart = function() {
  return this.type === o.name || this.type === o.privateId || this.type === o.num || this.type === o.string || this.type === o.bracketL || this.type.keyword;
};
S.parseClassElementName = function(e) {
  this.type === o.privateId ? (this.value === "constructor" && this.raise(this.start, "Classes can't have an element named '#constructor'"), e.computed = !1, e.key = this.parsePrivateIdent()) : this.parsePropertyName(e);
};
S.parseClassMethod = function(e, t, a, i) {
  var r = e.key;
  e.kind === "constructor" ? (t && this.raise(r.start, "Constructor can't be a generator"), a && this.raise(r.start, "Constructor can't be an async method")) : e.static && Kt(e, "prototype") && this.raise(r.start, "Classes may not have a static property named prototype");
  var s = e.value = this.parseMethod(t, a, i);
  return e.kind === "get" && s.params.length !== 0 && this.raiseRecoverable(s.start, "getter should have no params"), e.kind === "set" && s.params.length !== 1 && this.raiseRecoverable(s.start, "setter should have exactly one param"), e.kind === "set" && s.params[0].type === "RestElement" && this.raiseRecoverable(s.params[0].start, "Setter cannot use rest params"), this.finishNode(e, "MethodDefinition");
};
S.parseClassField = function(e) {
  return Kt(e, "constructor") ? this.raise(e.key.start, "Classes can't have a field named 'constructor'") : e.static && Kt(e, "prototype") && this.raise(e.key.start, "Classes can't have a static field named 'prototype'"), this.eat(o.eq) ? (this.enterScope(Vt | oa), e.value = this.parseMaybeAssign(), this.exitScope()) : e.value = null, this.semicolon(), this.finishNode(e, "PropertyDefinition");
};
S.parseClassStaticBlock = function(e) {
  e.body = [];
  var t = this.labels;
  for (this.labels = [], this.enterScope(Ze | oa); this.type !== o.braceR; ) {
    var a = this.parseStatement(null);
    e.body.push(a);
  }
  return this.next(), this.exitScope(), this.labels = t, this.finishNode(e, "StaticBlock");
};
S.parseClassId = function(e, t) {
  this.type === o.name ? (e.id = this.parseIdent(), t && this.checkLValSimple(e.id, $e, !1)) : (t === !0 && this.unexpected(), e.id = null);
};
S.parseClassSuper = function(e) {
  e.superClass = this.eat(o._extends) ? this.parseExprSubscripts(null, !1) : null;
};
S.enterClassBody = function() {
  var e = { declared: /* @__PURE__ */ Object.create(null), used: [] };
  return this.privateNameStack.push(e), e.declared;
};
S.exitClassBody = function() {
  var e = this.privateNameStack.pop(), t = e.declared, a = e.used;
  if (this.options.checkPrivateFields)
    for (var i = this.privateNameStack.length, r = i === 0 ? null : this.privateNameStack[i - 1], s = 0; s < a.length; ++s) {
      var n = a[s];
      pt(t, n.name) || (r ? r.used.push(n) : this.raiseRecoverable(n.start, "Private field '#" + n.name + "' must be declared in an enclosing class"));
    }
};
function an(e, t) {
  var a = t.key.name, i = e[a], r = "true";
  return t.type === "MethodDefinition" && (t.kind === "get" || t.kind === "set") && (r = (t.static ? "s" : "i") + t.kind), i === "iget" && r === "iset" || i === "iset" && r === "iget" || i === "sget" && r === "sset" || i === "sset" && r === "sget" ? (e[a] = "true", !1) : i ? !0 : (e[a] = r, !1);
}
function Kt(e, t) {
  var a = e.computed, i = e.key;
  return !a && (i.type === "Identifier" && i.name === t || i.type === "Literal" && i.value === t);
}
S.parseExportAllDeclaration = function(e, t) {
  return this.options.ecmaVersion >= 11 && (this.eatContextual("as") ? (e.exported = this.parseModuleExportName(), this.checkExport(t, e.exported, this.lastTokStart)) : e.exported = null), this.expectContextual("from"), this.type !== o.string && this.unexpected(), e.source = this.parseExprAtom(), this.options.ecmaVersion >= 16 && (e.attributes = this.parseWithClause()), this.semicolon(), this.finishNode(e, "ExportAllDeclaration");
};
S.parseExport = function(e, t) {
  if (this.next(), this.eat(o.star))
    return this.parseExportAllDeclaration(e, t);
  if (this.eat(o._default))
    return this.checkExport(t, "default", this.lastTokStart), e.declaration = this.parseExportDefaultDeclaration(), this.finishNode(e, "ExportDefaultDeclaration");
  if (this.shouldParseExportStatement())
    e.declaration = this.parseExportDeclaration(e), e.declaration.type === "VariableDeclaration" ? this.checkVariableExport(t, e.declaration.declarations) : this.checkExport(t, e.declaration.id, e.declaration.id.start), e.specifiers = [], e.source = null, this.options.ecmaVersion >= 16 && (e.attributes = []);
  else {
    if (e.declaration = null, e.specifiers = this.parseExportSpecifiers(t), this.eatContextual("from"))
      this.type !== o.string && this.unexpected(), e.source = this.parseExprAtom(), this.options.ecmaVersion >= 16 && (e.attributes = this.parseWithClause());
    else {
      for (var a = 0, i = e.specifiers; a < i.length; a += 1) {
        var r = i[a];
        this.checkUnreserved(r.local), this.checkLocalExport(r.local), r.local.type === "Literal" && this.raise(r.local.start, "A string literal cannot be used as an exported binding without `from`.");
      }
      e.source = null, this.options.ecmaVersion >= 16 && (e.attributes = []);
    }
    this.semicolon();
  }
  return this.finishNode(e, "ExportNamedDeclaration");
};
S.parseExportDeclaration = function(e) {
  return this.parseStatement(null);
};
S.parseExportDefaultDeclaration = function() {
  var e;
  if (this.type === o._function || (e = this.isAsyncFunction())) {
    var t = this.startNode();
    return this.next(), e && this.next(), this.parseFunction(t, It | cr, !1, e);
  } else if (this.type === o._class) {
    var a = this.startNode();
    return this.parseClass(a, "nullableID");
  } else {
    var i = this.parseMaybeAssign();
    return this.semicolon(), i;
  }
};
S.checkExport = function(e, t, a) {
  e && (typeof t != "string" && (t = t.type === "Identifier" ? t.name : t.value), pt(e, t) && this.raiseRecoverable(a, "Duplicate export '" + t + "'"), e[t] = !0);
};
S.checkPatternExport = function(e, t) {
  var a = t.type;
  if (a === "Identifier")
    this.checkExport(e, t, t.start);
  else if (a === "ObjectPattern")
    for (var i = 0, r = t.properties; i < r.length; i += 1) {
      var s = r[i];
      this.checkPatternExport(e, s);
    }
  else if (a === "ArrayPattern")
    for (var n = 0, u = t.elements; n < u.length; n += 1) {
      var l = u[n];
      l && this.checkPatternExport(e, l);
    }
  else a === "Property" ? this.checkPatternExport(e, t.value) : a === "AssignmentPattern" ? this.checkPatternExport(e, t.left) : a === "RestElement" && this.checkPatternExport(e, t.argument);
};
S.checkVariableExport = function(e, t) {
  if (e)
    for (var a = 0, i = t; a < i.length; a += 1) {
      var r = i[a];
      this.checkPatternExport(e, r.id);
    }
};
S.shouldParseExportStatement = function() {
  return this.type.keyword === "var" || this.type.keyword === "const" || this.type.keyword === "class" || this.type.keyword === "function" || this.isLet() || this.isAsyncFunction();
};
S.parseExportSpecifier = function(e) {
  var t = this.startNode();
  return t.local = this.parseModuleExportName(), t.exported = this.eatContextual("as") ? this.parseModuleExportName() : t.local, this.checkExport(
    e,
    t.exported,
    t.exported.start
  ), this.finishNode(t, "ExportSpecifier");
};
S.parseExportSpecifiers = function(e) {
  var t = [], a = !0;
  for (this.expect(o.braceL); !this.eat(o.braceR); ) {
    if (a)
      a = !1;
    else if (this.expect(o.comma), this.afterTrailingComma(o.braceR))
      break;
    t.push(this.parseExportSpecifier(e));
  }
  return t;
};
S.parseImport = function(e) {
  return this.next(), this.type === o.string ? (e.specifiers = tn, e.source = this.parseExprAtom()) : (e.specifiers = this.parseImportSpecifiers(), this.expectContextual("from"), e.source = this.type === o.string ? this.parseExprAtom() : this.unexpected()), this.options.ecmaVersion >= 16 && (e.attributes = this.parseWithClause()), this.semicolon(), this.finishNode(e, "ImportDeclaration");
};
S.parseImportSpecifier = function() {
  var e = this.startNode();
  return e.imported = this.parseModuleExportName(), this.eatContextual("as") ? e.local = this.parseIdent() : (this.checkUnreserved(e.imported), e.local = e.imported), this.checkLValSimple(e.local, $e), this.finishNode(e, "ImportSpecifier");
};
S.parseImportDefaultSpecifier = function() {
  var e = this.startNode();
  return e.local = this.parseIdent(), this.checkLValSimple(e.local, $e), this.finishNode(e, "ImportDefaultSpecifier");
};
S.parseImportNamespaceSpecifier = function() {
  var e = this.startNode();
  return this.next(), this.expectContextual("as"), e.local = this.parseIdent(), this.checkLValSimple(e.local, $e), this.finishNode(e, "ImportNamespaceSpecifier");
};
S.parseImportSpecifiers = function() {
  var e = [], t = !0;
  if (this.type === o.name && (e.push(this.parseImportDefaultSpecifier()), !this.eat(o.comma)))
    return e;
  if (this.type === o.star)
    return e.push(this.parseImportNamespaceSpecifier()), e;
  for (this.expect(o.braceL); !this.eat(o.braceR); ) {
    if (t)
      t = !1;
    else if (this.expect(o.comma), this.afterTrailingComma(o.braceR))
      break;
    e.push(this.parseImportSpecifier());
  }
  return e;
};
S.parseWithClause = function() {
  var e = [];
  if (!this.eat(o._with))
    return e;
  this.expect(o.braceL);
  for (var t = {}, a = !0; !this.eat(o.braceR); ) {
    if (a)
      a = !1;
    else if (this.expect(o.comma), this.afterTrailingComma(o.braceR))
      break;
    var i = this.parseImportAttribute(), r = i.key.type === "Identifier" ? i.key.name : i.key.value;
    pt(t, r) && this.raiseRecoverable(i.key.start, "Duplicate attribute key '" + r + "'"), t[r] = !0, e.push(i);
  }
  return e;
};
S.parseImportAttribute = function() {
  var e = this.startNode();
  return e.key = this.type === o.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never"), this.expect(o.colon), this.type !== o.string && this.unexpected(), e.value = this.parseExprAtom(), this.finishNode(e, "ImportAttribute");
};
S.parseModuleExportName = function() {
  if (this.options.ecmaVersion >= 13 && this.type === o.string) {
    var e = this.parseLiteral(this.value);
    return Qs.test(e.value) && this.raise(e.start, "An export name cannot include a lone surrogate."), e;
  }
  return this.parseIdent(!0);
};
S.adaptDirectivePrologue = function(e) {
  for (var t = 0; t < e.length && this.isDirectiveCandidate(e[t]); ++t)
    e[t].directive = e[t].expression.raw.slice(1, -1);
};
S.isDirectiveCandidate = function(e) {
  return this.options.ecmaVersion >= 5 && e.type === "ExpressionStatement" && e.expression.type === "Literal" && typeof e.expression.value == "string" && // Reject parenthesized strings.
  (this.input[e.start] === '"' || this.input[e.start] === "'");
};
var ve = X.prototype;
ve.toAssignable = function(e, t, a) {
  if (this.options.ecmaVersion >= 6 && e)
    switch (e.type) {
      case "Identifier":
        this.inAsync && e.name === "await" && this.raise(e.start, "Cannot use 'await' as identifier inside an async function");
        break;
      case "ObjectPattern":
      case "ArrayPattern":
      case "AssignmentPattern":
      case "RestElement":
        break;
      case "ObjectExpression":
        e.type = "ObjectPattern", a && this.checkPatternErrors(a, !0);
        for (var i = 0, r = e.properties; i < r.length; i += 1) {
          var s = r[i];
          this.toAssignable(s, t), s.type === "RestElement" && (s.argument.type === "ArrayPattern" || s.argument.type === "ObjectPattern") && this.raise(s.argument.start, "Unexpected token");
        }
        break;
      case "Property":
        e.kind !== "init" && this.raise(e.key.start, "Object pattern can't contain getter or setter"), this.toAssignable(e.value, t);
        break;
      case "ArrayExpression":
        e.type = "ArrayPattern", a && this.checkPatternErrors(a, !0), this.toAssignableList(e.elements, t);
        break;
      case "SpreadElement":
        e.type = "RestElement", this.toAssignable(e.argument, t), e.argument.type === "AssignmentPattern" && this.raise(e.argument.start, "Rest elements cannot have a default value");
        break;
      case "AssignmentExpression":
        e.operator !== "=" && this.raise(e.left.end, "Only '=' operator can be used for specifying default value."), e.type = "AssignmentPattern", delete e.operator, this.toAssignable(e.left, t);
        break;
      case "ParenthesizedExpression":
        this.toAssignable(e.expression, t, a);
        break;
      case "ChainExpression":
        this.raiseRecoverable(e.start, "Optional chaining cannot appear in left-hand side");
        break;
      case "MemberExpression":
        if (!t)
          break;
      default:
        this.raise(e.start, "Assigning to rvalue");
    }
  else a && this.checkPatternErrors(a, !0);
  return e;
};
ve.toAssignableList = function(e, t) {
  for (var a = e.length, i = 0; i < a; i++) {
    var r = e[i];
    r && this.toAssignable(r, t);
  }
  if (a) {
    var s = e[a - 1];
    this.options.ecmaVersion === 6 && t && s && s.type === "RestElement" && s.argument.type !== "Identifier" && this.unexpected(s.argument.start);
  }
  return e;
};
ve.parseSpread = function(e) {
  var t = this.startNode();
  return this.next(), t.argument = this.parseMaybeAssign(!1, e), this.finishNode(t, "SpreadElement");
};
ve.parseRestBinding = function() {
  var e = this.startNode();
  return this.next(), this.options.ecmaVersion === 6 && this.type !== o.name && this.unexpected(), e.argument = this.parseBindingAtom(), this.finishNode(e, "RestElement");
};
ve.parseBindingAtom = function() {
  if (this.options.ecmaVersion >= 6)
    switch (this.type) {
      case o.bracketL:
        var e = this.startNode();
        return this.next(), e.elements = this.parseBindingList(o.bracketR, !0, !0), this.finishNode(e, "ArrayPattern");
      case o.braceL:
        return this.parseObj(!0);
    }
  return this.parseIdent();
};
ve.parseBindingList = function(e, t, a, i) {
  for (var r = [], s = !0; !this.eat(e); )
    if (s ? s = !1 : this.expect(o.comma), t && this.type === o.comma)
      r.push(null);
    else {
      if (a && this.afterTrailingComma(e))
        break;
      if (this.type === o.ellipsis) {
        var n = this.parseRestBinding();
        this.parseBindingListItem(n), r.push(n), this.type === o.comma && this.raiseRecoverable(this.start, "Comma is not permitted after the rest element"), this.expect(e);
        break;
      } else
        r.push(this.parseAssignableListItem(i));
    }
  return r;
};
ve.parseAssignableListItem = function(e) {
  var t = this.parseMaybeDefault(this.start, this.startLoc);
  return this.parseBindingListItem(t), t;
};
ve.parseBindingListItem = function(e) {
  return e;
};
ve.parseMaybeDefault = function(e, t, a) {
  if (a = a || this.parseBindingAtom(), this.options.ecmaVersion < 6 || !this.eat(o.eq))
    return a;
  var i = this.startNodeAt(e, t);
  return i.left = a, i.right = this.parseMaybeAssign(), this.finishNode(i, "AssignmentPattern");
};
ve.checkLValSimple = function(e, t, a) {
  t === void 0 && (t = zt);
  var i = t !== zt;
  switch (e.type) {
    case "Identifier":
      this.strict && this.reservedWordsStrictBind.test(e.name) && this.raiseRecoverable(e.start, (i ? "Binding " : "Assigning to ") + e.name + " in strict mode"), i && (t === $e && e.name === "let" && this.raiseRecoverable(e.start, "let is disallowed as a lexically bound name"), a && (pt(a, e.name) && this.raiseRecoverable(e.start, "Argument name clash"), a[e.name] = !0), t !== lr && this.declareName(e.name, t, e.start));
      break;
    case "ChainExpression":
      this.raiseRecoverable(e.start, "Optional chaining cannot appear in left-hand side");
      break;
    case "MemberExpression":
      i && this.raiseRecoverable(e.start, "Binding member expression");
      break;
    case "ParenthesizedExpression":
      return i && this.raiseRecoverable(e.start, "Binding parenthesized expression"), this.checkLValSimple(e.expression, t, a);
    default:
      this.raise(e.start, (i ? "Binding" : "Assigning to") + " rvalue");
  }
};
ve.checkLValPattern = function(e, t, a) {
  switch (t === void 0 && (t = zt), e.type) {
    case "ObjectPattern":
      for (var i = 0, r = e.properties; i < r.length; i += 1) {
        var s = r[i];
        this.checkLValInnerPattern(s, t, a);
      }
      break;
    case "ArrayPattern":
      for (var n = 0, u = e.elements; n < u.length; n += 1) {
        var l = u[n];
        l && this.checkLValInnerPattern(l, t, a);
      }
      break;
    default:
      this.checkLValSimple(e, t, a);
  }
};
ve.checkLValInnerPattern = function(e, t, a) {
  switch (t === void 0 && (t = zt), e.type) {
    case "Property":
      this.checkLValInnerPattern(e.value, t, a);
      break;
    case "AssignmentPattern":
      this.checkLValPattern(e.left, t, a);
      break;
    case "RestElement":
      this.checkLValPattern(e.argument, t, a);
      break;
    default:
      this.checkLValPattern(e, t, a);
  }
};
var ke = function(t, a, i, r, s) {
  this.token = t, this.isExpr = !!a, this.preserveSpace = !!i, this.override = r, this.generator = !!s;
}, $ = {
  b_stat: new ke("{", !1),
  b_expr: new ke("{", !0),
  b_tmpl: new ke("${", !1),
  p_stat: new ke("(", !1),
  p_expr: new ke("(", !0),
  q_tmpl: new ke("`", !0, !0, function(e) {
    return e.tryReadTemplateToken();
  }),
  f_stat: new ke("function", !1),
  f_expr: new ke("function", !0),
  f_expr_gen: new ke("function", !0, !1, null, !0),
  f_gen: new ke("function", !1, !1, null, !0)
}, ft = X.prototype;
ft.initialContext = function() {
  return [$.b_stat];
};
ft.curContext = function() {
  return this.context[this.context.length - 1];
};
ft.braceIsBlock = function(e) {
  var t = this.curContext();
  return t === $.f_expr || t === $.f_stat ? !0 : e === o.colon && (t === $.b_stat || t === $.b_expr) ? !t.isExpr : e === o._return || e === o.name && this.exprAllowed ? pe.test(this.input.slice(this.lastTokEnd, this.start)) : e === o._else || e === o.semi || e === o.eof || e === o.parenR || e === o.arrow ? !0 : e === o.braceL ? t === $.b_stat : e === o._var || e === o._const || e === o.name ? !1 : !this.exprAllowed;
};
ft.inGeneratorContext = function() {
  for (var e = this.context.length - 1; e >= 1; e--) {
    var t = this.context[e];
    if (t.token === "function")
      return t.generator;
  }
  return !1;
};
ft.updateContext = function(e) {
  var t, a = this.type;
  a.keyword && e === o.dot ? this.exprAllowed = !1 : (t = a.updateContext) ? t.call(this, e) : this.exprAllowed = a.beforeExpr;
};
ft.overrideContext = function(e) {
  this.curContext() !== e && (this.context[this.context.length - 1] = e);
};
o.parenR.updateContext = o.braceR.updateContext = function() {
  if (this.context.length === 1) {
    this.exprAllowed = !0;
    return;
  }
  var e = this.context.pop();
  e === $.b_stat && this.curContext().token === "function" && (e = this.context.pop()), this.exprAllowed = !e.isExpr;
};
o.braceL.updateContext = function(e) {
  this.context.push(this.braceIsBlock(e) ? $.b_stat : $.b_expr), this.exprAllowed = !0;
};
o.dollarBraceL.updateContext = function() {
  this.context.push($.b_tmpl), this.exprAllowed = !0;
};
o.parenL.updateContext = function(e) {
  var t = e === o._if || e === o._for || e === o._with || e === o._while;
  this.context.push(t ? $.p_stat : $.p_expr), this.exprAllowed = !0;
};
o.incDec.updateContext = function() {
};
o._function.updateContext = o._class.updateContext = function(e) {
  e.beforeExpr && e !== o._else && !(e === o.semi && this.curContext() !== $.p_stat) && !(e === o._return && pe.test(this.input.slice(this.lastTokEnd, this.start))) && !((e === o.colon || e === o.braceL) && this.curContext() === $.b_stat) ? this.context.push($.f_expr) : this.context.push($.f_stat), this.exprAllowed = !1;
};
o.colon.updateContext = function() {
  this.curContext().token === "function" && this.context.pop(), this.exprAllowed = !0;
};
o.backQuote.updateContext = function() {
  this.curContext() === $.q_tmpl ? this.context.pop() : this.context.push($.q_tmpl), this.exprAllowed = !1;
};
o.star.updateContext = function(e) {
  if (e === o._function) {
    var t = this.context.length - 1;
    this.context[t] === $.f_expr ? this.context[t] = $.f_expr_gen : this.context[t] = $.f_gen;
  }
  this.exprAllowed = !0;
};
o.name.updateContext = function(e) {
  var t = !1;
  this.options.ecmaVersion >= 6 && e !== o.dot && (this.value === "of" && !this.exprAllowed || this.value === "yield" && this.inGeneratorContext()) && (t = !0), this.exprAllowed = t;
};
var P = X.prototype;
P.checkPropClash = function(e, t, a) {
  if (!(this.options.ecmaVersion >= 9 && e.type === "SpreadElement") && !(this.options.ecmaVersion >= 6 && (e.computed || e.method || e.shorthand))) {
    var i = e.key, r;
    switch (i.type) {
      case "Identifier":
        r = i.name;
        break;
      case "Literal":
        r = String(i.value);
        break;
      default:
        return;
    }
    var s = e.kind;
    if (this.options.ecmaVersion >= 6) {
      r === "__proto__" && s === "init" && (t.proto && (a ? a.doubleProto < 0 && (a.doubleProto = i.start) : this.raiseRecoverable(i.start, "Redefinition of __proto__ property")), t.proto = !0);
      return;
    }
    r = "$" + r;
    var n = t[r];
    if (n) {
      var u;
      s === "init" ? u = this.strict && n.init || n.get || n.set : u = n.init || n[s], u && this.raiseRecoverable(i.start, "Redefinition of property");
    } else
      n = t[r] = {
        init: !1,
        get: !1,
        set: !1
      };
    n[s] = !0;
  }
};
P.parseExpression = function(e, t) {
  var a = this.start, i = this.startLoc, r = this.parseMaybeAssign(e, t);
  if (this.type === o.comma) {
    var s = this.startNodeAt(a, i);
    for (s.expressions = [r]; this.eat(o.comma); )
      s.expressions.push(this.parseMaybeAssign(e, t));
    return this.finishNode(s, "SequenceExpression");
  }
  return r;
};
P.parseMaybeAssign = function(e, t, a) {
  if (this.isContextual("yield")) {
    if (this.inGenerator)
      return this.parseYield(e);
    this.exprAllowed = !1;
  }
  var i = !1, r = -1, s = -1, n = -1;
  t ? (r = t.parenthesizedAssign, s = t.trailingComma, n = t.doubleProto, t.parenthesizedAssign = t.trailingComma = -1) : (t = new la(), i = !0);
  var u = this.start, l = this.startLoc;
  (this.type === o.parenL || this.type === o.name) && (this.potentialArrowAt = this.start, this.potentialArrowInForAwait = e === "await");
  var c = this.parseMaybeConditional(e, t);
  if (a && (c = a.call(this, c, u, l)), this.type.isAssign) {
    var d = this.startNodeAt(u, l);
    return d.operator = this.value, this.type === o.eq && (c = this.toAssignable(c, !1, t)), i || (t.parenthesizedAssign = t.trailingComma = t.doubleProto = -1), t.shorthandAssign >= c.start && (t.shorthandAssign = -1), this.type === o.eq ? this.checkLValPattern(c) : this.checkLValSimple(c), d.left = c, this.next(), d.right = this.parseMaybeAssign(e), n > -1 && (t.doubleProto = n), this.finishNode(d, "AssignmentExpression");
  } else
    i && this.checkExpressionErrors(t, !0);
  return r > -1 && (t.parenthesizedAssign = r), s > -1 && (t.trailingComma = s), c;
};
P.parseMaybeConditional = function(e, t) {
  var a = this.start, i = this.startLoc, r = this.parseExprOps(e, t);
  if (this.checkExpressionErrors(t))
    return r;
  if (this.eat(o.question)) {
    var s = this.startNodeAt(a, i);
    return s.test = r, s.consequent = this.parseMaybeAssign(), this.expect(o.colon), s.alternate = this.parseMaybeAssign(e), this.finishNode(s, "ConditionalExpression");
  }
  return r;
};
P.parseExprOps = function(e, t) {
  var a = this.start, i = this.startLoc, r = this.parseMaybeUnary(t, !1, !1, e);
  return this.checkExpressionErrors(t) || r.start === a && r.type === "ArrowFunctionExpression" ? r : this.parseExprOp(r, a, i, -1, e);
};
P.parseExprOp = function(e, t, a, i, r) {
  var s = this.type.binop;
  if (s != null && (!r || this.type !== o._in) && s > i) {
    var n = this.type === o.logicalOR || this.type === o.logicalAND, u = this.type === o.coalesce;
    u && (s = o.logicalAND.binop);
    var l = this.value;
    this.next();
    var c = this.start, d = this.startLoc, h = this.parseExprOp(this.parseMaybeUnary(null, !1, !1, r), c, d, s, r), p = this.buildBinary(t, a, e, h, l, n || u);
    return (n && this.type === o.coalesce || u && (this.type === o.logicalOR || this.type === o.logicalAND)) && this.raiseRecoverable(this.start, "Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses"), this.parseExprOp(p, t, a, i, r);
  }
  return e;
};
P.buildBinary = function(e, t, a, i, r, s) {
  i.type === "PrivateIdentifier" && this.raise(i.start, "Private identifier can only be left side of binary expression");
  var n = this.startNodeAt(e, t);
  return n.left = a, n.operator = r, n.right = i, this.finishNode(n, s ? "LogicalExpression" : "BinaryExpression");
};
P.parseMaybeUnary = function(e, t, a, i) {
  var r = this.start, s = this.startLoc, n;
  if (this.isContextual("await") && this.canAwait)
    n = this.parseAwait(i), t = !0;
  else if (this.type.prefix) {
    var u = this.startNode(), l = this.type === o.incDec;
    u.operator = this.value, u.prefix = !0, this.next(), u.argument = this.parseMaybeUnary(null, !0, l, i), this.checkExpressionErrors(e, !0), l ? this.checkLValSimple(u.argument) : this.strict && u.operator === "delete" && dr(u.argument) ? this.raiseRecoverable(u.start, "Deleting local variable in strict mode") : u.operator === "delete" && Na(u.argument) ? this.raiseRecoverable(u.start, "Private fields can not be deleted") : t = !0, n = this.finishNode(u, l ? "UpdateExpression" : "UnaryExpression");
  } else if (!t && this.type === o.privateId)
    (i || this.privateNameStack.length === 0) && this.options.checkPrivateFields && this.unexpected(), n = this.parsePrivateIdent(), this.type !== o._in && this.unexpected();
  else {
    if (n = this.parseExprSubscripts(e, i), this.checkExpressionErrors(e))
      return n;
    for (; this.type.postfix && !this.canInsertSemicolon(); ) {
      var c = this.startNodeAt(r, s);
      c.operator = this.value, c.prefix = !1, c.argument = n, this.checkLValSimple(n), this.next(), n = this.finishNode(c, "UpdateExpression");
    }
  }
  if (!a && this.eat(o.starstar))
    if (t)
      this.unexpected(this.lastTokStart);
    else
      return this.buildBinary(r, s, n, this.parseMaybeUnary(null, !1, !1, i), "**", !1);
  else
    return n;
};
function dr(e) {
  return e.type === "Identifier" || e.type === "ParenthesizedExpression" && dr(e.expression);
}
function Na(e) {
  return e.type === "MemberExpression" && e.property.type === "PrivateIdentifier" || e.type === "ChainExpression" && Na(e.expression) || e.type === "ParenthesizedExpression" && Na(e.expression);
}
P.parseExprSubscripts = function(e, t) {
  var a = this.start, i = this.startLoc, r = this.parseExprAtom(e, t);
  if (r.type === "ArrowFunctionExpression" && this.input.slice(this.lastTokStart, this.lastTokEnd) !== ")")
    return r;
  var s = this.parseSubscripts(r, a, i, !1, t);
  return e && s.type === "MemberExpression" && (e.parenthesizedAssign >= s.start && (e.parenthesizedAssign = -1), e.parenthesizedBind >= s.start && (e.parenthesizedBind = -1), e.trailingComma >= s.start && (e.trailingComma = -1)), s;
};
P.parseSubscripts = function(e, t, a, i, r) {
  for (var s = this.options.ecmaVersion >= 8 && e.type === "Identifier" && e.name === "async" && this.lastTokEnd === e.end && !this.canInsertSemicolon() && e.end - e.start === 5 && this.potentialArrowAt === e.start, n = !1; ; ) {
    var u = this.parseSubscript(e, t, a, i, s, n, r);
    if (u.optional && (n = !0), u === e || u.type === "ArrowFunctionExpression") {
      if (n) {
        var l = this.startNodeAt(t, a);
        l.expression = u, u = this.finishNode(l, "ChainExpression");
      }
      return u;
    }
    e = u;
  }
};
P.shouldParseAsyncArrow = function() {
  return !this.canInsertSemicolon() && this.eat(o.arrow);
};
P.parseSubscriptAsyncArrow = function(e, t, a, i) {
  return this.parseArrowExpression(this.startNodeAt(e, t), a, !0, i);
};
P.parseSubscript = function(e, t, a, i, r, s, n) {
  var u = this.options.ecmaVersion >= 11, l = u && this.eat(o.questionDot);
  i && l && this.raise(this.lastTokStart, "Optional chaining cannot appear in the callee of new expressions");
  var c = this.eat(o.bracketL);
  if (c || l && this.type !== o.parenL && this.type !== o.backQuote || this.eat(o.dot)) {
    var d = this.startNodeAt(t, a);
    d.object = e, c ? (d.property = this.parseExpression(), this.expect(o.bracketR)) : this.type === o.privateId && e.type !== "Super" ? d.property = this.parsePrivateIdent() : d.property = this.parseIdent(this.options.allowReserved !== "never"), d.computed = !!c, u && (d.optional = l), e = this.finishNode(d, "MemberExpression");
  } else if (!i && this.eat(o.parenL)) {
    var h = new la(), p = this.yieldPos, y = this.awaitPos, w = this.awaitIdentPos;
    this.yieldPos = 0, this.awaitPos = 0, this.awaitIdentPos = 0;
    var V = this.parseExprList(o.parenR, this.options.ecmaVersion >= 8, !1, h);
    if (r && !l && this.shouldParseAsyncArrow())
      return this.checkPatternErrors(h, !1), this.checkYieldAwaitInDefaultParams(), this.awaitIdentPos > 0 && this.raise(this.awaitIdentPos, "Cannot use 'await' as identifier inside an async function"), this.yieldPos = p, this.awaitPos = y, this.awaitIdentPos = w, this.parseSubscriptAsyncArrow(t, a, V, n);
    this.checkExpressionErrors(h, !0), this.yieldPos = p || this.yieldPos, this.awaitPos = y || this.awaitPos, this.awaitIdentPos = w || this.awaitIdentPos;
    var j = this.startNodeAt(t, a);
    j.callee = e, j.arguments = V, u && (j.optional = l), e = this.finishNode(j, "CallExpression");
  } else if (this.type === o.backQuote) {
    (l || s) && this.raise(this.start, "Optional chaining cannot appear in the tag of tagged template expressions");
    var K = this.startNodeAt(t, a);
    K.tag = e, K.quasi = this.parseTemplate({ isTagged: !0 }), e = this.finishNode(K, "TaggedTemplateExpression");
  }
  return e;
};
P.parseExprAtom = function(e, t, a) {
  this.type === o.slash && this.readRegexp();
  var i, r = this.potentialArrowAt === this.start;
  switch (this.type) {
    case o._super:
      return this.allowSuper || this.raise(this.start, "'super' keyword outside a method"), i = this.startNode(), this.next(), this.type === o.parenL && !this.allowDirectSuper && this.raise(i.start, "super() call outside constructor of a subclass"), this.type !== o.dot && this.type !== o.bracketL && this.type !== o.parenL && this.unexpected(), this.finishNode(i, "Super");
    case o._this:
      return i = this.startNode(), this.next(), this.finishNode(i, "ThisExpression");
    case o.name:
      var s = this.start, n = this.startLoc, u = this.containsEsc, l = this.parseIdent(!1);
      if (this.options.ecmaVersion >= 8 && !u && l.name === "async" && !this.canInsertSemicolon() && this.eat(o._function))
        return this.overrideContext($.f_expr), this.parseFunction(this.startNodeAt(s, n), 0, !1, !0, t);
      if (r && !this.canInsertSemicolon()) {
        if (this.eat(o.arrow))
          return this.parseArrowExpression(this.startNodeAt(s, n), [l], !1, t);
        if (this.options.ecmaVersion >= 8 && l.name === "async" && this.type === o.name && !u && (!this.potentialArrowInForAwait || this.value !== "of" || this.containsEsc))
          return l = this.parseIdent(!1), (this.canInsertSemicolon() || !this.eat(o.arrow)) && this.unexpected(), this.parseArrowExpression(this.startNodeAt(s, n), [l], !0, t);
      }
      return l;
    case o.regexp:
      var c = this.value;
      return i = this.parseLiteral(c.value), i.regex = { pattern: c.pattern, flags: c.flags }, i;
    case o.num:
    case o.string:
      return this.parseLiteral(this.value);
    case o._null:
    case o._true:
    case o._false:
      return i = this.startNode(), i.value = this.type === o._null ? null : this.type === o._true, i.raw = this.type.keyword, this.next(), this.finishNode(i, "Literal");
    case o.parenL:
      var d = this.start, h = this.parseParenAndDistinguishExpression(r, t);
      return e && (e.parenthesizedAssign < 0 && !this.isSimpleAssignTarget(h) && (e.parenthesizedAssign = d), e.parenthesizedBind < 0 && (e.parenthesizedBind = d)), h;
    case o.bracketL:
      return i = this.startNode(), this.next(), i.elements = this.parseExprList(o.bracketR, !0, !0, e), this.finishNode(i, "ArrayExpression");
    case o.braceL:
      return this.overrideContext($.b_expr), this.parseObj(!1, e);
    case o._function:
      return i = this.startNode(), this.next(), this.parseFunction(i, 0);
    case o._class:
      return this.parseClass(this.startNode(), !1);
    case o._new:
      return this.parseNew();
    case o.backQuote:
      return this.parseTemplate();
    case o._import:
      return this.options.ecmaVersion >= 11 ? this.parseExprImport(a) : this.unexpected();
    default:
      return this.parseExprAtomDefault();
  }
};
P.parseExprAtomDefault = function() {
  this.unexpected();
};
P.parseExprImport = function(e) {
  var t = this.startNode();
  if (this.containsEsc && this.raiseRecoverable(this.start, "Escape sequence in keyword import"), this.next(), this.type === o.parenL && !e)
    return this.parseDynamicImport(t);
  if (this.type === o.dot) {
    var a = this.startNodeAt(t.start, t.loc && t.loc.start);
    return a.name = "import", t.meta = this.finishNode(a, "Identifier"), this.parseImportMeta(t);
  } else
    this.unexpected();
};
P.parseDynamicImport = function(e) {
  if (this.next(), e.source = this.parseMaybeAssign(), this.options.ecmaVersion >= 16)
    this.eat(o.parenR) ? e.options = null : (this.expect(o.comma), this.afterTrailingComma(o.parenR) ? e.options = null : (e.options = this.parseMaybeAssign(), this.eat(o.parenR) || (this.expect(o.comma), this.afterTrailingComma(o.parenR) || this.unexpected())));
  else if (!this.eat(o.parenR)) {
    var t = this.start;
    this.eat(o.comma) && this.eat(o.parenR) ? this.raiseRecoverable(t, "Trailing comma is not allowed in import()") : this.unexpected(t);
  }
  return this.finishNode(e, "ImportExpression");
};
P.parseImportMeta = function(e) {
  this.next();
  var t = this.containsEsc;
  return e.property = this.parseIdent(!0), e.property.name !== "meta" && this.raiseRecoverable(e.property.start, "The only valid meta property for import is 'import.meta'"), t && this.raiseRecoverable(e.start, "'import.meta' must not contain escaped characters"), this.options.sourceType !== "module" && !this.options.allowImportExportEverywhere && this.raiseRecoverable(e.start, "Cannot use 'import.meta' outside a module"), this.finishNode(e, "MetaProperty");
};
P.parseLiteral = function(e) {
  var t = this.startNode();
  return t.value = e, t.raw = this.input.slice(this.start, this.end), t.raw.charCodeAt(t.raw.length - 1) === 110 && (t.bigint = t.value != null ? t.value.toString() : t.raw.slice(0, -1).replace(/_/g, "")), this.next(), this.finishNode(t, "Literal");
};
P.parseParenExpression = function() {
  this.expect(o.parenL);
  var e = this.parseExpression();
  return this.expect(o.parenR), e;
};
P.shouldParseArrow = function(e) {
  return !this.canInsertSemicolon();
};
P.parseParenAndDistinguishExpression = function(e, t) {
  var a = this.start, i = this.startLoc, r, s = this.options.ecmaVersion >= 8;
  if (this.options.ecmaVersion >= 6) {
    this.next();
    var n = this.start, u = this.startLoc, l = [], c = !0, d = !1, h = new la(), p = this.yieldPos, y = this.awaitPos, w;
    for (this.yieldPos = 0, this.awaitPos = 0; this.type !== o.parenR; )
      if (c ? c = !1 : this.expect(o.comma), s && this.afterTrailingComma(o.parenR, !0)) {
        d = !0;
        break;
      } else if (this.type === o.ellipsis) {
        w = this.start, l.push(this.parseParenItem(this.parseRestBinding())), this.type === o.comma && this.raiseRecoverable(
          this.start,
          "Comma is not permitted after the rest element"
        );
        break;
      } else
        l.push(this.parseMaybeAssign(!1, h, this.parseParenItem));
    var V = this.lastTokEnd, j = this.lastTokEndLoc;
    if (this.expect(o.parenR), e && this.shouldParseArrow(l) && this.eat(o.arrow))
      return this.checkPatternErrors(h, !1), this.checkYieldAwaitInDefaultParams(), this.yieldPos = p, this.awaitPos = y, this.parseParenArrowList(a, i, l, t);
    (!l.length || d) && this.unexpected(this.lastTokStart), w && this.unexpected(w), this.checkExpressionErrors(h, !0), this.yieldPos = p || this.yieldPos, this.awaitPos = y || this.awaitPos, l.length > 1 ? (r = this.startNodeAt(n, u), r.expressions = l, this.finishNodeAt(r, "SequenceExpression", V, j)) : r = l[0];
  } else
    r = this.parseParenExpression();
  if (this.options.preserveParens) {
    var K = this.startNodeAt(a, i);
    return K.expression = r, this.finishNode(K, "ParenthesizedExpression");
  } else
    return r;
};
P.parseParenItem = function(e) {
  return e;
};
P.parseParenArrowList = function(e, t, a, i) {
  return this.parseArrowExpression(this.startNodeAt(e, t), a, !1, i);
};
var rn = [];
P.parseNew = function() {
  this.containsEsc && this.raiseRecoverable(this.start, "Escape sequence in keyword new");
  var e = this.startNode();
  if (this.next(), this.options.ecmaVersion >= 6 && this.type === o.dot) {
    var t = this.startNodeAt(e.start, e.loc && e.loc.start);
    t.name = "new", e.meta = this.finishNode(t, "Identifier"), this.next();
    var a = this.containsEsc;
    return e.property = this.parseIdent(!0), e.property.name !== "target" && this.raiseRecoverable(e.property.start, "The only valid meta property for new is 'new.target'"), a && this.raiseRecoverable(e.start, "'new.target' must not contain escaped characters"), this.allowNewDotTarget || this.raiseRecoverable(e.start, "'new.target' can only be used in functions and class static block"), this.finishNode(e, "MetaProperty");
  }
  var i = this.start, r = this.startLoc;
  return e.callee = this.parseSubscripts(this.parseExprAtom(null, !1, !0), i, r, !0, !1), this.eat(o.parenL) ? e.arguments = this.parseExprList(o.parenR, this.options.ecmaVersion >= 8, !1) : e.arguments = rn, this.finishNode(e, "NewExpression");
};
P.parseTemplateElement = function(e) {
  var t = e.isTagged, a = this.startNode();
  return this.type === o.invalidTemplate ? (t || this.raiseRecoverable(this.start, "Bad escape sequence in untagged template literal"), a.value = {
    raw: this.value.replace(/\r\n?/g, `
`),
    cooked: null
  }) : a.value = {
    raw: this.input.slice(this.start, this.end).replace(/\r\n?/g, `
`),
    cooked: this.value
  }, this.next(), a.tail = this.type === o.backQuote, this.finishNode(a, "TemplateElement");
};
P.parseTemplate = function(e) {
  e === void 0 && (e = {});
  var t = e.isTagged;
  t === void 0 && (t = !1);
  var a = this.startNode();
  this.next(), a.expressions = [];
  var i = this.parseTemplateElement({ isTagged: t });
  for (a.quasis = [i]; !i.tail; )
    this.type === o.eof && this.raise(this.pos, "Unterminated template literal"), this.expect(o.dollarBraceL), a.expressions.push(this.parseExpression()), this.expect(o.braceR), a.quasis.push(i = this.parseTemplateElement({ isTagged: t }));
  return this.next(), this.finishNode(a, "TemplateLiteral");
};
P.isAsyncProp = function(e) {
  return !e.computed && e.key.type === "Identifier" && e.key.name === "async" && (this.type === o.name || this.type === o.num || this.type === o.string || this.type === o.bracketL || this.type.keyword || this.options.ecmaVersion >= 9 && this.type === o.star) && !pe.test(this.input.slice(this.lastTokEnd, this.start));
};
P.parseObj = function(e, t) {
  var a = this.startNode(), i = !0, r = {};
  for (a.properties = [], this.next(); !this.eat(o.braceR); ) {
    if (i)
      i = !1;
    else if (this.expect(o.comma), this.options.ecmaVersion >= 5 && this.afterTrailingComma(o.braceR))
      break;
    var s = this.parseProperty(e, t);
    e || this.checkPropClash(s, r, t), a.properties.push(s);
  }
  return this.finishNode(a, e ? "ObjectPattern" : "ObjectExpression");
};
P.parseProperty = function(e, t) {
  var a = this.startNode(), i, r, s, n;
  if (this.options.ecmaVersion >= 9 && this.eat(o.ellipsis))
    return e ? (a.argument = this.parseIdent(!1), this.type === o.comma && this.raiseRecoverable(this.start, "Comma is not permitted after the rest element"), this.finishNode(a, "RestElement")) : (a.argument = this.parseMaybeAssign(!1, t), this.type === o.comma && t && t.trailingComma < 0 && (t.trailingComma = this.start), this.finishNode(a, "SpreadElement"));
  this.options.ecmaVersion >= 6 && (a.method = !1, a.shorthand = !1, (e || t) && (s = this.start, n = this.startLoc), e || (i = this.eat(o.star)));
  var u = this.containsEsc;
  return this.parsePropertyName(a), !e && !u && this.options.ecmaVersion >= 8 && !i && this.isAsyncProp(a) ? (r = !0, i = this.options.ecmaVersion >= 9 && this.eat(o.star), this.parsePropertyName(a)) : r = !1, this.parsePropertyValue(a, e, i, r, s, n, t, u), this.finishNode(a, "Property");
};
P.parseGetterSetter = function(e) {
  var t = e.key.name;
  this.parsePropertyName(e), e.value = this.parseMethod(!1), e.kind = t;
  var a = e.kind === "get" ? 0 : 1;
  if (e.value.params.length !== a) {
    var i = e.value.start;
    e.kind === "get" ? this.raiseRecoverable(i, "getter should have no params") : this.raiseRecoverable(i, "setter should have exactly one param");
  } else
    e.kind === "set" && e.value.params[0].type === "RestElement" && this.raiseRecoverable(e.value.params[0].start, "Setter cannot use rest params");
};
P.parsePropertyValue = function(e, t, a, i, r, s, n, u) {
  (a || i) && this.type === o.colon && this.unexpected(), this.eat(o.colon) ? (e.value = t ? this.parseMaybeDefault(this.start, this.startLoc) : this.parseMaybeAssign(!1, n), e.kind = "init") : this.options.ecmaVersion >= 6 && this.type === o.parenL ? (t && this.unexpected(), e.method = !0, e.value = this.parseMethod(a, i), e.kind = "init") : !t && !u && this.options.ecmaVersion >= 5 && !e.computed && e.key.type === "Identifier" && (e.key.name === "get" || e.key.name === "set") && this.type !== o.comma && this.type !== o.braceR && this.type !== o.eq ? ((a || i) && this.unexpected(), this.parseGetterSetter(e)) : this.options.ecmaVersion >= 6 && !e.computed && e.key.type === "Identifier" ? ((a || i) && this.unexpected(), this.checkUnreserved(e.key), e.key.name === "await" && !this.awaitIdentPos && (this.awaitIdentPos = r), t ? e.value = this.parseMaybeDefault(r, s, this.copyNode(e.key)) : this.type === o.eq && n ? (n.shorthandAssign < 0 && (n.shorthandAssign = this.start), e.value = this.parseMaybeDefault(r, s, this.copyNode(e.key))) : e.value = this.copyNode(e.key), e.kind = "init", e.shorthand = !0) : this.unexpected();
};
P.parsePropertyName = function(e) {
  if (this.options.ecmaVersion >= 6) {
    if (this.eat(o.bracketL))
      return e.computed = !0, e.key = this.parseMaybeAssign(), this.expect(o.bracketR), e.key;
    e.computed = !1;
  }
  return e.key = this.type === o.num || this.type === o.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
};
P.initFunction = function(e) {
  e.id = null, this.options.ecmaVersion >= 6 && (e.generator = e.expression = !1), this.options.ecmaVersion >= 8 && (e.async = !1);
};
P.parseMethod = function(e, t, a) {
  var i = this.startNode(), r = this.yieldPos, s = this.awaitPos, n = this.awaitIdentPos;
  return this.initFunction(i), this.options.ecmaVersion >= 6 && (i.generator = e), this.options.ecmaVersion >= 8 && (i.async = !!t), this.yieldPos = 0, this.awaitPos = 0, this.awaitIdentPos = 0, this.enterScope(Xa(t, i.generator) | oa | (a ? nr : 0)), this.expect(o.parenL), i.params = this.parseBindingList(o.parenR, !1, this.options.ecmaVersion >= 8), this.checkYieldAwaitInDefaultParams(), this.parseFunctionBody(i, !1, !0, !1), this.yieldPos = r, this.awaitPos = s, this.awaitIdentPos = n, this.finishNode(i, "FunctionExpression");
};
P.parseArrowExpression = function(e, t, a, i) {
  var r = this.yieldPos, s = this.awaitPos, n = this.awaitIdentPos;
  return this.enterScope(Xa(a, !1) | Qa), this.initFunction(e), this.options.ecmaVersion >= 8 && (e.async = !!a), this.yieldPos = 0, this.awaitPos = 0, this.awaitIdentPos = 0, e.params = this.toAssignableList(t, !0), this.parseFunctionBody(e, !0, !1, i), this.yieldPos = r, this.awaitPos = s, this.awaitIdentPos = n, this.finishNode(e, "ArrowFunctionExpression");
};
P.parseFunctionBody = function(e, t, a, i) {
  var r = t && this.type !== o.braceL, s = this.strict, n = !1;
  if (r)
    e.body = this.parseMaybeAssign(i), e.expression = !0, this.checkParams(e, !1);
  else {
    var u = this.options.ecmaVersion >= 7 && !this.isSimpleParamList(e.params);
    (!s || u) && (n = this.strictDirective(this.end), n && u && this.raiseRecoverable(e.start, "Illegal 'use strict' directive in function with non-simple parameter list"));
    var l = this.labels;
    this.labels = [], n && (this.strict = !0), this.checkParams(e, !s && !n && !t && !a && this.isSimpleParamList(e.params)), this.strict && e.id && this.checkLValSimple(e.id, lr), e.body = this.parseBlock(!1, void 0, n && !s), e.expression = !1, this.adaptDirectivePrologue(e.body.body), this.labels = l;
  }
  this.exitScope();
};
P.isSimpleParamList = function(e) {
  for (var t = 0, a = e; t < a.length; t += 1) {
    var i = a[t];
    if (i.type !== "Identifier")
      return !1;
  }
  return !0;
};
P.checkParams = function(e, t) {
  for (var a = /* @__PURE__ */ Object.create(null), i = 0, r = e.params; i < r.length; i += 1) {
    var s = r[i];
    this.checkLValInnerPattern(s, Ja, t ? null : a);
  }
};
P.parseExprList = function(e, t, a, i) {
  for (var r = [], s = !0; !this.eat(e); ) {
    if (s)
      s = !1;
    else if (this.expect(o.comma), t && this.afterTrailingComma(e))
      break;
    var n = void 0;
    a && this.type === o.comma ? n = null : this.type === o.ellipsis ? (n = this.parseSpread(i), i && this.type === o.comma && i.trailingComma < 0 && (i.trailingComma = this.start)) : n = this.parseMaybeAssign(!1, i), r.push(n);
  }
  return r;
};
P.checkUnreserved = function(e) {
  var t = e.start, a = e.end, i = e.name;
  if (this.inGenerator && i === "yield" && this.raiseRecoverable(t, "Cannot use 'yield' as identifier inside a generator"), this.inAsync && i === "await" && this.raiseRecoverable(t, "Cannot use 'await' as identifier inside an async function"), !(this.currentThisScope().flags & ua) && i === "arguments" && this.raiseRecoverable(t, "Cannot use 'arguments' in class field initializer"), this.inClassStaticBlock && (i === "arguments" || i === "await") && this.raise(t, "Cannot use " + i + " in class static initialization block"), this.keywords.test(i) && this.raise(t, "Unexpected keyword '" + i + "'"), !(this.options.ecmaVersion < 6 && this.input.slice(t, a).indexOf("\\") !== -1)) {
    var r = this.strict ? this.reservedWordsStrict : this.reservedWords;
    r.test(i) && (!this.inAsync && i === "await" && this.raiseRecoverable(t, "Cannot use keyword 'await' outside an async function"), this.raiseRecoverable(t, "The keyword '" + i + "' is reserved"));
  }
};
P.parseIdent = function(e) {
  var t = this.parseIdentNode();
  return this.next(!!e), this.finishNode(t, "Identifier"), e || (this.checkUnreserved(t), t.name === "await" && !this.awaitIdentPos && (this.awaitIdentPos = t.start)), t;
};
P.parseIdentNode = function() {
  var e = this.startNode();
  return this.type === o.name ? e.name = this.value : this.type.keyword ? (e.name = this.type.keyword, (e.name === "class" || e.name === "function") && (this.lastTokEnd !== this.lastTokStart + 1 || this.input.charCodeAt(this.lastTokStart) !== 46) && this.context.pop(), this.type = o.name) : this.unexpected(), e;
};
P.parsePrivateIdent = function() {
  var e = this.startNode();
  return this.type === o.privateId ? e.name = this.value : this.unexpected(), this.next(), this.finishNode(e, "PrivateIdentifier"), this.options.checkPrivateFields && (this.privateNameStack.length === 0 ? this.raise(e.start, "Private field '#" + e.name + "' must be declared in an enclosing class") : this.privateNameStack[this.privateNameStack.length - 1].used.push(e)), e;
};
P.parseYield = function(e) {
  this.yieldPos || (this.yieldPos = this.start);
  var t = this.startNode();
  return this.next(), this.type === o.semi || this.canInsertSemicolon() || this.type !== o.star && !this.type.startsExpr ? (t.delegate = !1, t.argument = null) : (t.delegate = this.eat(o.star), t.argument = this.parseMaybeAssign(e)), this.finishNode(t, "YieldExpression");
};
P.parseAwait = function(e) {
  this.awaitPos || (this.awaitPos = this.start);
  var t = this.startNode();
  return this.next(), t.argument = this.parseMaybeUnary(null, !0, !1, e), this.finishNode(t, "AwaitExpression");
};
var Qt = X.prototype;
Qt.raise = function(e, t) {
  var a = ir(this.input, e);
  t += " (" + a.line + ":" + a.column + ")", this.sourceFile && (t += " in " + this.sourceFile);
  var i = new SyntaxError(t);
  throw i.pos = e, i.loc = a, i.raisedAt = this.pos, i;
};
Qt.raiseRecoverable = Qt.raise;
Qt.curPosition = function() {
  if (this.options.locations)
    return new Pt(this.curLine, this.pos - this.lineStart);
};
var Ke = X.prototype, sn = function(t) {
  this.flags = t, this.var = [], this.lexical = [], this.functions = [];
};
Ke.enterScope = function(e) {
  this.scopeStack.push(new sn(e));
};
Ke.exitScope = function() {
  this.scopeStack.pop();
};
Ke.treatFunctionsAsVarInScope = function(e) {
  return e.flags & ht || !this.inModule && e.flags & Dt;
};
Ke.declareName = function(e, t, a) {
  var i = !1;
  if (t === $e) {
    var r = this.currentScope();
    i = r.lexical.indexOf(e) > -1 || r.functions.indexOf(e) > -1 || r.var.indexOf(e) > -1, r.lexical.push(e), this.inModule && r.flags & Dt && delete this.undefinedExports[e];
  } else if (t === ur) {
    var s = this.currentScope();
    s.lexical.push(e);
  } else if (t === or) {
    var n = this.currentScope();
    this.treatFunctionsAsVar ? i = n.lexical.indexOf(e) > -1 : i = n.lexical.indexOf(e) > -1 || n.var.indexOf(e) > -1, n.functions.push(e);
  } else
    for (var u = this.scopeStack.length - 1; u >= 0; --u) {
      var l = this.scopeStack[u];
      if (l.lexical.indexOf(e) > -1 && !(l.flags & sr && l.lexical[0] === e) || !this.treatFunctionsAsVarInScope(l) && l.functions.indexOf(e) > -1) {
        i = !0;
        break;
      }
      if (l.var.push(e), this.inModule && l.flags & Dt && delete this.undefinedExports[e], l.flags & ua)
        break;
    }
  i && this.raiseRecoverable(a, "Identifier '" + e + "' has already been declared");
};
Ke.checkLocalExport = function(e) {
  this.scopeStack[0].lexical.indexOf(e.name) === -1 && this.scopeStack[0].var.indexOf(e.name) === -1 && (this.undefinedExports[e.name] = e);
};
Ke.currentScope = function() {
  return this.scopeStack[this.scopeStack.length - 1];
};
Ke.currentVarScope = function() {
  for (var e = this.scopeStack.length - 1; ; e--) {
    var t = this.scopeStack[e];
    if (t.flags & (ua | Vt | Ze))
      return t;
  }
};
Ke.currentThisScope = function() {
  for (var e = this.scopeStack.length - 1; ; e--) {
    var t = this.scopeStack[e];
    if (t.flags & (ua | Vt | Ze) && !(t.flags & Qa))
      return t;
  }
};
var ca = function(t, a, i) {
  this.type = "", this.start = a, this.end = 0, t.options.locations && (this.loc = new na(t, i)), t.options.directSourceFile && (this.sourceFile = t.options.directSourceFile), t.options.ranges && (this.range = [a, 0]);
}, Ot = X.prototype;
Ot.startNode = function() {
  return new ca(this, this.start, this.startLoc);
};
Ot.startNodeAt = function(e, t) {
  return new ca(this, e, t);
};
function pr(e, t, a, i) {
  return e.type = t, e.end = a, this.options.locations && (e.loc.end = i), this.options.ranges && (e.range[1] = a), e;
}
Ot.finishNode = function(e, t) {
  return pr.call(this, e, t, this.lastTokEnd, this.lastTokEndLoc);
};
Ot.finishNodeAt = function(e, t, a, i) {
  return pr.call(this, e, t, a, i);
};
Ot.copyNode = function(e) {
  var t = new ca(this, e.start, this.startLoc);
  for (var a in e)
    t[a] = e[a];
  return t;
};
var nn = "Gara Garay Gukh Gurung_Khema Hrkt Katakana_Or_Hiragana Kawi Kirat_Rai Krai Nag_Mundari Nagm Ol_Onal Onao Sunu Sunuwar Todhri Todr Tulu_Tigalari Tutg Unknown Zzzz", hr = "ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS", fr = hr + " Extended_Pictographic", mr = fr, gr = mr + " EBase EComp EMod EPres ExtPict", yr = gr, on = yr, un = {
  9: hr,
  10: fr,
  11: mr,
  12: gr,
  13: yr,
  14: on
}, ln = "Basic_Emoji Emoji_Keycap_Sequence RGI_Emoji_Modifier_Sequence RGI_Emoji_Flag_Sequence RGI_Emoji_Tag_Sequence RGI_Emoji_ZWJ_Sequence RGI_Emoji", cn = {
  9: "",
  10: "",
  11: "",
  12: "",
  13: "",
  14: ln
}, _i = "Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu", br = "Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb", xr = br + " Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd", wr = xr + " Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho", vr = wr + " Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi", kr = vr + " Cypro_Minoan Cpmn Old_Uyghur Ougr Tangsa Tnsa Toto Vithkuqi Vith", dn = kr + " " + nn, pn = {
  9: br,
  10: xr,
  11: wr,
  12: vr,
  13: kr,
  14: dn
}, _r = {};
function hn(e) {
  var t = _r[e] = {
    binary: Ge(un[e] + " " + _i),
    binaryOfStrings: Ge(cn[e]),
    nonBinary: {
      General_Category: Ge(_i),
      Script: Ge(pn[e])
    }
  };
  t.nonBinary.Script_Extensions = t.nonBinary.Script, t.nonBinary.gc = t.nonBinary.General_Category, t.nonBinary.sc = t.nonBinary.Script, t.nonBinary.scx = t.nonBinary.Script_Extensions;
}
for (var Aa = 0, Si = [9, 10, 11, 12, 13, 14]; Aa < Si.length; Aa += 1) {
  var fn = Si[Aa];
  hn(fn);
}
var k = X.prototype, Xt = function(t, a) {
  this.parent = t, this.base = a || this;
};
Xt.prototype.separatedFrom = function(t) {
  for (var a = this; a; a = a.parent)
    for (var i = t; i; i = i.parent)
      if (a.base === i.base && a !== i)
        return !0;
  return !1;
};
Xt.prototype.sibling = function() {
  return new Xt(this.parent, this.base);
};
var Le = function(t) {
  this.parser = t, this.validFlags = "gim" + (t.options.ecmaVersion >= 6 ? "uy" : "") + (t.options.ecmaVersion >= 9 ? "s" : "") + (t.options.ecmaVersion >= 13 ? "d" : "") + (t.options.ecmaVersion >= 15 ? "v" : ""), this.unicodeProperties = _r[t.options.ecmaVersion >= 14 ? 14 : t.options.ecmaVersion], this.source = "", this.flags = "", this.start = 0, this.switchU = !1, this.switchV = !1, this.switchN = !1, this.pos = 0, this.lastIntValue = 0, this.lastStringValue = "", this.lastAssertionIsQuantifiable = !1, this.numCapturingParens = 0, this.maxBackReference = 0, this.groupNames = /* @__PURE__ */ Object.create(null), this.backReferenceNames = [], this.branchID = null;
};
Le.prototype.reset = function(t, a, i) {
  var r = i.indexOf("v") !== -1, s = i.indexOf("u") !== -1;
  this.start = t | 0, this.source = a + "", this.flags = i, r && this.parser.options.ecmaVersion >= 15 ? (this.switchU = !0, this.switchV = !0, this.switchN = !0) : (this.switchU = s && this.parser.options.ecmaVersion >= 6, this.switchV = !1, this.switchN = s && this.parser.options.ecmaVersion >= 9);
};
Le.prototype.raise = function(t) {
  this.parser.raiseRecoverable(this.start, "Invalid regular expression: /" + this.source + "/: " + t);
};
Le.prototype.at = function(t, a) {
  a === void 0 && (a = !1);
  var i = this.source, r = i.length;
  if (t >= r)
    return -1;
  var s = i.charCodeAt(t);
  if (!(a || this.switchU) || s <= 55295 || s >= 57344 || t + 1 >= r)
    return s;
  var n = i.charCodeAt(t + 1);
  return n >= 56320 && n <= 57343 ? (s << 10) + n - 56613888 : s;
};
Le.prototype.nextIndex = function(t, a) {
  a === void 0 && (a = !1);
  var i = this.source, r = i.length;
  if (t >= r)
    return r;
  var s = i.charCodeAt(t), n;
  return !(a || this.switchU) || s <= 55295 || s >= 57344 || t + 1 >= r || (n = i.charCodeAt(t + 1)) < 56320 || n > 57343 ? t + 1 : t + 2;
};
Le.prototype.current = function(t) {
  return t === void 0 && (t = !1), this.at(this.pos, t);
};
Le.prototype.lookahead = function(t) {
  return t === void 0 && (t = !1), this.at(this.nextIndex(this.pos, t), t);
};
Le.prototype.advance = function(t) {
  t === void 0 && (t = !1), this.pos = this.nextIndex(this.pos, t);
};
Le.prototype.eat = function(t, a) {
  return a === void 0 && (a = !1), this.current(a) === t ? (this.advance(a), !0) : !1;
};
Le.prototype.eatChars = function(t, a) {
  a === void 0 && (a = !1);
  for (var i = this.pos, r = 0, s = t; r < s.length; r += 1) {
    var n = s[r], u = this.at(i, a);
    if (u === -1 || u !== n)
      return !1;
    i = this.nextIndex(i, a);
  }
  return this.pos = i, !0;
};
k.validateRegExpFlags = function(e) {
  for (var t = e.validFlags, a = e.flags, i = !1, r = !1, s = 0; s < a.length; s++) {
    var n = a.charAt(s);
    t.indexOf(n) === -1 && this.raise(e.start, "Invalid regular expression flag"), a.indexOf(n, s + 1) > -1 && this.raise(e.start, "Duplicate regular expression flag"), n === "u" && (i = !0), n === "v" && (r = !0);
  }
  this.options.ecmaVersion >= 15 && i && r && this.raise(e.start, "Invalid regular expression flag");
};
function mn(e) {
  for (var t in e)
    return !0;
  return !1;
}
k.validateRegExpPattern = function(e) {
  this.regexp_pattern(e), !e.switchN && this.options.ecmaVersion >= 9 && mn(e.groupNames) && (e.switchN = !0, this.regexp_pattern(e));
};
k.regexp_pattern = function(e) {
  e.pos = 0, e.lastIntValue = 0, e.lastStringValue = "", e.lastAssertionIsQuantifiable = !1, e.numCapturingParens = 0, e.maxBackReference = 0, e.groupNames = /* @__PURE__ */ Object.create(null), e.backReferenceNames.length = 0, e.branchID = null, this.regexp_disjunction(e), e.pos !== e.source.length && (e.eat(
    41
    /* ) */
  ) && e.raise("Unmatched ')'"), (e.eat(
    93
    /* ] */
  ) || e.eat(
    125
    /* } */
  )) && e.raise("Lone quantifier brackets")), e.maxBackReference > e.numCapturingParens && e.raise("Invalid escape");
  for (var t = 0, a = e.backReferenceNames; t < a.length; t += 1) {
    var i = a[t];
    e.groupNames[i] || e.raise("Invalid named capture referenced");
  }
};
k.regexp_disjunction = function(e) {
  var t = this.options.ecmaVersion >= 16;
  for (t && (e.branchID = new Xt(e.branchID, null)), this.regexp_alternative(e); e.eat(
    124
    /* | */
  ); )
    t && (e.branchID = e.branchID.sibling()), this.regexp_alternative(e);
  t && (e.branchID = e.branchID.parent), this.regexp_eatQuantifier(e, !0) && e.raise("Nothing to repeat"), e.eat(
    123
    /* { */
  ) && e.raise("Lone quantifier brackets");
};
k.regexp_alternative = function(e) {
  for (; e.pos < e.source.length && this.regexp_eatTerm(e); )
    ;
};
k.regexp_eatTerm = function(e) {
  return this.regexp_eatAssertion(e) ? (e.lastAssertionIsQuantifiable && this.regexp_eatQuantifier(e) && e.switchU && e.raise("Invalid quantifier"), !0) : (e.switchU ? this.regexp_eatAtom(e) : this.regexp_eatExtendedAtom(e)) ? (this.regexp_eatQuantifier(e), !0) : !1;
};
k.regexp_eatAssertion = function(e) {
  var t = e.pos;
  if (e.lastAssertionIsQuantifiable = !1, e.eat(
    94
    /* ^ */
  ) || e.eat(
    36
    /* $ */
  ))
    return !0;
  if (e.eat(
    92
    /* \ */
  )) {
    if (e.eat(
      66
      /* B */
    ) || e.eat(
      98
      /* b */
    ))
      return !0;
    e.pos = t;
  }
  if (e.eat(
    40
    /* ( */
  ) && e.eat(
    63
    /* ? */
  )) {
    var a = !1;
    if (this.options.ecmaVersion >= 9 && (a = e.eat(
      60
      /* < */
    )), e.eat(
      61
      /* = */
    ) || e.eat(
      33
      /* ! */
    ))
      return this.regexp_disjunction(e), e.eat(
        41
        /* ) */
      ) || e.raise("Unterminated group"), e.lastAssertionIsQuantifiable = !a, !0;
  }
  return e.pos = t, !1;
};
k.regexp_eatQuantifier = function(e, t) {
  return t === void 0 && (t = !1), this.regexp_eatQuantifierPrefix(e, t) ? (e.eat(
    63
    /* ? */
  ), !0) : !1;
};
k.regexp_eatQuantifierPrefix = function(e, t) {
  return e.eat(
    42
    /* * */
  ) || e.eat(
    43
    /* + */
  ) || e.eat(
    63
    /* ? */
  ) || this.regexp_eatBracedQuantifier(e, t);
};
k.regexp_eatBracedQuantifier = function(e, t) {
  var a = e.pos;
  if (e.eat(
    123
    /* { */
  )) {
    var i = 0, r = -1;
    if (this.regexp_eatDecimalDigits(e) && (i = e.lastIntValue, e.eat(
      44
      /* , */
    ) && this.regexp_eatDecimalDigits(e) && (r = e.lastIntValue), e.eat(
      125
      /* } */
    )))
      return r !== -1 && r < i && !t && e.raise("numbers out of order in {} quantifier"), !0;
    e.switchU && !t && e.raise("Incomplete quantifier"), e.pos = a;
  }
  return !1;
};
k.regexp_eatAtom = function(e) {
  return this.regexp_eatPatternCharacters(e) || e.eat(
    46
    /* . */
  ) || this.regexp_eatReverseSolidusAtomEscape(e) || this.regexp_eatCharacterClass(e) || this.regexp_eatUncapturingGroup(e) || this.regexp_eatCapturingGroup(e);
};
k.regexp_eatReverseSolidusAtomEscape = function(e) {
  var t = e.pos;
  if (e.eat(
    92
    /* \ */
  )) {
    if (this.regexp_eatAtomEscape(e))
      return !0;
    e.pos = t;
  }
  return !1;
};
k.regexp_eatUncapturingGroup = function(e) {
  var t = e.pos;
  if (e.eat(
    40
    /* ( */
  )) {
    if (e.eat(
      63
      /* ? */
    )) {
      if (this.options.ecmaVersion >= 16) {
        var a = this.regexp_eatModifiers(e), i = e.eat(
          45
          /* - */
        );
        if (a || i) {
          for (var r = 0; r < a.length; r++) {
            var s = a.charAt(r);
            a.indexOf(s, r + 1) > -1 && e.raise("Duplicate regular expression modifiers");
          }
          if (i) {
            var n = this.regexp_eatModifiers(e);
            !a && !n && e.current() === 58 && e.raise("Invalid regular expression modifiers");
            for (var u = 0; u < n.length; u++) {
              var l = n.charAt(u);
              (n.indexOf(l, u + 1) > -1 || a.indexOf(l) > -1) && e.raise("Duplicate regular expression modifiers");
            }
          }
        }
      }
      if (e.eat(
        58
        /* : */
      )) {
        if (this.regexp_disjunction(e), e.eat(
          41
          /* ) */
        ))
          return !0;
        e.raise("Unterminated group");
      }
    }
    e.pos = t;
  }
  return !1;
};
k.regexp_eatCapturingGroup = function(e) {
  if (e.eat(
    40
    /* ( */
  )) {
    if (this.options.ecmaVersion >= 9 ? this.regexp_groupSpecifier(e) : e.current() === 63 && e.raise("Invalid group"), this.regexp_disjunction(e), e.eat(
      41
      /* ) */
    ))
      return e.numCapturingParens += 1, !0;
    e.raise("Unterminated group");
  }
  return !1;
};
k.regexp_eatModifiers = function(e) {
  for (var t = "", a = 0; (a = e.current()) !== -1 && gn(a); )
    t += Ue(a), e.advance();
  return t;
};
function gn(e) {
  return e === 105 || e === 109 || e === 115;
}
k.regexp_eatExtendedAtom = function(e) {
  return e.eat(
    46
    /* . */
  ) || this.regexp_eatReverseSolidusAtomEscape(e) || this.regexp_eatCharacterClass(e) || this.regexp_eatUncapturingGroup(e) || this.regexp_eatCapturingGroup(e) || this.regexp_eatInvalidBracedQuantifier(e) || this.regexp_eatExtendedPatternCharacter(e);
};
k.regexp_eatInvalidBracedQuantifier = function(e) {
  return this.regexp_eatBracedQuantifier(e, !0) && e.raise("Nothing to repeat"), !1;
};
k.regexp_eatSyntaxCharacter = function(e) {
  var t = e.current();
  return Sr(t) ? (e.lastIntValue = t, e.advance(), !0) : !1;
};
function Sr(e) {
  return e === 36 || e >= 40 && e <= 43 || e === 46 || e === 63 || e >= 91 && e <= 94 || e >= 123 && e <= 125;
}
k.regexp_eatPatternCharacters = function(e) {
  for (var t = e.pos, a = 0; (a = e.current()) !== -1 && !Sr(a); )
    e.advance();
  return e.pos !== t;
};
k.regexp_eatExtendedPatternCharacter = function(e) {
  var t = e.current();
  return t !== -1 && t !== 36 && !(t >= 40 && t <= 43) && t !== 46 && t !== 63 && t !== 91 && t !== 94 && t !== 124 ? (e.advance(), !0) : !1;
};
k.regexp_groupSpecifier = function(e) {
  if (e.eat(
    63
    /* ? */
  )) {
    this.regexp_eatGroupName(e) || e.raise("Invalid group");
    var t = this.options.ecmaVersion >= 16, a = e.groupNames[e.lastStringValue];
    if (a)
      if (t)
        for (var i = 0, r = a; i < r.length; i += 1) {
          var s = r[i];
          s.separatedFrom(e.branchID) || e.raise("Duplicate capture group name");
        }
      else
        e.raise("Duplicate capture group name");
    t ? (a || (e.groupNames[e.lastStringValue] = [])).push(e.branchID) : e.groupNames[e.lastStringValue] = !0;
  }
};
k.regexp_eatGroupName = function(e) {
  if (e.lastStringValue = "", e.eat(
    60
    /* < */
  )) {
    if (this.regexp_eatRegExpIdentifierName(e) && e.eat(
      62
      /* > */
    ))
      return !0;
    e.raise("Invalid capture group name");
  }
  return !1;
};
k.regexp_eatRegExpIdentifierName = function(e) {
  if (e.lastStringValue = "", this.regexp_eatRegExpIdentifierStart(e)) {
    for (e.lastStringValue += Ue(e.lastIntValue); this.regexp_eatRegExpIdentifierPart(e); )
      e.lastStringValue += Ue(e.lastIntValue);
    return !0;
  }
  return !1;
};
k.regexp_eatRegExpIdentifierStart = function(e) {
  var t = e.pos, a = this.options.ecmaVersion >= 11, i = e.current(a);
  return e.advance(a), i === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(e, a) && (i = e.lastIntValue), yn(i) ? (e.lastIntValue = i, !0) : (e.pos = t, !1);
};
function yn(e) {
  return Ee(e, !0) || e === 36 || e === 95;
}
k.regexp_eatRegExpIdentifierPart = function(e) {
  var t = e.pos, a = this.options.ecmaVersion >= 11, i = e.current(a);
  return e.advance(a), i === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(e, a) && (i = e.lastIntValue), bn(i) ? (e.lastIntValue = i, !0) : (e.pos = t, !1);
};
function bn(e) {
  return ze(e, !0) || e === 36 || e === 95 || e === 8204 || e === 8205;
}
k.regexp_eatAtomEscape = function(e) {
  return this.regexp_eatBackReference(e) || this.regexp_eatCharacterClassEscape(e) || this.regexp_eatCharacterEscape(e) || e.switchN && this.regexp_eatKGroupName(e) ? !0 : (e.switchU && (e.current() === 99 && e.raise("Invalid unicode escape"), e.raise("Invalid escape")), !1);
};
k.regexp_eatBackReference = function(e) {
  var t = e.pos;
  if (this.regexp_eatDecimalEscape(e)) {
    var a = e.lastIntValue;
    if (e.switchU)
      return a > e.maxBackReference && (e.maxBackReference = a), !0;
    if (a <= e.numCapturingParens)
      return !0;
    e.pos = t;
  }
  return !1;
};
k.regexp_eatKGroupName = function(e) {
  if (e.eat(
    107
    /* k */
  )) {
    if (this.regexp_eatGroupName(e))
      return e.backReferenceNames.push(e.lastStringValue), !0;
    e.raise("Invalid named reference");
  }
  return !1;
};
k.regexp_eatCharacterEscape = function(e) {
  return this.regexp_eatControlEscape(e) || this.regexp_eatCControlLetter(e) || this.regexp_eatZero(e) || this.regexp_eatHexEscapeSequence(e) || this.regexp_eatRegExpUnicodeEscapeSequence(e, !1) || !e.switchU && this.regexp_eatLegacyOctalEscapeSequence(e) || this.regexp_eatIdentityEscape(e);
};
k.regexp_eatCControlLetter = function(e) {
  var t = e.pos;
  if (e.eat(
    99
    /* c */
  )) {
    if (this.regexp_eatControlLetter(e))
      return !0;
    e.pos = t;
  }
  return !1;
};
k.regexp_eatZero = function(e) {
  return e.current() === 48 && !da(e.lookahead()) ? (e.lastIntValue = 0, e.advance(), !0) : !1;
};
k.regexp_eatControlEscape = function(e) {
  var t = e.current();
  return t === 116 ? (e.lastIntValue = 9, e.advance(), !0) : t === 110 ? (e.lastIntValue = 10, e.advance(), !0) : t === 118 ? (e.lastIntValue = 11, e.advance(), !0) : t === 102 ? (e.lastIntValue = 12, e.advance(), !0) : t === 114 ? (e.lastIntValue = 13, e.advance(), !0) : !1;
};
k.regexp_eatControlLetter = function(e) {
  var t = e.current();
  return Ir(t) ? (e.lastIntValue = t % 32, e.advance(), !0) : !1;
};
function Ir(e) {
  return e >= 65 && e <= 90 || e >= 97 && e <= 122;
}
k.regexp_eatRegExpUnicodeEscapeSequence = function(e, t) {
  t === void 0 && (t = !1);
  var a = e.pos, i = t || e.switchU;
  if (e.eat(
    117
    /* u */
  )) {
    if (this.regexp_eatFixedHexDigits(e, 4)) {
      var r = e.lastIntValue;
      if (i && r >= 55296 && r <= 56319) {
        var s = e.pos;
        if (e.eat(
          92
          /* \ */
        ) && e.eat(
          117
          /* u */
        ) && this.regexp_eatFixedHexDigits(e, 4)) {
          var n = e.lastIntValue;
          if (n >= 56320 && n <= 57343)
            return e.lastIntValue = (r - 55296) * 1024 + (n - 56320) + 65536, !0;
        }
        e.pos = s, e.lastIntValue = r;
      }
      return !0;
    }
    if (i && e.eat(
      123
      /* { */
    ) && this.regexp_eatHexDigits(e) && e.eat(
      125
      /* } */
    ) && xn(e.lastIntValue))
      return !0;
    i && e.raise("Invalid unicode escape"), e.pos = a;
  }
  return !1;
};
function xn(e) {
  return e >= 0 && e <= 1114111;
}
k.regexp_eatIdentityEscape = function(e) {
  if (e.switchU)
    return this.regexp_eatSyntaxCharacter(e) ? !0 : e.eat(
      47
      /* / */
    ) ? (e.lastIntValue = 47, !0) : !1;
  var t = e.current();
  return t !== 99 && (!e.switchN || t !== 107) ? (e.lastIntValue = t, e.advance(), !0) : !1;
};
k.regexp_eatDecimalEscape = function(e) {
  e.lastIntValue = 0;
  var t = e.current();
  if (t >= 49 && t <= 57) {
    do
      e.lastIntValue = 10 * e.lastIntValue + (t - 48), e.advance();
    while ((t = e.current()) >= 48 && t <= 57);
    return !0;
  }
  return !1;
};
var Cr = 0, qe = 1, we = 2;
k.regexp_eatCharacterClassEscape = function(e) {
  var t = e.current();
  if (wn(t))
    return e.lastIntValue = -1, e.advance(), qe;
  var a = !1;
  if (e.switchU && this.options.ecmaVersion >= 9 && ((a = t === 80) || t === 112)) {
    e.lastIntValue = -1, e.advance();
    var i;
    if (e.eat(
      123
      /* { */
    ) && (i = this.regexp_eatUnicodePropertyValueExpression(e)) && e.eat(
      125
      /* } */
    ))
      return a && i === we && e.raise("Invalid property name"), i;
    e.raise("Invalid property name");
  }
  return Cr;
};
function wn(e) {
  return e === 100 || e === 68 || e === 115 || e === 83 || e === 119 || e === 87;
}
k.regexp_eatUnicodePropertyValueExpression = function(e) {
  var t = e.pos;
  if (this.regexp_eatUnicodePropertyName(e) && e.eat(
    61
    /* = */
  )) {
    var a = e.lastStringValue;
    if (this.regexp_eatUnicodePropertyValue(e)) {
      var i = e.lastStringValue;
      return this.regexp_validateUnicodePropertyNameAndValue(e, a, i), qe;
    }
  }
  if (e.pos = t, this.regexp_eatLoneUnicodePropertyNameOrValue(e)) {
    var r = e.lastStringValue;
    return this.regexp_validateUnicodePropertyNameOrValue(e, r);
  }
  return Cr;
};
k.regexp_validateUnicodePropertyNameAndValue = function(e, t, a) {
  pt(e.unicodeProperties.nonBinary, t) || e.raise("Invalid property name"), e.unicodeProperties.nonBinary[t].test(a) || e.raise("Invalid property value");
};
k.regexp_validateUnicodePropertyNameOrValue = function(e, t) {
  if (e.unicodeProperties.binary.test(t))
    return qe;
  if (e.switchV && e.unicodeProperties.binaryOfStrings.test(t))
    return we;
  e.raise("Invalid property name");
};
k.regexp_eatUnicodePropertyName = function(e) {
  var t = 0;
  for (e.lastStringValue = ""; Ar(t = e.current()); )
    e.lastStringValue += Ue(t), e.advance();
  return e.lastStringValue !== "";
};
function Ar(e) {
  return Ir(e) || e === 95;
}
k.regexp_eatUnicodePropertyValue = function(e) {
  var t = 0;
  for (e.lastStringValue = ""; vn(t = e.current()); )
    e.lastStringValue += Ue(t), e.advance();
  return e.lastStringValue !== "";
};
function vn(e) {
  return Ar(e) || da(e);
}
k.regexp_eatLoneUnicodePropertyNameOrValue = function(e) {
  return this.regexp_eatUnicodePropertyValue(e);
};
k.regexp_eatCharacterClass = function(e) {
  if (e.eat(
    91
    /* [ */
  )) {
    var t = e.eat(
      94
      /* ^ */
    ), a = this.regexp_classContents(e);
    return e.eat(
      93
      /* ] */
    ) || e.raise("Unterminated character class"), t && a === we && e.raise("Negated character class may contain strings"), !0;
  }
  return !1;
};
k.regexp_classContents = function(e) {
  return e.current() === 93 ? qe : e.switchV ? this.regexp_classSetExpression(e) : (this.regexp_nonEmptyClassRanges(e), qe);
};
k.regexp_nonEmptyClassRanges = function(e) {
  for (; this.regexp_eatClassAtom(e); ) {
    var t = e.lastIntValue;
    if (e.eat(
      45
      /* - */
    ) && this.regexp_eatClassAtom(e)) {
      var a = e.lastIntValue;
      e.switchU && (t === -1 || a === -1) && e.raise("Invalid character class"), t !== -1 && a !== -1 && t > a && e.raise("Range out of order in character class");
    }
  }
};
k.regexp_eatClassAtom = function(e) {
  var t = e.pos;
  if (e.eat(
    92
    /* \ */
  )) {
    if (this.regexp_eatClassEscape(e))
      return !0;
    if (e.switchU) {
      var a = e.current();
      (a === 99 || Er(a)) && e.raise("Invalid class escape"), e.raise("Invalid escape");
    }
    e.pos = t;
  }
  var i = e.current();
  return i !== 93 ? (e.lastIntValue = i, e.advance(), !0) : !1;
};
k.regexp_eatClassEscape = function(e) {
  var t = e.pos;
  if (e.eat(
    98
    /* b */
  ))
    return e.lastIntValue = 8, !0;
  if (e.switchU && e.eat(
    45
    /* - */
  ))
    return e.lastIntValue = 45, !0;
  if (!e.switchU && e.eat(
    99
    /* c */
  )) {
    if (this.regexp_eatClassControlLetter(e))
      return !0;
    e.pos = t;
  }
  return this.regexp_eatCharacterClassEscape(e) || this.regexp_eatCharacterEscape(e);
};
k.regexp_classSetExpression = function(e) {
  var t = qe, a;
  if (!this.regexp_eatClassSetRange(e)) if (a = this.regexp_eatClassSetOperand(e)) {
    a === we && (t = we);
    for (var i = e.pos; e.eatChars(
      [38, 38]
      /* && */
    ); ) {
      if (e.current() !== 38 && (a = this.regexp_eatClassSetOperand(e))) {
        a !== we && (t = qe);
        continue;
      }
      e.raise("Invalid character in character class");
    }
    if (i !== e.pos)
      return t;
    for (; e.eatChars(
      [45, 45]
      /* -- */
    ); )
      this.regexp_eatClassSetOperand(e) || e.raise("Invalid character in character class");
    if (i !== e.pos)
      return t;
  } else
    e.raise("Invalid character in character class");
  for (; ; )
    if (!this.regexp_eatClassSetRange(e)) {
      if (a = this.regexp_eatClassSetOperand(e), !a)
        return t;
      a === we && (t = we);
    }
};
k.regexp_eatClassSetRange = function(e) {
  var t = e.pos;
  if (this.regexp_eatClassSetCharacter(e)) {
    var a = e.lastIntValue;
    if (e.eat(
      45
      /* - */
    ) && this.regexp_eatClassSetCharacter(e)) {
      var i = e.lastIntValue;
      return a !== -1 && i !== -1 && a > i && e.raise("Range out of order in character class"), !0;
    }
    e.pos = t;
  }
  return !1;
};
k.regexp_eatClassSetOperand = function(e) {
  return this.regexp_eatClassSetCharacter(e) ? qe : this.regexp_eatClassStringDisjunction(e) || this.regexp_eatNestedClass(e);
};
k.regexp_eatNestedClass = function(e) {
  var t = e.pos;
  if (e.eat(
    91
    /* [ */
  )) {
    var a = e.eat(
      94
      /* ^ */
    ), i = this.regexp_classContents(e);
    if (e.eat(
      93
      /* ] */
    ))
      return a && i === we && e.raise("Negated character class may contain strings"), i;
    e.pos = t;
  }
  if (e.eat(
    92
    /* \ */
  )) {
    var r = this.regexp_eatCharacterClassEscape(e);
    if (r)
      return r;
    e.pos = t;
  }
  return null;
};
k.regexp_eatClassStringDisjunction = function(e) {
  var t = e.pos;
  if (e.eatChars(
    [92, 113]
    /* \q */
  )) {
    if (e.eat(
      123
      /* { */
    )) {
      var a = this.regexp_classStringDisjunctionContents(e);
      if (e.eat(
        125
        /* } */
      ))
        return a;
    } else
      e.raise("Invalid escape");
    e.pos = t;
  }
  return null;
};
k.regexp_classStringDisjunctionContents = function(e) {
  for (var t = this.regexp_classString(e); e.eat(
    124
    /* | */
  ); )
    this.regexp_classString(e) === we && (t = we);
  return t;
};
k.regexp_classString = function(e) {
  for (var t = 0; this.regexp_eatClassSetCharacter(e); )
    t++;
  return t === 1 ? qe : we;
};
k.regexp_eatClassSetCharacter = function(e) {
  var t = e.pos;
  if (e.eat(
    92
    /* \ */
  ))
    return this.regexp_eatCharacterEscape(e) || this.regexp_eatClassSetReservedPunctuator(e) ? !0 : e.eat(
      98
      /* b */
    ) ? (e.lastIntValue = 8, !0) : (e.pos = t, !1);
  var a = e.current();
  return a < 0 || a === e.lookahead() && kn(a) || _n(a) ? !1 : (e.advance(), e.lastIntValue = a, !0);
};
function kn(e) {
  return e === 33 || e >= 35 && e <= 38 || e >= 42 && e <= 44 || e === 46 || e >= 58 && e <= 64 || e === 94 || e === 96 || e === 126;
}
function _n(e) {
  return e === 40 || e === 41 || e === 45 || e === 47 || e >= 91 && e <= 93 || e >= 123 && e <= 125;
}
k.regexp_eatClassSetReservedPunctuator = function(e) {
  var t = e.current();
  return Sn(t) ? (e.lastIntValue = t, e.advance(), !0) : !1;
};
function Sn(e) {
  return e === 33 || e === 35 || e === 37 || e === 38 || e === 44 || e === 45 || e >= 58 && e <= 62 || e === 64 || e === 96 || e === 126;
}
k.regexp_eatClassControlLetter = function(e) {
  var t = e.current();
  return da(t) || t === 95 ? (e.lastIntValue = t % 32, e.advance(), !0) : !1;
};
k.regexp_eatHexEscapeSequence = function(e) {
  var t = e.pos;
  if (e.eat(
    120
    /* x */
  )) {
    if (this.regexp_eatFixedHexDigits(e, 2))
      return !0;
    e.switchU && e.raise("Invalid escape"), e.pos = t;
  }
  return !1;
};
k.regexp_eatDecimalDigits = function(e) {
  var t = e.pos, a = 0;
  for (e.lastIntValue = 0; da(a = e.current()); )
    e.lastIntValue = 10 * e.lastIntValue + (a - 48), e.advance();
  return e.pos !== t;
};
function da(e) {
  return e >= 48 && e <= 57;
}
k.regexp_eatHexDigits = function(e) {
  var t = e.pos, a = 0;
  for (e.lastIntValue = 0; Tr(a = e.current()); )
    e.lastIntValue = 16 * e.lastIntValue + Mr(a), e.advance();
  return e.pos !== t;
};
function Tr(e) {
  return e >= 48 && e <= 57 || e >= 65 && e <= 70 || e >= 97 && e <= 102;
}
function Mr(e) {
  return e >= 65 && e <= 70 ? 10 + (e - 65) : e >= 97 && e <= 102 ? 10 + (e - 97) : e - 48;
}
k.regexp_eatLegacyOctalEscapeSequence = function(e) {
  if (this.regexp_eatOctalDigit(e)) {
    var t = e.lastIntValue;
    if (this.regexp_eatOctalDigit(e)) {
      var a = e.lastIntValue;
      t <= 3 && this.regexp_eatOctalDigit(e) ? e.lastIntValue = t * 64 + a * 8 + e.lastIntValue : e.lastIntValue = t * 8 + a;
    } else
      e.lastIntValue = t;
    return !0;
  }
  return !1;
};
k.regexp_eatOctalDigit = function(e) {
  var t = e.current();
  return Er(t) ? (e.lastIntValue = t - 48, e.advance(), !0) : (e.lastIntValue = 0, !1);
};
function Er(e) {
  return e >= 48 && e <= 55;
}
k.regexp_eatFixedHexDigits = function(e, t) {
  var a = e.pos;
  e.lastIntValue = 0;
  for (var i = 0; i < t; ++i) {
    var r = e.current();
    if (!Tr(r))
      return e.pos = a, !1;
    e.lastIntValue = 16 * e.lastIntValue + Mr(r), e.advance();
  }
  return !0;
};
var ei = function(t) {
  this.type = t.type, this.value = t.value, this.start = t.start, this.end = t.end, t.options.locations && (this.loc = new na(t, t.startLoc, t.endLoc)), t.options.ranges && (this.range = [t.start, t.end]);
}, R = X.prototype;
R.next = function(e) {
  !e && this.type.keyword && this.containsEsc && this.raiseRecoverable(this.start, "Escape sequence in keyword " + this.type.keyword), this.options.onToken && this.options.onToken(new ei(this)), this.lastTokEnd = this.end, this.lastTokStart = this.start, this.lastTokEndLoc = this.endLoc, this.lastTokStartLoc = this.startLoc, this.nextToken();
};
R.getToken = function() {
  return this.next(), new ei(this);
};
typeof Symbol < "u" && (R[Symbol.iterator] = function() {
  var e = this;
  return {
    next: function() {
      var t = e.getToken();
      return {
        done: t.type === o.eof,
        value: t
      };
    }
  };
});
R.nextToken = function() {
  var e = this.curContext();
  if ((!e || !e.preserveSpace) && this.skipSpace(), this.start = this.pos, this.options.locations && (this.startLoc = this.curPosition()), this.pos >= this.input.length)
    return this.finishToken(o.eof);
  if (e.override)
    return e.override(this);
  this.readToken(this.fullCharCodeAtPos());
};
R.readToken = function(e) {
  return Ee(e, this.options.ecmaVersion >= 6) || e === 92 ? this.readWord() : this.getTokenFromCode(e);
};
R.fullCharCodeAtPos = function() {
  var e = this.input.charCodeAt(this.pos);
  if (e <= 55295 || e >= 56320)
    return e;
  var t = this.input.charCodeAt(this.pos + 1);
  return t <= 56319 || t >= 57344 ? e : (e << 10) + t - 56613888;
};
R.skipBlockComment = function() {
  var e = this.options.onComment && this.curPosition(), t = this.pos, a = this.input.indexOf("*/", this.pos += 2);
  if (a === -1 && this.raise(this.pos - 2, "Unterminated comment"), this.pos = a + 2, this.options.locations)
    for (var i = void 0, r = t; (i = er(this.input, r, this.pos)) > -1; )
      ++this.curLine, r = this.lineStart = i;
  this.options.onComment && this.options.onComment(
    !0,
    this.input.slice(t + 2, a),
    t,
    this.pos,
    e,
    this.curPosition()
  );
};
R.skipLineComment = function(e) {
  for (var t = this.pos, a = this.options.onComment && this.curPosition(), i = this.input.charCodeAt(this.pos += e); this.pos < this.input.length && !dt(i); )
    i = this.input.charCodeAt(++this.pos);
  this.options.onComment && this.options.onComment(
    !1,
    this.input.slice(t + e, this.pos),
    t,
    this.pos,
    a,
    this.curPosition()
  );
};
R.skipSpace = function() {
  e: for (; this.pos < this.input.length; ) {
    var e = this.input.charCodeAt(this.pos);
    switch (e) {
      case 32:
      case 160:
        ++this.pos;
        break;
      case 13:
        this.input.charCodeAt(this.pos + 1) === 10 && ++this.pos;
      case 10:
      case 8232:
      case 8233:
        ++this.pos, this.options.locations && (++this.curLine, this.lineStart = this.pos);
        break;
      case 47:
        switch (this.input.charCodeAt(this.pos + 1)) {
          case 42:
            this.skipBlockComment();
            break;
          case 47:
            this.skipLineComment(2);
            break;
          default:
            break e;
        }
        break;
      default:
        if (e > 8 && e < 14 || e >= 5760 && tr.test(String.fromCharCode(e)))
          ++this.pos;
        else
          break e;
    }
  }
};
R.finishToken = function(e, t) {
  this.end = this.pos, this.options.locations && (this.endLoc = this.curPosition());
  var a = this.type;
  this.type = e, this.value = t, this.updateContext(a);
};
R.readToken_dot = function() {
  var e = this.input.charCodeAt(this.pos + 1);
  if (e >= 48 && e <= 57)
    return this.readNumber(!0);
  var t = this.input.charCodeAt(this.pos + 2);
  return this.options.ecmaVersion >= 6 && e === 46 && t === 46 ? (this.pos += 3, this.finishToken(o.ellipsis)) : (++this.pos, this.finishToken(o.dot));
};
R.readToken_slash = function() {
  var e = this.input.charCodeAt(this.pos + 1);
  return this.exprAllowed ? (++this.pos, this.readRegexp()) : e === 61 ? this.finishOp(o.assign, 2) : this.finishOp(o.slash, 1);
};
R.readToken_mult_modulo_exp = function(e) {
  var t = this.input.charCodeAt(this.pos + 1), a = 1, i = e === 42 ? o.star : o.modulo;
  return this.options.ecmaVersion >= 7 && e === 42 && t === 42 && (++a, i = o.starstar, t = this.input.charCodeAt(this.pos + 2)), t === 61 ? this.finishOp(o.assign, a + 1) : this.finishOp(i, a);
};
R.readToken_pipe_amp = function(e) {
  var t = this.input.charCodeAt(this.pos + 1);
  if (t === e) {
    if (this.options.ecmaVersion >= 12) {
      var a = this.input.charCodeAt(this.pos + 2);
      if (a === 61)
        return this.finishOp(o.assign, 3);
    }
    return this.finishOp(e === 124 ? o.logicalOR : o.logicalAND, 2);
  }
  return t === 61 ? this.finishOp(o.assign, 2) : this.finishOp(e === 124 ? o.bitwiseOR : o.bitwiseAND, 1);
};
R.readToken_caret = function() {
  var e = this.input.charCodeAt(this.pos + 1);
  return e === 61 ? this.finishOp(o.assign, 2) : this.finishOp(o.bitwiseXOR, 1);
};
R.readToken_plus_min = function(e) {
  var t = this.input.charCodeAt(this.pos + 1);
  return t === e ? t === 45 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 62 && (this.lastTokEnd === 0 || pe.test(this.input.slice(this.lastTokEnd, this.pos))) ? (this.skipLineComment(3), this.skipSpace(), this.nextToken()) : this.finishOp(o.incDec, 2) : t === 61 ? this.finishOp(o.assign, 2) : this.finishOp(o.plusMin, 1);
};
R.readToken_lt_gt = function(e) {
  var t = this.input.charCodeAt(this.pos + 1), a = 1;
  return t === e ? (a = e === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2, this.input.charCodeAt(this.pos + a) === 61 ? this.finishOp(o.assign, a + 1) : this.finishOp(o.bitShift, a)) : t === 33 && e === 60 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 45 && this.input.charCodeAt(this.pos + 3) === 45 ? (this.skipLineComment(4), this.skipSpace(), this.nextToken()) : (t === 61 && (a = 2), this.finishOp(o.relational, a));
};
R.readToken_eq_excl = function(e) {
  var t = this.input.charCodeAt(this.pos + 1);
  return t === 61 ? this.finishOp(o.equality, this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2) : e === 61 && t === 62 && this.options.ecmaVersion >= 6 ? (this.pos += 2, this.finishToken(o.arrow)) : this.finishOp(e === 61 ? o.eq : o.prefix, 1);
};
R.readToken_question = function() {
  var e = this.options.ecmaVersion;
  if (e >= 11) {
    var t = this.input.charCodeAt(this.pos + 1);
    if (t === 46) {
      var a = this.input.charCodeAt(this.pos + 2);
      if (a < 48 || a > 57)
        return this.finishOp(o.questionDot, 2);
    }
    if (t === 63) {
      if (e >= 12) {
        var i = this.input.charCodeAt(this.pos + 2);
        if (i === 61)
          return this.finishOp(o.assign, 3);
      }
      return this.finishOp(o.coalesce, 2);
    }
  }
  return this.finishOp(o.question, 1);
};
R.readToken_numberSign = function() {
  var e = this.options.ecmaVersion, t = 35;
  if (e >= 13 && (++this.pos, t = this.fullCharCodeAtPos(), Ee(t, !0) || t === 92))
    return this.finishToken(o.privateId, this.readWord1());
  this.raise(this.pos, "Unexpected character '" + Ue(t) + "'");
};
R.getTokenFromCode = function(e) {
  switch (e) {
    // The interpretation of a dot depends on whether it is followed
    // by a digit or another two dots.
    case 46:
      return this.readToken_dot();
    // Punctuation tokens.
    case 40:
      return ++this.pos, this.finishToken(o.parenL);
    case 41:
      return ++this.pos, this.finishToken(o.parenR);
    case 59:
      return ++this.pos, this.finishToken(o.semi);
    case 44:
      return ++this.pos, this.finishToken(o.comma);
    case 91:
      return ++this.pos, this.finishToken(o.bracketL);
    case 93:
      return ++this.pos, this.finishToken(o.bracketR);
    case 123:
      return ++this.pos, this.finishToken(o.braceL);
    case 125:
      return ++this.pos, this.finishToken(o.braceR);
    case 58:
      return ++this.pos, this.finishToken(o.colon);
    case 96:
      if (this.options.ecmaVersion < 6)
        break;
      return ++this.pos, this.finishToken(o.backQuote);
    case 48:
      var t = this.input.charCodeAt(this.pos + 1);
      if (t === 120 || t === 88)
        return this.readRadixNumber(16);
      if (this.options.ecmaVersion >= 6) {
        if (t === 111 || t === 79)
          return this.readRadixNumber(8);
        if (t === 98 || t === 66)
          return this.readRadixNumber(2);
      }
    // Anything else beginning with a digit is an integer, octal
    // number, or float.
    case 49:
    case 50:
    case 51:
    case 52:
    case 53:
    case 54:
    case 55:
    case 56:
    case 57:
      return this.readNumber(!1);
    // Quotes produce strings.
    case 34:
    case 39:
      return this.readString(e);
    // Operators are parsed inline in tiny state machines. '=' (61) is
    // often referred to. `finishOp` simply skips the amount of
    // characters it is given as second argument, and returns a token
    // of the type given by its first argument.
    case 47:
      return this.readToken_slash();
    case 37:
    case 42:
      return this.readToken_mult_modulo_exp(e);
    case 124:
    case 38:
      return this.readToken_pipe_amp(e);
    case 94:
      return this.readToken_caret();
    case 43:
    case 45:
      return this.readToken_plus_min(e);
    case 60:
    case 62:
      return this.readToken_lt_gt(e);
    case 61:
    case 33:
      return this.readToken_eq_excl(e);
    case 63:
      return this.readToken_question();
    case 126:
      return this.finishOp(o.prefix, 1);
    case 35:
      return this.readToken_numberSign();
  }
  this.raise(this.pos, "Unexpected character '" + Ue(e) + "'");
};
R.finishOp = function(e, t) {
  var a = this.input.slice(this.pos, this.pos + t);
  return this.pos += t, this.finishToken(e, a);
};
R.readRegexp = function() {
  for (var e, t, a = this.pos; ; ) {
    this.pos >= this.input.length && this.raise(a, "Unterminated regular expression");
    var i = this.input.charAt(this.pos);
    if (pe.test(i) && this.raise(a, "Unterminated regular expression"), e)
      e = !1;
    else {
      if (i === "[")
        t = !0;
      else if (i === "]" && t)
        t = !1;
      else if (i === "/" && !t)
        break;
      e = i === "\\";
    }
    ++this.pos;
  }
  var r = this.input.slice(a, this.pos);
  ++this.pos;
  var s = this.pos, n = this.readWord1();
  this.containsEsc && this.unexpected(s);
  var u = this.regexpState || (this.regexpState = new Le(this));
  u.reset(a, r, n), this.validateRegExpFlags(u), this.validateRegExpPattern(u);
  var l = null;
  try {
    l = new RegExp(r, n);
  } catch {
  }
  return this.finishToken(o.regexp, { pattern: r, flags: n, value: l });
};
R.readInt = function(e, t, a) {
  for (var i = this.options.ecmaVersion >= 12 && t === void 0, r = a && this.input.charCodeAt(this.pos) === 48, s = this.pos, n = 0, u = 0, l = 0, c = t ?? 1 / 0; l < c; ++l, ++this.pos) {
    var d = this.input.charCodeAt(this.pos), h = void 0;
    if (i && d === 95) {
      r && this.raiseRecoverable(this.pos, "Numeric separator is not allowed in legacy octal numeric literals"), u === 95 && this.raiseRecoverable(this.pos, "Numeric separator must be exactly one underscore"), l === 0 && this.raiseRecoverable(this.pos, "Numeric separator is not allowed at the first of digits"), u = d;
      continue;
    }
    if (d >= 97 ? h = d - 97 + 10 : d >= 65 ? h = d - 65 + 10 : d >= 48 && d <= 57 ? h = d - 48 : h = 1 / 0, h >= e)
      break;
    u = d, n = n * e + h;
  }
  return i && u === 95 && this.raiseRecoverable(this.pos - 1, "Numeric separator is not allowed at the last of digits"), this.pos === s || t != null && this.pos - s !== t ? null : n;
};
function In(e, t) {
  return t ? parseInt(e, 8) : parseFloat(e.replace(/_/g, ""));
}
function Pr(e) {
  return typeof BigInt != "function" ? null : BigInt(e.replace(/_/g, ""));
}
R.readRadixNumber = function(e) {
  var t = this.pos;
  this.pos += 2;
  var a = this.readInt(e);
  return a == null && this.raise(this.start + 2, "Expected number in radix " + e), this.options.ecmaVersion >= 11 && this.input.charCodeAt(this.pos) === 110 ? (a = Pr(this.input.slice(t, this.pos)), ++this.pos) : Ee(this.fullCharCodeAtPos()) && this.raise(this.pos, "Identifier directly after number"), this.finishToken(o.num, a);
};
R.readNumber = function(e) {
  var t = this.pos;
  !e && this.readInt(10, void 0, !0) === null && this.raise(t, "Invalid number");
  var a = this.pos - t >= 2 && this.input.charCodeAt(t) === 48;
  a && this.strict && this.raise(t, "Invalid number");
  var i = this.input.charCodeAt(this.pos);
  if (!a && !e && this.options.ecmaVersion >= 11 && i === 110) {
    var r = Pr(this.input.slice(t, this.pos));
    return ++this.pos, Ee(this.fullCharCodeAtPos()) && this.raise(this.pos, "Identifier directly after number"), this.finishToken(o.num, r);
  }
  a && /[89]/.test(this.input.slice(t, this.pos)) && (a = !1), i === 46 && !a && (++this.pos, this.readInt(10), i = this.input.charCodeAt(this.pos)), (i === 69 || i === 101) && !a && (i = this.input.charCodeAt(++this.pos), (i === 43 || i === 45) && ++this.pos, this.readInt(10) === null && this.raise(t, "Invalid number")), Ee(this.fullCharCodeAtPos()) && this.raise(this.pos, "Identifier directly after number");
  var s = In(this.input.slice(t, this.pos), a);
  return this.finishToken(o.num, s);
};
R.readCodePoint = function() {
  var e = this.input.charCodeAt(this.pos), t;
  if (e === 123) {
    this.options.ecmaVersion < 6 && this.unexpected();
    var a = ++this.pos;
    t = this.readHexChar(this.input.indexOf("}", this.pos) - this.pos), ++this.pos, t > 1114111 && this.invalidStringToken(a, "Code point out of bounds");
  } else
    t = this.readHexChar(4);
  return t;
};
R.readString = function(e) {
  for (var t = "", a = ++this.pos; ; ) {
    this.pos >= this.input.length && this.raise(this.start, "Unterminated string constant");
    var i = this.input.charCodeAt(this.pos);
    if (i === e)
      break;
    i === 92 ? (t += this.input.slice(a, this.pos), t += this.readEscapedChar(!1), a = this.pos) : i === 8232 || i === 8233 ? (this.options.ecmaVersion < 10 && this.raise(this.start, "Unterminated string constant"), ++this.pos, this.options.locations && (this.curLine++, this.lineStart = this.pos)) : (dt(i) && this.raise(this.start, "Unterminated string constant"), ++this.pos);
  }
  return t += this.input.slice(a, this.pos++), this.finishToken(o.string, t);
};
var Dr = {};
R.tryReadTemplateToken = function() {
  this.inTemplateElement = !0;
  try {
    this.readTmplToken();
  } catch (e) {
    if (e === Dr)
      this.readInvalidTemplateToken();
    else
      throw e;
  }
  this.inTemplateElement = !1;
};
R.invalidStringToken = function(e, t) {
  if (this.inTemplateElement && this.options.ecmaVersion >= 9)
    throw Dr;
  this.raise(e, t);
};
R.readTmplToken = function() {
  for (var e = "", t = this.pos; ; ) {
    this.pos >= this.input.length && this.raise(this.start, "Unterminated template");
    var a = this.input.charCodeAt(this.pos);
    if (a === 96 || a === 36 && this.input.charCodeAt(this.pos + 1) === 123)
      return this.pos === this.start && (this.type === o.template || this.type === o.invalidTemplate) ? a === 36 ? (this.pos += 2, this.finishToken(o.dollarBraceL)) : (++this.pos, this.finishToken(o.backQuote)) : (e += this.input.slice(t, this.pos), this.finishToken(o.template, e));
    if (a === 92)
      e += this.input.slice(t, this.pos), e += this.readEscapedChar(!0), t = this.pos;
    else if (dt(a)) {
      switch (e += this.input.slice(t, this.pos), ++this.pos, a) {
        case 13:
          this.input.charCodeAt(this.pos) === 10 && ++this.pos;
        case 10:
          e += `
`;
          break;
        default:
          e += String.fromCharCode(a);
          break;
      }
      this.options.locations && (++this.curLine, this.lineStart = this.pos), t = this.pos;
    } else
      ++this.pos;
  }
};
R.readInvalidTemplateToken = function() {
  for (; this.pos < this.input.length; this.pos++)
    switch (this.input[this.pos]) {
      case "\\":
        ++this.pos;
        break;
      case "$":
        if (this.input[this.pos + 1] !== "{")
          break;
      // fall through
      case "`":
        return this.finishToken(o.invalidTemplate, this.input.slice(this.start, this.pos));
      case "\r":
        this.input[this.pos + 1] === `
` && ++this.pos;
      // fall through
      case `
`:
      case "\u2028":
      case "\u2029":
        ++this.curLine, this.lineStart = this.pos + 1;
        break;
    }
  this.raise(this.start, "Unterminated template");
};
R.readEscapedChar = function(e) {
  var t = this.input.charCodeAt(++this.pos);
  switch (++this.pos, t) {
    case 110:
      return `
`;
    // 'n' -> '\n'
    case 114:
      return "\r";
    // 'r' -> '\r'
    case 120:
      return String.fromCharCode(this.readHexChar(2));
    // 'x'
    case 117:
      return Ue(this.readCodePoint());
    // 'u'
    case 116:
      return "	";
    // 't' -> '\t'
    case 98:
      return "\b";
    // 'b' -> '\b'
    case 118:
      return "\v";
    // 'v' -> '\u000b'
    case 102:
      return "\f";
    // 'f' -> '\f'
    case 13:
      this.input.charCodeAt(this.pos) === 10 && ++this.pos;
    // '\r\n'
    case 10:
      return this.options.locations && (this.lineStart = this.pos, ++this.curLine), "";
    case 56:
    case 57:
      if (this.strict && this.invalidStringToken(
        this.pos - 1,
        "Invalid escape sequence"
      ), e) {
        var a = this.pos - 1;
        this.invalidStringToken(
          a,
          "Invalid escape sequence in template string"
        );
      }
    default:
      if (t >= 48 && t <= 55) {
        var i = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0], r = parseInt(i, 8);
        return r > 255 && (i = i.slice(0, -1), r = parseInt(i, 8)), this.pos += i.length - 1, t = this.input.charCodeAt(this.pos), (i !== "0" || t === 56 || t === 57) && (this.strict || e) && this.invalidStringToken(
          this.pos - 1 - i.length,
          e ? "Octal literal in template string" : "Octal literal in strict mode"
        ), String.fromCharCode(r);
      }
      return dt(t) ? (this.options.locations && (this.lineStart = this.pos, ++this.curLine), "") : String.fromCharCode(t);
  }
};
R.readHexChar = function(e) {
  var t = this.pos, a = this.readInt(16, e);
  return a === null && this.invalidStringToken(t, "Bad character escape sequence"), a;
};
R.readWord1 = function() {
  this.containsEsc = !1;
  for (var e = "", t = !0, a = this.pos, i = this.options.ecmaVersion >= 6; this.pos < this.input.length; ) {
    var r = this.fullCharCodeAtPos();
    if (ze(r, i))
      this.pos += r <= 65535 ? 1 : 2;
    else if (r === 92) {
      this.containsEsc = !0, e += this.input.slice(a, this.pos);
      var s = this.pos;
      this.input.charCodeAt(++this.pos) !== 117 && this.invalidStringToken(this.pos, "Expecting Unicode escape sequence \\uXXXX"), ++this.pos;
      var n = this.readCodePoint();
      (t ? Ee : ze)(n, i) || this.invalidStringToken(s, "Invalid Unicode escape"), e += Ue(n), a = this.pos;
    } else
      break;
    t = !1;
  }
  return e + this.input.slice(a, this.pos);
};
R.readWord = function() {
  var e = this.readWord1(), t = o.name;
  return this.keywords.test(e) && (t = za[e]), this.finishToken(t, e);
};
var Cn = "8.15.0";
X.acorn = {
  Parser: X,
  version: Cn,
  defaultOptions: Da,
  Position: Pt,
  SourceLocation: na,
  getLineInfo: ir,
  Node: ca,
  TokenType: O,
  tokTypes: o,
  keywordTypes: za,
  TokContext: ke,
  tokContexts: $,
  isIdentifierChar: ze,
  isIdentifierStart: Ee,
  Token: ei,
  isNewLine: dt,
  lineBreak: pe,
  lineBreakG: Gs,
  nonASCIIwhitespace: tr
};
function An(e, t) {
  return X.parse(e, t);
}
const Tn = [
  { re: /\b__kf[A-Za-z]*\b/, msg: "Names starting with __kf are reserved for the K-Flow runtime", severity: "error" },
  { re: /\bchrome\s*\.\s*(runtime|storage|tabs|scripting)\b/, msg: "Extension APIs are not available to user scripts (they run without extension privileges)", severity: "error" },
  { re: /\bimport\s*\(/, msg: "Dynamic import() is not allowed", severity: "error" },
  { re: /\b(eval|Function)\s*\(/, msg: "eval()/Function() are not available in the K-Flow sandbox", severity: "error" },
  { re: /\b(XMLHttpRequest|fetch|WebSocket|sendBeacon)\b/, msg: "Network requests from scripts run with the page's permissions — make sure you trust the destination", severity: "warning" },
  { re: /\b(localStorage|document\.cookie|indexedDB)\b/, msg: "Script touches page storage/cookies", severity: "warning" }
];
function Ra(e, t, a = null) {
  t(e, a);
  for (const i of Object.keys(e)) {
    if (i === "type" || i === "start" || i === "end" || i === "loc") continue;
    const r = e[i];
    Array.isArray(r) ? r.forEach((s) => s && typeof s.type == "string" && Ra(s, t, e)) : r && typeof r.type == "string" && Ra(r, t, e);
  }
}
const Mn = /* @__PURE__ */ new Set(["ForStatement", "WhileStatement", "DoWhileStatement", "ForInStatement", "ForOfStatement"]);
function Ii(e) {
  const t = [];
  if (e.length > 2e5) return { code: "", problems: [{ message: "Script is too large (200 KB max)", severity: "error" }], loops: 0 };
  const a = e.split(`
`);
  for (const d of Tn)
    a.forEach((h, p) => {
      const y = h.replace(/\/\/.*$/, "").replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""'), w = d.re.exec(y);
      w && t.push({ message: d.msg, line: p + 1, column: w.index + 1, severity: d.severity });
    });
  let i;
  try {
    i = An(e, { ecmaVersion: "latest", sourceType: "script", allowAwaitOutsideFunction: !0, allowReturnOutsideFunction: !0, locations: !0 });
  } catch (d) {
    const h = d?.loc || {};
    return t.push({ message: `Syntax error: ${String(d?.message || d).replace(/\s*\(\d+:\d+\)$/, "")}`, line: h.line, column: (h.column ?? 0) + 1, severity: "error" }), { code: "", problems: t, loops: 0 };
  }
  const r = [];
  let s = 0, n = 0;
  const u = (d) => d.loc?.start?.line ?? 0, l = (d) => {
    for (const h of d)
      h.type === "FunctionDeclaration" || h.type === "EmptyStatement" || h.type === "ExpressionStatement" && h.directive || r.push({ pos: h.start, text: `__kfL(${u(h)});`, order: n++ });
  };
  Ra(i, (d) => {
    if (d.type === "Program" || d.type === "BlockStatement" || d.type === "StaticBlock" ? l(d.body) : d.type === "SwitchCase" && l(d.consequent), Mn.has(d.type)) {
      const h = ++s, p = d.body;
      p.type === "BlockStatement" ? r.push({ pos: p.start + 1, text: `__kfG(${h},${u(d)});`, order: -1 }) : (r.push({ pos: p.start, text: `{__kfG(${h},${u(d)});`, order: -1 }), r.push({ pos: p.end, text: "}", order: 1e9 }));
    }
  }), r.sort((d, h) => h.pos - d.pos || h.order - d.order);
  let c = e;
  for (const d of r) c = c.slice(0, d.pos) + d.text + c.slice(d.pos);
  return { code: c, problems: t, loops: s };
}
function Ci(e) {
  return e.some((t) => t.severity === "error");
}
function En(e) {
  const t = [];
  for (const a of e) {
    const i = t[t.length - 1];
    if (i && a.type === "type" && i.type === "type" && JSON.stringify(i.target) === JSON.stringify(a.target)) {
      t[t.length - 1] = a;
      continue;
    }
    if (i && a.type === "scroll" && i.type === "scroll") {
      t[t.length - 1] = a;
      continue;
    }
    if (i && a.type === "navigate" && i.type === "navigate") {
      t[t.length - 1] = a;
      continue;
    }
    t.push(a);
  }
  return t;
}
const ti = () => {
  const e = globalThis.crypto?.subtle;
  if (!e) throw new Error("Web Crypto is not available in this context");
  return e;
};
function Fa(e) {
  const t = atob(e), a = new Uint8Array(new ArrayBuffer(t.length));
  for (let i = 0; i < t.length; i++) a[i] = t.charCodeAt(i);
  return a;
}
const Pn = new TextEncoder(), Dn = new TextDecoder();
async function Va(e, t, a, i) {
  try {
    const r = await ti().decrypt({ name: "AES-GCM", iv: Fa(t), ...i ? { additionalData: Pn.encode(i) } : {} }, e, Fa(a));
    return Dn.decode(r);
  } catch {
    throw new Error("Decryption failed (wrong key or corrupted data)");
  }
}
let rt = null;
function Ln() {
  return rt || (rt = (async () => {
    const e = await Pe("keys", "device");
    if (e) return e;
    const t = await ti().generateKey({ name: "AES-GCM", length: 256 }, !1, ["encrypt", "decrypt"]);
    return await ct("keys", t, "device"), t;
  })(), rt.catch(() => {
    rt = null;
  }), rt);
}
const Lr = (e) => typeof e == "string" && (e.startsWith("enc:v1:") || e.startsWith("encm:v1:"));
async function Nn(e, t) {
  if (!Lr(e)) return e == null ? "" : String(e);
  const [a, , i, r] = e.split(":");
  if (a === "enc") return Va(await Ln(), i, r);
  if (!t) throw new Error("Unlock the K-Flow vault to read this encrypted value");
  return Va(t, i, r);
}
async function Rn(e) {
  return ti().importKey("raw", Fa(e), { name: "AES-GCM" }, !0, ["encrypt", "decrypt"]);
}
async function ai(e, t) {
  let a = 0;
  const i = await Promise.all(e.rows.map(async (r) => {
    let s = !1;
    const n = { ...r.values };
    for (const [u, l] of Object.entries(n))
      if (Lr(l)) {
        s = !0;
        try {
          n[u] = await Nn(l, t);
        } catch {
          n[u] = "", a++;
        }
      }
    return s ? { ...r, values: n } : r;
  }));
  return { ...e, rows: i, locked: a };
}
function Nr(e, t) {
  const a = e.rows.find((n) => n.id === t);
  if (!a) return "";
  const i = e.columns.find((n) => /name/i.test(n.name) && !(e.sensitiveColumns || []).includes(n.key)), r = e.keyColumn ? e.columns.find((n) => n.key === e.keyColumn) : void 0, s = [r ? a.values[r.key] : null, i ? a.values[i.key] : null].filter((n) => n != null && String(n).trim() !== "");
  return s.length ? s.join(" · ") : `Row ${e.rows.indexOf(a) + 1}`;
}
const Jt = "kf.vaultSession";
let Rr = null;
const Fr = () => globalThis.chrome?.storage?.session;
async function Fn() {
  const e = Fr();
  return e ? (await new Promise((a) => e.get(Jt, a)))?.[Jt] || null : Rr;
}
async function Vr(e) {
  const t = Fr();
  if (!t) {
    Rr = e;
    return;
  }
  await new Promise((a) => e ? t.set({ [Jt]: e }, () => a()) : t.remove(Jt, () => a()));
}
async function Vn() {
  await Vr(null);
}
async function pa(e) {
  const t = await Fn();
  return t ? Date.now() > t.expires ? (await Vn(), null) : (e && await Vr({ key: t.key, expires: Date.now() + e * 6e4 }), Rn(t.key)) : null;
}
async function On(e) {
  const t = await pa(15);
  if (!t) return null;
  const a = {};
  for (const i of await Z("vault"))
    if (!(e && i.domains?.length && !i.domains.some((r) => sa(e, r))))
      try {
        a[i.key] = await Va(t, i.iv, i.cipher, i.id), i.username && (a[i.key + "_user"] = i.username);
      } catch {
      }
  return a;
}
const Oa = ["create", "edit", "execute", "share", "delete", "export", "viewAudit", "manageMembers", "manageSettings", "manageDevices"], Bn = {
  owner: [...Oa],
  admin: [...Oa],
  manager: ["create", "edit", "execute", "share", "delete", "export", "viewAudit"],
  staff: ["execute", "create", "edit"],
  viewer: ["execute"]
}, Or = ["manageMembers", "manageSettings", "manageDevices"];
function Un(e, t = {}, a) {
  if (e === "owner") return new Set(Oa);
  const i = a && t.resources?.[a]?.[e] || t.roles?.[e] || Bn[e] || [];
  return new Set(i.filter((r) => e === "admin" || !Or.includes(r) || (t.roles?.[e] || []).includes(r)));
}
function qn(e, t, a = {}, i) {
  if (!e) return !1;
  if (e.role === "owner") return !0;
  const r = a.users?.[e.uid];
  return r?.deny?.includes(t) ? !1 : r?.allow?.includes(t) && !Or.includes(t) ? !0 : Un(e.role, a, i).has(t);
}
const Yn = "kf.org";
async function $n() {
  return await Zr(Yn) || null;
}
function ha(e, t, a, i) {
  return t?.orgId ? !e || e.orgId !== t.orgId || e.revoked ? !1 : qn({ uid: e.uid, role: e.role }, a, e.permissions, i) : !0;
}
const Ba = () => _.storage.session;
async function Br(e) {
  return (await new Promise((a) => Ba().get(e, a)))?.[e];
}
async function Ne(e, t) {
  await new Promise((a) => t === void 0 ? Ba().remove(e, () => a()) : Ba().set({ [e]: t }, () => a()));
}
async function mt() {
  const [e, t, a] = await Promise.all([Rt(), $n(), Z("workspaces")]);
  return { settings: e, org: t, workspaces: a };
}
function oe(e) {
  try {
    return new URL(e).hostname;
  } catch {
    return "";
  }
}
function gt(e, t) {
  const a = oe(t);
  if (!/^https?:|^file:/.test(t)) throw new Error("Automations run only on web pages (http/https)");
  if (Ni(e.settings, a)) throw new Error(`K-Flow is disabled on ${a} (Settings → Blocked sites)`);
  if (!bi(e.settings.security.automationAllowlist, a)) throw new Error(`${a} is not in your automation allowlist (Settings → Security)`);
  if (e.org && !e.org.revoked && e.org.policies.allowedDomains.length && !bi(e.org.policies.allowedDomains, a)) throw new Error(`Your organization allows automations only on: ${e.org.policies.allowedDomains.join(", ")}`);
}
function fa(e, t, a) {
  const i = oe(t), r = e.workspaces.find((s) => s.id === a);
  return Rs(i, [...e.settings.security.officialDomains, ...r?.officialDomains || []]);
}
async function jn() {
  const e = await pa();
  return Promise.all((await Z("tables")).map((t) => ai(t, e)));
}
async function ma(e) {
  const [t, a, i] = await Promise.all([Rt(), Z("variables"), jn()]), r = e.url ? oe(e.url) : void 0, s = await On(r), n = e.datasetId ? i.find((y) => y.id === e.datasetId) : void 0, u = n ? e.recordId ? n.rows.find((y) => y.id === e.recordId) : Ki(n) : null, l = n && u ? Os(n, u) : null, c = Xi(t), d = e.url ? { url: e.url, title: "", host: r || "" } : void 0, h = Qi(a, { record: l, datasets: i, fo: c, vault: s, page: d, workspaceId: e.workspaceId, scopeRef: e.scopeRef });
  return { values: { ...h.values, ...e.extra || {} }, errors: h.errors, record: l, dataset: n, row: u, settings: t, fo: c, tables: i, vaultLocked: !s, recordLabel: n && u ? Nr(n, u.id) : "" };
}
async function Ai(e, t) {
  if (!e.includes("{{")) return e;
  const a = await ma(t), i = await Z("snippets"), r = new Map(i.map((n) => [n.shortcut, n])), s = ia(e, "text", {
    globals: a.values,
    fo: a.fo,
    profile: { ...a.settings.profile },
    page: t.url ? { url: t.url, title: "", host: oe(t.url) } : void 0,
    resolveSnippet: (n) => {
      const u = r.get(n);
      return u ? { content: u.content, contentType: u.contentType } : null;
    }
  });
  if (s.errors.length) throw new Error(s.errors[0]);
  if (s.needsForm) throw new Error(`Unknown variable(s): ${s.form.map((n) => n.name).join(", ")}`);
  return s.text;
}
async function Wn(e) {
  const t = await mt(), a = oe(e), [i, r, s] = await Promise.all([Z("autofill"), Z("macros"), Z("scripts")]);
  let n = !0, u = "";
  try {
    gt(t, e);
  } catch (h) {
    n = !1, u = h.message;
  }
  const l = (h) => t.workspaces.find((p) => p.id === h)?.name || "General", c = (h) => h.length > 0 && Ns(h, e), d = (h, p) => h.filter((y) => y.enabled && ha(t.org, y, "execute", p));
  return {
    host: a,
    allowed: n,
    reason: u,
    official: fa(t, e),
    settings: { autofillHotkey: t.settings.automation.autofillHotkey, autoRun: t.settings.automation.autoRunEnabled, highlight: t.settings.automation.highlight },
    profiles: d(i, "autofill").map((h) => ({ id: h.id, name: h.name, rules: h.rules.length, runMode: h.runMode, shortcut: h.shortcut || "", workspace: l(h.workspaceId), matches: c(h.sites), anySite: !h.sites.length, datasetId: h.datasetId || null, starter: !!h.starter })),
    macros: d(r, "macros").map((h) => ({ id: h.id, name: h.name, steps: h.steps.length, shortcut: h.shortcut || "", workspace: l(h.workspaceId), matches: c(h.sites), anySite: !h.sites.length, datasetId: h.datasetId || null })),
    scripts: (t.settings.security.scriptsEnabled && !t.org?.policies.disableScripts ? d(s, "scripts").filter((h) => !h.library) : []).map((h) => ({ id: h.id, name: h.name, runMode: h.runMode, workspace: l(h.workspaceId), matches: c(h.sites), anySite: !h.sites.length }))
  };
}
async function Hn(e, t, a) {
  const i = await mt();
  gt(i, t);
  const r = await Pe("autofill", e);
  if (!r || r.deleted) throw new Error("Autofill profile not found");
  if (!ha(i.org, r, "execute", "autofill")) throw new Error("Your organization role does not allow running this profile");
  const s = await ma({ workspaceId: r.workspaceId, datasetId: r.datasetId, recordId: a, scopeRef: r.id, url: t }), n = Fs(r, { values: s.values, fo: s.fo, url: t, ctx: { profile: { ...s.settings.profile }, page: { url: t, title: "", host: oe(t) } } }), u = Object.entries(s.errors).map(([l, c]) => `{{${l}}}: ${c}`);
  return {
    name: r.name,
    rules: n,
    official: fa(i, t, r.workspaceId),
    waitMs: i.settings.automation.waitTimeoutMs,
    fieldDelayMs: r.fieldDelayMs ?? 0,
    highlight: i.settings.automation.highlight,
    respectExisting: i.settings.automation.respectExistingValues,
    record: s.recordLabel,
    datasetId: r.datasetId || null,
    recordId: s.row?.id || null,
    varErrors: u,
    vaultLocked: s.vaultLocked,
    workspaceId: r.workspaceId
  };
}
async function Gn(e) {
  const t = e.report?.items || [], a = {
    kind: "autofill",
    refId: e.profileId,
    name: e.name + (e.preview ? " (preview)" : ""),
    workspaceId: e.workspaceId,
    startedAt: Date.now() - (e.report?.durationMs || 0),
    endedAt: Date.now(),
    status: e.report?.failed ? e.report.filled ? "partial" : "failed" : "success",
    url: e.url.slice(0, 500),
    host: oe(e.url),
    steps: t.map((r, s) => ({ i: s, label: r.label, status: r.status === "filled" || r.status === "previewed" ? "done" : r.status === "skipped" ? "skip" : "fail", ms: r.ms, error: ["filled", "previewed"].includes(r.status) ? void 0 : r.message })),
    filled: e.report?.filled,
    failed: e.report?.failed,
    skipped: e.report?.skipped,
    recordId: e.recordId,
    recordLabel: e.record
  }, i = await Rt();
  return await Ga(a, i.automation.historyLimit), e.preview || await Ft("execute", "autofill", { resourceId: e.profileId, name: e.name, details: `${a.filled} filled, ${a.failed} problems on ${a.host}${e.record ? " · record " + e.record : ""}`, workspaceId: e.workspaceId }), a;
}
async function Ti(e, t, a) {
  const i = await Pe("tables", e);
  if (!i) throw new Error("Dataset not found");
  const r = Math.max(0, i.rows.findIndex((l) => l.id === i.currentRowId));
  let s = r;
  if (t === "next" ? s = r + 1 : t === "prev" ? s = r - 1 : s = i.rows.findIndex((l) => l.id === a), s < 0 || s >= i.rows.length) return { ok: !1, index: r, total: i.rows.length };
  const n = { ...i, currentRowId: i.rows[s].id };
  await be("tables", [n], { snapshot: !1 });
  const u = await ai(n, await pa());
  return { ok: !0, rowId: i.rows[s].id, label: Nr(u, i.rows[s].id), index: s, total: i.rows.length };
}
const yt = (e) => `kf.run.${e}`;
async function Ye(e) {
  return Br(yt(e));
}
async function zn(e, t, a) {
  const i = await mt();
  gt(i, a);
  const r = await Pe("macros", t);
  if (!r || r.deleted) throw new Error("Macro not found");
  if (!ha(i.org, r, "execute", "macros")) throw new Error("Your organization role does not allow running this macro");
  const s = await Ye(e);
  if (s && s.status !== "stopped" && Date.now() - s.heartbeat < 12e4) throw new Error(`"${s.name}" is already running in this tab — stop it first`);
  const n = lt("run"), u = await Ga({ kind: "macro", refId: r.id, name: r.name, workspaceId: r.workspaceId, startedAt: Date.now(), status: "running", url: a.slice(0, 500), host: oe(a), steps: [] }, i.settings.automation.historyLimit), l = {
    runId: n,
    macroId: t,
    name: r.name,
    tabId: e,
    status: "running",
    execId: u.id,
    startedAt: Date.now(),
    datasetId: r.datasetId,
    workspaceId: r.workspaceId,
    heartbeat: Date.now(),
    state: { runId: n, macroId: t, stepIndex: 0, iterations: {}, vars: {}, startedAt: Date.now(), stepLog: [], logs: [], navigations: 0 }
  };
  return await Ne(yt(e), l), await Ft("execute", "macros", { resourceId: r.id, name: r.name, details: `started on ${oe(a)}`, workspaceId: r.workspaceId }), { run: l, macro: Ur(r), official: fa(i, a, r.workspaceId) };
}
function Ur(e) {
  return { id: e.id, name: e.name, steps: e.steps, settings: { ...ra, ...e.settings || {} } };
}
async function Kn(e, t) {
  const a = await Ye(e);
  if (!a || a.status === "stopped") return null;
  if (Date.now() - a.heartbeat > 10 * 6e4)
    return await Ne(yt(e), void 0), null;
  const i = await Pe("macros", a.macroId);
  if (!i) return null;
  const r = await mt();
  try {
    gt(r, t);
  } catch (s) {
    return await ga(e, { status: "failed", error: s.message, state: a.state }), null;
  }
  return { run: a, macro: Ur(i), official: fa(r, t, i.workspaceId) };
}
async function Qn(e, t, a) {
  const i = await Ye(e);
  return !i || i.state.runId !== t.runId ? { status: "stopped" } : (i.state = t, i.heartbeat = Date.now(), a && (i.lastUrl = a), await Ne(yt(e), i), { status: i.status });
}
async function Xn(e, t) {
  const a = await Ye(e);
  return a ? (a.status = t === "pause" ? "paused" : t === "resume" ? "running" : "stopped", await Ne(yt(e), a), _.tabs.sendMessage(e, { type: "kf/macro/control", action: t, runId: a.runId }, { frameId: 0 }).catch?.(() => {
  }), t === "stop" && await ga(e, { status: "stopped", state: a.state }), { ok: !0, status: a.status }) : { ok: !1 };
}
async function ga(e, t) {
  const a = await Ye(e);
  if (await Ne(yt(e), void 0), !a) return;
  const i = t.state || a.state;
  await Wi(a.execId, {
    endedAt: Date.now(),
    status: t.status === "success" ? "success" : t.status === "stopped" ? "stopped" : "failed",
    error: t.error,
    steps: (i.stepLog || []).slice(-500),
    logs: (i.logs || []).slice(-200),
    filled: (i.stepLog || []).filter((r) => r.status === "done").length,
    failed: (i.stepLog || []).filter((r) => r.status === "fail").length,
    skipped: (i.stepLog || []).filter((r) => r.status === "skip").length
  }), t.status !== "success" && await Ft(t.status === "stopped" ? "stop" : "fail", "macros", { resourceId: a.macroId, name: a.name, details: t.error, workspaceId: a.workspaceId });
}
async function Mi(e, t, a) {
  const i = await Ye(e);
  return { workspaceId: i?.workspaceId, datasetId: i?.datasetId, scopeRef: i?.macroId, url: a, extra: t };
}
async function Jn(e, t) {
  const a = await ma(t), i = zi(e, { values: a.values, fo: a.fo, url: t.url || "" });
  if (i.error) throw new Error(i.error);
  return i.ok;
}
const bt = (e) => `kf.rec.${e}`;
async function xt(e) {
  return Br(bt(e));
}
async function Zn(e, t) {
  const a = await mt();
  gt(a, t);
  const i = { tabId: e, startedAt: Date.now(), startUrl: t, steps: [], paused: !1, lastUrl: t, workspaceId: a.settings.activeWorkspaceId };
  return await Ne(bt(e), i), i;
}
async function eo(e, t, a) {
  const i = await xt(e);
  if (!i || i.paused) return { ok: !1 };
  if (a) {
    const r = i.steps.findIndex((s) => s.id === t.id);
    r >= 0 ? i.steps[r] = t : i.steps.push(t);
  } else i.steps.push(t);
  return i.steps.length > 2e3 && i.steps.shift(), await Ne(bt(e), i), { ok: !0, count: i.steps.length };
}
async function to(e, t) {
  const a = await xt(e);
  if (!a) return null;
  if (t !== a.lastUrl) {
    const i = a.steps[a.steps.length - 1];
    !(i && ["click", "key"].includes(i.type) && Date.now() - a.startedAt > 0) && !a.paused && a.steps.push({ id: lt("stp"), type: "navigate", value: t, note: `Open ${oe(t)}` }), a.lastUrl = t, await Ne(bt(e), a);
  }
  return a;
}
async function ao(e, t) {
  const a = await xt(e);
  return a ? (a.paused = t, await Ne(bt(e), a), a) : null;
}
async function qr(e, t, a) {
  const i = await xt(e);
  if (await Ne(bt(e), void 0), !i || !t) return { saved: !1 };
  const r = En(i.steps);
  if (!r.length) return { saved: !1, empty: !0 };
  const s = Date.now(), u = r[0]?.type === "navigate" ? r : [{ id: lt("stp"), type: "navigate", value: i.startUrl, note: `Open ${oe(i.startUrl)}`, disabled: !0 }, ...r], l = {
    id: lt("mac"),
    name: a || `Recorded on ${oe(i.startUrl)} ${new Date(s).toLocaleString()}`,
    enabled: !0,
    workspaceId: i.workspaceId,
    sites: [{ kind: "domain", value: oe(i.startUrl).replace(/^www\./, "") }],
    steps: u,
    settings: { ...ra },
    tags: ["recorded"],
    startUrl: i.startUrl,
    createdAt: s,
    updatedAt: s
  };
  return await be("macros", [l]), await Ft("create", "macros", { resourceId: l.id, name: l.name, details: `recorded ${r.length} steps (sensitive values not recorded: ${r.filter((c) => c.sensitive).length})`, workspaceId: l.workspaceId }), { saved: !0, macroId: l.id, steps: u.length };
}
async function io(e, t, a, i, r = {}) {
  const s = await mt();
  if (gt(s, i), !s.settings.security.scriptsEnabled) throw new Error("Custom JavaScript is turned off (Settings → Security)");
  if (s.org?.policies.disableScripts) throw new Error("Your organization has disabled custom scripts");
  const n = await Pe("scripts", e);
  if (!n || n.deleted) throw new Error("Script not found");
  if (!ha(s.org, n, "execute", "scripts")) throw new Error("Your organization role does not allow running this script");
  const l = (await Z("scripts")).filter((T) => T.library && T.id !== n.id && T.enabled && (!T.workspaceId || T.workspaceId === n.workspaceId)), c = Ii(n.code);
  if (Ci(c.problems)) throw new Error(c.problems.filter((T) => T.severity === "error").map((T) => `line ${T.line ?? "?"}: ${T.message}`).join("; "));
  const d = l.map((T) => ({ name: T.name, ...Ii(T.code) })).filter((T) => !Ci(T.problems)).map((T) => ({ name: T.name, code: T.code })), h = await ma({ workspaceId: n.workspaceId, datasetId: n.datasetId, scopeRef: n.id, url: i, extra: r }), { vault: p, row: y, record: w, ...V } = h.values, j = { code: c.code, libraries: d, vars: JSON.parse(JSON.stringify(V, (T, me) => me instanceof Date ? me.toISOString() : me)), record: h.record, timeoutMs: n.timeoutMs, maxLoopIterations: n.maxLoopIterations, name: n.name }, K = await Ga({ kind: "script", refId: n.id, name: n.name, workspaceId: n.workspaceId, startedAt: Date.now(), status: "running", url: i.slice(0, 500), host: oe(i), steps: [] }, s.settings.automation.historyLimit);
  let te;
  try {
    const T = { tabId: t, frameIds: [a || 0] };
    await _.scripting.executeScript({ target: T, world: "MAIN", files: ["script-host.js"] });
    const [me] = await _.scripting.executeScript({ target: T, world: "MAIN", func: (Bt) => window.__kfScriptHost.run(Bt), args: [j] });
    if (te = me?.result, !te) throw new Error("The page did not return a result (it may have navigated away)");
  } catch (T) {
    te = { ok: !1, error: { message: /Cannot access|cannot be scripted|chrome:\/\//i.test(String(T?.message)) ? "This page cannot be scripted by extensions" : T?.message || String(T) }, logs: [], vars: {}, durationMs: 0, steps: 0 };
  }
  await Wi(K.id, {
    endedAt: Date.now(),
    status: te.ok ? "success" : "failed",
    error: te.error ? `${te.error.line ? "line " + te.error.line + ": " : ""}${te.error.message}` : void 0,
    logs: (te.logs || []).slice(-200).map((T) => `[${T.level}${T.line ? " L" + T.line : ""}] ${T.text}`)
  }), await Ft("execute", "scripts", { resourceId: n.id, name: n.name, details: `${te.ok ? "ok" : "failed"} on ${oe(i)}`, workspaceId: n.workspaceId });
  const et = {};
  for (const [T, me] of Object.entries(te.vars || {})) (!(T in V) || JSON.stringify(V[T]) !== JSON.stringify(me)) && (et[T] = me);
  return { ...te, vars: et };
}
const ot = /* @__PURE__ */ new Map();
function Yr() {
  const e = Date.now();
  for (const [t, a] of ot) e - a.at > 600 * 1e3 && ot.delete(t);
}
function $r() {
  const e = new Uint8Array(16);
  return crypto.getRandomValues(e), Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
const Qe = /* @__PURE__ */ new Map();
_.windows?.onRemoved.addListener((e) => {
  const t = Qe.get(e);
  t && (Qe.delete(e), !t.done && t.tabId !== void 0 && _.tabs.sendMessage(t.tabId, { type: "kf/overlayResult", nonce: t.nonce, result: { type: "cancel" } }, { frameId: t.frameId }).catch?.(() => {
  }));
});
async function Zt() {
  const [e, t, a, i] = await Promise.all([Rt(), Z("snippets"), Z("tables"), Z("workspaces")]), r = await pa(), s = await Promise.all(a.map((l) => ai(l, r))), n = new Set(i.filter((l) => !l.expansionActive || l.archived).map((l) => l.id)), u = t.filter((l) => !l.workspaceId || !n.has(l.workspaceId));
  return { settings: e, snippets: u, tables: s };
}
async function ro(e, t, a, i) {
  const r = await Z("variables");
  if (!r.length) return {};
  const s = Qi(r, { datasets: a, fo: Xi(t), page: i, workspaceId: e.workspaceId || t.activeWorkspaceId }), { row: n, record: u, vault: l, ...c } = s.values;
  return c;
}
async function so(e) {
  const { settings: t, snippets: a } = await Zt(), i = Ni(t, e);
  return {
    settings: {
      expansionEnabled: t.expansionEnabled && !i,
      blocked: i,
      triggerMode: t.triggerMode,
      delimiters: t.delimiters,
      keepDelimiter: t.keepDelimiter,
      caseSensitive: t.caseSensitive,
      wordBoundary: t.wordBoundary,
      assistantHotkey: t.assistantHotkey,
      showFloatingButton: t.showFloatingButton,
      showToasts: t.showToasts,
      googleDocsExperimental: t.googleDocsExperimental
    },
    // Only shortcut metadata is sent to pages; content stays in the extension.
    shortcuts: a.filter((r) => r.enabled && r.shortcut).map((r) => ({ id: r.id, shortcut: r.shortcut, trigger: r.trigger || "default" }))
  };
}
async function no(e, t, a) {
  const { settings: i, snippets: r, tables: s } = await Zt(), n = r.find((c) => c.id === e);
  if (!n) return { kind: "error", message: "Snippet not found" };
  const u = $i({ settings: i, snippets: r, tables: s, page: t });
  u.globals = await ro(n, i, s, t);
  const l = ia(n.content, n.contentType, u);
  if (l.errors.length && !l.needsForm) return { kind: "error", message: l.errors[0] };
  if (l.needsForm) {
    Yr();
    const c = $r();
    return ot.set(c, { snippetId: e, page: t, tabId: a, at: Date.now(), mode: "form" }), { kind: "form", nonce: c, name: n.name };
  }
  return !l.text.trim() && !l.html.replace(/<[^>]*>/g, "").trim() ? { kind: "error", message: /\{\{\s*me\./.test(n.content) ? `“${n.name}” is empty because your profile isn't filled in yet. Open the K-Flow dashboard → Settings → Profile and add your details (e.g. your signature).` : `“${n.name}” has no text yet. Add content to it in the K-Flow dashboard.` } : (await Pi(e), { kind: "insert", text: l.text, html: l.html, isRich: l.isRich, cursor: l.cursor === null ? null : l.text.length - l.cursor, name: n.name });
}
_.runtime.onMessage.addListener((e, t, a) => {
  if (!e || typeof e.type != "string" || !e.type.startsWith("kf/") || t.id !== _.runtime.id) return !1;
  const i = t.tab?.id;
  return (async () => {
    switch (e.type) {
      case _e.getIndex:
        return so(String(e.host || ""));
      case _e.expand:
        return no(String(e.snippetId), e.page, i);
      case _e.claimForm: {
        const r = ot.get(String(e.nonce));
        return r ? (ot.delete(String(e.nonce)), { ok: !0, snippetId: r.snippetId, page: r.page, mode: r.mode, payload: r.payload }) : { ok: !1 };
      }
      case "kf/openOverlay": {
        Yr();
        const r = $r();
        return ot.set(r, { snippetId: String(e.snippetId || ""), page: e.page, tabId: i, at: Date.now(), mode: String(e.mode || "picker"), payload: e.payload }), { nonce: r };
      }
      case "kf/renderText": {
        const { settings: r, snippets: s, tables: n } = await Zt(), u = ia(String(e.content || ""), "text", $i({ settings: r, snippets: s, tables: n, page: e.page }));
        return u.errors.length ? { error: u.errors[0] } : u.needsForm ? { error: 'Autopilot text cannot contain form fields — use an "Insert snippet" step instead' } : { text: u.text };
      }
      case "kf/openOverlayWindow": {
        const r = String(e.nonce), s = e.mode === "picker" ? 460 : 500, n = e.mode === "picker" ? 470 : e.mode === "confirm" ? 300 : e.mode === "mapField" ? 640 : 620;
        let u, l;
        try {
          const d = t.tab?.windowId !== void 0 ? await _.windows.get(t.tab.windowId) : null;
          d && d.left !== void 0 && d.width !== void 0 && d.top !== void 0 && d.height !== void 0 && (u = Math.round(d.left + (d.width - s) / 2), l = Math.round(d.top + Math.max(40, (d.height - n) / 2)));
        } catch {
        }
        const c = await _.windows.create({ url: _.runtime.getURL("overlay/index.html") + `#nonce=${r}&window=1`, type: "popup", width: s, height: n, left: u, top: l, focused: !0 });
        return c?.id === void 0 ? { ok: !1 } : (Qe.set(c.id, { nonce: r, tabId: t.tab?.id, frameId: t.frameId ?? 0, done: !1 }), { ok: !0 });
      }
      case "kf/overlayResult": {
        for (const [r, s] of Qe)
          if (s.nonce === e.nonce) {
            if (s.done = !0, s.tabId !== void 0) {
              try {
                await _.windows.update((await _.tabs.get(s.tabId)).windowId, { focused: !0 });
              } catch {
              }
              _.tabs.sendMessage(s.tabId, { type: "kf/overlayResult", nonce: s.nonce, result: e.result }, { frameId: s.frameId }).catch?.(() => {
              });
            }
            _.windows.remove(r).catch?.(() => {
            }), Qe.delete(r);
          }
        return { ok: !0 };
      }
      case "kf/closeOverlayWindow": {
        for (const [r, s] of Qe) s.nonce === e.nonce && (s.done = !0, _.windows.remove(r).catch?.(() => {
        }), Qe.delete(r));
        return { ok: !0 };
      }
      case _e.recordUsage:
        return await Pi(String(e.snippetId)), { ok: !0 };
      case _e.listForAssistant: {
        const { snippets: r } = await Zt(), s = await ut("usage"), n = new Map(s.map((u) => [u.snippetId, u]));
        return r.filter((u) => u.enabled).map((u) => ({ id: u.id, name: u.name, shortcut: u.shortcut, preview: u.content.slice(0, 160), contentType: u.contentType, favorite: u.favorite, pinned: u.pinned, lastUsedAt: n.get(u.id)?.lastUsedAt || 0, count: n.get(u.id)?.count || 0 }));
      }
      case _e.listWorkflows:
        return (await Z("macros")).filter((r) => r.enabled).map((r) => ({ id: r.id, name: r.name, steps: r.steps, description: r.description }));
      case _e.getWorkflow:
        return Pe("workflows", String(e.id));
      case _e.openDashboard:
        return await _.tabs.create({ url: _.runtime.getURL("dashboard/index.html" + (e.hash ? "#" + e.hash : "")) }), { ok: !0 };
      case _e.picked:
        return await new Promise((r) => _.storage.local.set({ [Ct.picked]: { ...e.element, at: Date.now() } }, () => r())), { ok: !0 };
      default:
        return lo(e, t);
    }
  })().then(a, (r) => a({ kind: "error", error: String(r?.message || r), message: String(r?.message || r) })), !0;
});
async function jr() {
  const e = await Rt(), t = _.sidePanel;
  if (!t?.setPanelBehavior) return;
  const a = e.actionOpens === "sidepanel";
  await t.setPanelBehavior({ openPanelOnActionClick: a }).catch(() => {
  }), await _.action.setPopup({ popup: a ? "" : "popup/index.html" });
}
function Wr(e) {
  const t = _.sidePanel;
  if (t?.open && e !== void 0) return t.open({ windowId: e }).catch(() => {
  });
  if (_.sidebarAction?.open) return _.sidebarAction.open();
}
_.storage.onChanged.addListener((e, t) => {
  t === "local" && e[Ct.settings] && jr();
});
jr();
_.commands?.onCommand.addListener((e, t) => {
  e === "open-side-panel" && Wr(t?.windowId), e === "open-assistant" && t?.id !== void 0 && _.tabs.sendMessage(t.id, { type: _e.openAssistant }).catch?.(() => {
  });
});
function Hr() {
  _.contextMenus.removeAll(() => {
    _.contextMenus.create({ id: "kf-insert", title: "Insert K-Flow snippet…", contexts: ["editable"] }), _.sidePanel?.open && _.contextMenus.create({ id: "kf-sidepanel", title: "Open K-Flow side panel", contexts: ["all"] }), _.contextMenus.create({ id: "kf-new-from-selection", title: "Create K-Flow snippet from selection", contexts: ["selection"] }), _.contextMenus.create({ id: "kf-map-field", title: "K-Flow: map this field…", contexts: ["editable"] }), _.contextMenus.create({ id: "kf-autofill", title: "K-Flow: autofill this page", contexts: ["page", "editable"] });
  });
}
_.contextMenus.onClicked.addListener((e, t) => {
  if (e.menuItemId === "kf-sidepanel") {
    Wr(t?.windowId);
    return;
  }
  if (t?.id && (e.menuItemId === "kf-insert" && _.tabs.sendMessage(t.id, { type: _e.openAssistant }, { frameId: e.frameId }).catch?.(() => {
  }), e.menuItemId === "kf-new-from-selection")) {
    const a = (e.selectionText || "").slice(0, 2e4);
    _.tabs.create({ url: _.runtime.getURL("dashboard/index.html#/new?text=" + encodeURIComponent(a)) });
  }
});
async function oo() {
  if (!_.scripting?.executeScript) return;
  const e = await _.tabs.query({});
  for (const t of e)
    t.id === void 0 || !/^(https?|file):/.test(t.url || "") || _.scripting.executeScript({ target: { tabId: t.id, allFrames: !0 }, files: ["content.js"] }).catch(() => {
    });
}
_.runtime.onInstalled.addListener(async (e) => {
  Hr(), oo(), e.reason === "install" && (await Ms(), _.tabs.create({ url: _.runtime.getURL("dashboard/index.html#/welcome") }));
});
_.runtime.onStartup?.addListener(Hr);
async function uo() {
  const [e] = await _.tabs.query({ active: !0, lastFocusedWindow: !0 });
  return e;
}
async function lo(e, t) {
  const a = !t.tab || (t.url || "").startsWith(_.runtime.getURL("")), i = t.tab?.id, r = String(e.url || t.tab?.url || t.url || ""), s = async () => {
    if (!a) return i;
    if (typeof e.tabId == "number") return e.tabId;
    const l = await uo();
    if (l?.id === void 0) throw new Error("No active tab");
    return l.id;
  }, n = async (l) => a ? (await _.tabs.get(l)).url || "" : r, u = async (l, c, d = 0) => _.tabs.sendMessage(l, c, { frameId: d });
  switch (e.type) {
    case "kf/automation/forPage": {
      const l = await s(), c = await n(l), d = await Wn(c), [h, p] = await Promise.all([Ye(l), xt(l)]);
      return { ...d, run: h && h.status !== "stopped" ? { name: h.name, status: h.status, step: h.state?.stepIndex } : null, recording: p ? { steps: p.steps.length, paused: p.paused } : null, tabId: l, url: c };
    }
    // ---- autofill
    case "kf/autofill/plan":
      return Hn(String(e.profileId), r, e.recordId ?? null);
    case "kf/autofill/report":
      return Gn({ profileId: String(e.profileId), name: String(e.name || ""), url: r, preview: !!e.preview, report: e.report, recordId: e.recordId, record: e.record, workspaceId: e.workspaceId });
    case "kf/autofill/run": {
      const l = await s();
      return u(l, { type: "kf/autofill/start", profileId: e.profileId, preview: !!e.preview, recordId: e.recordId ?? null });
    }
    // ---- dataset records
    case "kf/dataset/move":
      return Ti(String(e.datasetId), e.dir || "next", e.rowId);
    // ---- macros
    case "kf/macro/start": {
      const l = await s(), c = await n(l), d = await zn(l, String(e.macroId), c);
      return await u(l, { type: "kf/macro/resume", run: d.run, macro: d.macro, official: d.official }), { ok: !0, runId: d.run.runId };
    }
    case "kf/macro/pending":
      return i !== void 0 ? Kn(i, r) : null;
    case "kf/macro/checkpoint":
      return i !== void 0 ? Qn(i, e.state, r) : { status: "stopped" };
    case "kf/macro/finish":
      return i !== void 0 && await ga(i, { status: e.status, error: e.error, state: e.state }), { ok: !0 };
    case "kf/macro/control": {
      const l = await s();
      return Xn(l, e.action);
    }
    case "kf/macro/render": {
      const l = await s();
      return { text: await Ai(String(e.text || ""), await Mi(l, e.vars || {}, r)) };
    }
    case "kf/macro/formula": {
      const l = await s();
      return { ok: await Jn(String(e.src || ""), await Mi(l, e.vars || {}, r)) };
    }
    case "kf/macro/nextRecord": {
      const l = await s(), c = await Ye(l);
      if (!c?.datasetId) throw new Error("This macro has no dataset — choose one in the macro settings");
      return Ti(c.datasetId, "next");
    }
    // ---- recorder
    case "kf/rec/start": {
      const l = await s(), c = await n(l);
      return await Zn(l, c), await u(l, { type: "kf/rec/begin" }), { ok: !0 };
    }
    case "kf/rec/status":
      return i !== void 0 ? to(i, r) : null;
    case "kf/rec/step":
      return i !== void 0 ? eo(i, e.step, !!e.replace) : { ok: !1 };
    case "kf/rec/pause": {
      const l = await s(), c = await ao(l, !!e.paused);
      return u(l, { type: "kf/rec/paused", paused: !!e.paused }).catch(() => {
      }), { ok: !!c };
    }
    case "kf/rec/stop": {
      const l = await s(), c = await qr(l, e.save !== !1, e.name);
      return u(l, { type: "kf/rec/end" }).catch(() => {
      }), c.saved && e.open !== !1 && _.tabs.create({ url: _.runtime.getURL(`dashboard/index.html#/macros/${c.macroId}`) }), c;
    }
    // ---- scripts
    case "kf/script/run": {
      const l = await s(), c = await n(l), d = a ? 0 : t.frameId ?? 0;
      return io(String(e.scriptId), l, d, c, e.vars || {});
    }
    // ---- field selector / scanning
    case "kf/mapper/start": {
      const l = await s();
      return u(l, { type: "kf/mapper/begin", profileId: e.profileId || null });
    }
    case "kf/scan": {
      if (!a) return { error: "not allowed" };
      const l = await s(), c = await n(l);
      return { ...await u(l, { type: "kf/scan" }) || {}, url: c, tabId: l };
    }
    case "kf/tabs/list":
      return a ? (await _.tabs.query({})).filter((c) => /^https?:/.test(c.url || "")).map((c) => ({ id: c.id, title: c.title, url: c.url, active: c.active })) : [];
    case "kf/render":
      return a ? { text: await Ai(String(e.text || ""), { workspaceId: e.workspaceId, datasetId: e.datasetId, url: e.url }) } : { error: "not allowed" };
  }
  return { error: "unknown message" };
}
_.tabs.onRemoved.addListener(async (e) => {
  const t = await Ye(e);
  t && await ga(e, { status: "stopped", error: "Tab was closed", state: t.state }), await xt(e) && await qr(e, !0);
});
_.commands?.onCommand.addListener(async (e, t) => {
  t?.id !== void 0 && (e === "run-autofill" && _.tabs.sendMessage(t.id, { type: "kf/autofill/hotkey" }, { frameId: 0 }).catch?.(() => {
  }), e === "field-selector" && _.tabs.sendMessage(t.id, { type: "kf/mapper/begin" }, { frameId: 0 }).catch?.(() => {
  }));
});
_.contextMenus.onClicked.addListener((e, t) => {
  t?.id && (e.menuItemId === "kf-map-field" && _.tabs.sendMessage(t.id, { type: "kf/mapper/begin", focused: !0 }, { frameId: e.frameId ?? 0 }).catch?.(() => {
  }), e.menuItemId === "kf-autofill" && _.tabs.sendMessage(t.id, { type: "kf/autofill/hotkey" }, { frameId: 0 }).catch?.(() => {
  }));
});
