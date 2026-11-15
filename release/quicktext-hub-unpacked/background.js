const _ = typeof browser < "u" && browser?.runtime ? browser : globalThis.chrome, Pt = "quicktext-hub-db", Ot = 1, Se = {
  settings: "qth.settings",
  cloud: "qth.cloudConfig",
  revision: "qth.revision",
  sync: "qth.syncState",
  picked: "qth.pickedElement",
  pausedSites: "qth.pausedSites"
}, W = {
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
}, Ut = ["snippets", "folders", "tables", "workflows", "templates", "usage", "meta"];
let he = null;
function Ve() {
  return he || (he = new Promise((e, t) => {
    const n = indexedDB.open(Pt, Ot);
    n.onupgradeneeded = () => {
      const r = n.result;
      for (const a of Ut)
        r.objectStoreNames.contains(a) || (a === "usage" ? r.createObjectStore(a, { keyPath: "snippetId" }) : a === "meta" ? r.createObjectStore(a) : r.createObjectStore(a, { keyPath: "id" }).createIndex("updatedAt", "updatedAt"));
    }, n.onsuccess = () => {
      const r = n.result;
      r.onversionchange = () => {
        r.close(), he = null;
      }, e(r);
    }, n.onerror = () => t(n.error);
  }), he);
}
function pt(e) {
  return new Promise((t, n) => {
    e.onsuccess = () => t(e.result), e.onerror = () => n(e.error);
  });
}
async function ft(e) {
  const t = await Ve();
  return pt(t.transaction(e, "readonly").objectStore(e).getAll());
}
async function Ke(e, t) {
  const n = await Ve();
  return pt(n.transaction(e, "readonly").objectStore(e).get(t));
}
async function ht(e, t, n) {
  if (!t.length) return;
  const r = await Ve();
  await new Promise((a, o) => {
    const s = r.transaction(e, "readwrite"), c = s.objectStore(e);
    for (const d of t) n !== void 0 ? c.put(d, n) : c.put(d);
    s.oncomplete = () => a(), s.onerror = () => o(s.error), s.onabort = () => o(s.error);
  });
}
async function gt(e, t, n) {
  return ht(e, [t], n);
}
const Ht = /* @__PURE__ */ new Set();
async function yt(e, t = "local") {
  Ht.forEach((n) => {
    try {
      n({ collections: e, origin: t });
    } catch {
    }
  });
  try {
    _?.storage?.local && await new Promise((n) => _.storage.local.set({ [Se.revision]: { at: Date.now(), collections: e, origin: t } }, () => n()));
  } catch {
  }
}
async function Ae(e, t = !1) {
  const n = await ft(e);
  return t ? n : n.filter((r) => !r.deleted);
}
async function xe(e, t, n = {}) {
  const r = Date.now(), a = t.map((o) => n.touch === !1 ? o : { ...o, createdAt: o.createdAt || r, updatedAt: r });
  return await ht(e, a), await yt([e], n.origin || "local"), a;
}
async function wt(e) {
  const t = /* @__PURE__ */ new Date(), n = t.toISOString().slice(0, 10), r = await Ke("usage", e) || { snippetId: e, count: 0, lastUsedAt: 0, daily: {} };
  r.count++, r.lastUsedAt = t.getTime(), r.daily[n] = (r.daily[n] || 0) + 1;
  const a = Object.keys(r.daily).sort();
  for (; a.length > 90; ) delete r.daily[a.shift()];
  await gt("usage", r), await yt(["usage"]);
}
async function Bt(e) {
  return Ke("meta", e);
}
async function at(e, t) {
  return gt("meta", t, e);
}
const ot = {
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
  onboarded: !1
};
function jt(e) {
  return { ...ot, ...e || {}, profile: { ...ot.profile, ...e?.profile || {} } };
}
async function Wt() {
  const e = await new Promise((t) => _.storage.local.get(Se.settings, t));
  return jt(e?.[Se.settings]);
}
function zt(e, t) {
  const n = t.toLowerCase();
  return e.blockedSites.some((r) => {
    const a = r.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return a && (n === a || n.endsWith("." + a));
  });
}
function ue(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function Oe(e) {
  return ue(e).replace(/\r?\n/g, "<br>");
}
const Vt = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function je(e) {
  return e.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (t, n) => {
    if (n[0] === "#") {
      const r = n[1].toLowerCase() === "x" ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10);
      return Number.isFinite(r) ? String.fromCodePoint(r) : t;
    }
    return Vt[n.toLowerCase()] ?? t;
  });
}
const Kt = /^(p|div|h[1-6]|li|tr|blockquote|pre|ul|ol|table|section|article|header|footer)$/i;
function it(e) {
  let t = "";
  const n = [], r = /<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let a, o = null, s = "", c = !1;
  const d = () => {
    t && !t.endsWith(`
`) && (t += `
`);
  };
  for (; a = r.exec(e); ) {
    if (a[3] !== void 0) {
      const v = je(a[3].replace(/[\r\n\t ]+/g, " "));
      t += v, c && (s += v);
      continue;
    }
    const l = a[1].toLowerCase(), A = a[0][1] === "/";
    if (l === "br") {
      t += `
`;
      continue;
    }
    if (l === "a") {
      if (A)
        o && s.trim() !== o && !/^mailto:/i.test(o) && (t += ` (${o})`), c = !1, o = null;
      else {
        const v = /href\s*=\s*["']([^"']*)["']/i.exec(a[2]);
        o = v ? je(v[1]) : null, c = !0, s = "";
      }
      continue;
    }
    if (l === "ul" || l === "ol") {
      A ? (n.pop(), d()) : (d(), n.push({ ordered: l === "ol", n: 0 }));
      continue;
    }
    if (l === "li" && !A) {
      d();
      const v = n[n.length - 1];
      t += "  ".repeat(Math.max(0, n.length - 1)) + (v?.ordered ? `${++v.n}. ` : "• ");
      continue;
    }
    if (l === "td" || l === "th") {
      A && (t += "	");
      continue;
    }
    Kt.test(l) && d();
  }
  return t.replace(/\t\n/g, `
`).replace(/[  ]+\n/g, `
`).replace(/\n{3,}/g, `

`).replace(/^\n+|\n+$/g, "");
}
class X extends Error {
  constructor(t, n) {
    super(t), this.pos = n;
  }
}
function Gt(e, t = !1) {
  const n = [];
  let r = 0, a = "", o = 0;
  for (; r < e.length; ) {
    if (e[r] === "\\" && e.startsWith("{{", r + 1)) {
      a += "{{", r += 3;
      continue;
    }
    if (e.startsWith("{{", r)) {
      let s = r + 2, c = null;
      for (; s < e.length; s++) {
        const l = e[s];
        if (c) {
          l === "\\" ? s++ : l === c && (c = null);
          continue;
        }
        if (l === '"' || l === "'") c = l;
        else if (l === "}" && e[s + 1] === "}") break;
      }
      if (s >= e.length) {
        const l = e.indexOf("}}", r + 2);
        if (l < 0) throw new X('A command starting with "{{" is never closed with "}}"', r);
        s = l;
      }
      if (a && n.push({ type: "text", value: a, start: o, end: r }), e.slice(r + 2, s).includes("{{")) throw new X('Commands cannot be nested inside other commands. Use a formula instead, e.g. {{link: ="https://site.com/" & id}}', r);
      let d = e.slice(r + 2, s);
      t && (d = je(d.replace(/<[^>]*>/g, "")).replace(/\u00a0/g, " ")), n.push({ type: "cmd", value: d.trim(), start: r, end: s + 2 }), r = s + 2, a = "", o = r;
      continue;
    }
    a += e[r++];
  }
  return a && n.push({ type: "text", value: a, start: o, end: e.length }), n;
}
function ge(e, t) {
  const n = [];
  let r = "", a = null, o = 0;
  for (let s = 0; s < e.length; s++) {
    const c = e[s];
    if (a) {
      r += c, c === "\\" ? r += e[++s] ?? "" : c === a && (a = null);
      continue;
    }
    if (c === '"' || c === "'") {
      a = c, r += c;
      continue;
    }
    if ((c === "(" || c === "[") && o++, (c === ")" || c === "]") && o--, c === t && o <= 0) {
      n.push(r), r = "";
      continue;
    }
    r += c;
  }
  return n.push(r), n;
}
function bt(e) {
  const t = e.trim();
  return t.length >= 2 && (t[0] === '"' && t.endsWith('"') || t[0] === "'" && t.endsWith("'")) ? t.slice(1, -1).replace(/\\(["'\\])/g, "$1").replace(/\\n/g, `
`) : t;
}
function Qt(e) {
  const t = e.trim();
  if (t.startsWith("=")) {
    const c = ge(t.slice(1), ";");
    return { name: "=", args: { main: c[0].trim(), ...st(c.slice(1)) } };
  }
  if (t.startsWith("#")) return { name: "#", args: { main: t.slice(1), opts: {}, flags: /* @__PURE__ */ new Set() } };
  const n = ge(t, ";"), r = n[0].trim(), a = /^([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/.exec(r);
  let o, s = "";
  if (a)
    o = a[1].toLowerCase(), s = a[2].trim();
  else if (/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(r)) {
    const c = r.toLowerCase();
    ["else", "endif", "endrepeat", "endsection", "cursor", "today", "now", "time", "date", "index"].includes(c) && !r.includes(".") ? o = c : (o = "ref", s = r);
  } else {
    const c = /^([A-Za-z][\w-]*)\s+([\s\S]*)$/.exec(r);
    if (c && ["if", "elseif", "repeat", "section"].includes(c[1].toLowerCase()))
      o = c[1].toLowerCase(), s = c[2].trim();
    else throw new X(`Cannot understand command "{{${e}}}"`);
  }
  return { name: o, args: { main: o === "if" || o === "elseif" || o === "set" ? s : bt(s), ...st(n.slice(1)) } };
}
function st(e) {
  const t = {}, n = /* @__PURE__ */ new Set();
  for (const r of e) {
    const a = r.trim();
    if (!a) continue;
    const o = a.indexOf("=");
    o > 0 && /^[\w-]+$/.test(a.slice(0, o).trim()) ? t[a.slice(0, o).trim().toLowerCase()] = bt(a.slice(o + 1)) : n.add(a.toLowerCase());
  }
  return { opts: t, flags: n };
}
function We(e, t = !1) {
  const n = Gt(e, t);
  let r = 0;
  function a(s) {
    const c = [];
    for (; r < n.length; ) {
      const d = n[r++];
      if (d.type === "text") {
        c.push({ k: "text", text: d.value });
        continue;
      }
      if (!d.value) {
        c.push({ k: "text", text: "" });
        continue;
      }
      const { name: l, args: A } = Qt(d.value);
      if (s.includes(l)) return { nodes: c, term: { name: l, args: A, end: d.end } };
      if (l === "if") {
        const v = [];
        let w = A.main, T = null;
        for (; ; ) {
          const S = a(["elseif", "else", "endif"]);
          if (!S.term) throw new X(`{{if: ${A.main}}} is missing {{endif}}`, d.start);
          if (v.push({ cond: w, body: S.nodes }), S.term.name === "endif") break;
          if (S.term.name === "elseif") {
            w = S.term.args.main;
            continue;
          }
          const j = a(["endif"]);
          if (!j.term) throw new X(`{{if: ${A.main}}} is missing {{endif}}`, d.start);
          T = j.nodes;
          break;
        }
        if (v.some((S) => !S.cond.trim())) throw new X("{{if}} / {{elseif}} needs a condition, e.g. {{if: amount > 100}}", d.start);
        c.push({ k: "if", branches: v, elseBody: T, start: d.start });
        continue;
      }
      if (l === "repeat" || l === "section") {
        const v = l === "repeat" ? "endrepeat" : "endsection", w = a([v]);
        if (!w.term) throw new X(`{{${l}: ${A.main}}} is missing {{${v}}}`, d.start);
        c.push({ k: l, args: A, body: w.nodes, start: d.start, end: d.end, raw: d.value });
        continue;
      }
      if (["else", "elseif", "endif", "endrepeat", "endsection"].includes(l)) throw new X(`{{${l}}} without a matching opening command`, d.start);
      c.push({ k: "cmd", name: l, args: A, raw: d.value, start: d.start, end: d.end });
    }
    return { nodes: c, term: null };
  }
  return a([]).nodes;
}
const ct = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], lt = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], J = (e, t = 2) => String(e).padStart(t, "0"), Jt = (e) => {
  const t = ["th", "st", "nd", "rd"], n = e % 100;
  return e + (t[(n - 20) % 10] || t[n] || t[0]);
};
function z(e, t) {
  if (!(e instanceof Date) || isNaN(e.getTime())) return "";
  const n = {
    YYYY: () => String(e.getFullYear()),
    YY: () => String(e.getFullYear()).slice(-2),
    MMMM: () => ct[e.getMonth()],
    MMM: () => ct[e.getMonth()].slice(0, 3),
    MM: () => J(e.getMonth() + 1),
    M: () => String(e.getMonth() + 1),
    Do: () => Jt(e.getDate()),
    DD: () => J(e.getDate()),
    D: () => String(e.getDate()),
    dddd: () => lt[e.getDay()],
    ddd: () => lt[e.getDay()].slice(0, 3),
    HH: () => J(e.getHours()),
    H: () => String(e.getHours()),
    hh: () => J(e.getHours() % 12 || 12),
    h: () => String(e.getHours() % 12 || 12),
    mm: () => J(e.getMinutes()),
    m: () => String(e.getMinutes()),
    ss: () => J(e.getSeconds()),
    s: () => String(e.getSeconds()),
    A: () => e.getHours() < 12 ? "AM" : "PM",
    a: () => e.getHours() < 12 ? "am" : "pm",
    Q: () => String(Math.floor(e.getMonth() / 3) + 1)
  };
  return t.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a|Q/g, (r, a) => a !== void 0 ? a : n[r]());
}
function de(e, t) {
  const n = new Date(e.getTime()), r = /([+-])\s*(\d+)\s*(y|M|w|d|h|m|s|bd)/g;
  let a, o = !1;
  for (; a = r.exec(t); ) {
    o = !0;
    const s = parseInt(a[2], 10) * (a[1] === "-" ? -1 : 1);
    switch (a[3]) {
      case "y":
        n.setFullYear(n.getFullYear() + s);
        break;
      case "M":
        Ge(n, s);
        break;
      case "w":
        n.setDate(n.getDate() + 7 * s);
        break;
      case "d":
        n.setDate(n.getDate() + s);
        break;
      case "bd":
        xt(n, s);
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
function Ge(e, t) {
  const n = e.getDate();
  e.setDate(1), e.setMonth(e.getMonth() + t);
  const r = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  return e.setDate(Math.min(n, r)), e;
}
function xt(e, t) {
  const n = t < 0 ? -1 : 1;
  let r = Math.abs(t);
  for (; r > 0; )
    e.setDate(e.getDate() + n), e.getDay() !== 0 && e.getDay() !== 6 && r--;
  return e;
}
function H(e, t = /* @__PURE__ */ new Date()) {
  if (e instanceof Date) return isNaN(e.getTime()) ? null : e;
  if (typeof e == "number") return new Date(e);
  if (typeof e != "string") return null;
  const n = e.trim();
  if (!n) return null;
  const r = n.toLowerCase(), a = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  if (r === "now") return new Date(t.getTime());
  if (r === "today") return a;
  if (r === "tomorrow") return de(a, "+1d");
  if (r === "yesterday") return de(a, "-1d");
  if (/^[+-]\s*\d/.test(n)) return de(/[hms]\b/.test(n) && !/bd/.test(n) ? t : a, n);
  const o = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(n);
  if (o) return new Date(+o[1], +o[2] - 1, +o[3], +(o[4] || 0), +(o[5] || 0), +(o[6] || 0));
  const s = /^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i.exec(n);
  if (s) {
    let l = +s[1];
    return s[3] && (l = l % 12 + (s[3].toLowerCase() === "pm" ? 12 : 0)), new Date(t.getFullYear(), t.getMonth(), t.getDate(), l, +s[2]);
  }
  const c = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(n);
  if (c) return new Date(+c[3], +c[2] - 1, +c[1]);
  const d = Date.parse(n);
  return isNaN(d) ? null : new Date(d);
}
function Le(e) {
  return `${e.getFullYear()}-${J(e.getMonth() + 1)}-${J(e.getDate())}`;
}
function ut(e) {
  return `${J(e.getHours())}:${J(e.getMinutes())}`;
}
function kt(e, t, n = "days") {
  const r = t.getTime() - e.getTime();
  switch (n.toLowerCase()) {
    case "seconds":
      return Math.floor(r / 1e3);
    case "minutes":
      return Math.floor(r / 6e4);
    case "hours":
      return Math.floor(r / 36e5);
    case "weeks":
      return Math.floor(r / (7 * 864e5));
    case "months":
      return (t.getFullYear() - e.getFullYear()) * 12 + (t.getMonth() - e.getMonth()) - (t.getDate() < e.getDate() ? 1 : 0);
    case "years":
      return Math.floor(((t.getFullYear() - e.getFullYear()) * 12 + (t.getMonth() - e.getMonth()) - (t.getDate() < e.getDate() ? 1 : 0)) / 12);
    default: {
      const a = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()), o = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
      return Math.round((o - a) / 864e5);
    }
  }
}
function $(e) {
  return Array.isArray(e);
}
function _e(e) {
  return !!e && typeof e == "object" && !Array.isArray(e) && !(e instanceof Date);
}
function P(e) {
  if (typeof e == "number") return e;
  if (typeof e == "boolean") return e ? 1 : 0;
  if (e == null) return 0;
  if (e instanceof Date) return e.getTime();
  if (Array.isArray(e)) return e.length === 1 ? P(e[0]) : NaN;
  if (typeof e == "string") {
    const t = e.trim();
    if (t === "") return 0;
    const n = t.endsWith("%"), r = t.replace(/[%\s ]/g, "").replace(/^[^\d+\-.(]+/, "").replace(/[^\d.]+$/, "").replace(/,(?=\d{3}(\D|$))/g, ""), a = /^\(.*\)$/.test(r), o = Number(a ? "-" + r.slice(1, -1) : r);
    return r === "" || isNaN(o) ? NaN : n ? o / 100 : o;
  }
  return NaN;
}
function ye(e) {
  return typeof e == "number" ? Number.isFinite(e) : typeof e == "string" ? e.trim() !== "" && !isNaN(P(e)) : !1;
}
function F(e) {
  if (e == null) return !1;
  if (typeof e == "boolean") return e;
  if (typeof e == "number") return e !== 0 && !isNaN(e);
  if (typeof e == "string") {
    const t = e.trim().toLowerCase();
    return !(t === "" || t === "false" || t === "no" || t === "off" || t === "0");
  }
  return Array.isArray(e) ? e.length > 0 : !0;
}
function Mt(e) {
  if (!Number.isFinite(e)) return isNaN(e) ? "NaN" : e > 0 ? "∞" : "-∞";
  const t = Math.round(e * 1e10) / 1e10;
  return String(t);
}
function p(e, t) {
  if (e == null) return "";
  if (typeof e == "string") return e;
  if (typeof e == "number") return Mt(e);
  if (typeof e == "boolean") return e ? "yes" : "no";
  if (e instanceof Date) {
    const n = e.getHours() !== 0 || e.getMinutes() !== 0;
    return z(e, t ? n && e.__time ? `${t.dateFormat} ${t.timeFormat}` : t.dateFormat : "YYYY-MM-DD");
  }
  return Array.isArray(e) ? e.map((n) => p(n, t)).join(", ") : _e(e) ? "__label" in e ? p(e.__label, t) : Object.values(e).filter((n) => typeof n != "object").map((n) => p(n, t)).join(", ") : String(e);
}
function Q(e, t, n) {
  if (!t) return p(e, n);
  const [r, ...a] = t.split(":"), o = a.join(":").trim(), s = r.trim().toLowerCase(), c = () => {
    const d = P(e);
    if (isNaN(d)) throw new Error(`Cannot format "${p(e)}" as a number`);
    return d;
  };
  switch (s) {
    case "currency":
      return new Intl.NumberFormat(n.locale, { style: "currency", currency: (o || n.currency).toUpperCase() }).format(c());
    case "number":
    case "decimal": {
      const d = o === "" ? void 0 : parseInt(o, 10);
      return new Intl.NumberFormat(n.locale, d === void 0 ? { maximumFractionDigits: 10 } : { minimumFractionDigits: d, maximumFractionDigits: d }).format(c());
    }
    case "integer":
      return new Intl.NumberFormat(n.locale, { maximumFractionDigits: 0 }).format(c());
    case "plain":
      return Mt(c());
    case "percent": {
      const d = o === "" ? 0 : parseInt(o, 10);
      return new Intl.NumberFormat(n.locale, { style: "percent", minimumFractionDigits: d, maximumFractionDigits: d }).format(c());
    }
    case "upper":
      return p(e, n).toUpperCase();
    case "lower":
      return p(e, n).toLowerCase();
    case "title":
      return Qe(p(e, n));
    case "date": {
      const d = H(e);
      return d ? z(d, o || n.dateFormat) : p(e, n);
    }
    case "time": {
      const d = H(e);
      return d ? z(d, o || n.timeFormat) : p(e, n);
    }
    case "datetime": {
      const d = H(e);
      return d ? z(d, o || `${n.dateFormat} ${n.timeFormat}`) : p(e, n);
    }
    default: {
      const d = e instanceof Date ? e : typeof e == "string" ? H(e) : null;
      return d ? z(d, t) : p(e, n);
    }
  }
}
function Qe(e) {
  return e.toLowerCase().replace(/(^|[\s\-_/(])(\p{L})/gu, (t, n, r) => n + r.toUpperCase());
}
class Y extends Error {
}
function Zt(e) {
  const t = [];
  let n = 0;
  for (; n < e.length; ) {
    const r = e[n];
    if (/\s/.test(r)) {
      n++;
      continue;
    }
    if (/\d/.test(r) || r === "." && /\d/.test(e[n + 1] || "")) {
      const o = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(e.slice(n));
      t.push({ k: "num", v: o[0], pos: n }), n += o[0].length;
      continue;
    }
    if (r === '"' || r === "'" || r === "“" || r === "”") {
      const o = r === "“" ? "”" : r;
      let s = n + 1, c = "";
      for (; s < e.length && e[s] !== o && !(o === "”" && e[s] === '"'); )
        if (e[s] === "\\" && s + 1 < e.length) {
          const d = e[s + 1];
          c += d === "n" ? `
` : d === "t" ? "	" : d, s += 2;
        } else c += e[s++];
      if (s >= e.length) throw new Y(`Unterminated text starting at position ${n + 1}`);
      t.push({ k: "str", v: c, pos: n }), n = s + 1;
      continue;
    }
    if (/[\p{L}_$]/u.test(r)) {
      const o = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(e.slice(n));
      t.push({ k: "id", v: o[0], pos: n }), n += o[0].length;
      continue;
    }
    const a = e.slice(n, n + 2);
    if (["==", "!=", "<>", "<=", ">=", "&&", "||"].includes(a)) {
      t.push({ k: "op", v: a, pos: n }), n += 2;
      continue;
    }
    if ("+-*/%^&=<>!(),.[]?:".includes(r)) {
      t.push({ k: "op", v: r, pos: n }), n++;
      continue;
    }
    throw new Y(`Unexpected character "${r}" at position ${n + 1}`);
  }
  return t.push({ k: "eof", v: "", pos: e.length }), t;
}
const dt = {
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
function Dt(e) {
  const t = Zt(e);
  let n = 0;
  const r = () => t[n], a = () => t[n++], o = (w) => {
    const T = a();
    if (T.v !== w) throw new Y(`Expected "${w}" at position ${T.pos + 1}${T.k === "eof" ? " (end of formula)" : ""}`);
  }, s = (w) => w.k === "op" && w.v in dt ? w.v : w.k === "id" && (w.v.toLowerCase() === "and" || w.v.toLowerCase() === "or") ? w.v.toLowerCase() : null;
  function c(w) {
    let T = d();
    for (; ; ) {
      const S = r();
      if (S.k === "op" && S.v === "?" && w <= 0) {
        a();
        const Ie = c(0);
        o(":");
        const I = c(0);
        T = { t: "call", fn: "if", args: [T, Ie, I] };
        continue;
      }
      const j = s(S);
      if (!j) break;
      const oe = dt[j];
      if (oe < w) break;
      a();
      const Fe = c(j === "^" ? oe : oe + 1);
      T = { t: "bin", op: j, left: T, right: Fe };
    }
    return T;
  }
  function d() {
    const w = r();
    return w.k === "op" && (w.v === "-" || w.v === "+" || w.v === "!") ? (a(), { t: "unary", op: w.v === "!" ? "not" : w.v, arg: d() }) : w.k === "id" && w.v.toLowerCase() === "not" ? (a(), { t: "unary", op: "not", arg: c(3) }) : l(A());
  }
  function l(w) {
    for (; ; ) {
      const T = r();
      if (T.k === "op" && T.v === ".") {
        a();
        const S = a();
        if (S.k !== "id" && S.k !== "num") throw new Y(`Expected a field name after "." at position ${S.pos + 1}`);
        w = { t: "member", obj: w, prop: S.v };
      } else if (T.k === "op" && T.v === "[") {
        a();
        const S = c(0);
        o("]"), w = { t: "index", obj: w, index: S };
      } else return w;
    }
  }
  function A() {
    const w = a();
    if (w.k === "num") return { t: "num", v: parseFloat(w.v) };
    if (w.k === "str") return { t: "str", v: w.v };
    if (w.k === "id") {
      const T = w.v.toLowerCase();
      if (T === "true" || T === "yes") return { t: "bool", v: !0 };
      if (T === "false" || T === "no") return { t: "bool", v: !1 };
      if (T === "null") return { t: "null" };
      if (r().v === "(" && r().k === "op") {
        a();
        const S = [];
        if (!(r().k === "op" && r().v === ")"))
          for (; ; ) {
            if (S.push(c(0)), r().k === "op" && r().v === ",") {
              a();
              continue;
            }
            break;
          }
        return o(")"), { t: "call", fn: T, args: S };
      }
      return { t: "name", name: w.v };
    }
    if (w.k === "op" && w.v === "(") {
      const T = c(0);
      return o(")"), T;
    }
    if (w.k === "op" && w.v === "[") {
      const T = [];
      if (!(r().k === "op" && r().v === "]"))
        for (; ; ) {
          if (T.push(c(0)), r().k === "op" && r().v === ",") {
            a();
            continue;
          }
          break;
        }
      return o("]"), { t: "list", items: T };
    }
    throw new Y(w.k === "eof" ? "Formula ended unexpectedly" : `Unexpected "${w.v}" at position ${w.pos + 1}`);
  }
  const v = c(0);
  if (r().k !== "eof") throw new Y(`Unexpected "${r().v}" at position ${r().pos + 1}`);
  return v;
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
function ae(e, t) {
  if ($(e))
    return t === "length" || t === "count" ? e.length : e.map((n) => ae(n, t));
  if (_e(e)) {
    if (t in e) return e[t];
    const n = Object.keys(e).find((r) => r.toLowerCase() === t.toLowerCase());
    return n ? e[n] : null;
  }
  return typeof e == "string" && t === "length" ? e.length : null;
}
function k(e, t = "value") {
  const n = P(e);
  if (isNaN(n)) throw new Y(`"${p(e)}" is not a number (${t})`);
  return n;
}
function vt(e, t, n) {
  if ($(t) || $(n)) {
    const o = $(t) ? t : null, s = $(n) ? n : null, c = Math.max(o?.length ?? 0, s?.length ?? 0);
    return Array.from({ length: c }, (d, l) => vt(e, o ? o[l] ?? null : t, s ? s[l] ?? null : n));
  }
  if (t instanceof Date && (e === "+" || e === "-") && !(n instanceof Date)) {
    const o = new Date(t.getTime());
    return o.setDate(o.getDate() + (e === "+" ? 1 : -1) * k(n, "days")), o;
  }
  if (t instanceof Date && n instanceof Date && e === "-") return kt(n, t, "days");
  const r = k(t, "left side of " + e), a = k(n, "right side of " + e);
  switch (e) {
    case "+":
      return r + a;
    case "-":
      return r - a;
    case "*":
      return r * a;
    case "/":
      if (a === 0) throw new Y("Division by zero");
      return r / a;
    case "%":
      return r % a;
    case "^":
      return Math.pow(r, a);
  }
  throw new Y("Unknown operator " + e);
}
function te(e, t) {
  if (e == null || e === "") return t == null || t === "";
  if (typeof e == "boolean" || typeof t == "boolean") return F(e) === F(t);
  if (e instanceof Date || t instanceof Date) {
    const n = H(e), r = H(t);
    return !!n && !!r && Le(n) === Le(r);
  }
  return ye(e) && ye(t) ? Math.abs(P(e) - P(t)) < 1e-9 : p(e).trim().toLowerCase() === p(t).trim().toLowerCase();
}
function ee(e, t) {
  if (e instanceof Date || t instanceof Date) {
    const n = H(e), r = H(t);
    if (!n || !r) throw new Y("Cannot compare a date with a non-date");
    return n.getTime() - r.getTime();
  }
  return ye(e) && ye(t) ? P(e) - P(t) : p(e).localeCompare(p(t));
}
function $e(e) {
  return e.flatMap((t) => $(t) ? $e(t) : [t]);
}
function Ce(e) {
  return $e(e).filter((t) => t !== null && t !== "").map((t) => k(t));
}
function E(e, t, n) {
  const r = H(e, t);
  if (!r) throw new Y(`${n}: "${p(e)}" is not a valid date`);
  return r;
}
function Je(e, t) {
  if (!$(e)) throw new Y(`${t}: first argument must be a list or table`);
  return e.filter(_e);
}
const Tt = {};
function m(e, t, n, r, a) {
  Tt[e] = { fn: a, sig: n, doc: r, group: t };
}
m("upper", "Text", "upper(text)", "UPPERCASE text", ([e]) => p(e).toUpperCase());
m("lower", "Text", "lower(text)", "lowercase text", ([e]) => p(e).toLowerCase());
m("title", "Text", "title(text)", "Title Case Each Word", ([e]) => Qe(p(e)));
m("capitalize", "Text", "capitalize(text)", "Capitalize the first letter", ([e]) => {
  const t = p(e);
  return t.charAt(0).toUpperCase() + t.slice(1);
});
m("trim", "Text", "trim(text)", "Remove surrounding spaces", ([e]) => p(e).trim());
m("len", "Text", "len(text)", "Number of characters (or items in a list)", ([e]) => $(e) ? e.length : p(e).length);
m("replace", "Text", "replace(text, find, with)", "Replace every occurrence of find", ([e, t, n]) => p(e).split(p(t)).join(p(n)));
m("left", "Text", "left(text, n)", "First n characters", ([e, t]) => p(e).slice(0, k(t)));
m("right", "Text", "right(text, n)", "Last n characters", ([e, t]) => {
  const n = p(e), r = k(t);
  return r <= 0 ? "" : n.slice(-r);
});
m("mid", "Text", "mid(text, start, length)", "Substring (start at 1)", ([e, t, n]) => p(e).substr(k(t) - 1, n === void 0 ? void 0 : k(n)));
m("contains", "Text", "contains(text, part)", "True if text contains part (case-insensitive) or list contains item", ([e, t]) => $(e) ? e.some((n) => te(n, t)) : p(e).toLowerCase().includes(p(t).toLowerCase()));
m("startswith", "Text", "startswith(text, part)", "True if text starts with part", ([e, t]) => p(e).toLowerCase().startsWith(p(t).toLowerCase()));
m("endswith", "Text", "endswith(text, part)", "True if text ends with part", ([e, t]) => p(e).toLowerCase().endsWith(p(t).toLowerCase()));
m("split", "Text", "split(text, separator)", "Split text into a list", ([e, t]) => p(e).split(t === void 0 ? "," : p(t)).map((n) => n.trim()));
m("join", "Text", "join(list, separator)", "Join list items into text", ([e, t], n) => ($(e) ? e : [e]).map((r) => p(r, n.fo)).join(t === void 0 ? ", " : p(t)));
m("concat", "Text", "concat(a, b, ...)", "Join values together", (e, t) => $e(e).map((n) => p(n, t.fo)).join(""));
m("repeat", "Text", "repeat(text, n)", "Repeat text n times", ([e, t]) => p(e).repeat(Math.max(0, Math.min(1e3, k(t)))));
m("pad", "Text", "pad(text, length, char)", "Left-pad to a length", ([e, t, n]) => p(e).padStart(k(t), n === void 0 ? " " : p(n)));
m("truncate", "Text", "truncate(text, n)", "Shorten to n characters with …", ([e, t]) => {
  const n = p(e), r = k(t);
  return n.length > r ? n.slice(0, Math.max(0, r - 1)) + "…" : n;
});
m("initials", "Text", "initials(name)", 'Initials of a name: "Ada Lovelace" → "AL"', ([e]) => p(e).split(/\s+/).filter(Boolean).map((t) => t[0].toUpperCase()).join(""));
m("firstname", "Text", "firstname(name)", "First word of a full name", ([e]) => p(e).trim().split(/\s+/)[0] || "");
m("lastname", "Text", "lastname(name)", "Last word of a full name", ([e]) => {
  const t = p(e).trim().split(/\s+/);
  return t.length > 1 ? t[t.length - 1] : "";
});
m("urlencode", "Text", "urlencode(text)", "Encode text for use inside a link", ([e]) => encodeURIComponent(p(e)));
m("text", "Text", "text(value)", "Convert to text", ([e], t) => p(e, t.fo));
m("format", "Text", 'format(value, "currency:EUR")', "Format a value (currency, number:2, percent, date:DD/MM/YYYY, upper …)", ([e, t], n) => Q(e, p(t), n.fo));
m("if", "Logic", "if(condition, then, else)", "Choose a value based on a condition", ([e, t, n]) => F(e) ? t ?? "" : n ?? "");
m("and", "Logic", "and(a, b, ...)", "True if all are true", (e) => e.every(F));
m("or", "Logic", "or(a, b, ...)", "True if any is true", (e) => e.some(F));
m("not", "Logic", "not(a)", "Negate", ([e]) => !F(e));
m("isempty", "Logic", "isempty(value)", "True if blank", ([e]) => e == null || typeof e == "string" && e.trim() === "" || $(e) && e.length === 0);
m("coalesce", "Logic", "coalesce(a, b, ...)", "First non-blank value", (e) => e.find((t) => !(t == null || t === "")) ?? "");
m("choose", "Logic", 'choose(value, "a", "A", "b", "B", default)', "Map a value to a result", ([e, ...t]) => {
  for (let n = 0; n + 1 < t.length; n += 2) if (te(e, t[n])) return t[n + 1];
  return t.length % 2 ? t[t.length - 1] : "";
});
m("matches", "Logic", "matches(text, pattern)", "True if text matches a regular expression", ([e, t]) => {
  const n = p(t);
  if (n.length > 300) throw new Y("matches: pattern too long");
  try {
    return new RegExp(n, "i").test(p(e));
  } catch {
    throw new Y("matches: invalid pattern");
  }
});
m("isemail", "Logic", "isemail(text)", "True if text looks like an e-mail address", ([e]) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p(e).trim()));
m("isnumber", "Logic", "isnumber(value)", "True if value is numeric", ([e]) => ye(e));
m("round", "Math", "round(n, decimals)", "Round to decimals (default 0)", ([e, t]) => {
  const n = Math.pow(10, t === void 0 ? 0 : k(t));
  return Math.round(k(e) * n + Number.EPSILON) / n;
});
m("floor", "Math", "floor(n)", "Round down", ([e]) => Math.floor(k(e)));
m("ceil", "Math", "ceil(n)", "Round up", ([e]) => Math.ceil(k(e)));
m("abs", "Math", "abs(n)", "Absolute value", ([e]) => Math.abs(k(e)));
m("sqrt", "Math", "sqrt(n)", "Square root", ([e]) => Math.sqrt(k(e)));
m("min", "Math", "min(a, b, ...)", "Smallest number (lists allowed)", (e) => Math.min(...Ce(e)));
m("max", "Math", "max(a, b, ...)", "Largest number (lists allowed)", (e) => Math.max(...Ce(e)));
m("sum", "Math", "sum(list or numbers)", "Total", (e) => Ce(e).reduce((t, n) => t + n, 0));
m("avg", "Math", "avg(list or numbers)", "Average", (e) => {
  const t = Ce(e);
  return t.length ? t.reduce((n, r) => n + r, 0) / t.length : 0;
});
m("count", "Math", "count(list)", "Number of items", (e) => $e(e).filter((t) => t !== null && t !== "").length);
m("number", "Math", "number(value)", "Convert to number", ([e]) => k(e));
m("percent", "Math", "percent(part, whole)", "part as a percentage of whole (0-100)", ([e, t]) => {
  const n = k(t);
  if (n === 0) throw new Y("percent: whole is zero");
  return k(e) / n * 100;
});
m("percentof", "Math", "percentof(pct, amount)", "pct % of amount", ([e, t]) => k(e) / 100 * k(t));
m("addpercent", "Math", "addpercent(amount, pct)", "amount increased by pct % (e.g. tax)", ([e, t]) => k(e) * (1 + k(t) / 100));
m("discount", "Math", "discount(amount, pct)", "amount reduced by pct %", ([e, t]) => k(e) * (1 - k(t) / 100));
m("currency", "Math", 'currency(amount, "USD")', "Format as currency", ([e, t], n) => Q(e, "currency" + (t ? ":" + p(t) : ""), n.fo));
m("random", "Math", "random(min, max)", "Random whole number between min and max", ([e, t]) => {
  const n = k(e ?? 0), r = k(t ?? 100);
  return Math.floor(n + Math.random() * (r - n + 1));
});
m("today", "Date", "today()", "Today (midnight)", (e, t) => new Date(t.now.getFullYear(), t.now.getMonth(), t.now.getDate()));
m("now", "Date", "now()", "Current date and time", (e, t) => {
  const n = new Date(t.now.getTime());
  return n.__time = !0, n;
});
m("date", "Date", 'date("2025-01-31" | "+3d")', "Make a date from text or a shift", ([e], t) => E(e ?? "today", t.now, "date"));
m("adddays", "Date", "adddays(date, n)", "Add (or subtract) days", ([e, t], n) => {
  const r = new Date(E(e, n.now, "adddays"));
  return r.setDate(r.getDate() + k(t)), r;
});
m("addhours", "Date", "addhours(date, n)", "Add hours", ([e, t], n) => {
  const r = new Date(E(e, n.now, "addhours").getTime() + k(t) * 36e5);
  return r.__time = !0, r;
});
m("addminutes", "Date", "addminutes(date, n)", "Add minutes", ([e, t], n) => {
  const r = new Date(E(e, n.now, "addminutes").getTime() + k(t) * 6e4);
  return r.__time = !0, r;
});
m("addweeks", "Date", "addweeks(date, n)", "Add weeks", ([e, t], n) => {
  const r = new Date(E(e, n.now, "addweeks"));
  return r.setDate(r.getDate() + 7 * k(t)), r;
});
m("addmonths", "Date", "addmonths(date, n)", "Add months (clamps to month end)", ([e, t], n) => Ge(new Date(E(e, n.now, "addmonths")), k(t)));
m("addyears", "Date", "addyears(date, n)", "Add years", ([e, t], n) => Ge(new Date(E(e, n.now, "addyears")), 12 * k(t)));
m("addbusinessdays", "Date", "addbusinessdays(date, n)", "Add working days (skips weekends)", ([e, t], n) => xt(new Date(E(e, n.now, "addbusinessdays")), k(t)));
m("shift", "Date", 'shift(date, "+1M +2d")', "Shift a date using shift syntax", ([e, t], n) => de(E(e, n.now, "shift"), p(t)));
m("datediff", "Date", 'datediff(start, end, "days")', "Difference in days|weeks|months|years|hours|minutes", ([e, t, n], r) => kt(E(e, r.now, "datediff"), E(t, r.now, "datediff"), n ? p(n) : "days"));
m("formatdate", "Date", 'formatdate(date, "DD/MM/YYYY")', "Format a date", ([e, t], n) => z(E(e, n.now, "formatdate"), t === void 0 ? n.fo.dateFormat : p(t)));
m("weekday", "Date", "weekday(date)", "Day name, e.g. Monday", ([e], t) => z(E(e ?? "today", t.now, "weekday"), "dddd"));
m("year", "Date", "year(date)", "Year number", ([e], t) => E(e ?? "today", t.now, "year").getFullYear());
m("month", "Date", "month(date)", "Month number 1-12", ([e], t) => E(e ?? "today", t.now, "month").getMonth() + 1);
m("day", "Date", "day(date)", "Day of month", ([e], t) => E(e ?? "today", t.now, "day").getDate());
m("endofmonth", "Date", "endofmonth(date)", "Last day of the month", ([e], t) => {
  const n = E(e ?? "today", t.now, "endofmonth");
  return new Date(n.getFullYear(), n.getMonth() + 1, 0);
});
m("greeting", "Date", "greeting()", "Good morning / afternoon / evening", (e, t) => {
  const n = t.now.getHours();
  return n < 12 ? "Good morning" : n < 17 ? "Good afternoon" : "Good evening";
});
m("list", "Lists", "list(a, b, ...)", "Make a list", (e) => e);
m("first", "Lists", "first(list)", "First item", ([e]) => $(e) ? e[0] ?? null : e);
m("last", "Lists", "last(list)", "Last item", ([e]) => $(e) ? e[e.length - 1] ?? null : e);
m("item", "Lists", "item(list, n)", "Item number n (1-based)", ([e, t]) => $(e) ? e[k(t) - 1] ?? null : null);
m("unique", "Lists", "unique(list)", "Remove duplicates", ([e]) => $(e) ? e.filter((t, n) => e.findIndex((r) => te(t, r)) === n) : e);
m("sort", "Lists", "sort(list)", "Sort ascending", ([e]) => $(e) ? [...e].sort(ee) : e);
m("filter", "Lists", 'filter(table, "column", value)', "Rows whose column equals value", ([e, t, n]) => Je(e, "filter").filter((r) => te(ae(r, p(t)), n)));
m("lookup", "Lists", 'lookup(table, "matchColumn", value, "resultColumn")', "Find a row and return one column", ([e, t, n, r]) => {
  const a = Je(e, "lookup").find((o) => te(ae(o, p(t)), n));
  return a ? r === void 0 ? a : ae(a, p(r)) : "";
});
function St(e, t, n) {
  switch (t) {
    case ">":
      return ee(e, n) > 0;
    case ">=":
      return ee(e, n) >= 0;
    case "<":
      return ee(e, n) < 0;
    case "<=":
      return ee(e, n) <= 0;
    case "!=":
    case "<>":
      return !te(e, n);
    default:
      return te(e, n);
  }
}
m("countif", "Lists", 'countif(list, ">", 0)', "Count items matching a comparison (= != > >= < <=)", ([e, t, n]) => ($(e) ? e : [e]).filter((r) => St(r, p(t), n)).length);
m("sumif", "Lists", 'sumif(list, ">", 0)', "Sum items matching a comparison", ([e, t, n]) => ($(e) ? e : [e]).filter((r) => St(r, p(t), n)).reduce((r, a) => r + k(a), 0));
m("pluck", "Lists", 'pluck(table, "column")', "One column of a table as a list", ([e, t]) => Je(e, "pluck").map((n) => ae(n, p(t))));
function R(e, t) {
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
      return e.items.map((n) => R(n, t));
    case "name": {
      const n = t.lookup(e.name);
      if (!n.found) throw new Y(`Unknown name "${e.name}"`);
      return n.value;
    }
    case "member":
      return ae(R(e.obj, t), e.prop);
    case "index": {
      const n = R(e.obj, t), r = R(e.index, t);
      return $(n) ? n[k(r) - 1] ?? null : ae(n, p(r));
    }
    case "unary": {
      const n = R(e.arg, t);
      return e.op === "not" ? !F(n) : e.op === "-" ? $(n) ? n.map((r) => -k(r)) : -k(n) : k(n);
    }
    case "call": {
      const n = Tt[e.fn];
      if (!n) throw new Y(`Unknown function "${e.fn}()"`);
      return e.fn === "if" ? F(R(e.args[0], t)) ? e.args[1] ? R(e.args[1], t) : "" : e.args[2] ? R(e.args[2], t) : "" : n.fn(e.args.map((r) => R(r, t)), t);
    }
    case "bin": {
      if (e.op === "and" || e.op === "&&") return F(R(e.left, t)) && F(R(e.right, t));
      if (e.op === "or" || e.op === "||") return F(R(e.left, t)) || F(R(e.right, t));
      const n = R(e.left, t), r = R(e.right, t);
      switch (e.op) {
        case "&":
          return p(n, t.fo) + p(r, t.fo);
        case "=":
        case "==":
          return te(n, r);
        case "!=":
        case "<>":
          return !te(n, r);
        case "<":
          return ee(n, r) < 0;
        case "<=":
          return ee(n, r) <= 0;
        case ">":
          return ee(n, r) > 0;
        case ">=":
          return ee(n, r) >= 0;
        default:
          return vt(e.op, n, r);
      }
    }
  }
}
const ke = /* @__PURE__ */ new Map();
function le(e, t) {
  let n = ke.get(e);
  return n || (n = Dt(e), ke.size > 500 && ke.clear(), ke.set(e, n)), R(n, t);
}
function Me(e) {
  if (!e) return [];
  try {
    return [...Z(Dt(e.startsWith("=") ? e.slice(1) : e))];
  } catch {
    return [];
  }
}
const De = "⁣⁣QTHCURSOR⁣⁣", At = {
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
}, Xt = /* @__PURE__ */ new Set(["me", "data", "page", "index", "rownumber"]), ve = /^[\p{L}_][\p{L}\p{N}_]*$/u;
function Ue(e) {
  const t = e.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function He(e) {
  const t = e.includes("|") ? "|" : ",";
  return ge(e, t).map((n) => n.trim().replace(/^["']|["']$/g, "")).filter((n) => n !== "");
}
function ze(e, t, n, r, a, o) {
  const s = () => r ? n.repeats.get(r) : n, c = (d) => {
    for (const l of d)
      if (l.k === "cmd") {
        const A = At[l.name];
        if (A && l.args.main) s().fields.has(l.args.main) || s().fields.set(l.args.main, { type: A, args: l.args, start: l.start, end: l.end });
        else if (l.name === "set") {
          const v = l.args.main.split("=")[0].trim();
          v && s().sets.add(v);
        } else l.name === "ref" && n.pendingRefs.push({ name: l.args.main.split(".")[0], repeat: r });
        (l.name === "=" || l.name === "validate" || ["upper", "lower", "title", "capitalize", "trim", "replace"].includes(l.name)) && Me(l.args.main).forEach((v) => n.pendingRefs.push({ name: v, repeat: r })), l.name === "set" && Me(l.args.main.split("=").slice(1).join("=")).forEach((v) => n.pendingRefs.push({ name: v, repeat: r }));
        for (const v of [l.args.main, ...Object.values(l.args.opts)]) if (l.name !== "=" && v.startsWith("=")) Me(v).forEach((w) => n.pendingRefs.push({ name: w, repeat: r }));
        else if ((l.name === "snippet" || l.name === "include") && t.resolveSnippet && a < 5 && !o.has(l.args.main)) {
          const w = t.resolveSnippet(l.args.main);
          if (w) {
            o.add(l.args.main);
            try {
              ze(We(w.content, w.contentType === "html"), t, n, r, a + 1, o);
            } catch {
            }
            o.delete(l.args.main);
          }
        }
      } else l.k === "if" ? (l.branches.forEach((A) => {
        Me(A.cond).forEach((v) => n.pendingRefs.push({ name: v, repeat: r })), c(A.body);
      }), l.elseBody && c(l.elseBody)) : l.k === "section" ? (n.fields.has(l.args.main) || s().fields.set(l.args.main, { type: "section", args: l.args, start: l.start, end: l.end }), c(l.body)) : l.k === "repeat" && (/^\d+$/.test(l.args.main) || l.args.opts.count ? c(l.body) : (n.repeats.has(l.args.main) || n.repeats.set(l.args.main, { fields: /* @__PURE__ */ new Map(), sets: /* @__PURE__ */ new Set() }), ze(l.body, t, n, l.args.main, a, o)));
  };
  c(e);
}
function en(e) {
  for (const { name: t, repeat: n } of e.pendingRefs)
    if (!(e.fields.has(t) || e.sets.has(t) || e.repeats.has(t) || e.implicit.has(t) || Xt.has(t)))
      if (n) {
        const r = e.repeats.get(n);
        !r.fields.has(t) && !r.sets.has(t) && r.fields.set(t, { type: "text", args: { main: t, opts: {}, flags: /* @__PURE__ */ new Set() }, start: -1, end: -1 });
      } else e.implicit.add(t);
}
function Lt(e, t, n = {}) {
  const r = t === "html";
  let a = r;
  const o = { locale: "en-US", currency: "USD", dateFormat: "DD MMM YYYY", timeFormat: "h:mm A", ...n.fo || {} }, s = n.now || /* @__PURE__ */ new Date(), c = n.values || {}, d = { forms: !0, formulas: !0, conditionals: !0, ...n.features || {} }, l = [], A = [], v = [], w = /* @__PURE__ */ new Set();
  let T;
  try {
    T = We(e, r);
  } catch (i) {
    return { text: "", html: "", cursor: null, form: [], errors: [i.message], validation: [], needsForm: !1, isRich: !1 };
  }
  const S = { fields: /* @__PURE__ */ new Map(), sets: /* @__PURE__ */ new Set(), repeats: /* @__PURE__ */ new Map(), implicit: /* @__PURE__ */ new Set(), pendingRefs: [] };
  ze(T, n, S, null, 0, /* @__PURE__ */ new Set()), en(S);
  const j = {}, oe = {};
  for (const [i, u] of Object.entries(n.data || {})) oe[i] = u.rows.map((y) => ({ ...y }));
  const Fe = n.profile || {}, Ie = n.page || { url: "", title: "", host: "" }, I = [], Ye = () => {
    for (let i = I.length - 1; i >= 0; i--) if (!I[i].repeat.startsWith("__")) return I[i];
  };
  function Ze(i, u) {
    const y = u.opts.default ?? u.opts.value_default;
    switch (i) {
      case "checkbox":
      case "toggle":
      case "section":
        return y !== void 0 ? F(y) : u.flags.has("checked") || u.flags.has("on");
      case "date": {
        const h = H(y ?? "", s);
        return h ? Le(h) : "";
      }
      case "time": {
        if (y === void 0) return "";
        const h = H(y === "now" ? "now" : y, s);
        return h ? ut(h) : "";
      }
      case "datetime": {
        const h = y ? H(y, s) : null;
        return h ? `${Le(h)}T${ut(h)}` : "";
      }
      case "select":
        return u.flags.has("multiple") ? y ? He(y) : [] : y ?? (u.flags.has("required") || u.opts.required ? "" : He(u.opts.options || "")[0] ?? "");
      default:
        return y ?? "";
    }
  }
  function we(i, u, y) {
    switch (i) {
      case "checkbox":
      case "toggle":
      case "section":
        return !!u && u !== "false";
      case "number":
      case "currency": {
        if (u === "" || u === null || u === void 0) return null;
        const h = P(u);
        return isNaN(h) ? String(u) : h;
      }
      case "date":
      case "datetime": {
        const h = u ? H(u, s) : null;
        return h && i === "datetime" && (h.__time = !0), h;
      }
      case "time": {
        const h = u ? H(u, s) : null;
        return h && (h.__time = !0), h;
      }
      case "pick": {
        const h = n.data?.[y.opts.table || ""], x = h?.rows.find((N) => N.__id === u || N.id === u);
        if (!x) return null;
        const g = y.opts.display || h?.columns?.[0] || Object.keys(x)[0];
        return { ...x, __label: x[g] ?? "" };
      }
      case "select":
        return Array.isArray(u) ? u : u ?? "";
      default:
        return u ?? "";
    }
  }
  function be(i, u, y, h) {
    const x = h ? h.row : c;
    return x[i] !== void 0 ? x[i] : Ze(u, y);
  }
  function Ee(i) {
    for (let h = I.length - 1; h >= 0; h--) {
      const x = I[h];
      if (i in x.rowVars) return { found: !0, value: x.rowVars[i] };
      if (i === "index" || i === "rownumber") return { found: !0, value: x.index + 1 };
      const g = S.repeats.get(x.repeat)?.fields.get(i);
      if (g && g.start >= 0 && x === Ye())
        try {
          se(i, g.type, g.args, I.length, g.start, g.end);
        } catch {
        }
      if (g) return { found: !0, value: we(g.type, be(i, g.type, g.args, x), g.args) };
    }
    if (i in j) return { found: !0, value: j[i] };
    if (S.sets.has(i)) return { found: !0, value: "" };
    const u = S.fields.get(i);
    if (u)
      try {
        se(i, u.type, u.args, 0, u.start, u.end, !1, !0);
      } catch {
      }
    if (u) return { found: !0, value: we(u.type, be(i, u.type, u.args), u.args) };
    if (S.implicit.has(i)) {
      try {
        se(i, "text", { main: i, opts: {}, flags: /* @__PURE__ */ new Set() }, 0, void 0, void 0, !0, !0);
      } catch {
      }
      return { found: !0, value: c[i] ?? "" };
    }
    const y = S.repeats.get(i);
    return y ? {
      found: !0,
      value: Xe(i, { opts: {} }).map((x, g) => {
        const N = { index: g + 1 };
        for (const [f, b] of y.fields) N[f] = we(b.type, x[f] !== void 0 ? x[f] : Ze(b.type, b.args), b.args);
        return N;
      })
    } : i === "me" ? { found: !0, value: Fe } : i === "data" ? { found: !0, value: oe } : i === "page" ? { found: !0, value: Ie } : { found: !1, value: null };
  }
  const ie = { lookup: Ee, fo: o, now: s }, ne = (i) => {
    if (!d.formulas) throw new Error("Formulas require the Pro plan");
    return le(i, ie);
  }, pe = (i) => i === void 0 ? "" : i.startsWith("=") ? p(ne(i.slice(1)), o) : i;
  function Xe(i, u) {
    const y = Math.max(0, parseInt(u.opts.min ?? "1", 10) || 0), h = c[i];
    return Array.isArray(h) ? h : Array.from({ length: Math.max(y, 1) }, () => ({}));
  }
  function se(i, u, y, h, x, g, N = !1, f = !1) {
    if (!d.forms) throw new Error("Dynamic form fields require an upgraded plan");
    const b = f ? void 0 : Ye(), q = b ? `${b.repeat}#${b.index}.${i}` : i;
    if (w.has(q)) return;
    w.add(q);
    const O = be(i, u, y, b), D = y.opts, L = {
      name: i,
      type: u,
      depth: h,
      value: O,
      implicit: N,
      start: x,
      end: g,
      label: D.label || Ue(i),
      required: y.flags.has("required") || F(D.required ?? ""),
      defaultRaw: D.default,
      options: u === "select" ? He(pe(D.options) || "") : void 0,
      multiple: y.flags.has("multiple"),
      placeholder: D.placeholder,
      min: D.min !== void 0 ? P(D.min) : void 0,
      max: D.max !== void 0 ? P(D.max) : void 0,
      step: D.step !== void 0 ? P(D.step) : void 0,
      minLength: D.minlength !== void 0 ? parseInt(D.minlength, 10) : void 0,
      maxLength: D.maxlength !== void 0 ? parseInt(D.maxlength, 10) : void 0,
      pattern: D.pattern,
      message: D.message,
      rows: D.rows ? parseInt(D.rows, 10) : void 0,
      currency: D.currency,
      table: D.table,
      display: D.display,
      hint: D.hint || D.help
    };
    if (u === "pick") {
      const K = n.data?.[D.table || ""];
      if (!K) throw new Error(`Data Hub table "${D.table}" was not found`);
      const Ne = D.display || K.columns?.[0] || "name";
      L.options = K.rows.map((M) => `${M.__id}\0${p(M[Ne] ?? "")}`);
    }
    const U = Ft(L);
    U && (L.error = U, A.push(`${L.label}: ${U}`)), b ? b.formRow.push(L) : v.push(L);
  }
  function Ft(i) {
    const u = i.value, y = u === "" || u === null || u === void 0 || Array.isArray(u) && u.length === 0 || (i.type === "checkbox" || i.type === "toggle") && i.required && !u;
    if (i.required && y) return i.message || "This field is required";
    if (!y) {
      if (i.type === "number" || i.type === "currency") {
        const h = P(u);
        if (isNaN(h)) return "Enter a valid number";
        if (i.min !== void 0 && h < i.min) return i.message || `Must be at least ${i.min}`;
        if (i.max !== void 0 && h > i.max) return i.message || `Must be at most ${i.max}`;
      }
      if (typeof u == "string") {
        if (i.minLength !== void 0 && u.length < i.minLength) return i.message || `Use at least ${i.minLength} characters`;
        if (i.maxLength !== void 0 && u.length > i.maxLength) return i.message || `Use at most ${i.maxLength} characters`;
        if (i.pattern) {
          const h = { email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, phone: /^\+?[\d\s().-]{6,20}$/, url: /^https?:\/\/\S+$/i, digits: /^\d+$/ };
          let x = h[i.pattern.toLowerCase()];
          if (!x)
            try {
              x = new RegExp(`^(?:${i.pattern})$`);
            } catch {
              return "Invalid validation pattern";
            }
          if (!x.test(u.trim())) return i.message || `Invalid format${h[i.pattern.toLowerCase()] ? ` (${i.pattern})` : ""}`;
        }
      }
    }
  }
  let B = "";
  const V = (i) => {
    B += a ? Oe(i) : i;
  }, et = (i, u) => {
    a ? B += i : B += u;
  };
  function tt(i, u, y) {
    const h = y.opts.format;
    switch (i) {
      case "checkbox":
      case "toggle":
        return F(u) ? pe(y.opts.value ?? y.opts.on ?? "") : pe(y.opts.off ?? "");
      case "currency":
        return u === null || u === "" ? "" : typeof u == "number" ? Q(u, h || `currency:${y.opts.currency || o.currency}`, o) : p(u, o);
      case "number":
        return u === null ? "" : Q(u, h, o);
      case "date":
        return u ? z(u, h || o.dateFormat) : "";
      case "time":
        return u ? z(u, h || o.timeFormat) : "";
      case "datetime":
        return u ? z(u, h || `${o.dateFormat} ${o.timeFormat}`) : "";
      case "select":
        return Array.isArray(u) ? u.join(y.opts.separator ?? ", ") : Q(u, h, o);
      default:
        return Q(u, h, o);
    }
  }
  function It(i) {
    const u = ne(i.main);
    if (!$(u)) throw new Error("{{table}} source must be a list (a repeat section or data.<table>)");
    let y = u.filter((M) => _e(M));
    const x = (i.opts.columns ? ge(i.opts.columns, "|").map((M) => M.trim()).filter(Boolean) : Object.keys(y[0] || {}).filter((M) => !M.startsWith("__") && M !== "index")).map((M) => {
      const C = M.indexOf(":");
      return C > 0 ? { header: M.slice(0, C).trim(), expr: M.slice(C + 1).trim() } : { header: Ue(M), expr: M };
    }), g = (M, C, G) => {
      I.push({ repeat: "__table", row: {}, rowVars: { ...M, index: C + 1 }, index: C, formRow: [] });
      try {
        return G();
      } finally {
        I.pop();
      }
    };
    i.opts.where && (y = y.filter((M, C) => g(M, C, () => F(ne(i.opts.where))))), i.opts.limit && (y = y.slice(0, parseInt(i.opts.limit, 10) || y.length));
    const N = (i.opts.formats || "").split("|").map((M) => M.trim()), f = y.map((M, C) => x.map((G, Re) => g(M, C, () => Q(ne(G.expr), N[Re] || void 0, o)))), b = i.opts.total ? x.map((M, C) => {
      const G = ge(i.opts.total, "|").map((Pe) => Pe.trim().toLowerCase());
      if (C === 0 && !G.includes(M.header.toLowerCase())) return i.opts.totallabel || "Total";
      if (!G.includes(M.header.toLowerCase())) return "";
      const Re = y.reduce((Pe, Nt, Rt) => Pe + (P(g(Nt, Rt, () => ne(M.expr))) || 0), 0);
      return Q(Re, N[C] || void 0, o);
    }) : null, q = x.map((M) => M.header), O = [q, ...f, ...b ? [b] : []], D = q.map((M, C) => Math.max(...O.map((G) => (G[C] || "").length))), L = (M) => "| " + M.map((C, G) => (C || "").padEnd(D[G])).join(" | ") + " |", U = [L(q), "|" + D.map((M) => "-".repeat(M + 2)).join("|") + "|", ...f.map(L), ...b ? [L(b)] : []].join(`
`), K = 'style="border:1px solid #bbb;padding:4px 8px"', Ne = `<table style="border-collapse:collapse"><thead><tr>${q.map((M) => `<th ${K}>${ue(M)}</th>`).join("")}</tr></thead><tbody>${f.map((M) => `<tr>${M.map((C) => `<td ${K}>${ue(C)}</td>`).join("")}</tr>`).join("")}${b ? `<tr>${b.map((M) => `<td ${K}><b>${ue(M)}</b></td>`).join("")}</tr>` : ""}</tbody></table>`;
    et(Ne, U);
  }
  function re(i, u, y) {
    for (const h of i)
      try {
        Yt(h, u, y);
      } catch (x) {
        const g = x instanceof X || x instanceof Error ? x.message : String(x), N = h.k === "cmd" ? `{{${h.raw}}}` : h.k === "if" ? "{{if}}" : `{{${h.k}}}`;
        l.push(`${N}: ${g}`);
      }
  }
  function Yt(i, u, y) {
    const h = Ye();
    switch (i.k) {
      case "text":
        B += i.text;
        return;
      case "if": {
        if (!d.conditionals) throw new Error("Conditional rules require the Pro plan");
        for (const f of i.branches)
          if (F(le(f.cond, ie))) {
            re(f.body, u, y);
            return;
          }
        i.elseBody && re(i.elseBody, u, y);
        return;
      }
      case "section": {
        const f = i.args.main;
        if (!ve.test(f)) throw new Error("Section needs a name, e.g. {{section: extras; label=Add extras?}}");
        se(f, "section", i.args, u, i.start, i.end), F(we("section", be(f, "section", i.args, h), i.args)) && re(i.body, u + 1, y);
        return;
      }
      case "repeat": {
        const f = i.args.main, b = i.args.opts.separator ?? "", q = /^\d+$/.test(f) ? parseInt(f, 10) : i.args.opts.count ? Math.round(P(ne(i.args.opts.count))) : null;
        if (q !== null) {
          const L = Math.max(0, Math.min(500, isNaN(q) ? 0 : q));
          for (let U = 0; U < L; U++) {
            U && b && V(b), I.push({ repeat: "__static", row: {}, rowVars: { index: U + 1 }, index: U, formRow: [] });
            try {
              re(i.body, u, y);
            } finally {
              I.pop();
            }
          }
          return;
        }
        if (!ve.test(f)) throw new Error("Repeat needs a name, e.g. {{repeat: items; label=Item}}");
        if (!d.forms) throw new Error("Repeating sections require an upgraded plan");
        const O = Xe(f, i.args), D = {
          type: "repeat",
          name: f,
          label: i.args.opts.label || Ue(f),
          min: parseInt(i.args.opts.min ?? "1", 10) || 0,
          max: parseInt(i.args.opts.max ?? "50", 10) || 50,
          depth: u,
          rows: []
        };
        v.push(D), O.forEach((L, U) => {
          U && b && V(b);
          const K = { repeat: f, row: L || {}, rowVars: {}, index: U, formRow: [] };
          I.push(K);
          try {
            re(i.body, u + 1, y);
          } finally {
            I.pop(), D.rows.push(K.formRow);
          }
        });
        return;
      }
    }
    const { name: x, args: g } = i, N = At[x];
    if (N && (g.main || !["date", "time"].includes(x))) {
      const f = g.main;
      if (!f || !ve.test(f)) throw new Error(`Field name "${f}" may only contain letters, numbers and _ (use label=… for display text)`);
      if (se(f, N, g, u, i.start, i.end), g.flags.has("hidden") || g.opts.show === "no" || g.opts.show === "false") return;
      const b = Ee(f).value;
      V(tt(N, b, g));
      return;
    }
    switch (x) {
      case "#":
        return;
      case "ref": {
        const f = g.main, b = f.split(".")[0];
        (S.implicit.has(b) || h && S.repeats.get(h.repeat)?.fields.get(b)?.start === -1) && !f.includes(".") && se(b, "text", g, u, i.start, i.end, !0);
        let O;
        if (f.includes(".")) O = le(f, ie);
        else {
          const D = Ee(b);
          if (!D.found) throw new Error(`Unknown name "${b}"`);
          O = D.value;
          const L = S.fields.get(b) || (h ? S.repeats.get(h.repeat)?.fields.get(b) : void 0);
          if (L && !g.opts.format) {
            V(tt(L.type, O, { ...L.args, opts: { ...L.args.opts } }));
            return;
          }
        }
        V(Q(O, g.opts.format, o));
        return;
      }
      case "=": {
        const f = ne(g.main);
        V(Q(f, g.opts.format, o));
        return;
      }
      case "set": {
        const f = g.main.indexOf("=");
        if (f < 1) throw new Error("Use {{set: name = formula}}");
        const b = g.main.slice(0, f).trim();
        if (!ve.test(b)) throw new Error(`Invalid variable name "${b}"`);
        const q = ne(g.main.slice(f + 1));
        h ? h.rowVars[b] = q : j[b] = q;
        return;
      }
      case "upper":
      case "lower":
      case "title":
      case "capitalize":
      case "trim": {
        const f = p(le(g.main, ie), o);
        V(x === "upper" ? f.toUpperCase() : x === "lower" ? f.toLowerCase() : x === "title" ? Qe(f) : x === "trim" ? f.trim() : f.charAt(0).toUpperCase() + f.slice(1));
        return;
      }
      case "replace": {
        const f = p(le(g.main, ie), o);
        V(f.split(g.opts.find ?? "").join(g.opts.with ?? g.opts.by ?? ""));
        return;
      }
      case "today":
      case "date":
      case "now":
      case "time": {
        let f = new Date(s.getTime());
        (x === "today" || x === "date") && (f = new Date(s.getFullYear(), s.getMonth(), s.getDate())), g.opts.shift && (f = de(f, g.opts.shift)), g.main && x !== "date" && (f = de(f, g.main));
        const b = g.opts.format || (x === "time" ? o.timeFormat : x === "now" ? `${o.dateFormat} ${o.timeFormat}` : o.dateFormat);
        V(z(f, b));
        return;
      }
      case "cursor":
        B += De;
        return;
      case "link": {
        const f = pe(g.opts.url ?? (g.main.startsWith("="), g.main)), b = pe(g.opts.text ?? "") || f;
        if (!/^(https?:|mailto:|tel:)/i.test(f)) throw new Error(`Links must start with https://, http://, mailto: or tel: (got "${f}")`);
        const q = g.opts.plain || "both", O = b === f || q === "url" ? f : q === "text" ? b : `${b} (${f})`;
        et(`<a href="${ue(f)}">${ue(b)}</a>`, O);
        return;
      }
      case "table":
        It(g);
        return;
      case "snippet":
      case "include": {
        if (y >= 5) throw new Error("Snippets are nested too deeply (max 5)");
        const f = n.resolveSnippet?.(g.main);
        if (!f) throw new Error(`No snippet with shortcut "${g.main}"`);
        const b = f.contentType === "html", q = We(f.content, b);
        if (b === a) {
          re(q, u, y + 1);
          return;
        }
        const O = B, D = a;
        B = "", a = b;
        try {
          re(q, u, y + 1);
        } finally {
          a = D;
        }
        const L = B;
        B = O + (b ? it(L) : Oe(L));
        return;
      }
      case "validate": {
        F(le(g.main, ie)) || A.push(g.opts.message || `Check failed: ${g.main}`);
        return;
      }
      case "index": {
        if (!I.length) throw new Error("{{index}} can only be used inside {{repeat}}");
        V(String(I[I.length - 1].index + 1));
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
  re(T, 0, 0);
  let ce, fe;
  r ? (fe = B, ce = it(B)) : (ce = B, fe = Oe(B));
  let nt = null;
  const rt = ce.indexOf(De);
  rt >= 0 && (nt = rt), ce = ce.split(De).join(""), fe = fe.split(De).join("");
  const Et = v.length > 0;
  return { text: ce, html: fe, cursor: nt, form: v, errors: l, validation: A, needsForm: Et, isRich: r };
}
const Be = ["dynamicForms", "formulas", "conditionals", "richText", "dataHub", "autopilot", "analytics", "sharing", "marketplaceSubmit", "cloudSync"], mt = {
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
    features: Be
  },
  business: {
    id: "business",
    name: "Business",
    tagline: "Teams, shared folders, roles and team analytics",
    limits: { snippets: 2e4, folders: 2e3, tables: 200, workflows: 500, libraryTemplates: 1 / 0, teamMembers: 250 },
    features: [...Be, "teams", "teamAnalytics", "roles"]
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Custom limits, access management and audit logs",
    limits: { snippets: 1 / 0, folders: 1 / 0, tables: 1 / 0, workflows: 1 / 0, libraryTemplates: 1 / 0, teamMembers: 1 / 0 },
    features: [...Be, "teams", "teamAnalytics", "roles", "auditLogs"]
  }
};
function tn(e) {
  return mt[e || "pro"] || mt.pro;
}
function Te(e, t, n = !0) {
  return !n || tn(e).features.includes(t);
}
function qt(e) {
  const { settings: t } = e, n = new Map(e.snippets.filter((o) => !o.deleted).map((o) => [o.shortcut, o])), r = {};
  for (const o of e.tables)
    o.deleted || (r[o.key] = { label: o.name, columns: o.columns.map((s) => s.key), rows: o.rows.map((s) => ({ __id: s.id, ...s.values })) });
  const a = t.enforcePlanLimits;
  return {
    values: e.values || {},
    profile: { ...t.profile },
    data: Te(t.plan, "dataHub", a) ? r : {},
    page: e.page,
    resolveSnippet: (o) => {
      const s = n.get(o);
      return s ? { content: s.content, contentType: s.contentType } : null;
    },
    fo: { locale: t.locale, currency: t.currency, dateFormat: t.dateFormat, timeFormat: t.timeFormat },
    features: {
      forms: Te(t.plan, "dynamicForms", a),
      formulas: Te(t.plan, "formulas", a),
      conditionals: Te(t.plan, "conditionals", a)
    }
  };
}
const nn = [
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
], rn = () => Date.now();
function an() {
  const e = rn(), t = [
    { id: "fld_personal", name: "Personal", parentId: null, order: 0, createdAt: e, updatedAt: e, color: "#6366f1" },
    { id: "fld_work", name: "Work", parentId: null, order: 1, createdAt: e, updatedAt: e, color: "#0ea5e9" },
    { id: "fld_billing", name: "Billing", parentId: "fld_work", order: 0, createdAt: e, updatedAt: e, color: "#f59e0b" },
    { id: "fld_trading", name: "Trading", parentId: null, order: 2, createdAt: e, updatedAt: e, color: "#10b981" }
  ], n = (s, c, d = {}) => {
    const l = nn.find((A) => A.id === s);
    return {
      id: "snp_" + s.replace(/^lib-/, "").replace(/-/g, "_"),
      name: l.name,
      shortcut: l.shortcut,
      content: l.content,
      contentType: l.contentType,
      folderId: c,
      enabled: !0,
      favorite: !1,
      pinned: !1,
      description: l.description,
      tags: [],
      trigger: "default",
      source: { kind: "template", ref: s },
      createdAt: e,
      updatedAt: e,
      ...d
    };
  }, r = [
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
  return { folders: t, snippets: r, tables: [
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
async function on(e = !1) {
  if (!e && await Bt("seeded")) return !1;
  if ((await Ae("snippets", !0)).length && !e)
    return await at("seeded", !0), !1;
  const n = an();
  return await xe("folders", n.folders), await xe("snippets", n.snippets), await xe("tables", n.tables), await xe("workflows", n.workflows), await at("seeded", !0), !0;
}
const me = /* @__PURE__ */ new Map();
function _t() {
  const e = Date.now();
  for (const [t, n] of me) e - n.at > 600 * 1e3 && me.delete(t);
}
function $t() {
  const e = new Uint8Array(16);
  return crypto.getRandomValues(e), Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
async function qe() {
  const [e, t, n] = await Promise.all([Wt(), Ae("snippets"), Ae("tables")]);
  return { settings: e, snippets: t, tables: n };
}
async function sn(e) {
  const { settings: t, snippets: n } = await qe(), r = zt(t, e);
  return {
    settings: {
      expansionEnabled: t.expansionEnabled && !r,
      blocked: r,
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
    shortcuts: n.filter((a) => a.enabled && a.shortcut).map((a) => ({ id: a.id, shortcut: a.shortcut, trigger: a.trigger || "default" }))
  };
}
async function cn(e, t, n) {
  const { settings: r, snippets: a, tables: o } = await qe(), s = a.find((l) => l.id === e);
  if (!s) return { kind: "error", message: "Snippet not found" };
  const c = qt({ settings: r, snippets: a, tables: o, page: t }), d = Lt(s.content, s.contentType, c);
  if (d.errors.length && !d.needsForm) return { kind: "error", message: d.errors[0] };
  if (d.needsForm) {
    _t();
    const l = $t();
    return me.set(l, { snippetId: e, page: t, tabId: n, at: Date.now(), mode: "form" }), { kind: "form", nonce: l, name: s.name };
  }
  return await wt(e), { kind: "insert", text: d.text, html: d.html, isRich: d.isRich, cursor: d.cursor === null ? null : d.text.length - d.cursor, name: s.name };
}
_.runtime.onMessage.addListener((e, t, n) => {
  if (!e || typeof e.type != "string" || !e.type.startsWith("qth/") || t.id !== _.runtime.id) return !1;
  const r = t.tab?.id;
  return (async () => {
    switch (e.type) {
      case W.getIndex:
        return sn(String(e.host || ""));
      case W.expand:
        return cn(String(e.snippetId), e.page, r);
      case W.claimForm: {
        const a = me.get(String(e.nonce));
        return a ? (me.delete(String(e.nonce)), { ok: !0, snippetId: a.snippetId, page: a.page, mode: a.mode, payload: a.payload }) : { ok: !1 };
      }
      case "qth/openOverlay": {
        _t();
        const a = $t();
        return me.set(a, { snippetId: String(e.snippetId || ""), page: e.page, tabId: r, at: Date.now(), mode: String(e.mode || "picker"), payload: e.payload }), { nonce: a };
      }
      case "qth/renderText": {
        const { settings: a, snippets: o, tables: s } = await qe(), c = Lt(String(e.content || ""), "text", qt({ settings: a, snippets: o, tables: s, page: e.page }));
        return c.errors.length ? { error: c.errors[0] } : c.needsForm ? { error: 'Autopilot text cannot contain form fields — use an "Insert snippet" step instead' } : { text: c.text };
      }
      case W.recordUsage:
        return await wt(String(e.snippetId)), { ok: !0 };
      case W.listForAssistant: {
        const { snippets: a } = await qe(), o = await ft("usage"), s = new Map(o.map((c) => [c.snippetId, c]));
        return a.filter((c) => c.enabled).map((c) => ({ id: c.id, name: c.name, shortcut: c.shortcut, preview: c.content.slice(0, 160), contentType: c.contentType, favorite: c.favorite, pinned: c.pinned, lastUsedAt: s.get(c.id)?.lastUsedAt || 0, count: s.get(c.id)?.count || 0 }));
      }
      case W.listWorkflows:
        return (await Ae("workflows")).filter((a) => a.enabled);
      case W.getWorkflow:
        return Ke("workflows", String(e.id));
      case W.openDashboard:
        return await _.tabs.create({ url: _.runtime.getURL("dashboard/index.html" + (e.hash ? "#" + e.hash : "")) }), { ok: !0 };
      case W.picked:
        return await new Promise((a) => _.storage.local.set({ [Se.picked]: { ...e.element, at: Date.now() } }, () => a())), { ok: !0 };
      default:
        return { error: "unknown message" };
    }
  })().then(n, (a) => n({ kind: "error", error: String(a?.message || a), message: String(a?.message || a) })), !0;
});
_.commands?.onCommand.addListener((e, t) => {
  e === "open-assistant" && t?.id !== void 0 && _.tabs.sendMessage(t.id, { type: W.openAssistant }).catch?.(() => {
  });
});
function Ct() {
  _.contextMenus.removeAll(() => {
    _.contextMenus.create({ id: "qth-insert", title: "Insert QuickText snippet…", contexts: ["editable"] }), _.contextMenus.create({ id: "qth-new-from-selection", title: "Create QuickText snippet from selection", contexts: ["selection"] });
  });
}
_.contextMenus.onClicked.addListener((e, t) => {
  if (t?.id && (e.menuItemId === "qth-insert" && _.tabs.sendMessage(t.id, { type: W.openAssistant }, { frameId: e.frameId }).catch?.(() => {
  }), e.menuItemId === "qth-new-from-selection")) {
    const n = (e.selectionText || "").slice(0, 2e4);
    _.tabs.create({ url: _.runtime.getURL("dashboard/index.html#/new?text=" + encodeURIComponent(n)) });
  }
});
_.runtime.onInstalled.addListener(async (e) => {
  Ct(), e.reason === "install" && (await on(), _.tabs.create({ url: _.runtime.getURL("dashboard/index.html#/welcome") }));
});
_.runtime.onStartup?.addListener(Ct);
