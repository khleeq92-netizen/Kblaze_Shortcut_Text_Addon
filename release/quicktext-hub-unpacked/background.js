const k = typeof browser < "u" && browser?.runtime ? browser : globalThis.chrome, jt = "quicktext-hub-db", Gt = 1, we = {
  settings: "qth.settings",
  cloud: "qth.cloudConfig",
  revision: "qth.revision",
  sync: "qth.syncState",
  picked: "qth.pickedElement",
  pausedSites: "qth.pausedSites"
}, j = {
  getIndex: "qth/getIndex",
  expand: "qth/expand",
  claimForm: "qth/claimForm",
  recordUsage: "qth/recordUsage",
  openDashboard: "qth/openDashboard",
  listForAssistant: "qth/listForAssistant",
  getWorkflow: "qth/getWorkflow",
  listWorkflows: "qth/listWorkflows",
  picked: "qth/picked",
  // background -> content
  openAssistant: "qth/openAssistant"
}, Vt = ["snippets", "folders", "tables", "workflows", "templates", "usage", "meta"];
let ge = null;
function Ke() {
  return ge || (ge = new Promise((e, t) => {
    const n = indexedDB.open(jt, Gt);
    n.onupgradeneeded = () => {
      const a = n.result;
      for (const r of Vt)
        a.objectStoreNames.contains(r) || (r === "usage" ? a.createObjectStore(r, { keyPath: "snippetId" }) : r === "meta" ? a.createObjectStore(r) : a.createObjectStore(r, { keyPath: "id" }).createIndex("updatedAt", "updatedAt"));
    }, n.onsuccess = () => {
      const a = n.result;
      a.onversionchange = () => {
        a.close(), ge = null;
      }, e(a);
    }, n.onerror = () => t(n.error);
  }), ge);
}
function yt(e) {
  return new Promise((t, n) => {
    e.onsuccess = () => t(e.result), e.onerror = () => n(e.error);
  });
}
async function gt(e) {
  const t = await Ke();
  return yt(t.transaction(e, "readonly").objectStore(e).getAll());
}
async function Qe(e, t) {
  const n = await Ke();
  return yt(n.transaction(e, "readonly").objectStore(e).get(t));
}
async function bt(e, t, n) {
  if (!t.length) return;
  const a = await Ke();
  await new Promise((r, o) => {
    const s = a.transaction(e, "readwrite"), l = s.objectStore(e);
    for (const u of t) n !== void 0 ? l.put(u, n) : l.put(u);
    s.oncomplete = () => r(), s.onerror = () => o(s.error), s.onabort = () => o(s.error);
  });
}
async function wt(e, t, n) {
  return bt(e, [t], n);
}
const zt = /* @__PURE__ */ new Set();
async function xt(e, t = "local") {
  zt.forEach((n) => {
    try {
      n({ collections: e, origin: t });
    } catch {
    }
  });
  try {
    k?.storage?.local && await new Promise((n) => k.storage.local.set({ [we.revision]: { at: Date.now(), collections: e, origin: t } }, () => n()));
  } catch {
  }
}
async function Pe(e, t = !1) {
  const n = await gt(e);
  return t ? n : n.filter((a) => !a.deleted);
}
async function ve(e, t, n = {}) {
  const a = Date.now(), r = t.map((o) => n.touch === !1 ? o : { ...o, createdAt: o.createdAt || a, updatedAt: a });
  return await bt(e, r), await xt([e], n.origin || "local"), r;
}
async function kt(e) {
  const t = /* @__PURE__ */ new Date(), n = t.toISOString().slice(0, 10), a = await Qe("usage", e) || { snippetId: e, count: 0, lastUsedAt: 0, daily: {} };
  a.count++, a.lastUsedAt = t.getTime(), a.daily[n] = (a.daily[n] || 0) + 1;
  const r = Object.keys(a.daily).sort();
  for (; r.length > 90; ) delete a.daily[r.shift()];
  await wt("usage", a), await xt(["usage"]);
}
async function Xt(e) {
  return Qe("meta", e);
}
async function st(e, t) {
  return wt("meta", t, e);
}
const lt = {
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
  plan: "pro",
  enforcePlanLimits: !0,
  googleDocsExperimental: !1,
  autoSync: !0,
  conflictStrategy: "newest",
  syncSettings: !0,
  onboarded: !1,
  actionOpens: "popup"
};
function Kt(e) {
  return { ...lt, ...e || {}, profile: { ...lt.profile, ...e?.profile || {} } };
}
async function Mt() {
  const e = await new Promise((t) => k.storage.local.get(we.settings, t));
  return Kt(e?.[we.settings]);
}
function Qt(e, t) {
  const n = t.toLowerCase();
  return e.blockedSites.some((a) => {
    const r = a.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return r && (n === r || n.endsWith("." + r));
  });
}
function pe(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function He(e) {
  return pe(e).replace(/\r?\n/g, "<br>");
}
const Jt = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function Ve(e) {
  return e.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (t, n) => {
    if (n[0] === "#") {
      const a = n[1].toLowerCase() === "x" ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10);
      return Number.isFinite(a) ? String.fromCodePoint(a) : t;
    }
    return Jt[n.toLowerCase()] ?? t;
  });
}
const Zt = /^(p|div|h[1-6]|li|tr|blockquote|pre|ul|ol|table|section|article|header|footer)$/i;
function ct(e) {
  let t = "";
  const n = [], a = /<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let r, o = null, s = "", l = !1;
  const u = () => {
    t && !t.endsWith(`
`) && (t += `
`);
  };
  for (; r = a.exec(e); ) {
    if (r[3] !== void 0) {
      const S = Ve(r[3].replace(/[\r\n\t ]+/g, " "));
      t += S, l && (s += S);
      continue;
    }
    const c = r[1].toLowerCase(), D = r[0][1] === "/";
    if (c === "br") {
      t += `
`;
      continue;
    }
    if (c === "a") {
      if (D)
        o && s.trim() !== o && !/^mailto:/i.test(o) && (t += ` (${o})`), l = !1, o = null;
      else {
        const S = /href\s*=\s*["']([^"']*)["']/i.exec(r[2]);
        o = S ? Ve(S[1]) : null, l = !0, s = "";
      }
      continue;
    }
    if (c === "ul" || c === "ol") {
      D ? (n.pop(), u()) : (u(), n.push({ ordered: c === "ol", n: 0 }));
      continue;
    }
    if (c === "li" && !D) {
      u();
      const S = n[n.length - 1];
      t += "  ".repeat(Math.max(0, n.length - 1)) + (S?.ordered ? `${++S.n}. ` : "• ");
      continue;
    }
    if (c === "td" || c === "th") {
      D && (t += "	");
      continue;
    }
    Zt.test(c) && u();
  }
  return t.replace(/\t\n/g, `
`).replace(/[  ]+\n/g, `
`).replace(/\n{3,}/g, `

`).replace(/^\n+|\n+$/g, "");
}
class ee extends Error {
  constructor(t, n) {
    super(t), this.pos = n;
  }
}
function en(e, t = !1) {
  const n = [];
  let a = 0, r = "", o = 0;
  for (; a < e.length; ) {
    if (e[a] === "\\" && e.startsWith("{{", a + 1)) {
      r += "{{", a += 3;
      continue;
    }
    if (e.startsWith("{{", a)) {
      let s = a + 2, l = null;
      for (; s < e.length; s++) {
        const c = e[s];
        if (l) {
          c === "\\" ? s++ : c === l && (l = null);
          continue;
        }
        if (c === '"' || c === "'") l = c;
        else if (c === "}" && e[s + 1] === "}") break;
      }
      if (s >= e.length) {
        const c = e.indexOf("}}", a + 2);
        if (c < 0) throw new ee('A command starting with "{{" is never closed with "}}"', a);
        s = c;
      }
      if (r && n.push({ type: "text", value: r, start: o, end: a }), e.slice(a + 2, s).includes("{{")) throw new ee('Commands cannot be nested inside other commands. Use a formula instead, e.g. {{link: ="https://site.com/" & id}}', a);
      let u = e.slice(a + 2, s);
      t && (u = Ve(u.replace(/<[^>]*>/g, "")).replace(/\u00a0/g, " ")), n.push({ type: "cmd", value: u.trim(), start: a, end: s + 2 }), a = s + 2, r = "", o = a;
      continue;
    }
    r += e[a++];
  }
  return r && n.push({ type: "text", value: r, start: o, end: e.length }), n;
}
function xe(e, t) {
  const n = [];
  let a = "", r = null, o = 0;
  for (let s = 0; s < e.length; s++) {
    const l = e[s];
    if (r) {
      a += l, l === "\\" ? a += e[++s] ?? "" : l === r && (r = null);
      continue;
    }
    if (l === '"' || l === "'") {
      r = l, a += l;
      continue;
    }
    if ((l === "(" || l === "[") && o++, (l === ")" || l === "]") && o--, l === t && o <= 0) {
      n.push(a), a = "";
      continue;
    }
    a += l;
  }
  return n.push(a), n;
}
function Tt(e) {
  const t = e.trim();
  return t.length >= 2 && (t[0] === '"' && t.endsWith('"') || t[0] === "'" && t.endsWith("'")) ? t.slice(1, -1).replace(/\\(["'\\])/g, "$1").replace(/\\n/g, `
`) : t;
}
function tn(e) {
  const t = e.trim();
  if (t.startsWith("=")) {
    const l = xe(t.slice(1), ";");
    return { name: "=", args: { main: l[0].trim(), ...dt(l.slice(1)) } };
  }
  if (t.startsWith("#")) return { name: "#", args: { main: t.slice(1), opts: {}, flags: /* @__PURE__ */ new Set() } };
  const n = xe(t, ";"), a = n[0].trim(), r = /^([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/.exec(a);
  let o, s = "";
  if (r)
    o = r[1].toLowerCase(), s = r[2].trim();
  else if (/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(a)) {
    const l = a.toLowerCase();
    ["else", "endif", "endrepeat", "endsection", "cursor", "today", "now", "time", "date", "index"].includes(l) && !a.includes(".") ? o = l : (o = "ref", s = a);
  } else {
    const l = /^([A-Za-z][\w-]*)\s+([\s\S]*)$/.exec(a);
    if (l && ["if", "elseif", "repeat", "section"].includes(l[1].toLowerCase()))
      o = l[1].toLowerCase(), s = l[2].trim();
    else throw new ee(`Cannot understand command "{{${e}}}"`);
  }
  return { name: o, args: { main: o === "if" || o === "elseif" || o === "set" ? s : Tt(s), ...dt(n.slice(1)) } };
}
function dt(e) {
  const t = {}, n = /* @__PURE__ */ new Set();
  for (const a of e) {
    const r = a.trim();
    if (!r) continue;
    const o = r.indexOf("=");
    o > 0 && /^[\w-]+$/.test(r.slice(0, o).trim()) ? t[r.slice(0, o).trim().toLowerCase()] = Tt(r.slice(o + 1)) : n.add(r.toLowerCase());
  }
  return { opts: t, flags: n };
}
function ze(e, t = !1) {
  const n = en(e, t);
  let a = 0;
  function r(s) {
    const l = [];
    for (; a < n.length; ) {
      const u = n[a++];
      if (u.type === "text") {
        l.push({ k: "text", text: u.value });
        continue;
      }
      if (!u.value) {
        l.push({ k: "text", text: "" });
        continue;
      }
      const { name: c, args: D } = tn(u.value);
      if (s.includes(c)) return { nodes: l, term: { name: c, args: D, end: u.end } };
      if (c === "if") {
        const S = [];
        let b = D.main, A = null;
        for (; ; ) {
          const q = r(["elseif", "else", "endif"]);
          if (!q.term) throw new ee(`{{if: ${D.main}}} is missing {{endif}}`, u.start);
          if (S.push({ cond: b, body: q.nodes }), q.term.name === "endif") break;
          if (q.term.name === "elseif") {
            b = q.term.args.main;
            continue;
          }
          const W = r(["endif"]);
          if (!W.term) throw new ee(`{{if: ${D.main}}} is missing {{endif}}`, u.start);
          A = W.nodes;
          break;
        }
        if (S.some((q) => !q.cond.trim())) throw new ee("{{if}} / {{elseif}} needs a condition, e.g. {{if: amount > 100}}", u.start);
        l.push({ k: "if", branches: S, elseBody: A, start: u.start });
        continue;
      }
      if (c === "repeat" || c === "section") {
        const S = c === "repeat" ? "endrepeat" : "endsection", b = r([S]);
        if (!b.term) throw new ee(`{{${c}: ${D.main}}} is missing {{${S}}}`, u.start);
        l.push({ k: c, args: D, body: b.nodes, start: u.start, end: u.end, raw: u.value });
        continue;
      }
      if (["else", "elseif", "endif", "endrepeat", "endsection"].includes(c)) throw new ee(`{{${c}}} without a matching opening command`, u.start);
      l.push({ k: "cmd", name: c, args: D, raw: u.value, start: u.start, end: u.end });
    }
    return { nodes: l, term: null };
  }
  return r([]).nodes;
}
const ut = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], pt = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], Q = (e, t = 2) => String(e).padStart(t, "0"), nn = (e) => {
  const t = ["th", "st", "nd", "rd"], n = e % 100;
  return e + (t[(n - 20) % 10] || t[n] || t[0]);
};
function G(e, t) {
  if (!(e instanceof Date) || isNaN(e.getTime())) return "";
  const n = {
    YYYY: () => String(e.getFullYear()),
    YY: () => String(e.getFullYear()).slice(-2),
    MMMM: () => ut[e.getMonth()],
    MMM: () => ut[e.getMonth()].slice(0, 3),
    MM: () => Q(e.getMonth() + 1),
    M: () => String(e.getMonth() + 1),
    Do: () => nn(e.getDate()),
    DD: () => Q(e.getDate()),
    D: () => String(e.getDate()),
    dddd: () => pt[e.getDay()],
    ddd: () => pt[e.getDay()].slice(0, 3),
    HH: () => Q(e.getHours()),
    H: () => String(e.getHours()),
    hh: () => Q(e.getHours() % 12 || 12),
    h: () => String(e.getHours() % 12 || 12),
    mm: () => Q(e.getMinutes()),
    m: () => String(e.getMinutes()),
    ss: () => Q(e.getSeconds()),
    s: () => String(e.getSeconds()),
    A: () => e.getHours() < 12 ? "AM" : "PM",
    a: () => e.getHours() < 12 ? "am" : "pm",
    Q: () => String(Math.floor(e.getMonth() / 3) + 1)
  };
  return t.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a|Q/g, (a, r) => r !== void 0 ? r : n[a]());
}
function me(e, t) {
  const n = new Date(e.getTime()), a = /([+-])\s*(\d+)\s*(y|M|w|d|h|m|s|bd)/g;
  let r, o = !1;
  for (; r = a.exec(t); ) {
    o = !0;
    const s = parseInt(r[2], 10) * (r[1] === "-" ? -1 : 1);
    switch (r[3]) {
      case "y":
        n.setFullYear(n.getFullYear() + s);
        break;
      case "M":
        Je(n, s);
        break;
      case "w":
        n.setDate(n.getDate() + 7 * s);
        break;
      case "d":
        n.setDate(n.getDate() + s);
        break;
      case "bd":
        vt(n, s);
        break;
      case "h":
        n.setHours(n.getHours() + s);
        break;
      case "m":
        n.setMinutes(n.getMinutes() + s);
        break;
      case "s":
        n.setSeconds(n.getSeconds() + s);
        break;
    }
  }
  if (!o && t.trim()) throw new Error(`Invalid date shift "${t}". Use e.g. +3d, -1w, +1M, +2bd`);
  return n;
}
function Je(e, t) {
  const n = e.getDate();
  e.setDate(1), e.setMonth(e.getMonth() + t);
  const a = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  return e.setDate(Math.min(n, a)), e;
}
function vt(e, t) {
  const n = t < 0 ? -1 : 1;
  let a = Math.abs(t);
  for (; a > 0; )
    e.setDate(e.getDate() + n), e.getDay() !== 0 && e.getDay() !== 6 && a--;
  return e;
}
function O(e, t = /* @__PURE__ */ new Date()) {
  if (e instanceof Date) return isNaN(e.getTime()) ? null : e;
  if (typeof e == "number") return new Date(e);
  if (typeof e != "string") return null;
  const n = e.trim();
  if (!n) return null;
  const a = n.toLowerCase(), r = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  if (a === "now") return new Date(t.getTime());
  if (a === "today") return r;
  if (a === "tomorrow") return me(r, "+1d");
  if (a === "yesterday") return me(r, "-1d");
  if (/^[+-]\s*\d/.test(n)) return me(/[hms]\b/.test(n) && !/bd/.test(n) ? t : r, n);
  const o = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(n);
  if (o) return new Date(+o[1], +o[2] - 1, +o[3], +(o[4] || 0), +(o[5] || 0), +(o[6] || 0));
  const s = /^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i.exec(n);
  if (s) {
    let c = +s[1];
    return s[3] && (c = c % 12 + (s[3].toLowerCase() === "pm" ? 12 : 0)), new Date(t.getFullYear(), t.getMonth(), t.getDate(), c, +s[2]);
  }
  const l = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(n);
  if (l) return new Date(+l[3], +l[2] - 1, +l[1]);
  const u = Date.parse(n);
  return isNaN(u) ? null : new Date(u);
}
function Ie(e) {
  return `${e.getFullYear()}-${Q(e.getMonth() + 1)}-${Q(e.getDate())}`;
}
function mt(e) {
  return `${Q(e.getHours())}:${Q(e.getMinutes())}`;
}
function Dt(e, t, n = "days") {
  const a = t.getTime() - e.getTime();
  switch (n.toLowerCase()) {
    case "seconds":
      return Math.floor(a / 1e3);
    case "minutes":
      return Math.floor(a / 6e4);
    case "hours":
      return Math.floor(a / 36e5);
    case "weeks":
      return Math.floor(a / (7 * 864e5));
    case "months":
      return (t.getFullYear() - e.getFullYear()) * 12 + (t.getMonth() - e.getMonth()) - (t.getDate() < e.getDate() ? 1 : 0);
    case "years":
      return Math.floor(((t.getFullYear() - e.getFullYear()) * 12 + (t.getMonth() - e.getMonth()) - (t.getDate() < e.getDate() ? 1 : 0)) / 12);
    default: {
      const r = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()), o = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
      return Math.round((o - r) / 864e5);
    }
  }
}
function I(e) {
  return Array.isArray(e);
}
function Ye(e) {
  return !!e && typeof e == "object" && !Array.isArray(e) && !(e instanceof Date);
}
function E(e) {
  if (typeof e == "number") return e;
  if (typeof e == "boolean") return e ? 1 : 0;
  if (e == null) return 0;
  if (e instanceof Date) return e.getTime();
  if (Array.isArray(e)) return e.length === 1 ? E(e[0]) : NaN;
  if (typeof e == "string") {
    const t = e.trim();
    if (t === "") return 0;
    const n = t.endsWith("%"), a = t.replace(/[%\s ]/g, "").replace(/^[^\d+\-.(]+/, "").replace(/[^\d.]+$/, "").replace(/,(?=\d{3}(\D|$))/g, ""), r = /^\(.*\)$/.test(a), o = Number(r ? "-" + a.slice(1, -1) : a);
    return a === "" || isNaN(o) ? NaN : n ? o / 100 : o;
  }
  return NaN;
}
function ke(e) {
  return typeof e == "number" ? Number.isFinite(e) : typeof e == "string" ? e.trim() !== "" && !isNaN(E(e)) : !1;
}
function Y(e) {
  if (e == null) return !1;
  if (typeof e == "boolean") return e;
  if (typeof e == "number") return e !== 0 && !isNaN(e);
  if (typeof e == "string") {
    const t = e.trim().toLowerCase();
    return !(t === "" || t === "false" || t === "no" || t === "off" || t === "0");
  }
  return Array.isArray(e) ? e.length > 0 : !0;
}
function St(e) {
  if (!Number.isFinite(e)) return isNaN(e) ? "NaN" : e > 0 ? "∞" : "-∞";
  const t = Math.round(e * 1e10) / 1e10;
  return String(t);
}
function m(e, t) {
  if (e == null) return "";
  if (typeof e == "string") return e;
  if (typeof e == "number") return St(e);
  if (typeof e == "boolean") return e ? "yes" : "no";
  if (e instanceof Date) {
    const n = e.getHours() !== 0 || e.getMinutes() !== 0;
    return G(e, t ? n && e.__time ? `${t.dateFormat} ${t.timeFormat}` : t.dateFormat : "YYYY-MM-DD");
  }
  return Array.isArray(e) ? e.map((n) => m(n, t)).join(", ") : Ye(e) ? "__label" in e ? m(e.__label, t) : Object.values(e).filter((n) => typeof n != "object").map((n) => m(n, t)).join(", ") : String(e);
}
function K(e, t, n) {
  if (!t) return m(e, n);
  const [a, ...r] = t.split(":"), o = r.join(":").trim(), s = a.trim().toLowerCase(), l = () => {
    const u = E(e);
    if (isNaN(u)) throw new Error(`Cannot format "${m(e)}" as a number`);
    return u;
  };
  switch (s) {
    case "currency":
      return new Intl.NumberFormat(n.locale, { style: "currency", currency: (o || n.currency).toUpperCase() }).format(l());
    case "number":
    case "decimal": {
      const u = o === "" ? void 0 : parseInt(o, 10);
      return new Intl.NumberFormat(n.locale, u === void 0 ? { maximumFractionDigits: 10 } : { minimumFractionDigits: u, maximumFractionDigits: u }).format(l());
    }
    case "integer":
      return new Intl.NumberFormat(n.locale, { maximumFractionDigits: 0 }).format(l());
    case "plain":
      return St(l());
    case "percent": {
      const u = o === "" ? 0 : parseInt(o, 10);
      return new Intl.NumberFormat(n.locale, { style: "percent", minimumFractionDigits: u, maximumFractionDigits: u }).format(l());
    }
    case "upper":
      return m(e, n).toUpperCase();
    case "lower":
      return m(e, n).toLowerCase();
    case "title":
      return Ze(m(e, n));
    case "date": {
      const u = O(e);
      return u ? G(u, o || n.dateFormat) : m(e, n);
    }
    case "time": {
      const u = O(e);
      return u ? G(u, o || n.timeFormat) : m(e, n);
    }
    case "datetime": {
      const u = O(e);
      return u ? G(u, o || `${n.dateFormat} ${n.timeFormat}`) : m(e, n);
    }
    default: {
      const u = e instanceof Date ? e : typeof e == "string" ? O(e) : null;
      return u ? G(u, t) : m(e, n);
    }
  }
}
function Ze(e) {
  return e.toLowerCase().replace(/(^|[\s\-_/(])(\p{L})/gu, (t, n, a) => n + a.toUpperCase());
}
class R extends Error {
}
function an(e) {
  const t = [];
  let n = 0;
  for (; n < e.length; ) {
    const a = e[n];
    if (/\s/.test(a)) {
      n++;
      continue;
    }
    if (/\d/.test(a) || a === "." && /\d/.test(e[n + 1] || "")) {
      const o = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(e.slice(n));
      t.push({ k: "num", v: o[0], pos: n }), n += o[0].length;
      continue;
    }
    if (a === '"' || a === "'" || a === "“" || a === "”") {
      const o = a === "“" ? "”" : a;
      let s = n + 1, l = "";
      for (; s < e.length && e[s] !== o && !(o === "”" && e[s] === '"'); )
        if (e[s] === "\\" && s + 1 < e.length) {
          const u = e[s + 1];
          l += u === "n" ? `
` : u === "t" ? "	" : u, s += 2;
        } else l += e[s++];
      if (s >= e.length) throw new R(`Unterminated text starting at position ${n + 1}`);
      t.push({ k: "str", v: l, pos: n }), n = s + 1;
      continue;
    }
    if (/[\p{L}_$]/u.test(a)) {
      const o = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(e.slice(n));
      t.push({ k: "id", v: o[0], pos: n }), n += o[0].length;
      continue;
    }
    const r = e.slice(n, n + 2);
    if (["==", "!=", "<>", "<=", ">=", "&&", "||"].includes(r)) {
      t.push({ k: "op", v: r, pos: n }), n += 2;
      continue;
    }
    if ("+-*/%^&=<>!(),.[]?:".includes(a)) {
      t.push({ k: "op", v: a, pos: n }), n++;
      continue;
    }
    throw new R(`Unexpected character "${a}" at position ${n + 1}`);
  }
  return t.push({ k: "eof", v: "", pos: e.length }), t;
}
const ft = {
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
function At(e) {
  const t = an(e);
  let n = 0;
  const a = () => t[n], r = () => t[n++], o = (b) => {
    const A = r();
    if (A.v !== b) throw new R(`Expected "${b}" at position ${A.pos + 1}${A.k === "eof" ? " (end of formula)" : ""}`);
  }, s = (b) => b.k === "op" && b.v in ft ? b.v : b.k === "id" && (b.v.toLowerCase() === "and" || b.v.toLowerCase() === "or") ? b.v.toLowerCase() : null;
  function l(b) {
    let A = u();
    for (; ; ) {
      const q = a();
      if (q.k === "op" && q.v === "?" && b <= 0) {
        r();
        const $e = l(0);
        o(":");
        const C = l(0);
        A = { t: "call", fn: "if", args: [A, $e, C] };
        continue;
      }
      const W = s(q);
      if (!W) break;
      const se = ft[W];
      if (se < b) break;
      r();
      const Fe = l(W === "^" ? se : se + 1);
      A = { t: "bin", op: W, left: A, right: Fe };
    }
    return A;
  }
  function u() {
    const b = a();
    return b.k === "op" && (b.v === "-" || b.v === "+" || b.v === "!") ? (r(), { t: "unary", op: b.v === "!" ? "not" : b.v, arg: u() }) : b.k === "id" && b.v.toLowerCase() === "not" ? (r(), { t: "unary", op: "not", arg: l(3) }) : c(D());
  }
  function c(b) {
    for (; ; ) {
      const A = a();
      if (A.k === "op" && A.v === ".") {
        r();
        const q = r();
        if (q.k !== "id" && q.k !== "num") throw new R(`Expected a field name after "." at position ${q.pos + 1}`);
        b = { t: "member", obj: b, prop: q.v };
      } else if (A.k === "op" && A.v === "[") {
        r();
        const q = l(0);
        o("]"), b = { t: "index", obj: b, index: q };
      } else return b;
    }
  }
  function D() {
    const b = r();
    if (b.k === "num") return { t: "num", v: parseFloat(b.v) };
    if (b.k === "str") return { t: "str", v: b.v };
    if (b.k === "id") {
      const A = b.v.toLowerCase();
      if (A === "true" || A === "yes") return { t: "bool", v: !0 };
      if (A === "false" || A === "no") return { t: "bool", v: !1 };
      if (A === "null") return { t: "null" };
      if (a().v === "(" && a().k === "op") {
        r();
        const q = [];
        if (!(a().k === "op" && a().v === ")"))
          for (; ; ) {
            if (q.push(l(0)), a().k === "op" && a().v === ",") {
              r();
              continue;
            }
            break;
          }
        return o(")"), { t: "call", fn: A, args: q };
      }
      return { t: "name", name: b.v };
    }
    if (b.k === "op" && b.v === "(") {
      const A = l(0);
      return o(")"), A;
    }
    if (b.k === "op" && b.v === "[") {
      const A = [];
      if (!(a().k === "op" && a().v === "]"))
        for (; ; ) {
          if (A.push(l(0)), a().k === "op" && a().v === ",") {
            r();
            continue;
          }
          break;
        }
      return o("]"), { t: "list", items: A };
    }
    throw new R(b.k === "eof" ? "Formula ended unexpectedly" : `Unexpected "${b.v}" at position ${b.pos + 1}`);
  }
  const S = l(0);
  if (a().k !== "eof") throw new R(`Unexpected "${a().v}" at position ${a().pos + 1}`);
  return S;
}
function Z(e, t = /* @__PURE__ */ new Set()) {
  switch (e.t) {
    case "name":
      t.add(e.name);
      break;
    case "member":
      Z(e.obj, t);
      break;
    case "index":
      Z(e.obj, t), Z(e.index, t);
      break;
    case "call":
      e.args.forEach((n) => Z(n, t));
      break;
    case "unary":
      Z(e.arg, t);
      break;
    case "bin":
      Z(e.left, t), Z(e.right, t);
      break;
    case "list":
      e.items.forEach((n) => Z(n, t));
      break;
  }
  return t;
}
function ie(e, t) {
  if (I(e))
    return t === "length" || t === "count" ? e.length : e.map((n) => ie(n, t));
  if (Ye(e)) {
    if (t in e) return e[t];
    const n = Object.keys(e).find((a) => a.toLowerCase() === t.toLowerCase());
    return n ? e[n] : null;
  }
  return typeof e == "string" && t === "length" ? e.length : null;
}
function M(e, t = "value") {
  const n = E(e);
  if (isNaN(n)) throw new R(`"${m(e)}" is not a number (${t})`);
  return n;
}
function qt(e, t, n) {
  if (I(t) || I(n)) {
    const o = I(t) ? t : null, s = I(n) ? n : null, l = Math.max(o?.length ?? 0, s?.length ?? 0);
    return Array.from({ length: l }, (u, c) => qt(e, o ? o[c] ?? null : t, s ? s[c] ?? null : n));
  }
  if (t instanceof Date && (e === "+" || e === "-") && !(n instanceof Date)) {
    const o = new Date(t.getTime());
    return o.setDate(o.getDate() + (e === "+" ? 1 : -1) * M(n, "days")), o;
  }
  if (t instanceof Date && n instanceof Date && e === "-") return Dt(n, t, "days");
  const a = M(t, "left side of " + e), r = M(n, "right side of " + e);
  switch (e) {
    case "+":
      return a + r;
    case "-":
      return a - r;
    case "*":
      return a * r;
    case "/":
      if (r === 0) throw new R("Division by zero");
      return a / r;
    case "%":
      return a % r;
    case "^":
      return Math.pow(a, r);
  }
  throw new R("Unknown operator " + e);
}
function ne(e, t) {
  if (e == null || e === "") return t == null || t === "";
  if (typeof e == "boolean" || typeof t == "boolean") return Y(e) === Y(t);
  if (e instanceof Date || t instanceof Date) {
    const n = O(e), a = O(t);
    return !!n && !!a && Ie(n) === Ie(a);
  }
  return ke(e) && ke(t) ? Math.abs(E(e) - E(t)) < 1e-9 : m(e).trim().toLowerCase() === m(t).trim().toLowerCase();
}
function te(e, t) {
  if (e instanceof Date || t instanceof Date) {
    const n = O(e), a = O(t);
    if (!n || !a) throw new R("Cannot compare a date with a non-date");
    return n.getTime() - a.getTime();
  }
  return ke(e) && ke(t) ? E(e) - E(t) : m(e).localeCompare(m(t));
}
function Ce(e) {
  return e.flatMap((t) => I(t) ? Ce(t) : [t]);
}
function Re(e) {
  return Ce(e).filter((t) => t !== null && t !== "").map((t) => M(t));
}
function F(e, t, n) {
  const a = O(e, t);
  if (!a) throw new R(`${n}: "${m(e)}" is not a valid date`);
  return a;
}
function et(e, t) {
  if (!I(e)) throw new R(`${t}: first argument must be a list or table`);
  return e.filter(Ye);
}
const Lt = {};
function p(e, t, n, a, r) {
  Lt[e] = { fn: r, sig: n, doc: a, group: t };
}
p("upper", "Text", "upper(text)", "UPPERCASE text", ([e]) => m(e).toUpperCase());
p("lower", "Text", "lower(text)", "lowercase text", ([e]) => m(e).toLowerCase());
p("title", "Text", "title(text)", "Title Case Each Word", ([e]) => Ze(m(e)));
p("capitalize", "Text", "capitalize(text)", "Capitalize the first letter", ([e]) => {
  const t = m(e);
  return t.charAt(0).toUpperCase() + t.slice(1);
});
p("trim", "Text", "trim(text)", "Remove surrounding spaces", ([e]) => m(e).trim());
p("len", "Text", "len(text)", "Number of characters (or items in a list)", ([e]) => I(e) ? e.length : m(e).length);
p("replace", "Text", "replace(text, find, with)", "Replace every occurrence of find", ([e, t, n]) => m(e).split(m(t)).join(m(n)));
p("left", "Text", "left(text, n)", "First n characters", ([e, t]) => m(e).slice(0, M(t)));
p("right", "Text", "right(text, n)", "Last n characters", ([e, t]) => {
  const n = m(e), a = M(t);
  return a <= 0 ? "" : n.slice(-a);
});
p("mid", "Text", "mid(text, start, length)", "Substring (start at 1)", ([e, t, n]) => m(e).substr(M(t) - 1, n === void 0 ? void 0 : M(n)));
p("contains", "Text", "contains(text, part)", "True if text contains part (case-insensitive) or list contains item", ([e, t]) => I(e) ? e.some((n) => ne(n, t)) : m(e).toLowerCase().includes(m(t).toLowerCase()));
p("startswith", "Text", "startswith(text, part)", "True if text starts with part", ([e, t]) => m(e).toLowerCase().startsWith(m(t).toLowerCase()));
p("endswith", "Text", "endswith(text, part)", "True if text ends with part", ([e, t]) => m(e).toLowerCase().endsWith(m(t).toLowerCase()));
p("split", "Text", "split(text, separator)", "Split text into a list", ([e, t]) => m(e).split(t === void 0 ? "," : m(t)).map((n) => n.trim()));
p("join", "Text", "join(list, separator)", "Join list items into text", ([e, t], n) => (I(e) ? e : [e]).map((a) => m(a, n.fo)).join(t === void 0 ? ", " : m(t)));
p("concat", "Text", "concat(a, b, ...)", "Join values together", (e, t) => Ce(e).map((n) => m(n, t.fo)).join(""));
p("repeat", "Text", "repeat(text, n)", "Repeat text n times", ([e, t]) => m(e).repeat(Math.max(0, Math.min(1e3, M(t)))));
p("pad", "Text", "pad(text, length, char)", "Left-pad to a length", ([e, t, n]) => m(e).padStart(M(t), n === void 0 ? " " : m(n)));
p("truncate", "Text", "truncate(text, n)", "Shorten to n characters with …", ([e, t]) => {
  const n = m(e), a = M(t);
  return n.length > a ? n.slice(0, Math.max(0, a - 1)) + "…" : n;
});
p("initials", "Text", "initials(name)", 'Initials of a name: "Ada Lovelace" → "AL"', ([e]) => m(e).split(/\s+/).filter(Boolean).map((t) => t[0].toUpperCase()).join(""));
p("firstname", "Text", "firstname(name)", "First word of a full name", ([e]) => m(e).trim().split(/\s+/)[0] || "");
p("lastname", "Text", "lastname(name)", "Last word of a full name", ([e]) => {
  const t = m(e).trim().split(/\s+/);
  return t.length > 1 ? t[t.length - 1] : "";
});
p("urlencode", "Text", "urlencode(text)", "Encode text for use inside a link", ([e]) => encodeURIComponent(m(e)));
p("text", "Text", "text(value)", "Convert to text", ([e], t) => m(e, t.fo));
p("format", "Text", 'format(value, "currency:EUR")', "Format a value (currency, number:2, percent, date:DD/MM/YYYY, upper …)", ([e, t], n) => K(e, m(t), n.fo));
p("if", "Logic", "if(condition, then, else)", "Choose a value based on a condition", ([e, t, n]) => Y(e) ? t ?? "" : n ?? "");
p("and", "Logic", "and(a, b, ...)", "True if all are true", (e) => e.every(Y));
p("or", "Logic", "or(a, b, ...)", "True if any is true", (e) => e.some(Y));
p("not", "Logic", "not(a)", "Negate", ([e]) => !Y(e));
p("isempty", "Logic", "isempty(value)", "True if blank", ([e]) => e == null || typeof e == "string" && e.trim() === "" || I(e) && e.length === 0);
p("coalesce", "Logic", "coalesce(a, b, ...)", "First non-blank value", (e) => e.find((t) => !(t == null || t === "")) ?? "");
p("choose", "Logic", 'choose(value, "a", "A", "b", "B", default)', "Map a value to a result", ([e, ...t]) => {
  for (let n = 0; n + 1 < t.length; n += 2) if (ne(e, t[n])) return t[n + 1];
  return t.length % 2 ? t[t.length - 1] : "";
});
p("matches", "Logic", "matches(text, pattern)", "True if text matches a regular expression", ([e, t]) => {
  const n = m(t);
  if (n.length > 300) throw new R("matches: pattern too long");
  try {
    return new RegExp(n, "i").test(m(e));
  } catch {
    throw new R("matches: invalid pattern");
  }
});
p("isemail", "Logic", "isemail(text)", "True if text looks like an e-mail address", ([e]) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m(e).trim()));
p("isnumber", "Logic", "isnumber(value)", "True if value is numeric", ([e]) => ke(e));
p("round", "Math", "round(n, decimals)", "Round to decimals (default 0)", ([e, t]) => {
  const n = Math.pow(10, t === void 0 ? 0 : M(t));
  return Math.round(M(e) * n + Number.EPSILON) / n;
});
p("floor", "Math", "floor(n)", "Round down", ([e]) => Math.floor(M(e)));
p("ceil", "Math", "ceil(n)", "Round up", ([e]) => Math.ceil(M(e)));
p("abs", "Math", "abs(n)", "Absolute value", ([e]) => Math.abs(M(e)));
p("sqrt", "Math", "sqrt(n)", "Square root", ([e]) => Math.sqrt(M(e)));
p("min", "Math", "min(a, b, ...)", "Smallest number (lists allowed)", (e) => Math.min(...Re(e)));
p("max", "Math", "max(a, b, ...)", "Largest number (lists allowed)", (e) => Math.max(...Re(e)));
p("sum", "Math", "sum(list or numbers)", "Total", (e) => Re(e).reduce((t, n) => t + n, 0));
p("avg", "Math", "avg(list or numbers)", "Average", (e) => {
  const t = Re(e);
  return t.length ? t.reduce((n, a) => n + a, 0) / t.length : 0;
});
p("count", "Math", "count(list)", "Number of items", (e) => Ce(e).filter((t) => t !== null && t !== "").length);
p("number", "Math", "number(value)", "Convert to number", ([e]) => M(e));
p("percent", "Math", "percent(part, whole)", "part as a percentage of whole (0-100)", ([e, t]) => {
  const n = M(t);
  if (n === 0) throw new R("percent: whole is zero");
  return M(e) / n * 100;
});
p("percentof", "Math", "percentof(pct, amount)", "pct % of amount", ([e, t]) => M(e) / 100 * M(t));
p("addpercent", "Math", "addpercent(amount, pct)", "amount increased by pct % (e.g. tax)", ([e, t]) => M(e) * (1 + M(t) / 100));
p("discount", "Math", "discount(amount, pct)", "amount reduced by pct %", ([e, t]) => M(e) * (1 - M(t) / 100));
p("currency", "Math", 'currency(amount, "USD")', "Format as currency", ([e, t], n) => K(e, "currency" + (t ? ":" + m(t) : ""), n.fo));
p("random", "Math", "random(min, max)", "Random whole number between min and max", ([e, t]) => {
  const n = M(e ?? 0), a = M(t ?? 100);
  return Math.floor(n + Math.random() * (a - n + 1));
});
p("today", "Date", "today()", "Today (midnight)", (e, t) => new Date(t.now.getFullYear(), t.now.getMonth(), t.now.getDate()));
p("now", "Date", "now()", "Current date and time", (e, t) => {
  const n = new Date(t.now.getTime());
  return n.__time = !0, n;
});
p("date", "Date", 'date("2025-01-31" | "+3d")', "Make a date from text or a shift", ([e], t) => F(e ?? "today", t.now, "date"));
p("adddays", "Date", "adddays(date, n)", "Add (or subtract) days", ([e, t], n) => {
  const a = new Date(F(e, n.now, "adddays"));
  return a.setDate(a.getDate() + M(t)), a;
});
p("addhours", "Date", "addhours(date, n)", "Add hours", ([e, t], n) => {
  const a = new Date(F(e, n.now, "addhours").getTime() + M(t) * 36e5);
  return a.__time = !0, a;
});
p("addminutes", "Date", "addminutes(date, n)", "Add minutes", ([e, t], n) => {
  const a = new Date(F(e, n.now, "addminutes").getTime() + M(t) * 6e4);
  return a.__time = !0, a;
});
p("addweeks", "Date", "addweeks(date, n)", "Add weeks", ([e, t], n) => {
  const a = new Date(F(e, n.now, "addweeks"));
  return a.setDate(a.getDate() + 7 * M(t)), a;
});
p("addmonths", "Date", "addmonths(date, n)", "Add months (clamps to month end)", ([e, t], n) => Je(new Date(F(e, n.now, "addmonths")), M(t)));
p("addyears", "Date", "addyears(date, n)", "Add years", ([e, t], n) => Je(new Date(F(e, n.now, "addyears")), 12 * M(t)));
p("addbusinessdays", "Date", "addbusinessdays(date, n)", "Add working days (skips weekends)", ([e, t], n) => vt(new Date(F(e, n.now, "addbusinessdays")), M(t)));
p("shift", "Date", 'shift(date, "+1M +2d")', "Shift a date using shift syntax", ([e, t], n) => me(F(e, n.now, "shift"), m(t)));
p("datediff", "Date", 'datediff(start, end, "days")', "Difference in days|weeks|months|years|hours|minutes", ([e, t, n], a) => Dt(F(e, a.now, "datediff"), F(t, a.now, "datediff"), n ? m(n) : "days"));
p("formatdate", "Date", 'formatdate(date, "DD/MM/YYYY")', "Format a date", ([e, t], n) => G(F(e, n.now, "formatdate"), t === void 0 ? n.fo.dateFormat : m(t)));
p("weekday", "Date", "weekday(date)", "Day name, e.g. Monday", ([e], t) => G(F(e ?? "today", t.now, "weekday"), "dddd"));
p("year", "Date", "year(date)", "Year number", ([e], t) => F(e ?? "today", t.now, "year").getFullYear());
p("month", "Date", "month(date)", "Month number 1-12", ([e], t) => F(e ?? "today", t.now, "month").getMonth() + 1);
p("day", "Date", "day(date)", "Day of month", ([e], t) => F(e ?? "today", t.now, "day").getDate());
p("endofmonth", "Date", "endofmonth(date)", "Last day of the month", ([e], t) => {
  const n = F(e ?? "today", t.now, "endofmonth");
  return new Date(n.getFullYear(), n.getMonth() + 1, 0);
});
p("greeting", "Date", "greeting()", "Good morning / afternoon / evening", (e, t) => {
  const n = t.now.getHours();
  return n < 12 ? "Good morning" : n < 17 ? "Good afternoon" : "Good evening";
});
p("list", "Lists", "list(a, b, ...)", "Make a list", (e) => e);
p("first", "Lists", "first(list)", "First item", ([e]) => I(e) ? e[0] ?? null : e);
p("last", "Lists", "last(list)", "Last item", ([e]) => I(e) ? e[e.length - 1] ?? null : e);
p("item", "Lists", "item(list, n)", "Item number n (1-based)", ([e, t]) => I(e) ? e[M(t) - 1] ?? null : null);
p("unique", "Lists", "unique(list)", "Remove duplicates", ([e]) => I(e) ? e.filter((t, n) => e.findIndex((a) => ne(t, a)) === n) : e);
p("sort", "Lists", "sort(list)", "Sort ascending", ([e]) => I(e) ? [...e].sort(te) : e);
p("filter", "Lists", 'filter(table, "column", value)', "Rows whose column equals value", ([e, t, n]) => et(e, "filter").filter((a) => ne(ie(a, m(t)), n)));
p("lookup", "Lists", 'lookup(table, "matchColumn", value, "resultColumn")', "Find a row and return one column", ([e, t, n, a]) => {
  const r = et(e, "lookup").find((o) => ne(ie(o, m(t)), n));
  return r ? a === void 0 ? r : ie(r, m(a)) : "";
});
function Pt(e, t, n) {
  switch (t) {
    case ">":
      return te(e, n) > 0;
    case ">=":
      return te(e, n) >= 0;
    case "<":
      return te(e, n) < 0;
    case "<=":
      return te(e, n) <= 0;
    case "!=":
    case "<>":
      return !ne(e, n);
    default:
      return ne(e, n);
  }
}
p("countif", "Lists", 'countif(list, ">", 0)', "Count items matching a comparison (= != > >= < <=)", ([e, t, n]) => (I(e) ? e : [e]).filter((a) => Pt(a, m(t), n)).length);
p("sumif", "Lists", 'sumif(list, ">", 0)', "Sum items matching a comparison", ([e, t, n]) => (I(e) ? e : [e]).filter((a) => Pt(a, m(t), n)).reduce((a, r) => a + M(r), 0));
p("pluck", "Lists", 'pluck(table, "column")', "One column of a table as a list", ([e, t]) => et(e, "pluck").map((n) => ie(n, m(t))));
function U(e, t) {
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
      return e.items.map((n) => U(n, t));
    case "name": {
      const n = t.lookup(e.name);
      if (!n.found) throw new R(`Unknown name "${e.name}"`);
      return n.value;
    }
    case "member":
      return ie(U(e.obj, t), e.prop);
    case "index": {
      const n = U(e.obj, t), a = U(e.index, t);
      return I(n) ? n[M(a) - 1] ?? null : ie(n, m(a));
    }
    case "unary": {
      const n = U(e.arg, t);
      return e.op === "not" ? !Y(n) : e.op === "-" ? I(n) ? n.map((a) => -M(a)) : -M(n) : M(n);
    }
    case "call": {
      const n = Lt[e.fn];
      if (!n) throw new R(`Unknown function "${e.fn}()"`);
      return e.fn === "if" ? Y(U(e.args[0], t)) ? e.args[1] ? U(e.args[1], t) : "" : e.args[2] ? U(e.args[2], t) : "" : n.fn(e.args.map((a) => U(a, t)), t);
    }
    case "bin": {
      if (e.op === "and" || e.op === "&&") return Y(U(e.left, t)) && Y(U(e.right, t));
      if (e.op === "or" || e.op === "||") return Y(U(e.left, t)) || Y(U(e.right, t));
      const n = U(e.left, t), a = U(e.right, t);
      switch (e.op) {
        case "&":
          return m(n, t.fo) + m(a, t.fo);
        case "=":
        case "==":
          return ne(n, a);
        case "!=":
        case "<>":
          return !ne(n, a);
        case "<":
          return te(n, a) < 0;
        case "<=":
          return te(n, a) <= 0;
        case ">":
          return te(n, a) > 0;
        case ">=":
          return te(n, a) >= 0;
        default:
          return qt(e.op, n, a);
      }
    }
  }
}
const De = /* @__PURE__ */ new Map();
function ue(e, t) {
  let n = De.get(e);
  return n || (n = At(e), De.size > 500 && De.clear(), De.set(e, n)), U(n, t);
}
function Se(e) {
  if (!e) return [];
  try {
    return [...Z(At(e.startsWith("=") ? e.slice(1) : e))];
  } catch {
    return [];
  }
}
const Ae = "⁣⁣QTHCURSOR⁣⁣", It = {
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
}, rn = /* @__PURE__ */ new Set(["me", "data", "page", "index", "rownumber"]), qe = /^[\p{L}_][\p{L}\p{N}_]*$/u;
function We(e) {
  const t = e.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function je(e) {
  const t = e.includes("|") ? "|" : ",";
  return xe(e, t).map((n) => n.trim().replace(/^["']|["']$/g, "")).filter((n) => n !== "");
}
function Xe(e, t, n, a, r, o) {
  const s = () => a ? n.repeats.get(a) : n, l = (u) => {
    for (const c of u)
      if (c.k === "cmd") {
        const D = It[c.name];
        if (D && c.args.main) s().fields.has(c.args.main) || s().fields.set(c.args.main, { type: D, args: c.args, start: c.start, end: c.end });
        else if (c.name === "set") {
          const S = c.args.main.split("=")[0].trim();
          S && s().sets.add(S);
        } else c.name === "ref" && n.pendingRefs.push({ name: c.args.main.split(".")[0], repeat: a });
        (c.name === "=" || c.name === "validate" || ["upper", "lower", "title", "capitalize", "trim", "replace"].includes(c.name)) && Se(c.args.main).forEach((S) => n.pendingRefs.push({ name: S, repeat: a })), c.name === "set" && Se(c.args.main.split("=").slice(1).join("=")).forEach((S) => n.pendingRefs.push({ name: S, repeat: a }));
        for (const S of [c.args.main, ...Object.values(c.args.opts)]) if (c.name !== "=" && S.startsWith("=")) Se(S).forEach((b) => n.pendingRefs.push({ name: b, repeat: a }));
        else if ((c.name === "snippet" || c.name === "include") && t.resolveSnippet && r < 5 && !o.has(c.args.main)) {
          const b = t.resolveSnippet(c.args.main);
          if (b) {
            o.add(c.args.main);
            try {
              Xe(ze(b.content, b.contentType === "html"), t, n, a, r + 1, o);
            } catch {
            }
            o.delete(c.args.main);
          }
        }
      } else c.k === "if" ? (c.branches.forEach((D) => {
        Se(D.cond).forEach((S) => n.pendingRefs.push({ name: S, repeat: a })), l(D.body);
      }), c.elseBody && l(c.elseBody)) : c.k === "section" ? (n.fields.has(c.args.main) || s().fields.set(c.args.main, { type: "section", args: c.args, start: c.start, end: c.end }), l(c.body)) : c.k === "repeat" && (/^\d+$/.test(c.args.main) || c.args.opts.count ? l(c.body) : (n.repeats.has(c.args.main) || n.repeats.set(c.args.main, { fields: /* @__PURE__ */ new Map(), sets: /* @__PURE__ */ new Set() }), Xe(c.body, t, n, c.args.main, r, o)));
  };
  l(e);
}
function on(e) {
  for (const { name: t, repeat: n } of e.pendingRefs)
    if (!(e.fields.has(t) || e.sets.has(t) || e.repeats.has(t) || e.implicit.has(t) || rn.has(t)))
      if (n) {
        const a = e.repeats.get(n);
        !a.fields.has(t) && !a.sets.has(t) && a.fields.set(t, { type: "text", args: { main: t, opts: {}, flags: /* @__PURE__ */ new Set() }, start: -1, end: -1 });
      } else e.implicit.add(t);
}
function _t(e, t, n = {}) {
  const a = t === "html";
  let r = a;
  const o = { locale: "en-US", currency: "USD", dateFormat: "DD MMM YYYY", timeFormat: "h:mm A", ...n.fo || {} }, s = n.now || /* @__PURE__ */ new Date(), l = n.values || {}, u = { forms: !0, formulas: !0, conditionals: !0, ...n.features || {} }, c = [], D = [], S = [], b = /* @__PURE__ */ new Set();
  let A;
  try {
    A = ze(e, a);
  } catch (i) {
    return { text: "", html: "", cursor: null, form: [], errors: [i.message], validation: [], needsForm: !1, isRich: !1 };
  }
  const q = { fields: /* @__PURE__ */ new Map(), sets: /* @__PURE__ */ new Set(), repeats: /* @__PURE__ */ new Map(), implicit: /* @__PURE__ */ new Set(), pendingRefs: [] };
  Xe(A, n, q, null, 0, /* @__PURE__ */ new Set()), on(q);
  const W = {}, se = {};
  for (const [i, d] of Object.entries(n.data || {})) se[i] = d.rows.map((g) => ({ ...g }));
  const Fe = n.profile || {}, $e = n.page || { url: "", title: "", host: "" }, C = [], Ue = () => {
    for (let i = C.length - 1; i >= 0; i--) if (!C[i].repeat.startsWith("__")) return C[i];
  };
  function tt(i, d) {
    const g = d.opts.default ?? d.opts.value_default;
    switch (i) {
      case "checkbox":
      case "toggle":
      case "section":
        return g !== void 0 ? Y(g) : d.flags.has("checked") || d.flags.has("on");
      case "date": {
        const h = O(g ?? "", s);
        return h ? Ie(h) : "";
      }
      case "time": {
        if (g === void 0) return "";
        const h = O(g === "now" ? "now" : g, s);
        return h ? mt(h) : "";
      }
      case "datetime": {
        const h = g ? O(g, s) : null;
        return h ? `${Ie(h)}T${mt(h)}` : "";
      }
      case "select":
        return d.flags.has("multiple") ? g ? je(g) : [] : g ?? (d.flags.has("required") || d.opts.required ? "" : je(d.opts.options || "")[0] ?? "");
      default:
        return g ?? "";
    }
  }
  function Me(i, d, g) {
    switch (i) {
      case "checkbox":
      case "toggle":
      case "section":
        return !!d && d !== "false";
      case "number":
      case "currency": {
        if (d === "" || d === null || d === void 0) return null;
        const h = E(d);
        return isNaN(h) ? String(d) : h;
      }
      case "date":
      case "datetime": {
        const h = d ? O(d, s) : null;
        return h && i === "datetime" && (h.__time = !0), h;
      }
      case "time": {
        const h = d ? O(d, s) : null;
        return h && (h.__time = !0), h;
      }
      case "pick": {
        const h = n.data?.[g.opts.table || ""], x = h?.rows.find(($) => $.__id === d || $.id === d);
        if (!x) return null;
        const y = g.opts.display || h?.columns?.[0] || Object.keys(x)[0];
        return { ...x, __label: x[y] ?? "" };
      }
      case "select":
        return Array.isArray(d) ? d : d ?? "";
      default:
        return d ?? "";
    }
  }
  function Te(i, d, g, h) {
    const x = h ? h.row : l;
    return x[i] !== void 0 ? x[i] : tt(d, g);
  }
  function Ee(i) {
    for (let h = C.length - 1; h >= 0; h--) {
      const x = C[h];
      if (i in x.rowVars) return { found: !0, value: x.rowVars[i] };
      if (i === "index" || i === "rownumber") return { found: !0, value: x.index + 1 };
      const y = q.repeats.get(x.repeat)?.fields.get(i);
      if (y && y.start >= 0 && x === Ue())
        try {
          ce(i, y.type, y.args, C.length, y.start, y.end);
        } catch {
        }
      if (y) return { found: !0, value: Me(y.type, Te(i, y.type, y.args, x), y.args) };
    }
    if (i in W) return { found: !0, value: W[i] };
    if (q.sets.has(i)) return { found: !0, value: "" };
    const d = q.fields.get(i);
    if (d)
      try {
        ce(i, d.type, d.args, 0, d.start, d.end, !1, !0);
      } catch {
      }
    if (d) return { found: !0, value: Me(d.type, Te(i, d.type, d.args), d.args) };
    if (q.implicit.has(i)) {
      try {
        ce(i, "text", { main: i, opts: {}, flags: /* @__PURE__ */ new Set() }, 0, void 0, void 0, !0, !0);
      } catch {
      }
      return { found: !0, value: l[i] ?? "" };
    }
    const g = q.repeats.get(i);
    return g ? {
      found: !0,
      value: nt(i, { opts: {} }).map((x, y) => {
        const $ = { index: y + 1 };
        for (const [f, w] of g.fields) $[f] = Me(w.type, x[f] !== void 0 ? x[f] : tt(w.type, w.args), w.args);
        return $;
      })
    } : i === "me" ? { found: !0, value: Fe } : i === "data" ? { found: !0, value: se } : i === "page" ? { found: !0, value: $e } : { found: !1, value: null };
  }
  const le = { lookup: Ee, fo: o, now: s }, ae = (i) => {
    if (!u.formulas) throw new Error("Formulas require the Pro plan");
    return ue(i, le);
  }, he = (i) => i === void 0 ? "" : i.startsWith("=") ? m(ae(i.slice(1)), o) : i;
  function nt(i, d) {
    const g = Math.max(0, parseInt(d.opts.min ?? "1", 10) || 0), h = l[i];
    return Array.isArray(h) ? h : Array.from({ length: Math.max(g, 1) }, () => ({}));
  }
  function ce(i, d, g, h, x, y, $ = !1, f = !1) {
    if (!u.forms) throw new Error("Dynamic form fields require an upgraded plan");
    const w = f ? void 0 : Ue(), P = w ? `${w.repeat}#${w.index}.${i}` : i;
    if (b.has(P)) return;
    b.add(P);
    const N = Te(i, d, g, w), v = g.opts, L = {
      name: i,
      type: d,
      depth: h,
      value: N,
      implicit: $,
      start: x,
      end: y,
      label: v.label || We(i),
      required: g.flags.has("required") || Y(v.required ?? ""),
      defaultRaw: v.default,
      options: d === "select" ? je(he(v.options) || "") : void 0,
      multiple: g.flags.has("multiple"),
      placeholder: v.placeholder,
      min: v.min !== void 0 ? E(v.min) : void 0,
      max: v.max !== void 0 ? E(v.max) : void 0,
      step: v.step !== void 0 ? E(v.step) : void 0,
      minLength: v.minlength !== void 0 ? parseInt(v.minlength, 10) : void 0,
      maxLength: v.maxlength !== void 0 ? parseInt(v.maxlength, 10) : void 0,
      pattern: v.pattern,
      message: v.message,
      rows: v.rows ? parseInt(v.rows, 10) : void 0,
      currency: v.currency,
      table: v.table,
      display: v.display,
      hint: v.hint || v.help
    };
    if (d === "pick") {
      const z = n.data?.[v.table || ""];
      if (!z) throw new Error(`Data Hub table "${v.table}" was not found`);
      const Ne = v.display || z.columns?.[0] || "name";
      L.options = z.rows.map((T) => `${T.__id}\0${m(T[Ne] ?? "")}`);
    }
    const B = Et(L);
    B && (L.error = B, D.push(`${L.label}: ${B}`)), w ? w.formRow.push(L) : S.push(L);
  }
  function Et(i) {
    const d = i.value, g = d === "" || d === null || d === void 0 || Array.isArray(d) && d.length === 0 || (i.type === "checkbox" || i.type === "toggle") && i.required && !d;
    if (i.required && g) return i.message || "This field is required";
    if (!g) {
      if (i.type === "number" || i.type === "currency") {
        const h = E(d);
        if (isNaN(h)) return "Enter a valid number";
        if (i.min !== void 0 && h < i.min) return i.message || `Must be at least ${i.min}`;
        if (i.max !== void 0 && h > i.max) return i.message || `Must be at most ${i.max}`;
      }
      if (typeof d == "string") {
        if (i.minLength !== void 0 && d.length < i.minLength) return i.message || `Use at least ${i.minLength} characters`;
        if (i.maxLength !== void 0 && d.length > i.maxLength) return i.message || `Use at most ${i.maxLength} characters`;
        if (i.pattern) {
          const h = { email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, phone: /^\+?[\d\s().-]{6,20}$/, url: /^https?:\/\/\S+$/i, digits: /^\d+$/ };
          let x = h[i.pattern.toLowerCase()];
          if (!x)
            try {
              x = new RegExp(`^(?:${i.pattern})$`);
            } catch {
              return "Invalid validation pattern";
            }
          if (!x.test(d.trim())) return i.message || `Invalid format${h[i.pattern.toLowerCase()] ? ` (${i.pattern})` : ""}`;
        }
      }
    }
  }
  let H = "";
  const V = (i) => {
    H += r ? He(i) : i;
  }, at = (i, d) => {
    r ? H += i : H += d;
  };
  function rt(i, d, g) {
    const h = g.opts.format;
    switch (i) {
      case "checkbox":
      case "toggle":
        return Y(d) ? he(g.opts.value ?? g.opts.on ?? "") : he(g.opts.off ?? "");
      case "currency":
        return d === null || d === "" ? "" : typeof d == "number" ? K(d, h || `currency:${g.opts.currency || o.currency}`, o) : m(d, o);
      case "number":
        return d === null ? "" : K(d, h, o);
      case "date":
        return d ? G(d, h || o.dateFormat) : "";
      case "time":
        return d ? G(d, h || o.timeFormat) : "";
      case "datetime":
        return d ? G(d, h || `${o.dateFormat} ${o.timeFormat}`) : "";
      case "select":
        return Array.isArray(d) ? d.join(g.opts.separator ?? ", ") : K(d, h, o);
      default:
        return K(d, h, o);
    }
  }
  function Nt(i) {
    const d = ae(i.main);
    if (!I(d)) throw new Error("{{table}} source must be a list (a repeat section or data.<table>)");
    let g = d.filter((T) => Ye(T));
    const x = (i.opts.columns ? xe(i.opts.columns, "|").map((T) => T.trim()).filter(Boolean) : Object.keys(g[0] || {}).filter((T) => !T.startsWith("__") && T !== "index")).map((T) => {
      const _ = T.indexOf(":");
      return _ > 0 ? { header: T.slice(0, _).trim(), expr: T.slice(_ + 1).trim() } : { header: We(T), expr: T };
    }), y = (T, _, X) => {
      C.push({ repeat: "__table", row: {}, rowVars: { ...T, index: _ + 1 }, index: _, formRow: [] });
      try {
        return X();
      } finally {
        C.pop();
      }
    };
    i.opts.where && (g = g.filter((T, _) => y(T, _, () => Y(ae(i.opts.where))))), i.opts.limit && (g = g.slice(0, parseInt(i.opts.limit, 10) || g.length));
    const $ = (i.opts.formats || "").split("|").map((T) => T.trim()), f = g.map((T, _) => x.map((X, Be) => y(T, _, () => K(ae(X.expr), $[Be] || void 0, o)))), w = i.opts.total ? x.map((T, _) => {
      const X = xe(i.opts.total, "|").map((Oe) => Oe.trim().toLowerCase());
      if (_ === 0 && !X.includes(T.header.toLowerCase())) return i.opts.totallabel || "Total";
      if (!X.includes(T.header.toLowerCase())) return "";
      const Be = g.reduce((Oe, Ht, Wt) => Oe + (E(y(Ht, Wt, () => ae(T.expr))) || 0), 0);
      return K(Be, $[_] || void 0, o);
    }) : null, P = x.map((T) => T.header), N = [P, ...f, ...w ? [w] : []], v = P.map((T, _) => Math.max(...N.map((X) => (X[_] || "").length))), L = (T) => "| " + T.map((_, X) => (_ || "").padEnd(v[X])).join(" | ") + " |", B = [L(P), "|" + v.map((T) => "-".repeat(T + 2)).join("|") + "|", ...f.map(L), ...w ? [L(w)] : []].join(`
`), z = 'style="border:1px solid #bbb;padding:4px 8px"', Ne = `<table style="border-collapse:collapse"><thead><tr>${P.map((T) => `<th ${z}>${pe(T)}</th>`).join("")}</tr></thead><tbody>${f.map((T) => `<tr>${T.map((_) => `<td ${z}>${pe(_)}</td>`).join("")}</tr>`).join("")}${w ? `<tr>${w.map((T) => `<td ${z}><b>${pe(T)}</b></td>`).join("")}</tr>` : ""}</tbody></table>`;
    at(Ne, B);
  }
  function re(i, d, g) {
    for (const h of i)
      try {
        Bt(h, d, g);
      } catch (x) {
        const y = x instanceof ee || x instanceof Error ? x.message : String(x), $ = h.k === "cmd" ? `{{${h.raw}}}` : h.k === "if" ? "{{if}}" : `{{${h.k}}}`;
        c.push(`${$}: ${y}`);
      }
  }
  function Bt(i, d, g) {
    const h = Ue();
    switch (i.k) {
      case "text":
        H += i.text;
        return;
      case "if": {
        if (!u.conditionals) throw new Error("Conditional rules require the Pro plan");
        for (const f of i.branches)
          if (Y(ue(f.cond, le))) {
            re(f.body, d, g);
            return;
          }
        i.elseBody && re(i.elseBody, d, g);
        return;
      }
      case "section": {
        const f = i.args.main;
        if (!qe.test(f)) throw new Error("Section needs a name, e.g. {{section: extras; label=Add extras?}}");
        ce(f, "section", i.args, d, i.start, i.end), Y(Me("section", Te(f, "section", i.args, h), i.args)) && re(i.body, d + 1, g);
        return;
      }
      case "repeat": {
        const f = i.args.main, w = i.args.opts.separator ?? "", P = /^\d+$/.test(f) ? parseInt(f, 10) : i.args.opts.count ? Math.round(E(ae(i.args.opts.count))) : null;
        if (P !== null) {
          const L = Math.max(0, Math.min(500, isNaN(P) ? 0 : P));
          for (let B = 0; B < L; B++) {
            B && w && V(w), C.push({ repeat: "__static", row: {}, rowVars: { index: B + 1 }, index: B, formRow: [] });
            try {
              re(i.body, d, g);
            } finally {
              C.pop();
            }
          }
          return;
        }
        if (!qe.test(f)) throw new Error("Repeat needs a name, e.g. {{repeat: items; label=Item}}");
        if (!u.forms) throw new Error("Repeating sections require an upgraded plan");
        const N = nt(f, i.args), v = {
          type: "repeat",
          name: f,
          label: i.args.opts.label || We(f),
          min: parseInt(i.args.opts.min ?? "1", 10) || 0,
          max: parseInt(i.args.opts.max ?? "50", 10) || 50,
          depth: d,
          rows: []
        };
        S.push(v), N.forEach((L, B) => {
          B && w && V(w);
          const z = { repeat: f, row: L || {}, rowVars: {}, index: B, formRow: [] };
          C.push(z);
          try {
            re(i.body, d + 1, g);
          } finally {
            C.pop(), v.rows.push(z.formRow);
          }
        });
        return;
      }
    }
    const { name: x, args: y } = i, $ = It[x];
    if ($ && (y.main || !["date", "time"].includes(x))) {
      const f = y.main;
      if (!f || !qe.test(f)) throw new Error(`Field name "${f}" may only contain letters, numbers and _ (use label=… for display text)`);
      if (ce(f, $, y, d, i.start, i.end), y.flags.has("hidden") || y.opts.show === "no" || y.opts.show === "false") return;
      const w = Ee(f).value;
      V(rt($, w, y));
      return;
    }
    switch (x) {
      case "#":
        return;
      case "ref": {
        const f = y.main, w = f.split(".")[0];
        (q.implicit.has(w) || h && q.repeats.get(h.repeat)?.fields.get(w)?.start === -1) && !f.includes(".") && ce(w, "text", y, d, i.start, i.end, !0);
        let N;
        if (f.includes(".")) N = ue(f, le);
        else {
          const v = Ee(w);
          if (!v.found) throw new Error(`Unknown name "${w}"`);
          N = v.value;
          const L = q.fields.get(w) || (h ? q.repeats.get(h.repeat)?.fields.get(w) : void 0);
          if (L && !y.opts.format) {
            V(rt(L.type, N, { ...L.args, opts: { ...L.args.opts } }));
            return;
          }
        }
        V(K(N, y.opts.format, o));
        return;
      }
      case "=": {
        const f = ae(y.main);
        V(K(f, y.opts.format, o));
        return;
      }
      case "set": {
        const f = y.main.indexOf("=");
        if (f < 1) throw new Error("Use {{set: name = formula}}");
        const w = y.main.slice(0, f).trim();
        if (!qe.test(w)) throw new Error(`Invalid variable name "${w}"`);
        const P = ae(y.main.slice(f + 1));
        h ? h.rowVars[w] = P : W[w] = P;
        return;
      }
      case "upper":
      case "lower":
      case "title":
      case "capitalize":
      case "trim": {
        const f = m(ue(y.main, le), o);
        V(x === "upper" ? f.toUpperCase() : x === "lower" ? f.toLowerCase() : x === "title" ? Ze(f) : x === "trim" ? f.trim() : f.charAt(0).toUpperCase() + f.slice(1));
        return;
      }
      case "replace": {
        const f = m(ue(y.main, le), o);
        V(f.split(y.opts.find ?? "").join(y.opts.with ?? y.opts.by ?? ""));
        return;
      }
      case "today":
      case "date":
      case "now":
      case "time": {
        let f = new Date(s.getTime());
        (x === "today" || x === "date") && (f = new Date(s.getFullYear(), s.getMonth(), s.getDate())), y.opts.shift && (f = me(f, y.opts.shift)), y.main && x !== "date" && (f = me(f, y.main));
        const w = y.opts.format || (x === "time" ? o.timeFormat : x === "now" ? `${o.dateFormat} ${o.timeFormat}` : o.dateFormat);
        V(G(f, w));
        return;
      }
      case "cursor":
        H += Ae;
        return;
      case "link": {
        const f = he(y.opts.url ?? (y.main.startsWith("="), y.main)), w = he(y.opts.text ?? "") || f;
        if (!/^(https?:|mailto:|tel:)/i.test(f)) throw new Error(`Links must start with https://, http://, mailto: or tel: (got "${f}")`);
        const P = y.opts.plain || "both", N = w === f || P === "url" ? f : P === "text" ? w : `${w} (${f})`;
        at(`<a href="${pe(f)}">${pe(w)}</a>`, N);
        return;
      }
      case "table":
        Nt(y);
        return;
      case "snippet":
      case "include": {
        if (g >= 5) throw new Error("Snippets are nested too deeply (max 5)");
        const f = n.resolveSnippet?.(y.main);
        if (!f) throw new Error(`No snippet with shortcut "${y.main}"`);
        const w = f.contentType === "html", P = ze(f.content, w);
        if (w === r) {
          re(P, d, g + 1);
          return;
        }
        const N = H, v = r;
        H = "", r = w;
        try {
          re(P, d, g + 1);
        } finally {
          r = v;
        }
        const L = H;
        H = N + (w ? ct(L) : He(L));
        return;
      }
      case "validate": {
        Y(ue(y.main, le)) || D.push(y.opts.message || `Check failed: ${y.main}`);
        return;
      }
      case "index": {
        if (!C.length) throw new Error("{{index}} can only be used inside {{repeat}}");
        V(String(C[C.length - 1].index + 1));
        return;
      }
      case "else":
      case "endif":
      case "elseif":
      case "endrepeat":
      case "endsection":
        throw new Error("Misplaced block command");
      default:
        throw new Error(`Unknown command "${x}". See the syntax guide for available commands.`);
    }
  }
  re(A, 0, 0);
  let de, ye;
  a ? (ye = H, de = ct(H)) : (de = H, ye = He(H));
  let ot = null;
  const it = de.indexOf(Ae);
  it >= 0 && (ot = it), de = de.split(Ae).join(""), ye = ye.split(Ae).join("");
  const Ot = S.length > 0;
  return { text: de, html: ye, cursor: ot, form: S, errors: c, validation: D, needsForm: Ot, isRich: a };
}
const Ge = ["dynamicForms", "formulas", "conditionals", "richText", "dataHub", "autopilot", "analytics", "sharing", "marketplaceSubmit", "cloudSync"], ht = {
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
    features: Ge
  },
  business: {
    id: "business",
    name: "Business",
    tagline: "Teams, shared folders, roles and team analytics",
    limits: { snippets: 2e4, folders: 2e3, tables: 200, workflows: 500, libraryTemplates: 1 / 0, teamMembers: 250 },
    features: [...Ge, "teams", "teamAnalytics", "roles"]
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Custom limits, access management and audit logs",
    limits: { snippets: 1 / 0, folders: 1 / 0, tables: 1 / 0, workflows: 1 / 0, libraryTemplates: 1 / 0, teamMembers: 1 / 0 },
    features: [...Ge, "teams", "teamAnalytics", "roles", "auditLogs"]
  }
};
function sn(e) {
  return ht[e || "pro"] || ht.pro;
}
function Le(e, t, n = !0) {
  return !n || sn(e).features.includes(t);
}
function Yt(e) {
  const { settings: t } = e, n = new Map(e.snippets.filter((o) => !o.deleted).map((o) => [o.shortcut, o])), a = {};
  for (const o of e.tables)
    o.deleted || (a[o.key] = { label: o.name, columns: o.columns.map((s) => s.key), rows: o.rows.map((s) => ({ __id: s.id, ...s.values })) });
  const r = t.enforcePlanLimits;
  return {
    values: e.values || {},
    profile: { ...t.profile },
    data: Le(t.plan, "dataHub", r) ? a : {},
    page: e.page,
    resolveSnippet: (o) => {
      const s = n.get(o);
      return s ? { content: s.content, contentType: s.contentType } : null;
    },
    fo: { locale: t.locale, currency: t.currency, dateFormat: t.dateFormat, timeFormat: t.timeFormat },
    features: {
      forms: Le(t.plan, "dynamicForms", r),
      formulas: Le(t.plan, "formulas", r),
      conditionals: Le(t.plan, "conditionals", r)
    }
  };
}
const be = "⚠️ _Not financial advice. Trade at your own risk and always use a stop loss._", J = "{{number: pip_factor; label=Pips per 1.00 move (Gold 10 · EURUSD 10000 · JPY pairs 100); default=10; hidden}}", ln = [
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

${be}`
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
${J}${be}`
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
${J}`
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
{{validate: if(side = "BUY", sl < entry, sl > entry); message=Stop loss must be below entry for BUY and above entry for SELL}}${J}
${be}`
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
${J}`
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
${J}`
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
${J}`
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
${J}`
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
${J}`
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
${J}`
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
${be}`
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
{{endif}}${be}`
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
], cn = [
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
], dn = [...cn, ...ln], un = () => Date.now();
function pn() {
  const e = un(), t = [
    { id: "fld_personal", name: "Personal", parentId: null, order: 0, createdAt: e, updatedAt: e, color: "#6366f1" },
    { id: "fld_work", name: "Work", parentId: null, order: 1, createdAt: e, updatedAt: e, color: "#0ea5e9" },
    { id: "fld_billing", name: "Billing", parentId: "fld_work", order: 0, createdAt: e, updatedAt: e, color: "#f59e0b" },
    { id: "fld_trading", name: "Trading", parentId: null, order: 2, createdAt: e, updatedAt: e, color: "#10b981" }
  ], n = (s, l, u = {}) => {
    const c = dn.find((D) => D.id === s);
    return {
      id: "snp_" + s.replace(/^lib-/, "").replace(/-/g, "_"),
      name: c.name,
      shortcut: c.shortcut,
      content: c.content,
      contentType: c.contentType,
      folderId: l,
      enabled: !0,
      favorite: !1,
      pinned: !1,
      description: c.description,
      tags: [],
      trigger: "default",
      source: { kind: "template", ref: s },
      createdAt: e,
      updatedAt: e,
      ...u
    };
  }, a = [
    n("lib-email-signature", "fld_personal", { pinned: !0, favorite: !0 }),
    n("lib-pay-reminder", "fld_billing", { favorite: !0 }),
    n("lib-trade-update", "fld_trading", { pinned: !0 }),
    n("lib-trade-recap", "fld_trading"),
    n("lib-meeting-notes", "fld_work"),
    n("lib-wa-greeting", "fld_personal"),
    n("lib-datahub-customer", "fld_work"),
    {
      id: "snp_quick_thanks",
      name: "Quick thanks",
      shortcut: "/ty",
      content: "Thank you so much! 🙏",
      contentType: "text",
      folderId: "fld_personal",
      enabled: !0,
      favorite: !1,
      pinned: !1,
      tags: ["quick"],
      trigger: "default",
      createdAt: e,
      updatedAt: e
    },
    {
      id: "snp_today",
      name: "Today's date",
      shortcut: "/date",
      content: "{{today; format=dddd, D MMMM YYYY}}",
      contentType: "text",
      folderId: null,
      enabled: !0,
      favorite: !1,
      pinned: !1,
      tags: ["date"],
      trigger: "default",
      createdAt: e,
      updatedAt: e
    }
  ];
  return { folders: t, snippets: a, tables: [
    {
      id: "tbl_customers",
      name: "Customers",
      key: "customers",
      description: "Sample customer list used by /cust",
      columns: [
        { id: "c1", name: "Name", key: "name", type: "text" },
        { id: "c2", name: "Email", key: "email", type: "email" },
        { id: "c3", name: "Phone", key: "phone", type: "phone" },
        { id: "c4", name: "Plan", key: "plan", type: "category", options: ["Basic", "Pro", "Enterprise"] }
      ],
      rows: [
        { id: "r1", values: { name: "Aisha Khan", email: "aisha@example.com", phone: "+91 98765 43210", plan: "Pro" } },
        { id: "r2", values: { name: "Daniel Brooks", email: "daniel@example.com", phone: "+1 415 555 0134", plan: "Basic" } },
        { id: "r3", values: { name: "Mei Lin", email: "mei@example.com", phone: "+65 8123 4567", plan: "Enterprise" } }
      ],
      createdAt: e,
      updatedAt: e
    },
    {
      id: "tbl_students",
      name: "Students",
      key: "students",
      description: "Sample student roster",
      columns: [
        { id: "s1", name: "Name", key: "name", type: "text" },
        { id: "s2", name: "Roll no", key: "roll", type: "text" },
        { id: "s3", name: "Class", key: "class", type: "category", options: ["10-A", "10-B", "11-A"] },
        { id: "s4", name: "Guardian phone", key: "guardian_phone", type: "phone" }
      ],
      rows: [
        { id: "st1", values: { name: "Rohan Mehta", roll: "1012", class: "10-A", guardian_phone: "+91 90000 11111" } },
        { id: "st2", values: { name: "Sara Ali", roll: "1027", class: "10-B", guardian_phone: "+91 90000 22222" } }
      ],
      createdAt: e,
      updatedAt: e
    }
  ], workflows: [
    {
      id: "wf_contact_form",
      name: "Fill a contact form (demo)",
      description: "Fills Name, Email and Message fields by their labels, then asks before submitting.",
      enabled: !0,
      steps: [
        { id: "w1", type: "type", target: { kind: "label", value: "Name" }, value: "{{me.name}}", clear: !0 },
        { id: "w2", type: "type", target: { kind: "label", value: "Email" }, value: "{{me.email}}", clear: !0 },
        { id: "w3", type: "type", target: { kind: "label", value: "Message" }, value: "Hello, I would like more information. Thanks!", clear: !0 },
        { id: "w4", type: "click", target: { kind: "selector", value: "button[type=submit], input[type=submit]" }, requireConfirm: !0, note: "Submit the form" }
      ],
      createdAt: e,
      updatedAt: e
    }
  ] };
}
async function mn(e = !1) {
  if (!e && await Xt("seeded")) return !1;
  if ((await Pe("snippets", !0)).length && !e)
    return await st("seeded", !0), !1;
  const n = pn();
  return await ve("folders", n.folders), await ve("snippets", n.snippets), await ve("tables", n.tables), await ve("workflows", n.workflows), await st("seeded", !0), !0;
}
const fe = /* @__PURE__ */ new Map();
function Ct() {
  const e = Date.now();
  for (const [t, n] of fe) e - n.at > 600 * 1e3 && fe.delete(t);
}
function Rt() {
  const e = new Uint8Array(16);
  return crypto.getRandomValues(e), Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
const oe = /* @__PURE__ */ new Map();
k.windows?.onRemoved.addListener((e) => {
  const t = oe.get(e);
  t && (oe.delete(e), !t.done && t.tabId !== void 0 && k.tabs.sendMessage(t.tabId, { type: "qth/overlayResult", nonce: t.nonce, result: { type: "cancel" } }, { frameId: t.frameId }).catch?.(() => {
  }));
});
async function _e() {
  const [e, t, n] = await Promise.all([Mt(), Pe("snippets"), Pe("tables")]);
  return { settings: e, snippets: t, tables: n };
}
async function fn(e) {
  const { settings: t, snippets: n } = await _e(), a = Qt(t, e);
  return {
    settings: {
      expansionEnabled: t.expansionEnabled && !a,
      blocked: a,
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
    shortcuts: n.filter((r) => r.enabled && r.shortcut).map((r) => ({ id: r.id, shortcut: r.shortcut, trigger: r.trigger || "default" }))
  };
}
async function hn(e, t, n) {
  const { settings: a, snippets: r, tables: o } = await _e(), s = r.find((c) => c.id === e);
  if (!s) return { kind: "error", message: "Snippet not found" };
  const l = Yt({ settings: a, snippets: r, tables: o, page: t }), u = _t(s.content, s.contentType, l);
  if (u.errors.length && !u.needsForm) return { kind: "error", message: u.errors[0] };
  if (u.needsForm) {
    Ct();
    const c = Rt();
    return fe.set(c, { snippetId: e, page: t, tabId: n, at: Date.now(), mode: "form" }), { kind: "form", nonce: c, name: s.name };
  }
  return !u.text.trim() && !u.html.replace(/<[^>]*>/g, "").trim() ? { kind: "error", message: /\{\{\s*me\./.test(s.content) ? `“${s.name}” is empty because your profile isn't filled in yet. Open the QuickText dashboard → Settings → Profile and add your details (e.g. your signature).` : `“${s.name}” has no text yet. Add content to it in the QuickText dashboard.` } : (await kt(e), { kind: "insert", text: u.text, html: u.html, isRich: u.isRich, cursor: u.cursor === null ? null : u.text.length - u.cursor, name: s.name });
}
k.runtime.onMessage.addListener((e, t, n) => {
  if (!e || typeof e.type != "string" || !e.type.startsWith("qth/") || t.id !== k.runtime.id) return !1;
  const a = t.tab?.id;
  return (async () => {
    switch (e.type) {
      case j.getIndex:
        return fn(String(e.host || ""));
      case j.expand:
        return hn(String(e.snippetId), e.page, a);
      case j.claimForm: {
        const r = fe.get(String(e.nonce));
        return r ? (fe.delete(String(e.nonce)), { ok: !0, snippetId: r.snippetId, page: r.page, mode: r.mode, payload: r.payload }) : { ok: !1 };
      }
      case "qth/openOverlay": {
        Ct();
        const r = Rt();
        return fe.set(r, { snippetId: String(e.snippetId || ""), page: e.page, tabId: a, at: Date.now(), mode: String(e.mode || "picker"), payload: e.payload }), { nonce: r };
      }
      case "qth/renderText": {
        const { settings: r, snippets: o, tables: s } = await _e(), l = _t(String(e.content || ""), "text", Yt({ settings: r, snippets: o, tables: s, page: e.page }));
        return l.errors.length ? { error: l.errors[0] } : l.needsForm ? { error: 'Autopilot text cannot contain form fields — use an "Insert snippet" step instead' } : { text: l.text };
      }
      case "qth/openOverlayWindow": {
        const r = String(e.nonce), o = e.mode === "picker" ? 460 : 500, s = e.mode === "picker" ? 470 : e.mode === "confirm" ? 300 : 620;
        let l, u;
        try {
          const D = t.tab?.windowId !== void 0 ? await k.windows.get(t.tab.windowId) : null;
          D && D.left !== void 0 && D.width !== void 0 && D.top !== void 0 && D.height !== void 0 && (l = Math.round(D.left + (D.width - o) / 2), u = Math.round(D.top + Math.max(40, (D.height - s) / 2)));
        } catch {
        }
        const c = await k.windows.create({ url: k.runtime.getURL("overlay/index.html") + `#nonce=${r}&window=1`, type: "popup", width: o, height: s, left: l, top: u, focused: !0 });
        return c?.id === void 0 ? { ok: !1 } : (oe.set(c.id, { nonce: r, tabId: t.tab?.id, frameId: t.frameId ?? 0, done: !1 }), { ok: !0 });
      }
      case "qth/overlayResult": {
        for (const [r, o] of oe)
          if (o.nonce === e.nonce) {
            if (o.done = !0, o.tabId !== void 0) {
              try {
                await k.windows.update((await k.tabs.get(o.tabId)).windowId, { focused: !0 });
              } catch {
              }
              k.tabs.sendMessage(o.tabId, { type: "qth/overlayResult", nonce: o.nonce, result: e.result }, { frameId: o.frameId }).catch?.(() => {
              });
            }
            k.windows.remove(r).catch?.(() => {
            }), oe.delete(r);
          }
        return { ok: !0 };
      }
      case "qth/closeOverlayWindow": {
        for (const [r, o] of oe) o.nonce === e.nonce && (o.done = !0, k.windows.remove(r).catch?.(() => {
        }), oe.delete(r));
        return { ok: !0 };
      }
      case j.recordUsage:
        return await kt(String(e.snippetId)), { ok: !0 };
      case j.listForAssistant: {
        const { snippets: r } = await _e(), o = await gt("usage"), s = new Map(o.map((l) => [l.snippetId, l]));
        return r.filter((l) => l.enabled).map((l) => ({ id: l.id, name: l.name, shortcut: l.shortcut, preview: l.content.slice(0, 160), contentType: l.contentType, favorite: l.favorite, pinned: l.pinned, lastUsedAt: s.get(l.id)?.lastUsedAt || 0, count: s.get(l.id)?.count || 0 }));
      }
      case j.listWorkflows:
        return (await Pe("workflows")).filter((r) => r.enabled);
      case j.getWorkflow:
        return Qe("workflows", String(e.id));
      case j.openDashboard:
        return await k.tabs.create({ url: k.runtime.getURL("dashboard/index.html" + (e.hash ? "#" + e.hash : "")) }), { ok: !0 };
      case j.picked:
        return await new Promise((r) => k.storage.local.set({ [we.picked]: { ...e.element, at: Date.now() } }, () => r())), { ok: !0 };
      default:
        return { error: "unknown message" };
    }
  })().then(n, (r) => n({ kind: "error", error: String(r?.message || r), message: String(r?.message || r) })), !0;
});
async function Ft() {
  const e = await Mt(), t = k.sidePanel;
  if (!t?.setPanelBehavior) return;
  const n = e.actionOpens === "sidepanel";
  await t.setPanelBehavior({ openPanelOnActionClick: n }).catch(() => {
  }), await k.action.setPopup({ popup: n ? "" : "popup/index.html" });
}
function $t(e) {
  const t = k.sidePanel;
  if (t?.open && e !== void 0) return t.open({ windowId: e }).catch(() => {
  });
  if (k.sidebarAction?.open) return k.sidebarAction.open();
}
k.storage.onChanged.addListener((e, t) => {
  t === "local" && e[we.settings] && Ft();
});
Ft();
k.commands?.onCommand.addListener((e, t) => {
  e === "open-side-panel" && $t(t?.windowId), e === "open-assistant" && t?.id !== void 0 && k.tabs.sendMessage(t.id, { type: j.openAssistant }).catch?.(() => {
  });
});
function Ut() {
  k.contextMenus.removeAll(() => {
    k.contextMenus.create({ id: "qth-insert", title: "Insert QuickText snippet…", contexts: ["editable"] }), k.sidePanel?.open && k.contextMenus.create({ id: "qth-sidepanel", title: "Open QuickText side panel", contexts: ["all"] }), k.contextMenus.create({ id: "qth-new-from-selection", title: "Create QuickText snippet from selection", contexts: ["selection"] });
  });
}
k.contextMenus.onClicked.addListener((e, t) => {
  if (e.menuItemId === "qth-sidepanel") {
    $t(t?.windowId);
    return;
  }
  if (t?.id && (e.menuItemId === "qth-insert" && k.tabs.sendMessage(t.id, { type: j.openAssistant }, { frameId: e.frameId }).catch?.(() => {
  }), e.menuItemId === "qth-new-from-selection")) {
    const n = (e.selectionText || "").slice(0, 2e4);
    k.tabs.create({ url: k.runtime.getURL("dashboard/index.html#/new?text=" + encodeURIComponent(n)) });
  }
});
async function yn() {
  if (!k.scripting?.executeScript) return;
  const e = await k.tabs.query({});
  for (const t of e)
    t.id === void 0 || !/^(https?|file):/.test(t.url || "") || k.scripting.executeScript({ target: { tabId: t.id, allFrames: !0 }, files: ["content.js"] }).catch(() => {
    });
}
k.runtime.onInstalled.addListener(async (e) => {
  Ut(), yn(), e.reason === "install" && (await mn(), k.tabs.create({ url: k.runtime.getURL("dashboard/index.html#/welcome") }));
});
k.runtime.onStartup?.addListener(Ut);
