import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, DAYS, fmtDate, fmtTime, todayStr } from './api';
import { Badge, Msg, Empty } from './ui';

export function Doctors() {
  const [q, setQ] = useState({ name: '', specialization: '', minExperience: '', day: '' });
  const [list, setList] = useState(null);
  const [specs, setSpecs] = useState([]);
  useEffect(() => { api('/doctors/specializations').then(setSpecs); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
      api('/doctors?' + qs).then(setList);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  const set = (k) => (e) => setQ({ ...q, [k]: e.target.value });
  return (
    <section>
      <h1>Find a doctor</h1>
      <div className="card filters">
        <label>Name<input placeholder="Search by name" value={q.name} onChange={set('name')} /></label>
        <label>Specialization
          <select value={q.specialization} onChange={set('specialization')}>
            <option value="">All</option>{specs.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Experience
          <select value={q.minExperience} onChange={set('minExperience')}>
            <option value="">Any</option><option value="3">3+ years</option><option value="5">5+ years</option><option value="10">10+ years</option>
          </select>
        </label>
        <label>Available on
          <select value={q.day} onChange={set('day')}><option value="">Any day</option>{DAYS.map((d) => <option key={d}>{d}</option>)}</select>
        </label>
      </div>
      {list === null ? <Empty>Loading doctors…</Empty> : !list.length ? <Empty>No doctors match these filters. Clear a filter to see more.</Empty> : (
        <div className="grid">
          {list.map((d) => (
            <article className="card doc" key={d.id}>
              <h3>{d.name}</h3>
              <p className="spec">{d.specialization}</p>
              <dl>
                <dt>Qualification</dt><dd>{d.qualification}</dd>
                <dt>Experience</dt><dd>{d.experience} years</dd>
                <dt>Days</dt><dd>{d.availableDays.map((x) => x.slice(0, 3)).join(', ')}</dd>
                <dt>Hours</dt><dd>{fmtTime(d.availableTime.start)} – {fmtTime(d.availableTime.end)}</dd>
                <dt>Fee</dt><dd>₹{d.consultationFee}</dd>
              </dl>
              <Link className="btn" to={`/doctors/${d.id}`}>View slots</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function Ticket({ a }) {
  return (
    <div className="ticket">
      <div className="ticket-head"><span>Appointment ID</span><b>{a.appointmentId}</b></div>
      <dl>
        <dt>Patient</dt><dd>{a.patientName}</dd>
        <dt>Doctor</dt><dd>{a.doctorName}{a.specialization && `, ${a.specialization}`}</dd>
        <dt>Date</dt><dd>{fmtDate(a.date)}</dd>
        <dt>Time</dt><dd>{fmtTime(a.time)}</dd>
        <dt>Reason</dt><dd>{a.reason}</dd>
        {a.consultationFee != null && <><dt>Fee</dt><dd>₹{a.consultationFee}</dd></>}
        <dt>Status</dt><dd><Badge s={a.status} /></dd>
      </dl>
    </div>
  );
}

export function DoctorDetail() {
  const { id } = useParams();
  const [doc, setDoc] = useState();
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState([]);
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState();
  const [done, setDone] = useState();
  const loadSlots = () => api(`/doctors/${id}/slots?date=${date}`).then(setSlots).catch(() => setSlots([]));
  useEffect(() => { api('/doctors/' + id).then(setDoc).catch((e) => setMsg({ type: 'err', text: e.message })); }, [id]);
  useEffect(() => { setTime(''); if (date) loadSlots(); }, [id, date]);
  const book = async () => {
    setMsg();
    try { setDone(await api('/appointments', { method: 'POST', body: { doctorId: id, date, time, reason } })); }
    catch (e) { setMsg({ type: 'err', text: e.message }); setTime(''); loadSlots(); }
  };
  if (done) return (
    <section>
      <h1>You're booked</h1>
      <Ticket a={done} />
      <p className="alt"><Link className="btn" to="/appointments">View my appointments</Link></p>
    </section>
  );
  if (!doc) return <Msg m={msg} />;
  return (
    <section>
      <Link to="/doctors" className="back">Back to doctors</Link>
      <h1>{doc.name}</h1>
      <p className="spec">{doc.specialization} · {doc.qualification} · {doc.experience} years · ₹{doc.consultationFee}</p>
      <div className="card form">
        <label>Choose a date<input type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <p className="muted">Works {doc.availableDays.join(', ')}, {fmtTime(doc.availableTime.start)} – {fmtTime(doc.availableTime.end)}</p>
        {!slots.length ? <Empty>No slots on this date. Pick one of the doctor's working days.</Empty> : (
          <div className="slots">
            {slots.map((s) => (
              <button key={s.time} type="button" disabled={!s.available} className={`slot ${time === s.time ? 'on' : ''}`} onClick={() => setTime(s.time)}>
                {fmtTime(s.time)}
              </button>
            ))}
          </div>
        )}
        <label>Reason for visit<input maxLength="300" placeholder="e.g. Chest pain follow-up" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <Msg m={msg} />
        <button className="btn" disabled={!time} onClick={book}>{time ? `Confirm ${fmtTime(time)} on ${fmtDate(date)}` : 'Select a time slot'}</button>
      </div>
    </section>
  );
}

export function MyAppointments() {
  const [data, setData] = useState();
  const [tab, setTab] = useState('upcoming');
  const [open, setOpen] = useState();
  const [msg, setMsg] = useState();
  const load = () => api('/appointments/my').then(setData);
  useEffect(() => { load(); }, []);
  const cancel = async (a) => {
    if (!confirm(`Cancel your appointment with ${a.doctorName} on ${fmtDate(a.date)}?`)) return;
    try { await api(`/appointments/${a.id}/cancel`, { method: 'PATCH' }); setMsg({ type: 'ok', text: 'Appointment cancelled.' }); load(); }
    catch (e) { setMsg({ type: 'err', text: e.message }); }
  };
  const list = data?.[tab] || [];
  return (
    <section>
      <h1>My appointments</h1>
      <div className="seg">{['upcoming', 'previous'].map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'upcoming' ? 'Upcoming' : 'Previous'}{data && ` (${data[t].length})`}</button>)}</div>
      <Msg m={msg} />
      {!data ? <Empty>Loading…</Empty> : !list.length ? (
        <Empty>{tab === 'upcoming' ? <>Nothing scheduled. <Link to="/doctors">Find a doctor</Link> to book a visit.</> : 'No previous appointments yet.'}</Empty>
      ) : list.map((a) => (
        <div className="card appt" key={a.id}>
          <div className="appt-main">
            <div><b>{a.doctorName}</b><span className="muted"> {a.specialization}</span></div>
            <div>{fmtDate(a.date)}, {fmtTime(a.time)}</div>
            <Badge s={a.status} />
            <div className="actions">
              <button className="link" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Hide details' : 'View details'}</button>
              {tab === 'upcoming' && <button className="link danger" onClick={() => cancel(a)}>Cancel</button>}
            </div>
          </div>
          {open === a.id && <Ticket a={a} />}
        </div>
      ))}
    </section>
  );
}
