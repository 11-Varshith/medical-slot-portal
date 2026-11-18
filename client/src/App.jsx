import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from './api';
import { AuthCtx, useAuth, Msg, PatientFields, DoctorFields } from './ui';
import { Doctors, DoctorDetail, MyAppointments } from './patient';
import { DoctorAppointments, DoctorPatients } from './doctor';

function Provider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('token')) return setReady(true);
    api('/me').then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setReady(true));
  }, []);
  const login = ({ token, user }) => { localStorage.setItem('token', token); setUser(user); };
  const logout = () => { localStorage.removeItem('token'); setUser(null); };
  return <AuthCtx.Provider value={{ user, setUser, login, logout }}>{ready && children}</AuthCtx.Provider>;
}

const blank = {
  gender: '', availableDays: ['Monday', 'Wednesday', 'Friday'],
  availableTime: { start: '10:00', end: '13:00' }, slotDuration: 30,
};

function Auth({ mode }) {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState('patient');
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState();
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (user) return <Navigate to="/" />;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg();
    try { login(await api(`/auth/${mode}`, { method: 'POST', body: { ...f, role } })); nav('/'); }
    catch (x) { setMsg({ type: 'err', text: x.message }); }
    setBusy(false);
  };
  const reg = mode === 'register';
  return (
    <main className="auth">
      <aside className="hero">
        <h1>See the right doctor, at a time that works.</h1>
        <p>Find a specialist, pick an open slot, and get a confirmed appointment in under a minute. Doctors manage their day in one place.</p>
        <ul><li>Live slot availability, no double booking</li><li>Cancel any upcoming visit yourself</li><li>Full appointment history</li></ul>
      </aside>
      <form className="card auth-form" onSubmit={submit}>
        <h2>{reg ? 'Create your account' : 'Welcome back'}</h2>
        <div className="seg" role="tablist">
          {['patient', 'doctor'].map((r) => (
            <button type="button" key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>I am a {r}</button>
          ))}
        </div>
        {reg && <label>Full name<input value={f.name || ''} onChange={set('name')} required /></label>}
        <label>Email<input type="email" value={f.email || ''} onChange={set('email')} required /></label>
        <label>Password<input type="password" minLength={reg ? 6 : 1} value={f.password || ''} onChange={set('password')} required /></label>
        {reg && <label>Phone<input type="tel" value={f.phone || ''} onChange={set('phone')} required /></label>}
        {reg && (role === 'patient' ? <PatientFields f={f} set={set} /> : <DoctorFields f={f} setF={setF} set={set} />)}
        <Msg m={msg} />
        <button className="btn" disabled={busy}>{busy ? 'Please wait…' : reg ? 'Create account' : 'Log in'}</button>
        <p className="alt">{reg ? 'Already registered?' : 'New here?'} <NavLink to={reg ? '/login' : '/register'}>{reg ? 'Log in' : 'Create an account'}</NavLink></p>
        {!reg && <p className="alt"><NavLink to={`/forgot-password?role=${role}`}>Forgot your password?</NavLink></p>}
        {!reg && <p className="hint">Demo: patient@demo.com / patient123, dr.rahul.sharma@demo.com / doctor123 (choose Doctor)</p>}
      </form>
    </main>
  );
}

