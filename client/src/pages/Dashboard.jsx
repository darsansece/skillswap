import { Link } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Coin, Empty, fmtDate, useFetch } from '../components/ui';
import { LineChart } from '../components/Charts';
import SkillCard from './SkillCard';

export default function Dashboard() {
  const { user } = useAuth();
  const stats = useFetch('/analytics/me?days=30');
  const upcoming = useFetch('/exchanges/upcoming');
  const recs = useFetch('/ai/recommendations');
  const incoming = useFetch('/exchanges?role=incoming&status=pending&limit=5');
  const outgoing = useFetch('/exchanges?role=outgoing&status=pending&limit=5');
  const ann = useFetch('/announcements');
  const s = stats.data?.summary;

  const toast = useToast();
  const quickRespond = async (e, exId, action) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.post(`/exchanges/${exId}/respond`, { action });
      toast(action === 'accept' ? 'Request accepted!' : 'Request declined');
      incoming.reload();
      stats.reload();
    } catch (x) {
      toast(errMsg(x), 'err');
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Hello, {user.name.split(' ')[0]}</h1><p className="muted">Here's what's happening with your trades.</p></div>
        <div className="row"><Link className="btn ghost" to="/skills/new">List a skill</Link><Link className="btn" to="/marketplace">Find a mentor</Link></div>
      </div>

      {ann.data?.items?.map((a) => (
        <div key={a._id} className="card flat" style={{ borderLeft: '4px solid var(--gold)' }}><strong>{a.title}</strong>{a.body && <span className="muted"> — {a.body}</span>}</div>
      ))}

      {!user.skillsWanted?.length && (
        <div className="card flat" style={{ background: 'var(--teal-tint)' }}>
          <strong>Tell us what you want to learn.</strong> Add a few skills to your profile and we'll match you with mentors and swap partners. <Link to="/profile">Edit profile</Link>
        </div>
      )}

      {s && (
        <div className="stats">
          <div className="card stat"><div className="v"><Coin value={s.credits} /></div><div className="l">Available credits{s.heldCredits ? ` · ${s.heldCredits} held` : ''}</div></div>
          <div className="card stat"><div className="v">{s.sessionsTaught}</div><div className="l">Sessions taught ({s.hoursTaught}h)</div></div>
          <div className="card stat"><div className="v">{s.sessionsLearned}</div><div className="l">Sessions learned ({s.hoursLearned}h)</div></div>
          <div className="card stat"><div className="v">{s.rating || '—'}</div><div className="l">Your rating</div></div>
          <div className="card stat"><div className="v">Lv {s.level}</div><div className="l">{s.points} points · {s.loginStreak}-day streak</div></div>
          <div className="card stat"><div className="v">{s.certificates}</div><div className="l">Certificates</div></div>
        </div>
      )}

      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <h3>Credits in the last 30 days</h3>
            {stats.data && <LineChart series={[{ name: 'Earned', color: 'var(--teal)', data: stats.data.creditsFlow.earned }, { name: 'Spent', color: 'var(--gold)', data: stats.data.creditsFlow.spent }]} />}
          </div>
          <div>
            <div className="row between"><h2>Recommended for you</h2><Link to="/assistant" className="small">Ask the assistant</Link></div>
            {recs.data?.skills?.length ? (
              <div className="grid">{recs.data.skills.slice(0, 4).map((r) => <SkillCard key={r.skill._id} skill={r.skill} reason={r.reasons[0]} />)}</div>
            ) : <Empty>Add skills you want to learn to get personalised matches.</Empty>}
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h3>Upcoming sessions</h3>
            {!upcoming.data?.items?.length && <p className="muted small">No sessions scheduled.</p>}
            {upcoming.data?.items?.slice(0, 5).map((ss) => (
              <Link key={ss._id} to={`/exchanges/${ss.exchangeId}`} className="list-link">
                <Avatar user={ss.with} />
                <div><div style={{ fontWeight: 600 }}>{ss.skill?.title}</div><div className="small muted">{fmtDate(ss.startTime)} · {ss.durationMinutes} min with {ss.with?.name}</div></div>
              </Link>
            ))}
          </div>
          <div className="card">
            <div className="row between">
              <h3 style={{ margin: 0 }}>Incoming Requests (Teaching)</h3>
              <Link to="/exchanges?role=incoming" className="small">View all</Link>
            </div>
            {!incoming.data?.items?.length ? (
              <p className="muted small" style={{ marginTop: '.5rem' }}>No incoming requests waiting for your approval.</p>
            ) : (
              <div className="stack" style={{ marginTop: '.75rem', gap: '.6rem' }}>
                {incoming.data.items.map((e) => (
                  <div key={e._id} className="card flat" style={{ padding: '.65rem', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    <div className="row between">
                      <div className="row" style={{ gap: '.5rem' }}>
                        <Avatar user={e.requester} />
                        <div>
                          <strong>{e.requester?.name}</strong>
                          <div className="small muted">{e.type === 'swap' ? 'Swap' : `${e.hoursRequested}h`} · {e.skill?.title}</div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: '.3rem' }}>
                        <button className="btn ghost small" onClick={(ev) => quickRespond(ev, e._id, 'decline')}>
                          Decline
                        </button>
                        <button className="btn small" onClick={(ev) => quickRespond(ev, e._id, 'accept')}>
                          Accept
                        </button>
                      </div>
                    </div>
                    {e.message && <div className="small muted" style={{ fontStyle: 'italic', paddingLeft: '.5rem' }}>"{e.message}"</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="row between">
              <h3 style={{ margin: 0 }}>Sent Requests (Learning)</h3>
              <Link to="/exchanges?role=outgoing" className="small">View all</Link>
            </div>
            {!outgoing.data?.items?.length ? (
              <p className="muted small" style={{ marginTop: '.5rem' }}>No pending requests sent.</p>
            ) : (
              <div className="stack" style={{ marginTop: '.75rem', gap: '.6rem' }}>
                {outgoing.data.items.map((e) => (
                  <Link key={e._id} to={`/exchanges/${e._id}`} className="list-link">
                    <Avatar user={e.provider} />
                    <div>
                      <strong>{e.skill?.title}</strong>
                      <div className="small muted">Mentor: {e.provider?.name} · Waiting for approval</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {recs.data?.people?.length > 0 && (
            <div className="card">
              <h3>People to trade with</h3>
              {recs.data.people.slice(0, 4).map((p) => (
                <Link key={p.user._id} to={`/users/${p.user._id}`} className="list-link">
                  <Avatar user={p.user} /><div><strong>{p.user.name}</strong><div className="small muted">{p.mutual ? 'Mutual swap match' : p.canTeachMe ? 'Can teach you' : 'Wants what you teach'}</div></div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
