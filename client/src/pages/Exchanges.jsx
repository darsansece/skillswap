import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Coin, Empty, ErrorBox, Loading, Pager, Tabs, fmtDate, timeAgo, useFetch } from '../components/ui';

const STATUS_CHIP = { pending: 'gold', accepted: 'teal', completed: 'teal', declined: 'rose', cancelled: 'rose' };

export function ExchangeList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') || '';
  const status = params.get('status') || '';
  const page = params.get('page') || 1;
  const { data, loading } = useFetch(`/exchanges?role=${role}&status=${status}&page=${page}&limit=15`, [role, status, page]);
  const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k !== 'page') p.delete('page'); setParams(p); };
  return (
    <div>
      <div className="page-head"><div><h1>Exchanges</h1><p className="muted">Requests you've sent and received, and the sessions inside them.</p></div></div>
      <Tabs value={role} onChange={(v) => set('role', v)} tabs={[['', 'All'], ['learner', "I'm learning"], ['mentor', "I'm teaching"]]} />
      <div className="row" style={{ marginBottom: '1rem' }}>
        {['', 'pending', 'accepted', 'completed', 'declined', 'cancelled'].map((s) => <button key={s} className={`btn small ${status === s ? '' : 'ghost'}`} onClick={() => set('status', s)}>{s || 'Any status'}</button>)}
      </div>
      {loading && !data ? <Loading /> : !data?.items.length ? <Empty>No exchanges here yet. <Link to="/marketplace">Browse the marketplace</Link> to send your first request.</Empty> : (
        <div className="card table-wrap"><table>
          <thead><tr><th>Skill</th><th>With</th><th>Type</th><th>Status</th><th>Sessions</th><th>Updated</th></tr></thead>
          <tbody>{data.items.map((e) => {
            const other = e.requester._id === user._id ? e.provider : e.requester;
            const learning = e.requester._id === user._id;
            return (
              <tr key={e._id}>
                <td><Link to={`/exchanges/${e._id}`}>{e.skill?.title}</Link><div className="small muted">{learning ? 'You are learning' : 'You are teaching'}</div></td>
                <td><span className="row" style={{ flexWrap: 'nowrap' }}><Avatar user={other} />{other.name}</span></td>
                <td>{e.type === 'swap' ? <span className="chip">swap</span> : <span className="small">{e.hoursRequested}h</span>}</td>
                <td><span className={`chip ${STATUS_CHIP[e.status]}`}>{e.status}</span></td>
                <td>{e.sessions.filter((s) => s.status === 'completed').length}/{e.sessions.filter((s) => s.status !== 'cancelled').length}</td>
                <td className="small muted">{timeAgo(e.updatedAt)}</td>
              </tr>);
          })}</tbody></table></div>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={(p) => set('page', String(p))} />}
    </div>
  );
}

