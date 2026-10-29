import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Coin, Empty, ErrorBox, Loading, Modal, useFetch } from '../components/ui';

const blank = { title: '', description: '', category: 'Technology', level: 'intermediate', tags: '', mode: 'online', location: '', creditsPerHour: 1, acceptsSwap: true, yearsExperience: 0 };

export function SkillForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const meta = useFetch('/skills/meta');
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (id) {
      api.get(`/skills/${id}`).then(({ data }) => {
        const isOwner = Boolean(user && data.skill?.owner && String(data.skill.owner._id || data.skill.owner) === String(user._id || user.id));
        if (!isOwner && user?.role !== 'admin') {
          toast('Only the mentor who created this skill can edit it.', 'err');
          nav(`/skills/${id}`, { replace: true });
          return;
        }
        setF({ ...blank, ...data.skill, tags: data.skill.tags ? data.skill.tags.join(', ') : '' });
      }).catch((x) => setErr(errMsg(x)));
    }
  }, [id, user, nav, toast]);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    const body = { ...f, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), creditsPerHour: Number(f.creditsPerHour), yearsExperience: Number(f.yearsExperience) };
    try {
      const { data } = id ? await api.put(`/skills/${id}`, body) : await api.post('/skills', body);
      toast(id ? 'Listing updated' : 'Skill listed'); nav(`/skills/${data.skill._id}`);
    } catch (x) { setErr(errMsg(x)); }
  };
  if (!meta.data) return <Loading />;
  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 720 }}>
      <h1>{id ? 'Edit listing' : 'List a skill you can teach'}</h1>
      <ErrorBox error={err} />
      <div className="field"><label htmlFor="t">Title</label><input id="t" required value={f.title} onChange={up('title')} placeholder="e.g. Conversational Spanish for travellers" /></div>
      <div className="field"><label htmlFor="d">Description</label><textarea id="d" required value={f.description} onChange={up('description')} placeholder="What will learners be able to do after a session with you?" /><div className="hint">At least 20 characters.</div></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <div className="field"><label htmlFor="c">Category</label><select id="c" value={f.category} onChange={up('category')}>{meta.data.categories.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="l">Your level</label><select id="l" value={f.level} onChange={up('level')}>{meta.data.levels.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="m">Where</label><select id="m" value={f.mode} onChange={up('mode')}>{meta.data.modes.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="cr">Credits per hour</label><input id="cr" type="number" min="0" max="20" value={f.creditsPerHour} onChange={up('creditsPerHour')} /></div>
        <div className="field"><label htmlFor="y">Years of experience</label><input id="y" type="number" min="0" value={f.yearsExperience} onChange={up('yearsExperience')} /></div>
        {f.mode !== 'online' && <div className="field"><label htmlFor="loc">Location</label><input id="loc" value={f.location} onChange={up('location')} /></div>}
      </div>
      <div className="field"><label htmlFor="tg">Tags</label><input id="tg" value={f.tags} onChange={up('tags')} placeholder="python, data, beginners" /><div className="hint">Separate with commas.</div></div>
      <label className="row" style={{ fontWeight: 500 }}><input type="checkbox" checked={f.acceptsSwap} onChange={up('acceptsSwap')} /> I'm open to skill swaps</label>
      <div className="row" style={{ marginTop: '1rem' }}><button className="btn">{id ? 'Save changes' : 'Publish listing'}</button><button type="button" className="btn ghost" onClick={() => nav(-1)}>Cancel</button></div>
    </form>
  );
}

export function MySkills() {
  const { data, loading, reload } = useFetch('/skills/mine');
  const bookmarks = useFetch('/users/me/bookmarks');
  const toast = useToast();
  const [verify, setVerify] = useState(null);
  const [evidence, setEvidence] = useState('');
  const setStatus = async (s, status) => { await api.put(`/skills/${s._id}`, { status }); reload(); };
  const remove = async (s) => { if (window.confirm(`Remove "${s.title}"?`)) { await api.delete(`/skills/${s._id}`); toast('Listing removed'); reload(); } };
  const sendVerify = async () => {
    try { await api.post(`/skills/${verify._id}/verification`, { evidence }); toast('Verification requested'); setVerify(null); setEvidence(''); reload(); } catch (e) { toast(errMsg(e), 'err'); }
  };
  if (loading) return <Loading />;
  return (
    <div className="stack">
      <div className="page-head"><h1>My skills</h1><Link className="btn" to="/skills/new">List a skill</Link></div>
      {!data.items.length ? <Empty>You haven't listed anything yet. Everyone knows something worth teaching.</Empty> : (
        <div className="card table-wrap"><table>
          <thead><tr><th>Skill</th><th>Rate</th><th>Status</th><th>Verification</th><th>Views</th><th>Sessions</th><th /></tr></thead>
          <tbody>{data.items.map((s) => (
            <tr key={s._id}>
              <td><Link to={`/skills/${s._id}`}>{s.title}</Link></td>
              <td><Coin value={s.creditsPerHour} /></td>
              <td><span className={`chip ${s.status === 'active' ? 'teal' : ''}`}>{s.status}</span></td>
              <td>{s.verification.status === 'none' || s.verification.status === 'rejected'
                ? <button className="btn link small" onClick={() => setVerify(s)}>{s.verification.status === 'rejected' ? 'Rejected — retry' : 'Get verified'}</button>
                : <span className={`chip ${s.verification.status === 'verified' ? 'teal' : 'gold'}`}>{s.verification.status}</span>}</td>
              <td>{s.views}</td><td>{s.sessionsCompleted}</td>
              <td className="row" style={{ flexWrap: 'nowrap' }}>
                <Link className="btn ghost small" to={`/skills/${s._id}/edit`}>Edit</Link>
                <button className="btn ghost small" onClick={() => setStatus(s, s.status === 'active' ? 'paused' : 'active')}>{s.status === 'active' ? 'Pause' : 'Resume'}</button>
                <button className="btn ghost small" onClick={() => remove(s)}>Remove</button>
              </td>
            </tr>))}
          </tbody></table></div>
      )}
      <h2>Saved skills</h2>
      {bookmarks.data?.items?.length ? (
        <div className="card">{bookmarks.data.items.map((b) => <div key={b._id} style={{ padding: '.35rem 0' }}><Link to={`/skills/${b._id}`}>{b.title}</Link> <span className="small muted">by {b.owner?.name}</span></div>)}</div>
      ) : <p className="muted">Skills you save from the marketplace appear here.</p>}
      {verify && (
        <Modal title={`Verify "${verify.title}"`} onClose={() => setVerify(null)}>
          <p className="muted">Moderators review your evidence and add a verified mark to the listing.</p>
          <div className="field"><label htmlFor="ev">Evidence</label><textarea id="ev" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Links to your work, certificates, or a short description of your experience" /></div>
          <button className="btn" onClick={sendVerify} disabled={!evidence.trim()}>Request verification</button>
        </Modal>
      )}
    </div>
  );
}
