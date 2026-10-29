import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Coin, Empty, ErrorBox, Loading, Modal, Pager, Tabs, fmtDate, timeAgo, useFetch } from '../components/ui';

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

function getSampleQuestions(skillTitle) {
  const t = (skillTitle || '').toLowerCase();
  if (t.includes('driv')) {
    return [
      {
        prompt: 'What should you do when you see a flashing amber traffic light?',
        options: [
          'Speed up to cross quickly before it turns red',
          'Slow down and proceed with caution, yielding to pedestrians and oncoming vehicles',
          'Come to a complete stop and wait for a green signal',
          'Turn on hazard lights and immediately reverse',
        ],
        correctIndex: 1,
        explanation: 'A flashing amber light means slow down and proceed with caution, yielding to pedestrians and oncoming vehicles.',
      },
      {
        prompt: 'What is the primary purpose of the two-second rule when driving?',
        options: [
          'Time taken to start driving at a green light',
          'Safe following distance behind the vehicle ahead under normal dry conditions',
          'Duration allowed to switch between gears',
          'Maximum time permitted to overtake on city streets',
        ],
        correctIndex: 1,
        explanation: 'The 2-second rule helps maintain a safe stopping distance under ideal driving conditions.',
      },
      {
        prompt: 'Which mirror should you check first before signalling a turn or lane change?',
        options: [
          'Left exterior wing mirror',
          'Interior rearview mirror (Mirror-Signal-Manoeuvre routine)',
          'Right passenger vanity mirror',
          'Blind spot mirror only',
        ],
        correctIndex: 1,
        explanation: 'Always follow the Mirror-Signal-Manoeuvre (MSM) routine, beginning with the interior rearview mirror.',
      },
      {
        prompt: 'When approaching an uncontrolled pedestrian zebra crossing, what is mandatory?',
        options: [
          'Honk loudly and maintain current speed',
          'Slow down and stop to allow pedestrians to safely cross',
          'Overtake the vehicle in front to clear the intersection',
          'Accelerate quickly before pedestrians reach the road',
        ],
        correctIndex: 1,
        explanation: 'Pedestrians have right of way at zebra crossings; drivers must slow down and stop safely.',
      },
    ];
  }
  if (t.includes('python') || t.includes('code') || t.includes('programm')) {
    return [
      {
        prompt: 'Which of the following built-in data types in Python is immutable?',
        options: ['List', 'Dictionary', 'Tuple', 'Set'],
        correctIndex: 2,
        explanation: 'Tuples cannot be altered or modified after creation, making them immutable in Python.',
      },
      {
        prompt: 'What keyword is used to declare a function in Python?',
        options: ['function', 'def', 'func', 'define'],
        correctIndex: 1,
        explanation: 'In Python, the `def` keyword is used to define a function.',
      },
      {
        prompt: 'What does the `break` statement do inside a loop in Python?',
        options: [
          'Skips the rest of the current iteration and moves to the next',
          'Terminates the loop immediately and resumes execution after the loop',
          'Restarts the loop from index 0',
          'Throws an unhandled exception',
        ],
        correctIndex: 1,
        explanation: 'The `break` statement immediately exits the closest enclosing loop.',
      },
    ];
  }
  return [
    {
      prompt: `What is the most effective approach to mastering ${skillTitle || 'this skill'}?`,
      options: [
        'Consistent deliberate practice and mastering core fundamentals',
        'Practicing once a month without feedback',
        'Skipping basics and jumping directly to expert tasks',
        'Passive reading without hands-on exercises',
      ],
      correctIndex: 0,
      explanation: 'Deliberate practice with solid fundamentals forms the bedrock of competence.',
    },
    {
      prompt: 'When encountering an error or difficulty during practice, what is best practice?',
      options: [
        'Quit and abandon the session',
        'Analyze the root cause and retry with adjustments',
        'Ignore it and never review the problem',
        'Assume it will resolve itself automatically',
      ],
      correctIndex: 1,
      explanation: 'Error analysis and iterative correction lead to rapid skill development.',
    },
  ];
}