function ScheduleForm({ ex, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ startTime: '', durationMinutes: 60, meetingLink: '', agenda: '', teacher: ex.provider._id });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/exchanges/${ex._id}/sessions`, { ...f, startTime: new Date(f.startTime).toISOString(), durationMinutes: Number(f.durationMinutes) });
      toast('Session scheduled'); onDone(data.exchange); setF({ ...f, startTime: '', agenda: '' });
    } catch (x) { toast(errMsg(x), 'err'); }
  };
  return (
    <form onSubmit={submit} className="card flat">
      <h3>Schedule a session</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        <div className="field"><label htmlFor="st">Date and time</label><input id="st" type="datetime-local" required value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></div>
        <div className="field"><label htmlFor="du">Length</label><select id="du" value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: e.target.value })}>{[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></div>
        <div className="field"><label htmlFor="ml">Meeting link or place</label><input id="ml" value={f.meetingLink} onChange={(e) => setF({ ...f, meetingLink: e.target.value })} placeholder="https://meet…" /></div>
        {ex.type === 'swap' && <div className="field"><label htmlFor="te">Who teaches</label><select id="te" value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })}><option value={ex.provider._id}>{ex.provider.name} ({ex.skill.title})</option><option value={ex.requester._id}>{ex.requester.name} ({ex.offeredSkill?.title})</option></select></div>}
      </div>
      <div className="field"><label htmlFor="ag">Agenda</label><input id="ag" value={f.agenda} onChange={(e) => setF({ ...f, agenda: e.target.value })} placeholder="What will you cover?" /></div>
      <button className="btn">Schedule session</button>
    </form>
  );
}

function SharedNotes({ ex }) {
  const { socket } = useSocket();
  const [notes, setNotes] = useState(ex.sharedNotes || '');
  const [state, setState] = useState('Saved');
  const timer = useRef();
  useEffect(() => {
    if (!socket) return undefined;
    const h = (p) => { if (p.exchangeId === ex._id) setNotes(p.notes); };
    socket.on('notes:update', h);
    return () => socket.off('notes:update', h);
  }, [socket, ex._id]);
  const change = (v) => {
    setNotes(v); setState('Saving…');
    socket?.emit('notes:edit', { exchangeId: ex._id, notes: v });
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => { await api.put(`/exchanges/${ex._id}/notes`, { notes: v }); setState('Saved'); }, 800);
  };
  return (
    <div className="card">
      <div className="row between"><h3 style={{ margin: 0 }}>Shared notes</h3><span className="small muted">{state} · both of you can edit live</span></div>
      <textarea className="notes" aria-label="Shared notes" value={notes} onChange={(e) => change(e.target.value)} placeholder="Agenda, homework, links, things to remember…" style={{ marginTop: '.75rem' }} />
    </div>
  );
}

export function ExchangeDetail() {
  const { id } = useParams();
  const { user, refreshMe } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, setData } = useFetch(`/exchanges/${id}`, [id]);
  const [review, setReview] = useState({ rating: 5, comment: '' });
  const [res, setRes] = useState({ title: '', url: '' });
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const ex = data.exchange;
  const isMentor = ex.provider._id === user._id;
  const other = isMentor ? ex.requester : ex.provider;
  const update = (exchange) => setData({ exchange });
  const act = async (url, body, msg) => {
    try { const { data: d } = await api.post(url, body); if (d.exchange) update(d.exchange); toast(msg); refreshMe(); } catch (x) { toast(errMsg(x), 'err'); }
  };
  const sessionAct = async (sid, body, msg) => {
    try { const { data: d } = await api.put(`/exchanges/${ex._id}/sessions/${sid}`, body); update(d.exchange); toast(msg); } catch (x) { toast(errMsg(x), 'err'); }
  };
  const openChat = async () => { const r = await api.post('/conversations', { userId: other._id }); navigate(`/messages/${r.data.conversation._id}`); };
  const hasCompleted = ex.sessions.some((s) => s.status === 'completed');
  const reviewed = ex.reviewedBy.includes(user._id);
  const submitReview = async (e) => {
    e.preventDefault();
    try { await api.post(`/exchanges/${ex._id}/review`, review); toast('Review posted'); update({ ...ex, reviewedBy: [...ex.reviewedBy, user._id] }); } catch (x) { toast(errMsg(x), 'err'); }
  };
  const addResource = async (e) => {
    e.preventDefault();
    try { const { data: d } = await api.post(`/exchanges/${ex._id}/resources`, res); update({ ...ex, resources: d.resources }); setRes({ title: '', url: '' }); } catch (x) { toast(errMsg(x), 'err'); }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="row"><span className={`chip ${STATUS_CHIP[ex.status]}`}>{ex.status}</span><span className="chip">{ex.type === 'swap' ? 'Skill swap' : `${ex.hoursRequested} hours with credits`}</span></div>
          <h1 style={{ marginTop: '.5rem' }}><Link to={`/skills/${ex.skill._id}`} style={{ color: 'inherit' }}>{ex.skill.title}</Link></h1>
          <p className="muted">{isMentor ? `You're teaching ${other.name}` : `You're learning from ${other.name}`}{ex.type === 'swap' && ex.offeredSkill ? ` in exchange for ${ex.offeredSkill.title}` : ''}</p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={openChat}>Message {other.name.split(' ')[0]}</button>
          {['pending', 'accepted'].includes(ex.status) && <button className="btn ghost" onClick={() => window.confirm('Cancel this exchange? Held credits are refunded.') && act(`/exchanges/${ex._id}/cancel`, {}, 'Exchange cancelled')}>Cancel exchange</button>}
          {ex.status === 'accepted' && hasCompleted && <button className="btn" onClick={() => act(`/exchanges/${ex._id}/complete`, {}, 'Exchange completed')}>Mark complete</button>}
        </div>
      </div>

      {ex.message && <div className="card flat"><strong>{ex.requester.name}:</strong> {ex.message}</div>}
      {ex.responseNote && <div className="card flat small muted">Note: {ex.responseNote}</div>}

      {ex.status === 'pending' && isMentor && (
        <div className="card row between">
          <span>{ex.requester.name} wants to learn this{ex.type === 'credit' ? <> for <Coin value={Math.ceil(ex.hoursRequested * ex.skill.creditsPerHour)} /></> : ' as a swap'}.</span>
          <div className="row"><button className="btn ghost" onClick={() => act(`/exchanges/${ex._id}/respond`, { action: 'decline' }, 'Request declined')}>Decline</button><button className="btn" onClick={() => act(`/exchanges/${ex._id}/respond`, { action: 'accept' }, 'Request accepted')}>Accept</button></div>
        </div>
      )}
      {ex.status === 'pending' && !isMentor && <div className="card flat">Waiting for {ex.provider.name} to respond.</div>}
      {ex.type === 'credit' && ex.escrowCredits > 0 && <p className="small muted"><Coin value={ex.escrowCredits} /> held for remaining sessions. Unused credits return to the learner when the exchange ends.</p>}

      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <h3>Sessions</h3>
            {!ex.sessions.length && <p className="muted small">No sessions yet.</p>}
            {ex.sessions.map((s) => {
              const started = new Date(s.startTime) <= new Date();
              const iConfirmed = s.confirmedBy.includes(user._id);
              return (
                <div key={s._id} style={{ padding: '.75rem 0', borderBottom: '1px solid var(--line)' }}>
                  <div className="row between">
                    <div><strong>{fmtDate(s.startTime)}</strong> · {s.durationMinutes} min <span className={`chip ${s.status === 'completed' ? 'teal' : s.status === 'cancelled' ? 'rose' : ''}`}>{s.status}</span>
                      {s.creditsCharged > 0 && <span className="small muted"> · <Coin value={s.creditsCharged} /> paid</span>}
                      {s.agenda && <div className="small muted">{s.agenda}</div>}
                      {s.meetingLink && <div className="small"><a href={s.meetingLink} target="_blank" rel="noreferrer">{s.meetingLink}</a></div>}
                    </div>
                    {s.status === 'scheduled' && ex.status === 'accepted' && (
                      <div className="row">
                        {started ? (iConfirmed ? <span className="small muted">Waiting for {other.name.split(' ')[0]} to confirm</span>
                          : <button className="btn small" onClick={() => act(`/exchanges/${ex._id}/sessions/${s._id}/confirm`, {}, 'Session confirmed')}>Confirm it happened</button>)
                          : <button className="btn ghost small" onClick={() => sessionAct(s._id, { status: 'cancelled' }, 'Session cancelled')}>Cancel</button>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {ex.status === 'accepted' && <ScheduleForm ex={ex} onDone={update} />}
          {['accepted', 'completed'].includes(ex.status) && <SharedNotes ex={ex} />}
        </div>
        <div className="stack">
          <div className="card">
            <h3>Resources</h3>
            {ex.resources.map((r) => <div key={r._id} className="small" style={{ marginBottom: '.3rem' }}><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> <span className="muted">· {r.addedBy?.name}</span></div>)}
            {!ex.resources.length && <p className="small muted">Share links, docs and exercises here.</p>}
            {ex.status === 'accepted' && (
              <form onSubmit={addResource} className="stack" style={{ marginTop: '.5rem' }}>
                <input aria-label="Resource title" placeholder="Title" required value={res.title} onChange={(e) => setRes({ ...res, title: e.target.value })} />
                <input aria-label="Resource URL" placeholder="https://…" type="url" required value={res.url} onChange={(e) => setRes({ ...res, url: e.target.value })} />
                <button className="btn ghost small">Add resource</button>
              </form>
            )}
          </div>
          {hasCompleted && (
            <div className="card">
              <h3>Review {other.name.split(' ')[0]}</h3>
              {reviewed ? <p className="small muted">Thanks, your review is posted.</p> : (
                <form onSubmit={submitReview}>
                  <div className="field"><label htmlFor="rt">Rating</label><select id="rt" value={review.rating} onChange={(e) => setReview({ ...review, rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}</select></div>
                  <div className="field"><label htmlFor="rc">Comment</label><textarea id="rc" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} /></div>
                  <button className="btn">Post review</button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
