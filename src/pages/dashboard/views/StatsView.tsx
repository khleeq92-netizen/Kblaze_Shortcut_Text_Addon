import React, { useMemo } from 'react';
import { useStore } from '../store';
import { PlanGate, timeAgo } from '../common';

const TYPING_CPS = 5; // ~ characters per second for an average typist

export function StatsView() {
  const { snippets, usage } = useStore();
  const data = useMemo(() => {
    const rows = snippets.map((s) => ({ s, u: usage.get(s.id) })).filter((x) => x.u);
    const total = rows.reduce((a, x) => a + x.u!.count, 0);
    const days: { day: string; n: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      days.push({ day: d, n: rows.reduce((a, x) => a + (x.u!.daily[d] || 0), 0) });
    }
    const chars = rows.reduce((a, x) => a + x.u!.count * Math.max(0, x.s.content.replace(/\{\{[\s\S]*?\}\}/g, '').length - x.s.shortcut.length), 0);
    const today = days[days.length - 1].n;
    const week = days.slice(-7).reduce((a, d) => a + d.n, 0);
    return { rows: rows.sort((a, b) => b.u!.count - a.u!.count), total, days, chars, today, week };
  }, [snippets, usage]);
  const max = Math.max(1, ...data.days.map((d) => d.n));
  const unused = snippets.filter((s) => !usage.has(s.id));
  return (
    <div className="page">
      <div className="page-head"><h2>Usage statistics</h2><span className="muted">Stored only on this device</span></div>
      <PlanGate feature="analytics">
        <div className="stat-cards">
          <div className="card stat"><div className="v">{data.total}</div><div className="l">Total expansions</div></div>
          <div className="card stat"><div className="v">{data.today}</div><div className="l">Today</div></div>
          <div className="card stat"><div className="v">{data.week}</div><div className="l">Last 7 days</div></div>
          <div className="card stat"><div className="v">{data.chars.toLocaleString()}</div><div className="l">Characters saved</div></div>
          <div className="card stat"><div className="v">{Math.round(data.chars / TYPING_CPS / 60)} min</div><div className="l">Typing time saved (est.)</div></div>
        </div>
        <div className="card section">
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Expansions per day (last 30 days)</h3>
          <div className="bars">{data.days.map((d) => <div key={d.day} style={{ height: `${(d.n / max) * 100}%` }} title={`${d.day}: ${d.n}`} />)}</div>
          <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 11.5, marginTop: 4 }}><span>{data.days[0].day}</span><span>today</span></div>
        </div>
        <div className="card section">
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Snippets by usage</h3>
          <table className="list">
            <thead><tr><th>Snippet</th><th>Shortcut</th><th>Uses</th><th>Last 7 days</th><th>Last used</th></tr></thead>
            <tbody>
              {data.rows.map(({ s, u }) => {
                const w = Object.entries(u!.daily).filter(([d]) => d >= new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).reduce((a, [, n]) => a + n, 0);
                return <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => (location.hash = '/snippet/' + s.id)}><td>{s.name}</td><td className="mono">{s.shortcut}</td><td><b>{u!.count}</b></td><td>{w}</td><td>{timeAgo(u!.lastUsedAt)}</td></tr>;
              })}
              {!data.rows.length && <tr><td colSpan={5} className="muted">No expansions recorded yet — type a shortcut in any text field.</td></tr>}
            </tbody>
          </table>
          {unused.length > 0 && <div className="hint" style={{ marginTop: 10 }}>{unused.length} snippet(s) have never been used: {unused.slice(0, 8).map((s) => s.shortcut).join(', ')}{unused.length > 8 ? '…' : ''}</div>}
        </div>
      </PlanGate>
    </div>
  );
}
