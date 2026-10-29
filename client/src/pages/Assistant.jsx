import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Avatar, Tabs, useFetch } from '../components/ui';
import SkillCard from './SkillCard';

const STARTERS = [
  'What should I learn next?',
  'How do credits work?',
  'Find Python mentors',
  'How do direct swaps work?',
  'How do I book a session?',
  'How to earn certificates?',
];

function MessageContent({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      {lines.map((line, idx) => {
        if (!line.trim()) return <div key={idx} style={{ height: '0.3rem' }} />;
        const parts = line.split(/(\*\*.*?\*\*)/g);
        const formatted = parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={pIdx}>{part.slice(2, -2)}</strong>;
          }
          return part;
        });
        const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');
        return (
          <div key={idx} style={isBullet ? { paddingLeft: '0.5rem' } : undefined}>
            {formatted}
          </div>
        );
      })}
    </div>
  );
}

function Chat() {
  const [history, setHistory] = useState([
    {
      role: 'assistant',
      content: "Hello! 👋 I'm your SkillSwap learning assistant.\nI can match you with top mentors, generate a step-by-step curriculum, explain credits and skill swaps, or guide you toward certifications.\nWhat would you like to explore today?",
    },
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const end = useRef();

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [history]);

  const ask = async (msg) => {
    const m = (msg ?? text).trim();
    if (!m || busy) return;
    setText('');
    setBusy(true);
    const next = [...history, { role: 'user', content: m }];
    setHistory(next);
    try {
      const { data } = await api.post('/ai/chat', { message: m, history: next.slice(1, -1) });
      setHistory([...next, { role: 'assistant', content: data.reply, source: data.source }]);
    } catch (e) {
      toast(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'min(680px, calc(100vh - 250px))', padding: 0 }}>
      <div className="msgs" style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.65rem' }} aria-live="polite">
        {history.map((h, i) => (
          <div key={i} className={`bubble ${h.role === 'user' ? 'me' : ''}`} style={{ lineHeight: 1.5, maxWidth: '82%' }}>
            <MessageContent text={h.content} />
          </div>
        ))}
        {busy && <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingLeft: '0.5rem' }}><span className="dot on" /> Assistant is thinking…</div>}
        <div ref={end} />
      </div>

      <div className="row" style={{ padding: '.5rem 1rem', background: 'var(--surface-2)', borderTop: '1px solid var(--line)', gap: '.4rem', overflowX: 'auto' }}>
        <span className="small muted" style={{ whiteSpace: 'nowrap', marginRight: '.25rem' }}>Ask:</span>
        {STARTERS.map((s) => (
          <button key={s} className="btn ghost small" onClick={() => ask(s)} style={{ whiteSpace: 'nowrap' }}>
            {s}
          </button>
        ))}
      </div>

      <form className="row" style={{ padding: '.75rem 1rem', borderTop: '1px solid var(--line)', flexWrap: 'nowrap', gap: '.5rem' }} onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input
          aria-label="Ask the assistant"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about learning Python, guitar, sourdough, credits, or booking sessions…"
          style={{ flex: 1 }}
        />
        <button className="btn" disabled={busy || !text.trim()}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
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
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/ai/learning-path', f);
      setPath(data.path);
    } catch (x) {
      toast(errMsg(x), 'err');
    } finally {
      setBusy(false);
    }
  };

  const saveGoal = async () => {
    try {
      await api.post('/goals', {
        skillName: path.skillName,
        targetLevel: 'advanced',
        milestones: path.steps.map((s) => s.title),
      });
      toast('Saved as a personal learning goal in your Learn dashboard!');
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  };

  return (
    <div className="stack">
      <form className="card row" onSubmit={plan} style={{ gap: '.75rem' }}>
        <input
          aria-label="Skill"
          placeholder="Skill to master (e.g. Python, Acoustic Guitar, Conversational Spanish, Sourdough, Figma)"
          required
          value={f.skillName}
          onChange={(e) => setF({ ...f, skillName: e.target.value })}
          style={{ flex: 2, minWidth: 200 }}
        />
        <select
          aria-label="Current level"
          value={f.currentLevel}
          onChange={(e) => setF({ ...f, currentLevel: e.target.value })}
          style={{ flex: 1, minWidth: 140 }}
        >
          {['beginner', 'intermediate', 'advanced'].map((l) => (
            <option key={l} value={l}>Current: {l}</option>
          ))}
        </select>
        <button className="btn" disabled={busy}>
          {busy ? 'Generating…' : 'Generate Roadmap'}
        </button>
      </form>

      {path && (
        <div className="grid-2">
          <div className="card">
            <div className="row between" style={{ marginBottom: '.75rem' }}>
              <h2 style={{ margin: 0 }}>{path.skillName} Roadmap</h2>
              <button className="btn ghost small" onClick={saveGoal}>
                Save as Goal
              </button>
            </div>
            <p className="small muted">
              Structured {path.steps.length}-stage milestone plan · ~{path.weeklyHours} hours/week for {Math.round(path.estimatedWeeks)} weeks.
            </p>
            <ol style={{ paddingLeft: '1.25rem', marginTop: '1rem' }}>
              {path.steps.map((s, i) => (
                <li key={i} style={{ marginBottom: '.65rem', lineHeight: 1.45 }}>
                  <span className={`chip small ${s.stage === 'beginner' ? 'teal' : s.stage === 'intermediate' ? 'gold' : 'rose'}`} style={{ marginRight: 8 }}>
                    {s.stage}
                  </span>
                  <span>{s.title}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="stack">
            <div className="card">
              <h3>Community Mentors</h3>
              {path.mentors && path.mentors.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: '.5rem' }}>
                  {path.mentors.map((m) => (
                    <Link key={m._id} to={`/skills/${m._id}`} className="row" style={{ color: 'inherit', padding: '.4rem 0', borderBottom: '1px solid var(--line)' }}>
                      <Avatar user={m.owner} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong>{m.title}</strong>
                        <div className="small muted">taught by {m.owner?.name} · {m.creditsPerHour} credits/hr</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="small muted" style={{ marginTop: '.5rem' }}>No active mentors listed yet for this skill. Be the first to offer it in <strong>My Skills</strong>!</p>
              )}
            </div>

            <div className="card">
              <h3>Skill Assessments & Certifications</h3>
              {path.assessments && path.assessments.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: '.5rem' }}>
                  {path.assessments.map((a) => (
                    <div key={a._id} className="row between" style={{ padding: '.4rem 0', borderBottom: '1px solid var(--line)' }}>
                      <div>
                        <Link to={`/learn/${a._id}`}><strong>{a.title}</strong></Link>
                        <div className="small muted">Pass score: {a.passingScore}% · {a.level}</div>
                      </div>
                      <Link to={`/learn/${a._id}`} className="btn ghost small">Take Test</Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="small muted" style={{ marginTop: '.5rem' }}>No official test published yet. Practice with mentors or create one in <strong>Learn</strong>!</p>
              )}
            </div>
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
      <div className="page-head">
        <div>
          <h1>Learning Assistant</h1>
          <p className="muted">Personalized skill roadmap generator and 1-on-1 learning recommendations.</p>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['chat', 'Ask Assistant'],
          ['path', 'Learning Path Planner'],
          ['recs', 'Personal Recommendations'],
        ]}
      />
      {tab === 'chat' && <Chat />}
      {tab === 'path' && <PathPlanner />}
      {tab === 'recs' && (
        <div className="stack">
          <h2>Skills matched to your interests</h2>
          {recs.data?.skills?.length ? (
            <div className="grid">
              {recs.data.skills.map((r) => (
                <SkillCard key={r.skill._id} skill={r.skill} reason={r.reasons.join(' · ') || 'Popular in the community'} />
              ))}
            </div>
          ) : (
            <p className="muted">Add skills you want to learn on your <Link to="/profile">profile</Link> to get curated recommendations.</p>
          )}

          <h2 style={{ marginTop: '1.5rem' }}>People to trade with</h2>
          <div className="grid">
            {recs.data?.people?.map((p) => (
              <Link key={p.user._id} to={`/users/${p.user._id}`} className="card row" style={{ color: 'inherit' }}>
                <Avatar user={p.user} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{p.user.name}</strong>
                  <div className="small muted">{p.user.headline || 'Community Member'}</div>
                  {p.mutual && <span className="chip teal" style={{ marginTop: 4 }}>Mutual Swap Match</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
