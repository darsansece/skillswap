import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, ErrorBox, Loading, ReportButton, Stars, fmtDay, useFetch } from '../components/ui';
import SkillCard from './SkillCard';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const csv = (a) => (a || []).join(', ');
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

function PortfolioEditor({ items, onChange }) {
  const [f, setF] = useState({ title: '', url: '', description: '', skill: '' });
  const toast = useToast();
  const add = async (e) => {
    e.preventDefault();
    try { const { data } = await api.post('/users/me/portfolio', f); onChange(data.portfolio); setF({ title: '', url: '', description: '', skill: '' }); }
    catch (x) { toast(errMsg(x), 'err'); }
  };
  const del = async (id) => { const { data } = await api.delete(`/users/me/portfolio/${id}`); onChange(data.portfolio); };
  return (
    <div className="card">
      <h2>Portfolio</h2>
      <p className="muted small">Show work that proves your skills: projects, recordings, recipes, designs.</p>
      {items.map((p) => (
        <div key={p._id} className="row between" style={{ padding: '.5rem 0', borderBottom: '1px solid var(--line)' }}>
          <div><strong>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> : p.title}</strong>{p.skill && <span className="chip" style={{ marginLeft: 6 }}>{p.skill}</span>}<div className="small muted">{p.description}</div></div>
          <button className="btn ghost small" onClick={() => del(p._id)}>Remove</button>
        </div>
      ))}
      <form onSubmit={add} style={{ marginTop: '1rem' }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          <input aria-label="Project title" placeholder="Project title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input aria-label="Link" placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          <input aria-label="Related skill" placeholder="Related skill" value={f.skill} onChange={(e) => setF({ ...f, skill: e.target.value })} />
        </div>
        <input aria-label="Description" placeholder="Short description" style={{ marginTop: '.5rem' }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <button className="btn ghost small" style={{ marginTop: '.5rem' }}>Add to portfolio</button>
      </form>
    </div>
  );
}

export function ProfileEdit() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  useEffect(() => {
    setF({
      name: user.name, headline: user.headline || '', bio: user.bio || '', location: user.location || '', avatar: user.avatar || '', timezone: user.timezone || 'UTC',
      languages: csv(user.languages), interests: csv(user.interests),
      skillsWanted: (user.skillsWanted || []).map((s) => s.name).join(', '),
      availability: user.availability || [], socialLinks: user.socialLinks || {},
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user._id]);
  if (!f) return <Loading />;
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const { data } = await api.put('/users/me', { ...f, languages: list(f.languages), interests: list(f.interests), skillsWanted: list(f.skillsWanted).map((name) => ({ name })) });
      setUser(data.user); toast('Profile saved');
    } catch (x) { setErr(errMsg(x)); }
  };
  const setSlot = (i, k, v) => { const a = [...f.availability]; a[i] = { ...a[i], [k]: v }; setF({ ...f, availability: a }); };
  const changePw = async (e) => {
    e.preventDefault();
    try { await api.post('/auth/change-password', pw); toast('Password changed'); setPw({ currentPassword: '', newPassword: '' }); } catch (x) { toast(errMsg(x), 'err'); }
  };
  const uploadAvatar = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { const { data } = await api.post('/uploads', fd); setF({ ...f, avatar: data.url }); } catch (x) { toast(errMsg(x), 'err'); }
  };

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="page-head"><h1>Your profile</h1><Link to={`/users/${user._id}`}>View public profile</Link></div>
      {params.get('welcome') && <div className="card flat" style={{ background: 'var(--teal-tint)' }}>Welcome! Fill in what you'd like to learn so we can find you mentors and swap partners.</div>}
      {!user.emailVerified && <div className="card flat small">Your email isn't verified yet. Check your inbox for the verification link.</div>}
      <form className="card" onSubmit={save}>
        <ErrorBox error={err} />
        <div className="row" style={{ marginBottom: '1rem' }}>
          <Avatar user={{ ...user, avatar: f.avatar }} size="lg" />
          <label className="btn ghost small" style={{ margin: 0 }}>Upload photo<input type="file" accept="image/*" hidden onChange={uploadAvatar} /></label>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          <div className="field"><label htmlFor="n">Name</label><input id="n" value={f.name} onChange={up('name')} /></div>
          <div className="field"><label htmlFor="h">Headline</label><input id="h" value={f.headline} onChange={up('headline')} placeholder="Weekend baker, weekday engineer" /></div>
          <div className="field"><label htmlFor="lo">Location</label><input id="lo" value={f.location} onChange={up('location')} /></div>
          <div className="field"><label htmlFor="tz">Time zone</label><input id="tz" value={f.timezone} onChange={up('timezone')} /></div>
        </div>
        <div className="field"><label htmlFor="b">About you</label><textarea id="b" value={f.bio} onChange={up('bio')} /></div>
        <div className="field"><label htmlFor="sw">Skills you want to learn</label><input id="sw" value={f.skillsWanted} onChange={up('skillsWanted')} placeholder="Guitar, Spanish, Figma" /><div className="hint">Comma-separated. These drive your recommendations.</div></div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          <div className="field"><label htmlFor="in">Interests</label><input id="in" value={f.interests} onChange={up('interests')} /></div>
          <div className="field"><label htmlFor="la">Languages</label><input id="la" value={f.languages} onChange={up('languages')} /></div>
        </div>
        <label>Weekly availability</label>
        {f.availability.map((a, i) => (
          <div className="row" key={i} style={{ marginBottom: '.4rem' }}>
            <select aria-label="Day" value={a.day} onChange={(e) => setSlot(i, 'day', e.target.value)} style={{ width: 'auto' }}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select>
            <input aria-label="From" type="time" value={a.from} onChange={(e) => setSlot(i, 'from', e.target.value)} style={{ width: 'auto' }} />
            <input aria-label="To" type="time" value={a.to} onChange={(e) => setSlot(i, 'to', e.target.value)} style={{ width: 'auto' }} />
            <button type="button" className="btn ghost small" onClick={() => setF({ ...f, availability: f.availability.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn link small" onClick={() => setF({ ...f, availability: [...f.availability, { day: 'sat', from: '10:00', to: '12:00' }] })}>Add a time slot</button>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', marginTop: '1rem' }}>
          {['website', 'linkedin', 'github'].map((k) => <div className="field" key={k}><label htmlFor={k}>{k[0].toUpperCase() + k.slice(1)}</label><input id={k} value={f.socialLinks[k] || ''} onChange={(e) => setF({ ...f, socialLinks: { ...f.socialLinks, [k]: e.target.value } })} /></div>)}
        </div>
        <button className="btn">Save profile</button>
      </form>
      <PortfolioEditor items={user.portfolio || []} onChange={(portfolio) => setUser({ ...user, portfolio })} />
      <form className="card" onSubmit={changePw}>
        <h2>Change password</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          <div className="field"><label htmlFor="cp">Current password</label><input id="cp" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></div>
          <div className="field"><label htmlFor="np">New password</label><input id="np" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></div>
        </div>
        <button className="btn ghost">Change password</button>
      </form>
    </div>
  );
}

export function PublicProfile() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(`/users/${id}`, [id]);
  const [endorse, setEndorse] = useState('');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { user, skills, reviews, certificates, endorsements } = data;
  const isMe = me._id === user._id;
  const message = async () => { const r = await api.post('/conversations', { userId: user._id }); nav(`/messages/${r.data.conversation._id}`); };
  const doEndorse = async (e) => {
    e.preventDefault();
    try { await api.post(`/users/${user._id}/endorse`, { skill: endorse }); toast(`Endorsed for ${endorse}`); setEndorse(''); reload(); } catch (x) { toast(errMsg(x), 'err'); }
  };
  return (
    <div className="grid-2">
      <div className="stack">
        <div className="row"><Avatar user={user} size="lg" /><div><h1 style={{ marginBottom: '.2rem' }}>{user.name}</h1><div className="muted">{user.headline}</div></div></div>
        <div className="row small muted">
          <Stars value={user.rating} count={user.stats?.ratingCount} />
          <span>Level {user.level}</span><span>{user.stats?.sessionsTaught} taught</span><span>{user.stats?.sessionsLearned} learned</span>
          {user.location && <span>{user.location}</span>}
        </div>
        {user.bio && <p style={{ whiteSpace: 'pre-wrap' }}>{user.bio}</p>}
        <h2>Teaches</h2>
        {skills.length ? <div className="grid">{skills.map((s) => <SkillCard key={s._id} skill={{ ...s, owner: undefined }} />)}</div> : <p className="muted">No skills listed yet.</p>}
        {user.portfolio?.length > 0 && <><h2>Portfolio</h2>{user.portfolio.map((p) => <div key={p._id} className="card flat" style={{ marginBottom: '.5rem' }}><strong>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> : p.title}</strong><div className="small muted">{p.description}</div></div>)}</>}
        <h2>Reviews</h2>
        {!reviews.length && <p className="muted">No reviews yet.</p>}
        {reviews.map((r) => <div key={r._id} className="card flat" style={{ marginBottom: '.5rem' }}><div className="row"><strong>{r.reviewer?.name}</strong><Stars value={r.rating} />{r.skill && <span className="small muted">for {r.skill.title}</span>}</div>{r.comment && <p style={{ margin: '.4rem 0 0' }}>{r.comment}</p>}</div>)}
      </div>
      <aside className="stack">
        {!isMe && <div className="card row"><button className="btn" onClick={message}>Send message</button><ReportButton targetType="user" targetId={user._id} label="Report user" /></div>}
        <div className="card">
          <h3>Wants to learn</h3>
          {user.skillsWanted?.length ? <div className="row">{user.skillsWanted.map((s) => <span key={s.name} className="chip">{s.name}</span>)}</div> : <p className="small muted">Not specified.</p>}
        </div>
        <div className="card">
          <h3>Endorsements</h3>
          {Object.keys(endorsements).length ? <div className="row">{Object.entries(endorsements).map(([k, v]) => <span key={k} className="chip teal">{k} · {v}</span>)}</div> : <p className="small muted">None yet.</p>}
          {!isMe && <form onSubmit={doEndorse} className="row" style={{ marginTop: '.75rem' }}><input aria-label="Skill to endorse" placeholder="Skill" value={endorse} onChange={(e) => setEndorse(e.target.value)} style={{ flex: 1 }} required /><button className="btn ghost small">Endorse</button></form>}
        </div>
        <div className="card">
          <h3>Badges</h3>
          {user.badges?.length ? <div className="row">{user.badges.map((b) => <span key={b.key} className="chip gold">{b.key.replace(/_/g, ' ')}</span>)}</div> : <p className="small muted">None yet.</p>}
        </div>
        <div className="card">
          <h3>Certificates</h3>
          {!certificates.length && <p className="small muted">None yet.</p>}
          {certificates.map((c) => <div key={c._id} className="small" style={{ marginBottom: '.3rem' }}><strong>{c.skillName}</strong> ({c.level}) · {c.score}% · <Link to={`/verify/${c.code}`}>{c.code}</Link><div className="muted">{fmtDay(c.issuedAt)}</div></div>)}
        </div>
      </aside>
    </div>
  );
}
