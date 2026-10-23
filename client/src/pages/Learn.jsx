import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Empty, ErrorBox, Loading, Tabs, fmtDay, useFetch } from '../components/ui';

function Goals() {
  const { data, reload } = useFetch('/goals');
  const toast = useToast();
  const [f, setF] = useState({ skillName: '', targetLevel: 'intermediate', targetDate: '', milestones: '' });
  const [newMs, setNewMs] = useState({});
  const create = async (e) => {
    e.preventDefault();
    try { await api.post('/goals', { ...f, milestones: f.milestones.split('\n').map((s) => s.trim()).filter(Boolean), targetDate: f.targetDate || undefined }); setF({ skillName: '', targetLevel: 'intermediate', targetDate: '', milestones: '' }); reload(); toast('Goal created'); }
    catch (x) { toast(errMsg(x), 'err'); }
  };
  const upd = async (g, body) => { await api.put(`/goals/${g._id}`, body); reload(); };
  return (
    <div className="grid-2">
      <div className="stack">
        {!data?.items?.length && <Empty>Set a goal to track your progress toward a new skill.</Empty>}
        {data?.items?.map((g) => (
          <div key={g._id} className="card">
            <div className="row between"><h3 style={{ margin: 0 }}>{g.skillName} → {g.targetLevel}</h3><span className={`chip ${g.status === 'completed' ? 'teal' : ''}`}>{g.status}</span></div>
            <div className="row small muted" style={{ margin: '.3rem 0 .6rem' }}><span>{g.progress}% done</span><span>{g.hoursLogged}h practised</span>{g.targetDate && <span>Target {fmtDay(g.targetDate)}</span>}</div>
            <div className="bar"><span style={{ width: `${g.progress}%` }} /></div>
            <div style={{ marginTop: '.75rem' }}>
              {g.milestones.map((m) => <label key={m._id} className="row" style={{ fontWeight: 400, margin: '.2rem 0' }}><input type="checkbox" checked={m.done} onChange={() => upd(g, { toggleMilestone: m._id })} /> <span style={m.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>{m.title}</span></label>)}
            </div>
            <div className="row" style={{ marginTop: '.75rem' }}>
              <input aria-label="New milestone" placeholder="Add a milestone" value={newMs[g._id] || ''} onChange={(e) => setNewMs({ ...newMs, [g._id]: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
              <button className="btn ghost small" onClick={() => { if (newMs[g._id]) { upd(g, { addMilestone: newMs[g._id] }); setNewMs({ ...newMs, [g._id]: '' }); } }}>Add</button>
              <button className="btn ghost small" onClick={() => upd(g, { logHours: 1 })}>Log 1 hour</button>
              <button className="btn link small" onClick={async () => { if (window.confirm('Delete this goal?')) { await api.delete(`/goals/${g._id}`); reload(); } }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      <form className="card" onSubmit={create}>
        <h3>New goal</h3>
        <div className="field"><label htmlFor="gs">Skill</label><input id="gs" required value={f.skillName} onChange={(e) => setF({ ...f, skillName: e.target.value })} /></div>
        <div className="field"><label htmlFor="gl">Target level</label><select id="gl" value={f.targetLevel} onChange={(e) => setF({ ...f, targetLevel: e.target.value })}>{['beginner', 'intermediate', 'advanced', 'expert'].map((l) => <option key={l}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="gd">Target date</label><input id="gd" type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} /></div>
        <div className="field"><label htmlFor="gm">Milestones</label><textarea id="gm" value={f.milestones} onChange={(e) => setF({ ...f, milestones: e.target.value })} placeholder={'One per line\nLearn basic chords\nPlay a full song'} /></div>
        <button className="btn">Create goal</button>
      </form>
    </div>
  );
}

export function Learn() {
  const [tab, setTab] = useState('tests');
  const [q, setQ] = useState('');
  const list = useFetch(`/assessments?limit=30&q=${encodeURIComponent(q)}`, [q]);
  const mine = useFetch('/assessments?mine=true&limit=30');
  const attempts = useFetch('/assessments/attempts/mine');
  const certs = useFetch('/certificates/mine');
  return (
    <div>
      <div className="page-head"><div><h1>Assessments & goals</h1><p className="muted">Prove what you know, earn certificates, and track your learning.</p></div><Link className="btn ghost" to="/learn/new">Create an assessment</Link></div>
      <Tabs value={tab} onChange={setTab} tabs={[['tests', 'Assessments'], ['results', 'My results'], ['certs', 'Certificates'], ['goals', 'Goals'], ['authored', 'Authored by me']]} />
      {tab === 'tests' && (
        <div className="stack">
          <input type="search" aria-label="Search assessments" placeholder="Search by skill" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
          {list.loading && !list.data ? <Loading /> : !list.data?.items.length ? <Empty>No assessments found.</Empty> : (
            <div className="grid">{list.data.items.map((a) => (
              <div key={a._id} className="card">
                <div className="row"><span className="chip">{a.category}</span><span className="chip">{a.level}</span>{a.myPassed && <span className="chip teal">Passed</span>}</div>
                <h3 style={{ marginTop: '.6rem' }}>{a.title}</h3>
                <p className="small muted">{a.questionCount} questions · {a.timeLimitMinutes} min · pass at {a.passingScore}%{a.myBest !== null ? ` · your best ${a.myBest}%` : ''}</p>
                {a.myAttempts >= a.maxAttempts ? <span className="small muted">No attempts left</span> : <Link className="btn small" to={`/learn/${a._id}`}>{a.myAttempts ? 'Try again' : 'Start'}</Link>}
              </div>))}
            </div>
          )}
        </div>
      )}
      {tab === 'results' && (
        <div className="card table-wrap"><table>
          <thead><tr><th>Assessment</th><th>Score</th><th>Result</th><th>Date</th></tr></thead>
          <tbody>{attempts.data?.items.map((t) => <tr key={t._id}><td>{t.assessment?.title}</td><td>{t.score}%</td><td><span className={`chip ${t.passed ? 'teal' : 'rose'}`}>{t.passed ? 'passed' : 'not passed'}</span></td><td className="small">{fmtDay(t.submittedAt)}</td></tr>)}</tbody>
        </table>{!attempts.data?.items.length && <p className="muted">No attempts yet.</p>}</div>
      )}
      {tab === 'certs' && (
        <div className="grid">
          {!certs.data?.items.length && <Empty>Pass an assessment to earn your first certificate.</Empty>}
          {certs.data?.items.map((c) => (
            <div key={c._id} className="card" style={{ borderTop: '4px solid var(--gold)' }}>
              <div className="small muted">Certificate of skill</div>
              <h2 style={{ margin: '.3rem 0' }}>{c.skillName}</h2>
              <p className="small">{c.level} level · scored {c.score}% · {fmtDay(c.issuedAt)}</p>
              <p className="small">Verification code <strong>{c.code}</strong>{c.revoked && <span className="chip rose" style={{ marginLeft: 6 }}>revoked</span>}</p>
              <Link className="small" to={`/verify/${c.code}`}>Open verification page</Link>
            </div>))}
        </div>
      )}
      {tab === 'goals' && <Goals />}
      {tab === 'authored' && (
        <div className="card table-wrap"><table>
          <thead><tr><th>Title</th><th>Status</th><th>Questions</th></tr></thead>
          <tbody>{mine.data?.items.map((a) => <tr key={a._id}><td>{a.title}</td><td><span className={`chip ${a.status === 'published' ? 'teal' : 'gold'}`}>{a.status.replace('_', ' ')}</span></td><td>{a.questionCount}</td></tr>)}</tbody>
        </table>{!mine.data?.items.length && <p className="muted">Assessments you create are reviewed by moderators before they go live.</p>}</div>
      )}
    </div>
  );
}

export function TakeAssessment() {
  const { id } = useParams();
  const { refreshMe } = useAuth();
  const toast = useToast();
  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(null);
  const intro = useFetch(`/assessments/${id}`, [id]);

  const start = async () => {
    try { const { data } = await api.post(`/assessments/${id}/attempts`); setSession(data); setAnswers(new Array(data.assessment.questions.length).fill(null)); }
    catch (x) { setErr(errMsg(x)); }
  };
  const submit = async () => {
    try { const { data } = await api.post(`/assessments/attempts/${session.attempt._id}/submit`, { answers }); setResult(data); if (data.certificate) toast('Certificate earned!'); refreshMe(); }
    catch (x) { toast(errMsg(x), 'err'); }
  };
  useEffect(() => {
    if (!session || result) return undefined;
    const end = new Date(session.attempt.startedAt).getTime() + session.assessment.timeLimitMinutes * 60000;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [session, result]);

  if (intro.loading) return <Loading />;
  if (intro.error) return <ErrorBox error={intro.error} />;
  const a = intro.data.assessment;
  if (result) {
    return (
      <div className="stack" style={{ maxWidth: 760 }}>
        <div className="card" style={{ borderTop: `4px solid ${result.attempt.passed ? 'var(--teal)' : 'var(--rose)'}` }}>
          <h1>{result.attempt.score}% — {result.attempt.passed ? 'Passed' : 'Not passed this time'}</h1>
          {result.late && <p className="error">Submitted after the time limit, so the attempt scored zero.</p>}
          {result.certificate ? <p>Your certificate code is <strong>{result.certificate.code}</strong>. <Link to={`/verify/${result.certificate.code}`}>View it</Link></p> : <p className="muted">You need {a.passingScore}% to pass.</p>}
          <Link to="/learn">Back to assessments</Link>
        </div>
        {result.review.map((q, i) => (
          <div key={i} className="card flat">
            <strong>{i + 1}. {q.prompt}</strong>
            <div style={{ marginTop: '.5rem' }}>{q.options.map((o, j) => <div key={j} className={`quiz-opt ${j === q.correctIndex ? 'right' : j === q.yourAnswer ? 'wrong' : ''}`}>{o}{j === q.correctIndex && <span className="chip teal" style={{ marginLeft: 'auto' }}>correct</span>}</div>)}</div>
            {q.explanation && <p className="small muted">{q.explanation}</p>}
          </div>))}
      </div>
    );
  }
  if (!session) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <h1>{a.title}</h1>
        <p>{a.description}</p>
        <p className="muted">{a.questions.length} questions · {a.timeLimitMinutes} minutes · pass at {a.passingScore}% · {a.maxAttempts} attempts allowed</p>
        <ErrorBox error={err} />
        <button className="btn" onClick={start}>Start the timer</button>
      </div>
    );
  }
  const qs = session.assessment.questions;
  const mm = left !== null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '';
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="row between card" style={{ position: 'sticky', top: 64, zIndex: 5 }}><strong>{a.title}</strong><span className={left !== null && left < 60 ? 'chip rose' : 'chip'}>{mm} left</span><span className="small muted">{answers.filter((x) => x !== null).length}/{qs.length} answered</span></div>
      {qs.map((q, i) => (
        <fieldset key={q._id} className="card" style={{ border: '1px solid var(--line)' }}>
          <legend style={{ fontWeight: 700, padding: '0 .3rem' }}>{i + 1}. {q.prompt}</legend>
          {q.options.map((o, j) => (
            <label key={j} className={`quiz-opt ${answers[i] === j ? 'sel' : ''}`} style={{ fontWeight: 400 }}>
              <input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => setAnswers(answers.map((x, k) => (k === i ? j : x)))} /> {o}
            </label>))}
        </fieldset>))}
      <button className="btn" onClick={() => (answers.includes(null) && !window.confirm('Some questions are unanswered. Submit anyway?') ? null : submit())}>Submit answers</button>
    </div>
  );
}

const blankQ = () => ({ prompt: '', options: ['', ''], correctIndex: 0, explanation: '' });

export function CreateAssessment() {
  const nav = useNavigate();
  const toast = useToast();
  const meta = useFetch('/skills/meta');
  const [f, setF] = useState({ title: '', skillName: '', category: 'Technology', level: 'beginner', description: '', passingScore: 70, timeLimitMinutes: 20, maxAttempts: 3 });
  const [qs, setQs] = useState([blankQ()]);
  const [err, setErr] = useState('');
  const setQ = (i, patch) => setQs(qs.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const { data } = await api.post('/assessments', { ...f, passingScore: Number(f.passingScore), timeLimitMinutes: Number(f.timeLimitMinutes), maxAttempts: Number(f.maxAttempts), questions: qs.map((q) => ({ ...q, options: q.options.filter((o) => o.trim()) })) });
      toast(data.assessment.status === 'published' ? 'Assessment published' : 'Submitted for moderator review'); nav('/learn');
    } catch (x) { setErr(errMsg(x)); }
  };
  if (!meta.data) return <Loading />;
  return (
    <form className="stack" onSubmit={submit} style={{ maxWidth: 820 }}>
      <h1>Create an assessment</h1>
      <p className="muted">Moderators review member-created assessments before they go live.</p>
      <ErrorBox error={err} />
      <div className="card">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          <div className="field"><label htmlFor="at">Title</label><input id="at" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="field"><label htmlFor="as">Skill</label><input id="as" required value={f.skillName} onChange={(e) => setF({ ...f, skillName: e.target.value })} /></div>
          <div className="field"><label htmlFor="ac">Category</label><select id="ac" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{meta.data.categories.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="al">Level</label><select id="al" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>{meta.data.levels.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="ap">Pass mark (%)</label><input id="ap" type="number" min="1" max="100" value={f.passingScore} onChange={(e) => setF({ ...f, passingScore: e.target.value })} /></div>
          <div className="field"><label htmlFor="am">Time limit (minutes)</label><input id="am" type="number" min="1" value={f.timeLimitMinutes} onChange={(e) => setF({ ...f, timeLimitMinutes: e.target.value })} /></div>
          <div className="field"><label htmlFor="ax">Attempts allowed</label><input id="ax" type="number" min="1" value={f.maxAttempts} onChange={(e) => setF({ ...f, maxAttempts: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="ad">Description</label><textarea id="ad" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      </div>
      {qs.map((q, i) => (
        <div key={i} className="card">
          <div className="row between"><h3 style={{ margin: 0 }}>Question {i + 1}</h3>{qs.length > 1 && <button type="button" className="btn link small" onClick={() => setQs(qs.filter((_, k) => k !== i))}>Remove</button>}</div>
          <div className="field" style={{ marginTop: '.5rem' }}><label htmlFor={`qp${i}`}>Question</label><input id={`qp${i}`} required value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} /></div>
          <label>Options (select the correct one)</label>
          {q.options.map((o, j) => (
            <div key={j} className="row" style={{ marginBottom: '.4rem', flexWrap: 'nowrap' }}>
              <input type="radio" name={`c${i}`} checked={q.correctIndex === j} onChange={() => setQ(i, { correctIndex: j })} aria-label={`Option ${j + 1} is correct`} />
              <input aria-label={`Option ${j + 1}`} required value={o} onChange={(e) => setQ(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} />
              {q.options.length > 2 && <button type="button" className="btn ghost small" onClick={() => setQ(i, { options: q.options.filter((_, k) => k !== j), correctIndex: q.correctIndex >= j && q.correctIndex > 0 ? q.correctIndex - 1 : q.correctIndex })}>✕</button>}
            </div>))}
          {q.options.length < 6 && <button type="button" className="btn link small" onClick={() => setQ(i, { options: [...q.options, ''] })}>Add option</button>}
          <div className="field" style={{ marginTop: '.5rem' }}><label htmlFor={`qe${i}`}>Explanation (shown after submitting)</label><input id={`qe${i}`} value={q.explanation} onChange={(e) => setQ(i, { explanation: e.target.value })} /></div>
        </div>))}
      <div className="row"><button type="button" className="btn ghost" onClick={() => setQs([...qs, blankQ()])}>Add question</button><button className="btn">Submit assessment</button></div>
    </form>
  );
}

export function VerifyCertificate() {
  const { code: initial } = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState(initial || '');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!initial) return;
    setErr(''); setRes(null);
    api.get(`/certificates/verify/${initial}`).then(({ data }) => setRes(data)).catch((e) => setErr(errMsg(e)));
  }, [initial]);
  return (
    <div className="content" style={{ maxWidth: 620 }}>
      <Link to="/" className="brand" style={{ color: 'var(--text)' }}><span className="coin" /> SkillSwap</Link>
      <h1>Verify a certificate</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); nav(`/verify/${code.trim()}`); }}>
        <input aria-label="Certificate code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="12-character code" style={{ flex: 1 }} />
        <button className="btn">Verify</button>
      </form>
      <div style={{ marginTop: '1.5rem' }}>
        <ErrorBox error={err} />
        {res && (
          <div className="card" style={{ borderTop: `4px solid ${res.valid ? 'var(--gold)' : 'var(--rose)'}` }}>
            <span className={`chip ${res.valid ? 'teal' : 'rose'}`}>{res.valid ? 'Valid certificate' : 'This certificate has been revoked'}</span>
            <h2 style={{ marginTop: '.75rem' }}>{res.certificate.holder}</h2>
            <p>Certified in <strong>{res.certificate.skillName}</strong> at {res.certificate.level} level with a score of {res.certificate.score}%.</p>
            <p className="small muted">Issued {fmtDay(res.certificate.issuedAt)} · code {res.certificate.code}</p>
          </div>
        )}
      </div>
    </div>
  );
}
