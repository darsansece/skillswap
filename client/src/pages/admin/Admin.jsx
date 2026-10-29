import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api, { errMsg } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Coin, Empty, Loading, Modal, Pager, Tabs, fmtDate, fmtDay, useFetch } from '../../components/ui';
import { HBars, LineChart } from '../../components/Charts';

function Overview() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const { data } = useFetch(`/analytics/platform?days=${days}`, [days]);
  const toast = useToast();
  const download = async (type) => {
    try {
      const res = await api.get(`/analytics/export/${type}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `${type}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  if (!data) return <Loading />;
  const t = data.totals;
  const obj = (o) => Object.entries(o).map(([label, value]) => ({ label, value }));
  return (
    <div className="stack">
      <div className="row between">
        <div className="row">{[7, 30, 90].map((d) => <button key={d} className={`btn small ${days === d ? '' : 'ghost'}`} onClick={() => setDays(d)}>Last {d} days</button>)}</div>
        {user.role === 'admin' && <div className="row"><span className="small muted">Export CSV:</span>{['users', 'exchanges', 'transactions'].map((x) => <button key={x} className="btn ghost small" onClick={() => download(x)}>{x}</button>)}</div>}
      </div>
      <div className="stats">
        {[['Members', t.users], ['Active this week', t.activeUsers7d], ['Active skills', t.skills], ['Exchanges', t.exchanges], ['Sessions completed', t.completedSessions], ['Hours exchanged', t.hoursExchanged], ['Forum posts', t.forumPosts], ['Certificates', t.certificates], ['Open reports', t.openReports]].map(([l, v]) => (
          <div key={l} className="card stat"><div className="v" style={l === 'Open reports' && v ? { color: 'var(--rose)' } : undefined}>{v}</div><div className="l">{l}</div></div>))}
      </div>
      <div className="grid-2">
        <div className="card"><h3>Sign-ups and new exchanges</h3><LineChart series={[{ name: 'Sign-ups', color: 'var(--teal)', data: data.signups }, { name: 'Exchanges', color: 'var(--gold)', data: data.exchangesOverTime }]} /></div>
        <div className="card"><h3>Exchange status</h3><HBars items={obj(data.statusBreakdown)} /><h3 style={{ marginTop: '1rem' }}>Payment type</h3><HBars items={obj(data.typeBreakdown)} /></div>
      </div>
      <div className="grid-2">
        <div className="card"><h3>Most requested skills</h3><HBars items={data.topSkills} label="title" value="requests" /></div>
        <div className="card"><h3>Skills by category</h3><HBars items={data.categoryDistribution} label="category" value="count" /></div>
      </div>
      <div className="card"><h3>Credits paid to mentors</h3><LineChart series={[{ name: 'Credits', color: 'var(--gold)', data: data.creditsCirculated }]} /></div>
    </div>
  );
}

function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, reload } = useFetch(`/admin/users?q=${encodeURIComponent(q)}&status=${status}&page=${page}`, [q, status, page]);
  const [credit, setCredit] = useState(null);
  const run = async (fn, msg) => { try { await fn(); toast(msg); reload(); } catch (e) { toast(errMsg(e), 'err'); } };
  const moderate = (u, action) => {
    const body = { action };
    if (action === 'suspend') { const d = window.prompt('Suspend for how many days?', '7'); if (!d) return; body.days = Number(d); }
    if (action === 'warn') { const r = window.prompt('Reason for the warning'); if (!r) return; body.reason = r; }
    if (action === 'ban' && !window.confirm(`Ban ${u.name}? They will not be able to log in.`)) return;
    run(() => api.post(`/admin/users/${u._id}/moderate`, body), `Done: ${action}`);
  };
  return (
    <div className="stack">
      <div className="row">
        <input type="search" aria-label="Search users" placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ maxWidth: 320 }} />
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}><option value="">Any status</option><option>active</option><option>suspended</option><option>banned</option></select>
      </div>
      <div className="card table-wrap"><table>
        <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Credits</th><th>Level</th><th>Warnings</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>{data?.items.map((u) => (
          <tr key={u._id}>
            <td><Link to={`/users/${u._id}`}>{u.name}</Link><div className="small muted">{u.email}{u.emailVerified ? '' : ' · unverified'}</div></td>
            <td>{me.role === 'admin' && u._id !== me._id ? (
              <select aria-label="Role" value={u.role} onChange={(e) => run(() => api.put(`/admin/users/${u._id}/role`, { role: e.target.value }), 'Role updated')} style={{ width: 'auto' }}>{['user', 'moderator', 'admin'].map((r) => <option key={r}>{r}</option>)}</select>) : u.role}</td>
            <td><span className={`chip ${u.status === 'active' ? 'teal' : 'rose'}`}>{u.status}</span>{u.suspendedUntil && <div className="small muted">until {fmtDay(u.suspendedUntil)}</div>}</td>
            <td><Coin value={u.credits} /></td><td>{u.level}</td><td>{u.warnings?.length || 0}</td><td className="small">{fmtDay(u.createdAt)}</td>
            <td>{u._id !== me._id && (
              <div className="row" style={{ gap: '.3rem' }}>
                <button className="btn ghost small" onClick={() => moderate(u, 'warn')}>Warn</button>
                {u.status === 'active' ? <button className="btn ghost small" onClick={() => moderate(u, 'suspend')}>Suspend</button> : <button className="btn ghost small" onClick={() => moderate(u, 'activate')}>Reactivate</button>}
                {me.role === 'admin' && u.status !== 'banned' && <button className="btn ghost small" onClick={() => moderate(u, 'ban')}>Ban</button>}
                {me.role === 'admin' && <button className="btn ghost small" onClick={() => setCredit(u)}>Credits</button>}
              </div>)}</td>
          </tr>))}</tbody>
      </table></div>
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      {credit && <CreditModal user={credit} onClose={() => setCredit(null)} onDone={reload} />}
    </div>
  );
}

