import { useState, useEffect } from 'react';
import { api, fmtDate, fmtTime } from './api';
import { Badge, Msg, Empty } from './ui';

const NEXT = { Pending: ['Confirmed', 'Cancelled'], Confirmed: ['Completed', 'Cancelled'] };
const TABS = [['today', 'Today'], ['upcoming', 'Upcoming'], ['past', 'Previous'], ['all', 'All']];

export function DoctorAppointments() {
  const [tab, setTab] = useState('today');
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState();
  const load = () => api('/doctor/appointments?filter=' + tab).then(setList);
  useEffect(() => { setList(null); load(); }, [tab]);
  const update = async (a, status) => {
    setMsg();
    try { await api(`/doctor/appointments/${a.id}/status`, { method: 'PATCH', body: { status } }); load(); }
    catch (e) { setMsg({ type: 'err', text: e.message }); }
  };
  return (
    <section>
      <h1>Appointments</h1>
      <div className="seg">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <Msg m={msg} />
      {list === null ? <Empty>Loading…</Empty> : !list.length ? <Empty>No appointments in this view.</Empty> : (
        <div className="card scroll">
          <table>
            <thead><tr><th>ID</th><th>Patient</th><th>Date and time</th><th>Reason</th><th>Status</th><th>Update</th></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>{a.appointmentId}</td>
                  <td><b>{a.patient?.name || a.patientName}</b><br /><span className="muted">{a.patient && `${a.patient.age} yrs, ${a.patient.gender}, ${a.patient.phone}`}</span></td>
                  <td>{fmtDate(a.date)}<br />{fmtTime(a.time)}</td>
                  <td>{a.reason}</td>
                  <td><Badge s={a.status} /></td>
                  <td className="actions">
                    {(NEXT[a.status] || []).map((s) => <button key={s} className={`link ${s === 'Cancelled' ? 'danger' : ''}`} onClick={() => update(a, s)}>Mark {s.toLowerCase()}</button>)}
                    {!NEXT[a.status] && <span className="muted">–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DoctorPatients() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/doctor/patients').then(setList); }, []);
  return (
    <section>
      <h1>Your patients</h1>
      {list === null ? <Empty>Loading…</Empty> : !list.length ? <Empty>Patients appear here once they book with you.</Empty> : (
        <div className="grid">
          {list.map((p) => (
            <article className="card" key={p.id}>
              <h3>{p.name}</h3>
              <p className="muted">{p.age} yrs, {p.gender} · {p.phone}</p>
              <ul className="plain">
                {p.appointments.map((a) => <li key={a.appointmentId}>{fmtDate(a.date)}, {fmtTime(a.time)} <Badge s={a.status} /></li>)}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
