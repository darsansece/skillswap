import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Coin, Empty, ErrorBox, Loading, Pager, Tabs, fmtDate, timeAgo, useFetch } from '../components/ui';

const STATUS_CHIP = { pending: 'gold', accepted: 'teal', completed: 'teal', declined: 'rose', cancelled: 'rose' };

export function ExchangeList() {
  const { user, refreshMe } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') ?? 'incoming';
  const status = params.get('status') || '';
  const page = params.get('page') || 1;
  const { data, loading, reload } = useFetch(`/exchanges?role=${role}&status=${status}&page=${page}&limit=15`, [role, status, page]);

  const set = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    if (k !== 'page') p.delete('page');
    setParams(p);
  };

  const openChat = async (targetUser) => {
    try {
      const targetId = targetUser?._id || targetUser;
      const { data: d } = await api.post('/conversations', { userId: targetId });
      navigate(`/messages/${d.conversation._id}`);
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  };

  const respondRequest = async (e, exId, action) => {
    e.stopPropagation();
    try {
      await api.post(`/exchanges/${exId}/respond`, { action });
      toast(action === 'accept' ? 'Request accepted! Opening workspace…' : 'Request declined');
      refreshMe();
      if (action === 'accept') {
        navigate(`/exchanges/${exId}`);
      } else {
        reload();
      }
    } catch (x) {
      toast(errMsg(x), 'err');
    }
  };

  const cancelRequest = async (e, exId) => {
    e.stopPropagation();
    if (!window.confirm('Cancel this request? Held credits will be refunded.')) return;
    try {
      await api.post(`/exchanges/${exId}/cancel`, {});
      toast('Request cancelled');
      reload();
      refreshMe();
    } catch (x) {
      toast(errMsg(x), 'err');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Exchanges & Requests</h1>
          <p className="muted">Manage mentorship requests, approve incoming learners, track active sessions, and chat directly.</p>
        </div>
      </div>

      <Tabs
        value={role}
        onChange={(v) => set('role', v)}
        tabs={[
          ['incoming', 'Incoming Requests (Teaching)'],
          ['outgoing', 'Sent Requests (Learning)'],
          ['active', 'Active Exchanges'],
          ['completed', 'Completed'],
          ['', 'All Exchanges'],
        ]}
      />

      <div className="row" style={{ marginBottom: '1.25rem', gap: '.4rem', flexWrap: 'wrap' }}>
        {['', 'pending', 'accepted', 'completed', 'declined', 'cancelled'].map((s) => (
          <button
            key={s}
            className={`btn small ${status === s ? '' : 'ghost'}`}
            onClick={() => set('status', s)}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Any status'}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty>
          {role === 'incoming'
            ? 'No incoming requests waiting for your approval.'
            : role === 'outgoing'
            ? 'You have not sent any pending requests. Browse the marketplace to find mentors!'
            : role === 'active'
            ? 'No active ongoing exchanges right now.'
            : 'No exchanges found.'}
          <div style={{ marginTop: '1rem' }}>
            <Link to="/marketplace" className="btn small">Browse Marketplace</Link>
          </div>
        </Empty>
      ) : (
        <div className="stack" style={{ gap: '1rem' }}>
          {data.items.map((e) => {
            const isMentor = Boolean(user && e.provider && String(e.provider._id || e.provider) === String(user._id || user.id));
            const mentee = e.requester;
            const mentor = e.provider;
            const other = isMentor ? mentee : mentor;

            return (
              <div key={e._id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div className="row" style={{ gap: '.5rem', marginBottom: '.35rem' }}>
                      <span className={`chip ${STATUS_CHIP[e.status]}`}>{e.status}</span>
                      <span className="chip">{e.type === 'swap' ? 'Skill swap' : `${e.hoursRequested}h with credits`}</span>
                      <span className="small muted">
                        {isMentor ? 'Teaching: ' : 'Learning: '}
                        <strong>{e.skill?.title}</strong>
                      </span>
                    </div>
                    <h3 style={{ margin: 0 }}>
                      <Link to={`/exchanges/${e._id}`} style={{ color: 'inherit' }}>
                        {e.skill?.title}
                      </Link>
                    </h3>
                  </div>

                  <div className="row" style={{ gap: '.4rem' }}>
                    <button className="btn ghost small" onClick={() => openChat(other)}>
                      Chat with {other?.name ? other.name.split(' ')[0] : 'User'}
                    </button>
                    <Link to={`/exchanges/${e._id}`} className="btn small ghost">
                      View Details
                    </Link>
                  </div>
                </div>

                <div className="grid-2" style={{ background: 'var(--surface-2)', padding: '.75rem 1rem', borderRadius: 'var(--radius-s)' }}>
                  <div className="row" style={{ gap: '.75rem' }}>
                    <Avatar user={mentee} />
                    <div>
                      <div className="small muted">Mentee (Learner)</div>
                      <strong>{mentee?.name}</strong>
                      {mentee?.level && <span className="small muted"> · Lv {mentee.level}</span>}
                    </div>
                  </div>

                  <div className="row" style={{ gap: '.75rem' }}>
                    <Avatar user={mentor} />
                    <div>
                      <div className="small muted">Mentor (Teacher)</div>
                      <strong>{mentor?.name}</strong>
                      {mentor?.level && <span className="small muted"> · Lv {mentor.level}</span>}
                    </div>
                  </div>
                </div>

                {e.message && (
                  <div className="small" style={{ paddingLeft: '.75rem', borderLeft: '3px solid var(--teal)' }}>
                    <strong>Message from {mentee?.name}:</strong> {e.message}
                  </div>
                )}

                {e.status === 'pending' && isMentor && (
                  <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: '.6rem' }}>
                    <span className="small muted">
                      {mentee?.name} is waiting for your approval to start learning.
                    </span>
                    <div className="row" style={{ gap: '.5rem' }}>
                      <button className="btn ghost small" onClick={(ev) => respondRequest(ev, e._id, 'decline')}>
                        Decline
                      </button>
                      <button className="btn small" onClick={(ev) => respondRequest(ev, e._id, 'accept')}>
                        Accept Request
                      </button>
                    </div>
                  </div>
                )}

                {e.status === 'pending' && !isMentor && (
                  <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: '.6rem' }}>
                    <span className="small muted">
                      Sent to {mentor?.name}. Waiting for mentor approval.
                    </span>
                    <button className="btn ghost small" onClick={(ev) => cancelRequest(ev, e._id)}>
                      Cancel Request
                    </button>
                  </div>
                )}

                {e.status === 'accepted' && (
                  <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: '.6rem' }}>
                    <span className="small muted">
                      {e.sessions?.filter((s) => s.status === 'completed').length || 0} / {e.sessions?.length || 0} sessions completed
                    </span>
                    <Link to={`/exchanges/${e._id}`} className="btn small">
                      Schedule / Manage Sessions
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
      const { data } = await api.post(`/exchanges/${ex._id}/sessions`, {
        ...f,
        startTime: new Date(f.startTime).toISOString(),
        durationMinutes: Number(f.durationMinutes),
      });
      toast('Session scheduled');
      onDone(data.exchange);
      setF({ ...f, startTime: '', agenda: '' });
    } catch (x) {
      toast(errMsg(x), 'err');
    }
  };
  return (
    <form onSubmit={submit} className="card flat">
      <h3>Schedule a session</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        <div className="field">
          <label htmlFor="st">Date and time</label>
          <input id="st" type="datetime-local" required value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="du">Length</label>
          <select id="du" value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: e.target.value })}>
            {[30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ml">Meeting link or place</label>
          <input id="ml" value={f.meetingLink} onChange={(e) => setF({ ...f, meetingLink: e.target.value })} placeholder="https://meet…" />
        </div>
        {ex.type === 'swap' && (
          <div className="field">
            <label htmlFor="te">Who teaches</label>
            <select id="te" value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })}>
              <option value={ex.provider._id}>{ex.provider.name} ({ex.skill.title})</option>
              <option value={ex.requester._id}>{ex.requester.name} ({ex.offeredSkill?.title})</option>
            </select>
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="ag">Agenda</label>
        <input id="ag" value={f.agenda} onChange={(e) => setF({ ...f, agenda: e.target.value })} placeholder="What will you cover?" />
      </div>
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
    setNotes(v);
    setState('Saving…');
    socket?.emit('notes:edit', { exchangeId: ex._id, notes: v });
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await api.put(`/exchanges/${ex._id}/notes`, { notes: v });
      setState('Saved');
    }, 800);
  };
  return (
    <div className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>Shared notes</h3>
        <span className="small muted">{state} · both of you can edit live</span>
      </div>
      <textarea
        className="notes"
        aria-label="Shared notes"
        value={notes}
        onChange={(e) => change(e.target.value)}
        placeholder="Agenda, homework, links, things to remember…"
        style={{ marginTop: '.75rem' }}
      />
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
  const isMentor = Boolean(user && ex.provider && String(ex.provider._id || ex.provider) === String(user._id || user.id));
  const isLearner = Boolean(user && ex.requester && String(ex.requester._id || ex.requester) === String(user._id || user.id));
  const mentor = ex.provider;
  const mentee = ex.requester;
  const other = isMentor ? mentee : mentor;

  const update = (exchange) => setData({ exchange });

  const act = async (url, body, msg) => {
    try {
      const { data: d } = await api.post(url, body);
      if (d.exchange) update(d.exchange);
      toast(msg);
      refreshMe();
    } catch (x) {
      toast(errMsg(x), 'err');
    }
  };

  const sessionAct = async (sid, body, msg) => {
    try {
      const { data: d } = await api.put(`/exchanges/${ex._id}/sessions/${sid}`, body);
      update(d.exchange);
      toast(msg);
    } catch (x) {
      toast(errMsg(x), 'err');
    }
  };

  const startImmediateSession = async () => {
    try {
      const now = new Date();
      const { data: d } = await api.post(`/exchanges/${ex._id}/sessions`, {
        startTime: now.toISOString(),
        durationMinutes: 60,
        meetingLink: `https://meet.skillswap.dev/session-${ex._id.slice(-6)}`,
        agenda: `Live 1-on-1 Lesson: ${ex.skill?.title}`,
      });
      toast('Live teaching session started!');
      update(d.exchange);
    } catch (x) {
      toast(errMsg(x), 'err');
    }
  };

  const openChat = async (targetUser) => {
    try {
      const targetId = (targetUser || other)?._id || (targetUser || other);
      const r = await api.post('/conversations', { userId: targetId });
      navigate(`/messages/${r.data.conversation._id}`);
    } catch (x) {
      toast(errMsg(x), 'err');
    }
  };

  const hasCompleted = ex.sessions?.some((s) => s.status === 'completed');
  const reviewed = ex.reviewedBy?.includes(user._id);

  const submitReview = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/exchanges/${ex._id}/review`, review);
      toast('Review posted');
      update({ ...ex, reviewedBy: [...(ex.reviewedBy || []), user._id] });
    } catch (x) {
      toast(errMsg(x), 'err');
    }
  };

  const addResource = async (e) => {
    e.preventDefault();
    try {
      const { data: d } = await api.post(`/exchanges/${ex._id}/resources`, res);
      update({ ...ex, resources: d.resources });
      setRes({ title: '', url: '' });
    } catch (x) {
      toast(errMsg(x), 'err');
    }
  };

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: '.5rem', marginBottom: '.4rem' }}>
            <span className={`chip ${STATUS_CHIP[ex.status]}`}>{ex.status.toUpperCase()}</span>
            <span className="chip">{ex.type === 'swap' ? 'Skill swap' : `${ex.hoursRequested}h with credits`}</span>
            <span className={`chip ${isMentor ? 'teal' : 'gold'}`}>
              {isMentor ? 'You are the Mentor (Teaching)' : 'You are the Mentee (Learning)'}
            </span>
          </div>
          <h1 style={{ marginTop: '.25rem' }}>
            <Link to={`/skills/${ex.skill._id}`} style={{ color: 'inherit' }}>
              {ex.skill.title}
            </Link>
          </h1>
          <p className="muted">
            {isMentor ? `Teaching ${mentee?.name}` : `Learning from ${mentor?.name}`}
            {ex.type === 'swap' && ex.offeredSkill ? ` in exchange for ${ex.offeredSkill.title}` : ''}
          </p>
        </div>

        <div className="row" style={{ gap: '.5rem' }}>
          <button className="btn" onClick={() => openChat(other)}>
            Chat with {other?.name?.split(' ')[0] || 'Partner'}
          </button>
          {['pending', 'accepted'].includes(ex.status) && (
            <button
              className="btn ghost"
              onClick={() => window.confirm('Cancel this exchange? Held credits are refunded.') && act(`/exchanges/${ex._id}/cancel`, {}, 'Exchange cancelled')}
            >
              Cancel exchange
            </button>
          )}
          {ex.status === 'accepted' && hasCompleted && (
            <button className="btn" onClick={() => act(`/exchanges/${ex._id}/complete`, {}, 'Exchange completed')}>
              Mark complete
            </button>
          )}
        </div>
      </div>

      {/* Pending status actions */}
      {ex.status === 'pending' && isMentor && (
        <div className="card" style={{ borderLeft: '4px solid var(--teal)', background: 'var(--surface)' }}>
          <div className="row between" style={{ alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: '0 0 .3rem 0' }}>Request received from {mentee?.name}</h3>
              <p className="small muted" style={{ margin: 0 }}>
                {mentee?.name} wants to book {ex.hoursRequested} hour{ex.hoursRequested > 1 ? 's' : ''}
                {ex.type === 'credit' ? <> for <Coin value={Math.ceil(ex.hoursRequested * (ex.skill.creditsPerHour || 0))} /></> : ' as a direct skill swap'}.
              </p>
              {ex.message && (
                <div style={{ marginTop: '.6rem', padding: '.5rem .75rem', background: 'var(--surface-2)', borderRadius: 6, fontStyle: 'italic' }}>
                  "{ex.message}"
                </div>
              )}
            </div>
            <div className="row" style={{ gap: '.5rem', marginTop: '.5rem' }}>
              <button className="btn ghost" onClick={() => act(`/exchanges/${ex._id}/respond`, { action: 'decline' }, 'Request declined')}>
                Decline
              </button>
              <button className="btn" onClick={() => act(`/exchanges/${ex._id}/respond`, { action: 'accept' }, 'Request accepted!')}>
                Accept Request
              </button>
            </div>
          </div>
        </div>
      )}

      {ex.status === 'pending' && isLearner && (
        <div className="card" style={{ borderLeft: '4px solid var(--gold)', background: 'var(--surface)' }}>
          <div className="row between" style={{ alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: '0 0 .3rem 0' }}>Waiting for mentor approval</h3>
              <p className="small muted" style={{ margin: 0 }}>
                Your request has been sent to <strong>{mentor?.name}</strong>. Held credits will be transferred to escrow when accepted.
              </p>
            </div>
            <button className="btn ghost small" onClick={() => openChat(mentor)}>
              Message {mentor?.name?.split(' ')[0]}
            </button>
          </div>
        </div>
      )}

      {ex.responseNote && (
        <div className="card flat small muted">
          <strong>Mentor note:</strong> {ex.responseNote}
        </div>
      )}

      {/* Mentor and Mentee details side-by-side */}
      <div className="grid-2">
        <div className="card">
          <div className="row between" style={{ marginBottom: '.5rem' }}>
            <span className="chip teal">Mentor (Instructor)</span>
            <button className="btn link small" onClick={() => openChat(mentor)}>
              Chat
            </button>
          </div>
          <div className="row" style={{ gap: '.75rem', alignItems: 'center' }}>
            <Avatar user={mentor} size="lg" />
            <div>
              <h3 style={{ margin: 0 }}>
                <Link to={`/users/${mentor?._id}`} style={{ color: 'inherit' }}>
                  {mentor?.name}
                </Link>
              </h3>
              <div className="small muted">{mentor?.email}</div>
              <div className="small muted">{mentor?.headline || 'Mentor'}</div>
            </div>
          </div>
          <div className="row small muted" style={{ marginTop: '.75rem', gap: '1rem' }}>
            <span>Level {mentor?.level || 1}</span>
            <span>{mentor?.stats?.sessionsTaught || 0} sessions taught</span>
            {mentor?.location && <span>Based in {mentor.location}</span>}
          </div>
          {mentor?.languages?.length > 0 && (
            <div className="small muted" style={{ marginTop: '.25rem' }}>
              Speaks: {mentor.languages.join(', ')}
            </div>
          )}
        </div>

        <div className="card">
          <div className="row between" style={{ marginBottom: '.5rem' }}>
            <span className="chip gold">Mentee (Student)</span>
            <button className="btn link small" onClick={() => openChat(mentee)}>
              Chat
            </button>
          </div>
          <div className="row" style={{ gap: '.75rem', alignItems: 'center' }}>
            <Avatar user={mentee} size="lg" />
            <div>
              <h3 style={{ margin: 0 }}>
                <Link to={`/users/${mentee?._id}`} style={{ color: 'inherit' }}>
                  {mentee?.name}
                </Link>
              </h3>
              <div className="small muted">{mentee?.email}</div>
              <div className="small muted">{mentee?.headline || 'Community Member'}</div>
            </div>
          </div>
          <div className="row small muted" style={{ marginTop: '.75rem', gap: '1rem' }}>
            <span>Level {mentee?.level || 1}</span>
            <span>{mentee?.stats?.sessionsLearned || 0} sessions learned</span>
            {mentee?.location && <span>Based in {mentee.location}</span>}
          </div>
          {mentee?.languages?.length > 0 && (
            <div className="small muted" style={{ marginTop: '.25rem' }}>
              Speaks: {mentee.languages.join(', ')}
            </div>
          )}
        </div>
      </div>

      {ex.type === 'credit' && ex.escrowCredits > 0 && (
        <p className="small muted">
          <Coin value={ex.escrowCredits} /> held in escrow. Unused credits return to the learner when the exchange ends.
        </p>
      )}

      {/* Sessions and live collaboration */}
      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <div className="row between" style={{ alignItems: 'center', marginBottom: '.6rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Teaching & Learning Sessions</h3>
                {ex.status === 'accepted' && (
                  <span className="small muted">Confirm session after it ends to release credits to mentor</span>
                )}
              </div>
              {ex.status === 'accepted' && (
                <button className="btn small" onClick={startImmediateSession}>
                  ▶ Start Live Session Now
                </button>
              )}
            </div>
            {!ex.sessions?.length && (
              <p className="muted small" style={{ marginTop: '.75rem' }}>
                No sessions scheduled yet. Click "Start Live Session Now" or use the form below to plan a session.
              </p>
            )}
            {ex.sessions?.map((s) => {
              const started = new Date(s.startTime) <= new Date();
              const iConfirmed = s.confirmedBy?.includes(user._id);
              return (
                <div key={s._id} style={{ padding: '.75rem 0', borderBottom: '1px solid var(--line)' }}>
                  <div className="row between">
                    <div>
                      <strong>{fmtDate(s.startTime)}</strong> · {s.durationMinutes} min{' '}
                      <span className={`chip ${s.status === 'completed' ? 'teal' : s.status === 'cancelled' ? 'rose' : ''}`}>
                        {s.status}
                      </span>
                      {s.creditsCharged > 0 && (
                        <span className="small muted"> · <Coin value={s.creditsCharged} /> paid</span>
                      )}
                      {s.agenda && <div className="small muted">{s.agenda}</div>}
                      {s.meetingLink && (
                        <div style={{ marginTop: '.35rem' }}>
                          <a href={s.meetingLink} target="_blank" rel="noreferrer" className="btn small ghost" style={{ textDecoration: 'none' }}>
                            📹 Join Live Video Room
                          </a>
                        </div>
                      )}
                    </div>
                    {s.status === 'scheduled' && ex.status === 'accepted' && (
                      <div className="row">
                        {started ? (
                          iConfirmed ? (
                            <span className="small muted">Waiting for {other?.name?.split(' ')[0]} to confirm</span>
                          ) : (
                            <button className="btn small" onClick={() => act(`/exchanges/${ex._id}/sessions/${s._id}/confirm`, {}, 'Session confirmed')}>
                              Confirm it happened
                            </button>
                          )
                        ) : (
                          <button className="btn ghost small" onClick={() => sessionAct(s._id, { status: 'cancelled' }, 'Session cancelled')}>
                            Cancel
                          </button>
                        )}
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
            <h3>Shared Resources</h3>
            {ex.resources?.map((r) => (
              <div key={r._id} className="small" style={{ marginBottom: '.35rem' }}>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.title}
                </a>{' '}
                <span className="muted">· added by {r.addedBy?.name}</span>
              </div>
            ))}
            {!ex.resources?.length && (
              <p className="small muted">Share links, course docs and exercises here.</p>
            )}
            {ex.status === 'accepted' && (
              <form onSubmit={addResource} className="stack" style={{ marginTop: '.75rem' }}>
                <input
                  aria-label="Resource title"
                  placeholder="Resource Title (e.g. Pandas Cheatsheet)"
                  required
                  value={res.title}
                  onChange={(e) => setRes({ ...res, title: e.target.value })}
                />
                <input
                  aria-label="Resource URL"
                  placeholder="https://…"
                  type="url"
                  required
                  value={res.url}
                  onChange={(e) => setRes({ ...res, url: e.target.value })}
                />
                <button className="btn ghost small">Add resource</button>
              </form>
            )}
          </div>

          {hasCompleted && (
            <div className="card">
              <h3>Review {other?.name?.split(' ')[0]}</h3>
              {reviewed ? (
                <p className="small muted">Thanks, your review has been posted.</p>
              ) : (
                <form onSubmit={submitReview}>
                  <div className="field">
                    <label htmlFor="rt">Rating</label>
                    <select id="rt" value={review.rating} onChange={(e) => setReview({ ...review, rating: Number(e.target.value) })}>
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>{'★'.repeat(n)} ({n} stars)</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="rc">Feedback</label>
                    <textarea id="rc" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} placeholder="How was the session?" />
                  </div>
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
