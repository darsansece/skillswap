import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, ErrorBox, Loading, Pager, useFetch } from '../components/ui';
import SkillCard from './SkillCard';

export default function Marketplace() {
  const [params, setParams] = useSearchParams();
  const meta = useFetch('/skills/meta');
  const [q, setQ] = useState(params.get('q') || '');
  const qs = params.toString();
  const list = useFetch(`/skills?limit=12&${qs}`, [qs]);
  useEffect(() => setQ(params.get('q') || ''), [params]);

  const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k !== 'page') p.delete('page'); setParams(p); };
  const sel = (k, opts, label) => (
    <select aria-label={label} value={params.get(k) || ''} onChange={(e) => set(k, e.target.value)} style={{ width: 'auto' }}>
      <option value="">{label}</option>{opts.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>))}
    </select>
  );

  return (
    <div>
      <div className="page-head">
        <div><h1>Marketplace</h1><p className="muted">{list.data ? `${list.data.total} skills on offer` : ' '}</p></div>
        <Link className="btn" to="/skills/new">List a skill</Link>
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); set('q', q); }} style={{ marginBottom: '.75rem' }}>
        <input type="search" placeholder="Search guitar, Python, Spanish…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} aria-label="Search skills" />
        <button className="btn">Search</button>
      </form>
      <div className="row" style={{ marginBottom: '1.5rem' }}>
        {meta.data && sel('category', meta.data.categories, 'Any category')}
        {meta.data && sel('level', meta.data.levels, 'Any level')}
        {sel('mode', [['online', 'Online'], ['in-person', 'In person']], 'Online or in person')}
        {sel('maxCredits', [['1', 'Up to 1'], ['2', 'Up to 2'], ['5', 'Up to 5']], 'Any price')}
        {sel('sort', [['newest', 'Newest'], ['rating', 'Top rated'], ['popular', 'Most sessions'], ['credits-asc', 'Cheapest']], 'Sort: newest')}
        <label className="row small" style={{ margin: 0, fontWeight: 500 }}><input type="checkbox" checked={params.get('swap') === 'true'} onChange={(e) => set('swap', e.target.checked ? 'true' : '')} /> Swaps accepted</label>
        <label className="row small" style={{ margin: 0, fontWeight: 500 }}><input type="checkbox" checked={params.get('verified') === 'true'} onChange={(e) => set('verified', e.target.checked ? 'true' : '')} /> Verified only</label>
        {qs && <button className="btn link small" onClick={() => setParams({})}>Clear filters</button>}
      </div>
      <ErrorBox error={list.error} />
      {list.loading && !list.data ? <Loading /> : list.data?.items.length ? (
        <div className="grid">{list.data.items.map((s) => <SkillCard key={s._id} skill={s} />)}</div>
      ) : <Empty>No skills match these filters. Try widening your search, or be the first to list one.</Empty>}
      {list.data && <Pager page={list.data.page} pages={list.data.pages} onPage={(p) => set('page', String(p))} />}
    </div>
  );
}