function CreateAssessmentModal({ ex, onClose, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState(`${ex.skill?.title || 'Skill'} Knowledge & Practice Evaluation`);
  const [description, setDescription] = useState(`Comprehensive evaluation test for ${ex.requester?.name || 'the mentee'} covering core concepts and practical rules.`);
  const [passingScore, setPassingScore] = useState(70);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(15);
  const [questions, setQuestions] = useState(() => getSampleQuestions(ex.skill?.title));
  const [loading, setLoading] = useState(false);

  const loadSamples = () => {
    setQuestions(getSampleQuestions(ex.skill?.title));
    toast('Loaded sample questions for ' + (ex.skill?.title || 'course'));
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      { prompt: '', options: ['Option A', 'Option B'], correctIndex: 0, explanation: '' },
    ]);
  };

  const removeQuestion = (idx) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const updateQ = (idx, field, val) => {
    setQuestions(questions.map((q, i) => (i === idx ? { ...q, [field]: val } : q)));
  };

  const updateOpt = (qIdx, optIdx, val) => {
    setQuestions(questions.map((q, i) => {
      if (i !== qIdx) return q;
      const opts = [...q.options];
      opts[optIdx] = val;
      return { ...q, options: opts };
    }));
  };

  const addOpt = (qIdx) => {
    setQuestions(questions.map((q, i) => {
      if (i !== qIdx || q.options.length >= 6) return q;
      return { ...q, options: [...q.options, `Option ${String.fromCharCode(65 + q.options.length)}`] };
    }));
  };

  const removeOpt = (qIdx, optIdx) => {
    setQuestions(questions.map((q, i) => {
      if (i !== qIdx || q.options.length <= 2) return q;
      const opts = q.options.filter((_, j) => j !== optIdx);
      let cIdx = q.correctIndex;
      if (cIdx >= optIdx && cIdx > 0) cIdx -= 1;
      return { ...q, options: opts, correctIndex: cIdx };
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return toast('Title is required', 'err');
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].prompt.trim()) return toast(`Question ${i + 1} has an empty prompt`, 'err');
      const validOpts = questions[i].options.filter((o) => o.trim());
      if (validOpts.length < 2) return toast(`Question ${i + 1} requires at least 2 choices`, 'err');
    }

    setLoading(true);
    try {
      await api.post(`/exchanges/${ex._id}/assessments`, {
        title,
        description,
        passingScore: Number(passingScore),
        timeLimitMinutes: Number(timeLimitMinutes),
        questions,
      });
      toast('Test created and assigned to mentee!');
      onCreated();
      onClose();
    } catch (err) {
      toast(errMsg(err), 'err');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Create Mentee Evaluation Test" onClose={onClose}>
      <form onSubmit={handleSubmit} className="stack" style={{ gap: '1.2rem', maxHeight: '75vh', overflowY: 'auto', paddingRight: '.5rem' }}>
        <p className="muted small" style={{ margin: 0 }}>
          Create a multiple-choice assessment for <strong>{ex.requester?.name}</strong>. The system will auto-evaluate their responses, calculate scores, and present the detailed breakdown to both of you!
        </p>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="eval-title">Test Title</label>
            <input
              id="eval-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Driving Rules & Safety Test"
            />
          </div>
          <div className="row" style={{ gap: '.75rem', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="eval-pass">Pass Mark (%)</label>
              <input
                id="eval-pass"
                type="number"
                min="1"
                max="100"
                required
                value={passingScore}
                onChange={(e) => setPassingScore(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="eval-time">Time Limit (min)</label>
              <input
                id="eval-time"
                type="number"
                min="1"
                max="120"
                required
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="eval-desc">Instructions for Mentee</label>
          <textarea
            id="eval-desc"
            rows="2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Guidance or rules for taking this evaluation"
          />
        </div>

        <div className="row between" style={{ alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Questions ({questions.length})</h3>
            <span className="small muted">Select the radio button next to the choice that is the correct answer</span>
          </div>
          <button type="button" className="btn small ghost" onClick={loadSamples}>
            ✨ Load Sample Questions
          </button>
        </div>

        <div className="stack" style={{ gap: '1rem' }}>
          {questions.map((q, qIdx) => (
            <div key={qIdx} className="card flat" style={{ border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
              <div className="row between" style={{ marginBottom: '.5rem' }}>
                <strong>Question {qIdx + 1}</strong>
                {questions.length > 1 && (
                  <button type="button" className="btn link small" style={{ color: 'var(--rose)' }} onClick={() => removeQuestion(qIdx)}>
                    Remove Question
                  </button>
                )}
              </div>

              <div className="field" style={{ marginBottom: '.75rem' }}>
                <input
                  aria-label={`Question ${qIdx + 1} prompt`}
                  required
                  placeholder="Enter the question prompt here..."
                  value={q.prompt}
                  onChange={(e) => updateQ(qIdx, 'prompt', e.target.value)}
                />
              </div>

              <div className="small muted" style={{ marginBottom: '.35rem' }}>
                Choices (Click the radio to set the correct answer):
              </div>

              <div className="stack" style={{ gap: '.4rem', marginBottom: '.6rem' }}>
                {q.options.map((opt, optIdx) => (
                  <div key={optIdx} className="row" style={{ gap: '.5rem', alignItems: 'center' }}>
                    <input
                      type="radio"
                      name={`correct-${qIdx}`}
                      checked={q.correctIndex === optIdx}
                      onChange={() => updateQ(qIdx, 'correctIndex', optIdx)}
                      title="Set as correct answer"
                      style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                    />
                    <input
                      aria-label={`Choice ${optIdx + 1}`}
                      required
                      value={opt}
                      onChange={(e) => updateOpt(qIdx, optIdx, e.target.value)}
                      placeholder={`Choice ${optIdx + 1}`}
                      style={{ flex: 1 }}
                    />
                    {q.correctIndex === optIdx && (
                      <span className="chip teal small" style={{ fontSize: '.75rem' }}>Correct Answer</span>
                    )}
                    {q.options.length > 2 && (
                      <button
                        type="button"
                        className="btn ghost small"
                        style={{ padding: '.2rem .5rem' }}
                        onClick={() => removeOpt(qIdx, optIdx)}
                        title="Delete choice"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {q.options.length < 6 && (
                <button
                  type="button"
                  className="btn link small"
                  onClick={() => addOpt(qIdx)}
                  style={{ marginBottom: '.6rem' }}
                >
                  + Add another choice
                </button>
              )}

              <div className="field">
                <label className="small muted">Explanation (shown to mentee after submission):</label>
                <input
                  value={q.explanation || ''}
                  onChange={(e) => updateQ(qIdx, 'explanation', e.target.value)}
                  placeholder="Why is this answer correct? (e.g. Traffic rules require yielding at amber...)"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
          <button type="button" className="btn ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <div className="row" style={{ gap: '.5rem' }}>
            <button type="button" className="btn ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Publishing…' : 'Publish Test to Mentee'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function TakeAssessmentModal({ ex, assessment, onClose, onCompleted }) {
  const toast = useToast();
  const [answers, setAnswers] = useState(() => new Array(assessment.questions?.length || 0).fill(null));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(assessment.timeLimitMinutes ? assessment.timeLimitMinutes * 60 : null);

  useEffect(() => {
    if (result || timeLeft === null) return undefined;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [result, timeLeft]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const unanswered = answers.filter((a) => a === null).length;
    if (unanswered > 0 && !window.confirm(`You have ${unanswered} unanswered question(s). Submit now for evaluation?`)) {
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post(`/exchanges/${ex._id}/assessments/${assessment._id}/submit`, {
        answers: answers.map((a) => (a === null ? -1 : a)),
      });
      setResult(data);
      toast(data.passed ? '🎉 Congratulations! You passed the test!' : 'Test submitted. Review your answers below.');
      onCompleted();
    } catch (err) {
      toast(errMsg(err), 'err');
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = answers.filter((a) => a !== null).length;
  const totalQuestions = assessment.questions?.length || 0;

  if (result) {
    return (
      <Modal title={`Evaluation Results: ${assessment.title}`} onClose={onClose}>
        <div className="stack" style={{ gap: '1rem', maxHeight: '75vh', overflowY: 'auto' }}>
          <div
            className="card"
            style={{
              borderLeft: `5px solid ${result.passed ? 'var(--teal)' : 'var(--rose)'}`,
              background: 'var(--surface-2)',
              textAlign: 'center',
              padding: '1.25rem',
            }}
          >
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: result.passed ? 'var(--teal)' : 'var(--rose)' }}>
              {result.score}%
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: '.5rem', margin: '.4rem 0' }}>
              <span className={`chip ${result.passed ? 'teal' : 'rose'}`} style={{ fontSize: '.9rem', padding: '.3rem .8rem' }}>
                {result.passed ? 'PASSED ✅' : 'NEEDS PRACTICE ❌'}
              </span>
              <span className="chip">Pass Mark: {assessment.passingScore}%</span>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              {result.passed
                ? 'Great job! The system evaluated all answers and verified your proficiency.'
                : 'Keep practicing! Review the detailed answers and explanations below.'}
            </p>
          </div>

          <h3>Question Breakdown & Correct Answers</h3>
          <div className="stack" style={{ gap: '.75rem' }}>
            {result.breakdown?.map((item, i) => (
              <div
                key={i}
                className="card flat"
                style={{
                  border: `1px solid ${item.isCorrect ? '#2DB47A' : 'var(--rose)'}`,
                  background: 'var(--surface-2)',
                }}
              >
                <div className="row between" style={{ marginBottom: '.4rem' }}>
                  <strong>{i + 1}. {item.prompt}</strong>
                  <span className={`chip ${item.isCorrect ? 'teal' : 'rose'}`}>
                    {item.isCorrect ? 'Correct +1' : 'Incorrect'}
                  </span>
                </div>

                <div className="stack" style={{ gap: '.3rem', marginTop: '.5rem' }}>
                  {item.options?.map((opt, optIdx) => {
                    const isChosen = item.chosenIndex === optIdx;
                    const isCorrect = item.correctIndex === optIdx;
                    return (
                      <div
                        key={optIdx}
                        className={`quiz-opt ${isCorrect ? 'right' : isChosen ? 'wrong' : ''}`}
                        style={{ margin: 0, justifyContent: 'space-between' }}
                      >
                        <span>{opt}</span>
                        <div className="row" style={{ gap: '.3rem' }}>
                          {isChosen && (
                            <span className={`chip small ${isCorrect ? 'teal' : 'rose'}`}>
                              Your Answer {isCorrect ? '✓' : '✗'}
                            </span>
                          )}
                          {isCorrect && !isChosen && (
                            <span className="chip teal small">Correct Choice ✓</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {item.explanation && (
                  <div className="small muted" style={{ marginTop: '.6rem', padding: '.4rem .6rem', background: 'var(--surface)', borderRadius: 4 }}>
                    💡 <strong>Explanation:</strong> {item.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: '.75rem' }}>
            <button className="btn" onClick={onClose}>
              Done & Return to Workspace
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const mins = timeLeft !== null ? Math.floor(timeLeft / 60) : 0;
  const secs = timeLeft !== null ? timeLeft % 60 : 0;

  return (
    <Modal title={`Attending Test: ${assessment.title}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="stack" style={{ gap: '1rem', maxHeight: '75vh', overflowY: 'auto' }}>
        <div className="row between" style={{ background: 'var(--surface-2)', padding: '.6rem 1rem', borderRadius: 6 }}>
          <div>
            <span className="small muted">Passing Mark: </span>
            <strong>{assessment.passingScore}%</strong>
            <span className="small muted"> · Answered: </span>
            <strong>{answeredCount} / {totalQuestions}</strong>
          </div>
          {timeLeft !== null && (
            <span className={`chip ${timeLeft < 180 ? 'rose' : 'teal'}`} style={{ fontWeight: 700 }}>
              ⏳ {mins}:{String(secs).padStart(2, '0')} remaining
            </span>
          )}
        </div>

        {assessment.description && (
          <p className="small muted" style={{ margin: 0 }}>
            {assessment.description}
          </p>
        )}

        <div className="stack" style={{ gap: '1rem' }}>
          {assessment.questions?.map((q, i) => (
            <div key={q._id || i} className="card flat" style={{ border: '1px solid var(--line)', background: 'var(--surface-2)' }}>
              <div style={{ marginBottom: '.6rem', fontWeight: 600 }}>
                {i + 1}. {q.prompt}
              </div>
              <div className="stack" style={{ gap: '.4rem' }}>
                {q.options?.map((opt, optIdx) => (
                  <label
                    key={optIdx}
                    className={`quiz-opt ${answers[i] === optIdx ? 'sel' : ''}`}
                    style={{ margin: 0 }}
                  >
                    <input
                      type="radio"
                      name={`q-${i}`}
                      checked={answers[i] === optIdx}
                      onChange={() => {
                        const updated = [...answers];
                        updated[i] = optIdx;
                        setAnswers(updated);
                      }}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
          <button type="button" className="btn ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Evaluating Test…' : 'Submit Test for Evaluation'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AssessmentResultsModal({ assessment, mentee, onClose }) {
  const attempt = assessment.latestAttempt || assessment.myLatest;
  const breakdown = attempt?.breakdown || [];

  return (
    <Modal title={`Evaluation Breakdown: ${assessment.title}`} onClose={onClose}>
      <div className="stack" style={{ gap: '1rem', maxHeight: '75vh', overflowY: 'auto' }}>
        <div
          className="card"
          style={{
            borderLeft: `5px solid ${attempt?.passed ? 'var(--teal)' : 'var(--rose)'}`,
            background: 'var(--surface-2)',
            textAlign: 'center',
            padding: '1.25rem',
          }}
        >
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: attempt?.passed ? 'var(--teal)' : 'var(--rose)' }}>
            {attempt?.score}%
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: '.5rem', margin: '.4rem 0' }}>
            <span className={`chip ${attempt?.passed ? 'teal' : 'rose'}`} style={{ fontSize: '.9rem', padding: '.3rem .8rem' }}>
              {attempt?.passed ? 'PASSED ✅' : 'NEEDS PRACTICE ❌'}
            </span>
            <span className="chip">Pass Mark: {assessment.passingScore}%</span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Student: <strong>{mentee?.name || 'Mentee'}</strong> · Evaluated automatically by SkillSwap
            {attempt?.submittedAt && ` on ${fmtDate(attempt.submittedAt)}`}
          </p>
        </div>

        <h3>Question by Question Review</h3>
        <div className="stack" style={{ gap: '.75rem' }}>
          {breakdown.length > 0 ? (
            breakdown.map((item, i) => (
              <div
                key={i}
                className="card flat"
                style={{
                  border: `1px solid ${item.isCorrect ? '#2DB47A' : 'var(--rose)'}`,
                  background: 'var(--surface-2)',
                }}
              >
                <div className="row between" style={{ marginBottom: '.4rem' }}>
                  <strong>{i + 1}. {item.prompt}</strong>
                  <span className={`chip ${item.isCorrect ? 'teal' : 'rose'}`}>
                    {item.isCorrect ? 'Correct +1' : 'Incorrect'}
                  </span>
                </div>

                <div className="stack" style={{ gap: '.3rem', marginTop: '.5rem' }}>
                  {item.options?.map((opt, optIdx) => {
                    const isChosen = item.chosenIndex === optIdx;
                    const isCorrect = item.correctIndex === optIdx;
                    return (
                      <div
                        key={optIdx}
                        className={`quiz-opt ${isCorrect ? 'right' : isChosen ? 'wrong' : ''}`}
                        style={{ margin: 0, justifyContent: 'space-between' }}
                      >
                        <span>{opt}</span>
                        <div className="row" style={{ gap: '.3rem' }}>
                          {isChosen && (
                            <span className={`chip small ${isCorrect ? 'teal' : 'rose'}`}>
                              Mentee's Answer {isCorrect ? '✓' : '✗'}
                            </span>
                          )}
                          {isCorrect && !isChosen && (
                            <span className="chip teal small">Correct Choice ✓</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {item.explanation && (
                  <div className="small muted" style={{ marginTop: '.6rem', padding: '.4rem .6rem', background: 'var(--surface)', borderRadius: 4 }}>
                    💡 <strong>Explanation:</strong> {item.explanation}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="muted">No question breakdown recorded for this attempt.</p>
          )}
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: '.75rem' }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ExchangeAssessments({ ex, isMentor, isLearner, other, openChat }) {
  const toast = useToast();
  const { data, loading, reload } = useFetch(`/exchanges/${ex._id}/assessments`, [ex._id]);
  const [showCreate, setShowCreate] = useState(false);
  const [takingTest, setTakingTest] = useState(null);
  const [viewingResult, setViewingResult] = useState(null);

  const tests = data?.assessments || [];

  const deleteTest = async (testId) => {
    if (!window.confirm('Delete this evaluation test?')) return;
    try {
      await api.delete(`/exchanges/${ex._id}/assessments/${testId}`);
      toast('Test deleted');
      reload();
    } catch (err) {
      toast(errMsg(err), 'err');
    }
  };

  return (
    <div className="card assessment-card">
      <div className="row between" style={{ alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <div className="row" style={{ gap: '.5rem', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>📝 Course Assessments & Evaluations</h3>
            <span className="chip teal small">{tests.length} {tests.length === 1 ? 'Test' : 'Tests'}</span>
          </div>
          <p className="small muted" style={{ margin: '.2rem 0 0' }}>
            Mentors create MCQ evaluations to test mentee knowledge. Tests are auto-evaluated by the system and visible to both!
          </p>
        </div>

        {isMentor && (
          <button className="btn small" onClick={() => setShowCreate(true)}>
            + Create Evaluation Test
          </button>
        )}
      </div>

      {loading && !data ? (
        <Loading />
      ) : !tests.length ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', background: 'var(--surface-2)', borderRadius: 'var(--radius-s)' }}>
          <p className="muted small" style={{ margin: '0 0 .75rem 0' }}>
            {isMentor
              ? `You have not created any evaluation tests for ${ex.requester?.name || 'your mentee'} yet. Click below to create a quick MCQ test to evaluate their skills.`
              : 'No evaluation tests assigned yet. When your mentor creates an assessment, it will appear here for you to attend.'}
          </p>
          {isMentor && (
            <button className="btn small" onClick={() => setShowCreate(true)}>
              + Create First Evaluation Test
            </button>
          )}
        </div>
      ) : (
        <div className="stack" style={{ gap: '.75rem' }}>
          {tests.map((test) => {
            const attempt = test.latestAttempt || test.myLatest;
            const hasTaken = Boolean(attempt);

            return (
              <div
                key={test._id}
                style={{
                  background: 'var(--surface-2)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-s)',
                  border: '1px solid var(--line)',
                }}
              >
                <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '.5rem' }}>
                  <div>
                    <div className="row" style={{ gap: '.4rem', marginBottom: '.3rem', flexWrap: 'wrap' }}>
                      <span className="chip">{test.questions?.length || 0} Questions</span>
                      <span className="chip">Pass: {test.passingScore}%</span>
                      {test.timeLimitMinutes > 0 && <span className="chip">{test.timeLimitMinutes} min</span>}
                      {hasTaken ? (
                        <span className={`chip ${attempt.passed ? 'teal' : 'rose'}`}>
                          Score: {attempt.score}% · {attempt.passed ? 'PASSED ✅' : 'NEEDS PRACTICE ❌'}
                        </span>
                      ) : (
                        <span className="chip gold">
                          {isLearner ? 'Pending Your Action' : `Waiting for ${ex.requester?.name?.split(' ')[0]} to attend`}
                        </span>
                      )}
                    </div>

                    <h4 style={{ margin: '0 0 .25rem 0' }}>{test.title}</h4>
                    {test.description && (
                      <p className="small muted" style={{ margin: '0 0 .4rem 0' }}>{test.description}</p>
                    )}

                    {hasTaken && (
                      <div className="small muted">
                        Evaluated on {fmtDate(attempt.submittedAt)} · Mentee score: <strong>{attempt.score}%</strong> ({attempt.passed ? 'Passed' : 'Needs Practice'})
                      </div>
                    )}
                  </div>

                  <div className="row" style={{ gap: '.5rem', alignItems: 'center' }}>
                    {isLearner && !hasTaken && (
                      <button className="btn small" onClick={() => setTakingTest(test)}>
                        ▶ Attend Test Now
                      </button>
                    )}

                    {hasTaken && (
                      <button className="btn small" onClick={() => setViewingResult(test)}>
                        👁 View Results & Breakdown
                      </button>
                    )}

                    {isLearner && hasTaken && (
                      <button className="btn ghost small" onClick={() => setTakingTest(test)}>
                        🔄 Retake Test
                      </button>
                    )}

                    {isMentor && !hasTaken && (
                      <button className="btn ghost small" onClick={() => openChat(ex.requester)}>
                        💬 Remind Mentee
                      </button>
                    )}

                    {isMentor && (
                      <button
                        className="btn link small"
                        style={{ color: 'var(--rose)', marginLeft: '.25rem' }}
                        onClick={() => deleteTest(test._id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateAssessmentModal
          ex={ex}
          onClose={() => setShowCreate(false)}
          onCreated={reload}
        />
      )}

      {takingTest && (
        <TakeAssessmentModal
          ex={ex}
          assessment={takingTest}
          onClose={() => setTakingTest(null)}
          onCompleted={reload}
        />
      )}

      {viewingResult && (
        <AssessmentResultsModal
          assessment={viewingResult}
          mentee={ex.requester}
          onClose={() => setViewingResult(null)}
        />
      )}
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

      {/* Course Assessments & Evaluations */}
      <ExchangeAssessments
        ex={ex}
        isMentor={isMentor}
        isLearner={isLearner}
        other={other}
        openChat={openChat}
      />

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