function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState(searchParams.get('role') === 'doctor' ? 'doctor' : 'patient');
  const [email, setEmail] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const [msg, setMsg] = useState();
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(); setResetUrl('');
    try {
      const result = await api('/auth/forgot-password', { method: 'POST', body: { email, role } });
      setMsg({ type: 'ok', text: result.message });
      setResetUrl(result.resetUrl || '');
    } catch (error) {
      setMsg({ type: 'err', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <aside className="hero">
        <h1>Get back to your care.</h1>
        <p>Request a secure password reset link. For your protection, links expire after 30 minutes and can only be used once.</p>
      </aside>
      <form className="card auth-form" onSubmit={submit}>
        <h2>Forgot your password?</h2>
        <p className="muted">Enter the email address and account type you use to sign in.</p>
        <div className="seg" role="group" aria-label="Account type">
          {['patient', 'doctor'].map((value) => (
            <button type="button" key={value} className={role === value ? 'on' : ''} onClick={() => setRole(value)}>I am a {value}</button>
          ))}
        </div>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <Msg m={msg} />
        {resetUrl && <p className="dev-reset">Development reset link: <a href={resetUrl}>Reset your password</a></p>}
        <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        <p className="alt"><NavLink to="/login">Back to log in</NavLink></p>
      </form>
    </main>
  );
}

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const token = searchParams.get('token') || '';
  const role = searchParams.get('role') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState();
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMsg({ type: 'err', text: 'The passwords do not match.' });
      return;
    }
    setBusy(true); setMsg();
    try {
      const result = await api('/auth/reset-password', { method: 'POST', body: { token, role, password } });
      setMsg({ type: 'ok', text: result.message });
      setComplete(true);
    } catch (error) {
      setMsg({ type: 'err', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <aside className="hero">
        <h1>Choose a new password.</h1>
        <p>Use at least 8 characters. After saving, sign in with your new password.</p>
      </aside>
      <form className="card auth-form" onSubmit={submit}>
        <h2>Reset your password</h2>
        {!token && <Msg m={{ type: 'err', text: 'This password reset link is missing or invalid. Request a new one.' }} />}
        <label>New password<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={complete} /></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={complete} /></label>
        <Msg m={msg} />
        {complete
          ? <button type="button" className="btn" onClick={() => nav('/login')}>Go to log in</button>
          : <button className="btn" disabled={busy || !token}>{busy ? 'Saving…' : 'Save new password'}</button>}
        {!complete && <p className="alt"><NavLink to="/forgot-password">Request another link</NavLink></p>}
      </form>
    </main>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState();
  useEffect(() => { api('/dashboard').then(setD); }, []);
  const cards = user.role === 'patient'
    ? [['Total appointments', 'total'], ['Upcoming', 'upcoming'], ['Previous', 'previous'], ['Cancelled', 'cancelled']]
    : [["Today's appointments", 'today'], ['Upcoming', 'upcoming'], ['Total patients', 'patients'], ['Completed', 'completed']];
  return (
    <section>
      <h1>Hello, {user.name.split(' ')[0] === 'Dr.' ? user.name : user.name.split(' ')[0]}</h1>
      <div className="stats">
        {cards.map(([label, k]) => <div className="stat card" key={k}><b>{d ? d[k] : '–'}</b><span>{label}</span></div>)}
      </div>
      <NavLink className="btn" to={user.role === 'patient' ? '/doctors' : '/appointments'}>
        {user.role === 'patient' ? 'Find a doctor' : "View today's schedule"}
      </NavLink>
    </section>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const [f, setF] = useState(user);
  const [msg, setMsg] = useState();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setMsg();
    try { setUser(await api('/me', { method: 'PUT', body: f })); setMsg({ type: 'ok', text: 'Profile saved.' }); }
    catch (x) { setMsg({ type: 'err', text: x.message }); }
  };
  return (
    <section>
      <h1>{user.role === 'doctor' ? 'Profile and availability' : 'Your profile'}</h1>
      <form className="card form" onSubmit={save}>
        <div className="row">
          <label>Full name<input value={f.name} onChange={set('name')} required /></label>
          <label>Phone<input value={f.phone} onChange={set('phone')} required /></label>
        </div>
        <label>Email<input value={f.email} disabled /></label>
        {user.role === 'patient' ? <PatientFields f={f} set={set} /> : <DoctorFields f={f} setF={setF} set={set} />}
        <Msg m={msg} />
        <button className="btn">Save changes</button>
      </form>
    </section>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const links = user.role === 'patient'
    ? [['/', 'Dashboard'], ['/doctors', 'Find doctors'], ['/appointments', 'My appointments'], ['/profile', 'Profile']]
    : [['/', 'Dashboard'], ['/appointments', 'Appointments'], ['/patients', 'Patients'], ['/profile', 'Profile']];
  const p = user.role === 'patient';
  return (
    <>
      <header className="nav">
        <span className="brand">CareSlot</span>
        <nav>{links.map(([to, l]) => <NavLink key={to} to={to} end={to === '/'}>{l}</NavLink>)}</nav>
        <button className="link" onClick={logout}>Log out</button>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/appointments" element={p ? <MyAppointments /> : <DoctorAppointments />} />
          {p && <Route path="/doctors" element={<Doctors />} />}
          {p && <Route path="/doctors/:id" element={<DoctorDetail />} />}
          {!p && <Route path="/patients" element={<DoctorPatients />} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}

function Gate() {
  const { user } = useAuth();
  return user ? <Shell /> : (
    <Routes>
      <Route path="/register" element={<Auth mode="register" />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<Auth mode="login" />} />
    </Routes>
  );
}

export default function App() { return <Provider><Gate /></Provider>; }