function CreditModal({ user, onClose, onDone }) {
  const [amount, setAmount] = useState(5);
  const [reason, setReason] = useState('');
  const toast = useToast();
  const save = async () => {
    try { await api.post(`/admin/users/${user._id}/credits`, { amount: Number(amount), reason }); toast('Credits adjusted'); onDone(); onClose(); } catch (e) { toast(errMsg(e), 'err'); }
  };
  return (
    <Modal title={`Adjust credits for ${user.name}`} onClose={onClose}>
      <p className="muted">Current balance <Coin value={user.credits} />. Use a negative number to deduct.</p>
      <div className="field"><label htmlFor="ca">Amount</label><input id="ca" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <div className="field"><label htmlFor="cr">Reason</label><input id="cr" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <button className="btn" onClick={save}>Apply adjustment</button>
    </Modal>
  );
}

function Reports() {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const { data, reload } = useFetch(`/admin/reports?status=${status}`, [status]);
  const resolve = async (r, action) => {
    const body = { action };
    if (action === 'user_suspended') { const d = window.prompt('Suspend for how many days?', '7'); if (!d) return; body.days = Number(d); }
    body.note = window.prompt('Note for the record (optional)') || undefined;
    try { await api.post(`/admin/reports/${r._id}/resolve`, body); toast('Report handled'); reload(); } catch (e) { toast(errMsg(e), 'err'); }
  };
  const link = (r) => ({ user: `/users/${r.targetId}`, skill: `/skills/${r.targetId}`, post: `/forum/${r.targetId}` }[r.targetType]);
  return (
    <div className="stack">
      <div className="row">{['open', 'resolved', 'dismissed'].map((s) => <button key={s} className={`btn small ${status === s ? '' : 'ghost'}`} onClick={() => setStatus(s)}>{s}</button>)}</div>
      {!data?.items.length ? <Empty>No {status} reports.</Empty> : data.items.map((r) => (
        <div key={r._id} className="card">
          <div className="row between">
            <div className="row"><span className="chip rose">{r.reason}</span><span className="chip">{r.targetType}</span><span className="small muted">reported by {r.reporter?.name} · {fmtDate(r.createdAt)}</span></div>
            {link(r) && <Link className="small" to={link(r)}>Open {r.targetType}</Link>}
          </div>
          <blockquote style={{ margin: '.75rem 0', paddingLeft: '.75rem', borderLeft: '3px solid var(--line)' }}>{r.target.exists ? r.target.preview || <em>(no text)</em> : <em>Content no longer exists</em>}</blockquote>
          {r.details && <p className="small">Reporter says: {r.details}</p>}
          {r.status === 'open' ? (
            <div className="row">
              <button className="btn ghost small" onClick={() => resolve(r, 'dismiss')}>Dismiss</button>
              {r.targetType !== 'user' && <button className="btn ghost small" onClick={() => resolve(r, 'content_removed')}>Remove content</button>}
              <button className="btn ghost small" onClick={() => resolve(r, 'user_warned')}>Warn author</button>
              <button className="btn ghost small" onClick={() => resolve(r, 'user_suspended')}>Suspend author</button>
              <button className="btn danger small" onClick={() => resolve(r, 'user_banned')}>Ban author</button>
            </div>
          ) : <p className="small muted">{r.status} by {r.resolvedBy?.name} · action: {r.action}{r.resolutionNote ? ` · ${r.resolutionNote}` : ''}</p>}
        </div>))}
    </div>
  );
}

