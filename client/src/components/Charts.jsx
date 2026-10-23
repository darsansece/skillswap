/** Lightweight SVG charts (no chart library dependency). */
export function LineChart({ series, height = 180 }) {
  const w = 600; const h = height; const pad = { l: 30, r: 10, t: 10, b: 24 };
  const n = series[0]?.data.length || 0;
  const max = Math.max(4, Math.ceil(Math.max(...series.flatMap((s) => s.data.map((d) => d.value))) / 2) * 2);
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, n - 1);
  const y = (v) => h - pad.b - (v / max) * (h - pad.t - pad.b);
  const ticks = series[0]?.data.filter((_, i) => i % Math.ceil(n / 6) === 0) || [];
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={series.map((s) => s.name).join(' and ')}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={pad.l} x2={w - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" /><text className="axis" x={pad.l - 6} y={y(max * f) + 3} textAnchor="end">{Math.round(max * f)}</text></g>)}
        {ticks.map((d) => { const i = series[0].data.indexOf(d); return <text key={d.date} className="axis" x={x(i)} y={h - 6} textAnchor="middle">{d.date.slice(5)}</text>; })}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" points={s.data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')} />
            {s.data.map((d, i) => d.value > 0 && <circle key={i} cx={x(i)} cy={y(d.value)} r="3" fill={s.color}><title>{`${d.date}: ${d.value}`}</title></circle>)}
          </g>
        ))}
      </svg>
      {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>}
    </div>
  );
}

export function HBars({ items, label = 'label', value = 'value' }) {
  const max = Math.max(1, ...items.map((i) => i[value]));
  if (!items.length) return <p className="muted small">No data yet.</p>;
  return items.map((i) => (
    <div className="hbar" key={i[label]}>
      <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i[label]}>{i[label]}</span>
      <div className="bar"><span style={{ width: `${(i[value] / max) * 100}%` }} /></div>
      <span className="small" style={{ textAlign: 'right' }}>{i[value]}</span>
    </div>
  ));
}
