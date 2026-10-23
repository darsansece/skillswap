import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { errMsg } from '../api/client';
import { ErrorBox } from '../components/ui';

function AuthShell({ children }) {
  return (
    <div className="auth">
      <section className="pitch">
        <h1>Trade what you know for what you want to learn.</h1>
        <p>Teach an hour, earn a credit. Spend it learning guitar, Spanish or sourdough from someone in your community — or swap skills directly.</p>
        <div className="ledger" aria-hidden="true">
          <div><span>Taught Python, 1 hour</span><span className="coin">+2</span></div>
          <div><span>Learned guitar, 1 hour</span><span className="coin">−2</span></div>
          <div><span>Swapped Spanish for baking</span><span>even</span></div>
        </div>
      </section>
      <section className="form">{children}</section>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(f.email, f.password); nav(loc.state?.from || '/'); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <AuthShell>
      <form className="card" onSubmit={submit}>
        <h2>Log in</h2>
        <ErrorBox error={err} />
        <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <p className="small" style={{ marginTop: '1rem' }}><Link to="/forgot-password">Forgot your password?</Link></p>
        <p className="small">New here? <Link to="/register">Create an account</Link></p>
      </form>
    </AuthShell>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await register(f); nav('/profile?welcome=1'); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <AuthShell>
      <form className="card" onSubmit={submit}>
        <h2>Create your account</h2>
        <p className="muted small">You start with <span className="coin">10</span> credits.</p>
        <ErrorBox error={err} />
        <div className="field"><label htmlFor="nm">Name</label><input id="nm" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><div className="hint">At least 8 characters, including a number.</div></div>
        <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        <p className="small" style={{ marginTop: '1rem' }}>Already a member? <Link to="/login">Log in</Link></p>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [res, setRes] = useState(null);
  const submit = async (e) => { e.preventDefault(); const { data } = await api.post('/auth/forgot-password', { email }); setRes(data); };
  return (
    <AuthShell>
      <form className="card" onSubmit={submit}>
        <h2>Reset your password</h2>
        {res ? (
          <>
            <p>{res.message}.</p>
            {res.devResetToken && <p className="small muted">Development mode: <Link to={`/reset-password/${res.devResetToken}`}>open the reset link</Link></p>}
          </>
        ) : (
          <>
            <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <button className="btn">Send reset link</button>
          </>
        )}
        <p className="small" style={{ marginTop: '1rem' }}><Link to="/login">Back to log in</Link></p>
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  const { token } = useParams();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post(`/auth/reset-password/${token}`, { password: pw }); nav('/login'); } catch (x) { setErr(errMsg(x)); }
  };
  return (
    <AuthShell>
      <form className="card" onSubmit={submit}>
        <h2>Choose a new password</h2>
        <ErrorBox error={err} />
        <div className="field"><label htmlFor="pw">New password</label><input id="pw" type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <button className="btn">Save password</button>
      </form>
    </AuthShell>
  );
}

export function VerifyEmail() {
  const { token } = useParams();
  const [msg, setMsg] = useState('Verifying…');
  useEffect(() => { api.get(`/auth/verify-email/${token}`).then(() => setMsg('Your email is verified.')).catch((e) => setMsg(errMsg(e))); }, [token]);
  return <AuthShell><div className="card"><h2>Email verification</h2><p>{msg}</p><Link to="/">Go to SkillSwap</Link></div></AuthShell>;
}