function Verifications() {
  const toast = useToast();
  const skills = useFetch('/admin/verifications');
  const tests = useFetch('/admin/assessments');
  const decide = async (s, decision) => {
    const note = window.prompt(decision === 'verified' ? 'Note for the member (optional)' : 'Why is this rejected?') || '';
    try { await api.post(`/admin/verifications/${s._id}`, { decision, note }); toast(`Skill ${decision}`); skills.reload(); } catch (e) { toast(errMsg(e), 'err'); }
  };
  const review = async (a, decision) => { await api.post(`/admin/assessments/${a._id}/review`, { decision }); toast(decision === 'publish' ? 'Published' : 'Returned to author'); tests.reload(); };
  return (
    <div className="grid-2">
      <div className="stack">
        <h2>Skill verification requests</h2>
        {!skills.data?.items.length && <Empty>No pending verifications.</Empty>}
        {skills.data?.items.map((s) => (
          <div key={s._id} className="card">
            <h3><Link to={`/skills/${s._id}`}>{s.title}</Link></h3>
            <p className="small muted">{s.owner?.name} · {s.category} · {s.level}</p>
            <p className="small"><strong>Evidence:</strong> {s.verification.evidence}</p>
            <div className="row"><button className="btn small" onClick={() => decide(s, 'verified')}>Verify</button><button className="btn ghost small" onClick={() => decide(s, 'rejected')}>Reject</button></div>
          </div>))}
      </div>
      <div className="stack">
        <h2>Assessments awaiting review</h2>
        {!tests.data?.items.length && <Empty>Nothing to review.</Empty>}
        {tests.data?.items.map((a) => (
          <div key={a._id} className="card">
            <h3>{a.title}</h3>
            <p className="small muted">{a.skillName} · {a.questions.length} questions · by {a.createdBy?.name}</p>
            <details><summary className="small">Preview questions</summary><ol className="small">{a.questions.map((q) => <li key={q._id}>{q.prompt} — <em>{q.options[q.correctIndex]}</em></li>)}</ol></details>
            <div className="row" style={{ marginTop: '.5rem' }}><button className="btn small" onClick={() => review(a, 'publish')}>Publish</button><button className="btn ghost small" onClick={() => review(a, 'reject')}>Return to author</button></div>
          </div>))}
      </div>
    </div>
  );
}

function Announcements() {
  const { data, reload } = useFetch('/announcements');
  const [f, setF] = useState({ title: '', body: '' });
  const toast = useToast();
  const create = async (e) => { e.preventDefault(); await api.post('/admin/announcements', f); setF({ title: '', body: '' }); toast('Announcement posted'); reload(); };
  return (
    <div className="grid-2">
      <div className="stack">
        {!data?.items.length && <Empty>No active announcements.</Empty>}
        {data?.items.map((a) => <div key={a._id} className="card row between"><div><strong>{a.title}</strong><div className="small muted">{a.body}</div></div><button className="btn ghost small" onClick={async () => { await api.delete(`/admin/announcements/${a._id}`); reload(); }}>Take down</button></div>)}
      </div>
      <form className="card" onSubmit={create}>
        <h3>New announcement</h3>
        <p className="small muted">Shown at the top of every member's dashboard.</p>
        <div className="field"><label htmlFor="an">Title</label><input id="an" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="field"><label htmlFor="ab">Details</label><textarea id="ab" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <button className="btn">Post announcement</button>
      </form>
    </div>
  );
}

function Audit() {
  const [page, setPage] = useState(1);
  const { data } = useFetch(`/admin/audit?page=${page}`, [page]);
  return (
    <div className="card table-wrap">
      <table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
        <tbody>{data?.items.map((l) => <tr key={l._id}><td className="small">{fmtDate(l.createdAt)}</td><td>{l.actor?.name} <span className="small muted">{l.actor?.role}</span></td><td><code>{l.action}</code></td><td className="small">{l.targetType}</td><td className="small muted">{l.meta ? JSON.stringify(l.meta) : ''}</td></tr>)}</tbody></table>
      {data && <Pager page={data.page} pages={Math.ceil(data.total / 30)} onPage={setPage} />}
    </div>
  );
}

export default function Admin() {
  const { user, isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  const [tab, setTab] = useState('overview');
  const tabs = [
    ['overview', 'Analytics'],
    ['users', 'Members'],
    ['reports', 'Reports'],
    ['verify', 'Verification'],
    ['ann', 'Announcements'],
    ['audit', 'Audit log'],
  ];
  return (
    <div>
      <div className="page-head"><div><h1>Admin panel</h1><p className="muted">Signed in as {user.name} ({user.email}).</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'overview' && <Overview />}
      {tab === 'users' && <Users />}
      {tab === 'reports' && <Reports />}
      {tab === 'verify' && <Verifications />}
      {tab === 'ann' && <Announcements />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}
