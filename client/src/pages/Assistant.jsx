import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Avatar, Tabs, useFetch } from '../components/ui';
import SkillCard from './SkillCard';

const STARTERS = ['What should I learn next?', 'How do credits work?', 'How do I book a session?', 'How can I level up faster?'];

function Chat() {
  const [history, setHistory] = useState([{ role: 'assistant', content: "Hi! I can recommend mentors, plan a learning path, or explain how SkillSwap works. What are you working on?" }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const end = useRef();
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [history]);
  const ask = async (msg) => {
    const m = (msg ?? text).trim(); if (!m || busy) return;
    setText(''); setBusy(true);
    const next = [...history, { role: 'user', content: m }];
    setHistory(next);
    try {
      const { data } = await api.post('/ai/chat', { message: m, history: next.slice(1, -1) });
      setHistory([...next, { role: 'assistant', content: data.reply, source: data.source }]);
    } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'min(640px, calc(100vh - 260px))', padding: 0 }}>
      <div className="msgs" style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }} aria-live="polite">
        {history.map((h, i) => <div key={i} className={`bubble ${h.role === 'user' ? 'me' : ''}`}>{h.content}</div>)}
        {busy && <div className="small muted">Thinking…</div>}
        <div ref={end} />
      </div>
      <div className="row" style={{ padding: '.5rem 1rem' }}>{STARTERS.map((s) => <button key={s} className="btn ghost small" onClick={() => ask(s)}>{s}</button>)}</div>
      <form className="row" style={{ padding: '.75rem 1rem', borderTop: '1px solid var(--line)', flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input aria-label="Ask the assistant" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything about learning or trading skills" />
        <button className="btn" disabled={busy}>Ask</button>
      </form>
    </div>
  );
}

function PathPlanner() {
  const [f, setF] = useState({ skillName: '', currentLevel: 'beginner' });
  const [path, setPath] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const plan = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { data } = await api.post('/ai/learning-path', f); setPath(data.path); } catch (x) { toast(errMsg(x), 'err'); } finally { setBusy(false); }
  };
  const saveGoal = async () => {
    await api.post('/goals', { skillName: path.skillName, targetLevel: 'advanced', milestones: path.steps.map((s) => s.title) });
    toast('Saved as a learning goal');
  };
  return (
    <div className="stack">
      <form className="card row" onSubmit={plan}>
        <input aria-label="Skill" placeholder="Skill, e.g. Guitar" required value={f.skillName} onChange={(e) => setF({ ...f, skillName: e.target.value })} style={{ flex: 2, minWidth: 180 }} />
        <select aria-label="Current level" value={f.currentLevel} onChange={(e) => setF({ ...f, currentLevel: e.target.value })} style={{ flex: 1, minWidth: 140 }}>{['beginner', 'intermediate', 'advanced'].map((l) => <option key={l}>{l}</option>)}</select>
        <button className="btn" disabled={busy}>{busy ? 'Planning…' : 'Plan my path'}</button>
      </form>
      {path && (
        <div className="grid-2">
          <div className="card">
            <div className="row between"><h2 style={{ margin: 0 }}>{path.skillName} roadmap</h2><button className="btn ghost small" onClick={saveGoal}>Save as goal</button></div>
            <p className="small muted">About {path.weeklyHours} hours a week for {Math.round(path.estimatedWeeks)} weeks.</p>
            <ol style={{ paddingLeft: '1.2rem' }}>{path.steps.map((s, i) => <li key={i} style={{ marginBottom: '.5rem' }}><span className="chip" style={{ marginRight: 6 }}>{s.stage}</span>{s.title}</li>)}</ol>
          </div>
          <div className="stack">
            <div className="card"><h3>Mentors</h3>{path.mentors.length ? path.mentors.map((m) => <Link key={m._id} to={`/skills/${m._id}`} className="row" style={{ color: 'inherit', padding: '.3rem 0' }}><Avatar user={m.owner} />{m.title}</Link>) : <p className="small muted">No mentors listed yet.</p>}</div>
            <div className="card"><h3>Assessments</h3>{path.assessments.length ? path.assessments.map((a) => <div key={a._id}><Link to={`/learn/${a._id}`}>{a.title}</Link> <span className="small muted">{a.level}</span></div>) : <p className="small muted">No assessments yet.</p>}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Assistant() {
  const [tab, setTab] = useState('chat');
  const recs = useFetch('/ai/recommendations');
  return (
    <div>
      <div className="page-head"><div><h1>Learning assistant</h1><p className="muted">Personal recommendations based on what you want to learn and what you can teach.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[['chat', 'Ask'], ['recs', 'Recommendations'], ['path', 'Learning path']]} />
      {tab === 'chat' && <Chat />}
      {tab === 'path' && <PathPlanner />}
      {tab === 'recs' && (
        <div className="stack">
          <h2>Skills matched to you</h2>
          {recs.data?.skills?.length ? <div className="grid">{recs.data.skills.map((r) => <SkillCard key={r.skill._id} skill={r.skill} reason={r.reasons.join(' · ') || 'Popular in the community'} />)}</div> : <p className="muted">Add skills you want to learn on your <Link to="/profile">profile</Link>.</p>}
          <h2>People to trade with</h2>
          <div className="grid">{recs.data?.people?.map((p) => (
            <Link key={p.user._id} to={`/users/${p.user._id}`} className="card row" style={{ color: 'inherit' }}>
              <Avatar user={p.user} /><div><strong>{p.user.name}</strong><div className="small muted">{p.user.headline}</div>{p.mutual && <span className="chip teal">Mutual swap</span>}</div>
            </Link>))}</div>
        </div>
      )}
    </div>
  );
}
