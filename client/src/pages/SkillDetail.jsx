import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Coin, ErrorBox, Loading, Modal, ReportButton, Stars, fmtDay, useFetch } from '../components/ui';
import SkillCard from './SkillCard';

function RequestModal({ skill, onClose }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const mine = useFetch('/skills/mine');
  const [f, setF] = useState({ type: 'credit', hoursRequested: 1, message: '', offeredSkillId: '' });
  const [err, setErr] = useState('');
  const cost = Math.ceil(f.hoursRequested * skill.creditsPerHour);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const { data } = await api.post('/exchanges', { skillId: skill._id, ...f, hoursRequested: Number(f.hoursRequested) });
      nav(`/exchanges/${data.exchange._id}`);
    } catch (x) { setErr(errMsg(x)); }
  };
  const ownActive = (mine.data?.items || []).filter((s) => s.status === 'active');
  return (
    <Modal title={`Request: ${skill.title}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox error={err} />
        <div className="field">
          <label>How do you want to pay?</label>
          <div className="row">
            <label className="row" style={{ fontWeight: 500, margin: 0 }}><input type="radio" checked={f.type === 'credit'} onChange={() => setF({ ...f, type: 'credit' })} /> With credits</label>
            {skill.acceptsSwap && <label className="row" style={{ fontWeight: 500, margin: 0 }}><input type="radio" checked={f.type === 'swap'} onChange={() => setF({ ...f, type: 'swap' })} /> Swap one of my skills</label>}
          </div>
        </div>
        {f.type === 'swap' && (
          <div className="field"><label htmlFor="os">Skill you'll teach in return</label>
            {ownActive.length ? (
              <select id="os" required value={f.offeredSkillId} onChange={(e) => setF({ ...f, offeredSkillId: e.target.value })}>
                <option value="">Choose a skill</option>{ownActive.map((s) => <option key={s._id} value={s._id}>{s.title}</option>)}
              </select>
            ) : <p className="small muted">You need to <Link to="/skills/new">list a skill</Link> before you can offer a swap.</p>}
          </div>
        )}
        <div className="field"><label htmlFor="hr">Hours</label><input id="hr" type="number" min="0.5" max="40" step="0.5" value={f.hoursRequested} onChange={(e) => setF({ ...f, hoursRequested: e.target.value })} />
          {f.type === 'credit' && <div className="hint">Costs <Coin value={cost} />. You have {user.credits}. Credits are held when the mentor accepts and paid out after each session.</div>}
        </div>
        <div className="field"><label htmlFor="msg">Message</label><textarea id="msg" placeholder="What do you want to get out of it?" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></div>
        <button className="btn" disabled={f.type === 'credit' && cost > user.credits}>Send request</button>
      </form>
    </Modal>
  );
}

export default function SkillDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, error } = useFetch(`/skills/${id}`, [id]);
  const [asking, setAsking] = useState(false);
  const [bookmarked, setBookmarked] = useState(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { skill, reviews, related } = data;
  const own = skill.owner._id === user._id;
  const mark = bookmarked ?? (user.bookmarks || []).includes(skill._id);
  const toggleBookmark = async () => { const r = await api.post(`/users/me/bookmarks/${skill._id}`); setBookmarked(r.data.bookmarked); toast(r.data.bookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks'); };
  const message = async () => { const r = await api.post('/conversations', { userId: skill.owner._id }); nav(`/messages/${r.data.conversation._id}`); };

  return (
    <div className="grid-2">
      <div className="stack">
        <div className="row" style={{ gap: '.4rem' }}>
          <span className="chip">{skill.category}</span><span className="chip">{skill.level}</span><span className="chip">{skill.mode}</span>
          {skill.verification?.status === 'verified' && <span className="chip teal">Verified skill</span>}
          {skill.status === 'paused' && <span className="chip rose">Paused</span>}
        </div>
        <h1>{skill.title}</h1>
        <Stars value={skill.rating} count={skill.ratingCount} />
        <p style={{ whiteSpace: 'pre-wrap' }}>{skill.description}</p>
        <div className="row small muted">
          {skill.yearsExperience > 0 && <span>{skill.yearsExperience} years' experience</span>}
          {skill.location && <span>Based in {skill.location}</span>}
          <span>{skill.sessionsCompleted} sessions completed</span><span>{skill.views} views</span>
        </div>
        {skill.tags?.length > 0 && <div className="row">{skill.tags.map((t) => <Link key={t} to={`/marketplace?tag=${t}`} className="chip">#{t}</Link>)}</div>}
        <h2>Reviews</h2>
        {!reviews.length && <p className="muted">No reviews yet.</p>}
        {reviews.map((r) => (
          <div key={r._id} className="card flat">
            <div className="row"><Avatar user={r.reviewer} /><strong>{r.reviewer?.name}</strong><Stars value={r.rating} /><span className="small muted">{fmtDay(r.createdAt)}</span></div>
            {r.comment && <p style={{ marginTop: '.5rem' }}>{r.comment}</p>}
          </div>
        ))}
        {related.length > 0 && <><h2>Related skills</h2><div className="grid">{related.map((s) => <SkillCard key={s._id} skill={s} />)}</div></>}
      </div>
      <aside className="stack">
        <div className="card">
          <div className="coin big">{skill.creditsPerHour}</div>
          <p className="muted">credits per hour{skill.acceptsSwap ? ', or swap a skill' : ''}</p>
          {own ? (
            <div className="row"><Link className="btn" to={`/skills/${skill._id}/edit`}>Edit listing</Link></div>
          ) : (
            <div className="stack">
              <button className="btn" style={{ width: '100%' }} onClick={() => setAsking(true)}>Request to learn</button>
              <div className="row"><button className="btn ghost small" onClick={toggleBookmark}>{mark ? 'Saved' : 'Save'}</button><button className="btn ghost small" onClick={message}>Message</button><ReportButton targetType="skill" targetId={skill._id} /></div>
            </div>
          )}
        </div>
        <div className="card">
          <Link to={`/users/${skill.owner._id}`} className="row" style={{ color: 'inherit' }}><Avatar user={skill.owner} size="lg" /><div><h3 style={{ margin: 0 }}>{skill.owner.name}</h3><div className="small muted">{skill.owner.headline}</div></div></Link>
          <p className="small" style={{ marginTop: '.75rem' }}>Level {skill.owner.level} · {skill.owner.stats?.sessionsTaught} sessions taught</p>
          {skill.owner.availability?.length > 0 && <p className="small muted">Available: {skill.owner.availability.map((a) => `${a.day} ${a.from}–${a.to}`).join(', ')}</p>}
          {skill.owner.languages?.length > 0 && <p className="small muted">Speaks {skill.owner.languages.join(', ')}</p>}
        </div>
      </aside>
      {asking && <RequestModal skill={skill} onClose={() => setAsking(false)} />}
    </div>
  );
}
