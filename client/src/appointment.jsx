import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, LAB_STEPS, fmtDate, fmtTime, fmtStamp, isFuture, fileToPayload, openFile } from './api';
import { Badge, Msg, Empty, ICON, useAuth, ReasonDialog } from './ui';

export function Ticket({ a }) {
  return (
    <div className="ticket">
      <div className="ticket-head"><span>🎫 Appointment ID</span><b>{a.appointmentId}</b></div>
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

export function PrescriptionCard({ p }) {
  return (
    <article className="card rx">
      <header><b>💊 Prescription</b><span className="muted">{p.doctorName} · {fmtDate(p.createdAt)} · {p.appointmentCode}</span></header>
      {p.diagnosis && <p><b>Diagnosis:</b> {p.diagnosis}</p>}
      {p.kind === 'written' ? (
        <div className="scroll"><table>
          <thead><tr><th>Tablet</th><th>MG</th><th>Times a day</th><th>Days</th></tr></thead>
          <tbody>{p.medicines.map((m, i) => <tr key={i}><td><b>{m.name}</b></td><td>{m.mg} mg</td><td>{m.timesPerDay}×</td><td>{m.days}</td></tr>)}</tbody>
        </table></div>
      ) : <button className="btn ghost" onClick={() => openFile(p.file.fileId)}>📎 Open {p.file.name}</button>}
      {p.notes && <p className="muted note">📝 {p.notes}</p>}
    </article>
  );
}

export function LabCard({ lab, doctor, onChange, showWho }) {
  const idx = LAB_STEPS.indexOf(lab.status);
  const [f, setF] = useState({ status: lab.status, note: '', resultText: lab.resultText || '' });
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState();
  const save = async (e) => {
    e.preventDefault(); setMsg();
    try {
      const body = { ...f, ...(file && { file: await fileToPayload(file) }) };
      await api('/labs/' + lab.id, { method: 'PATCH', body });
      setFile(null); setF({ ...f, note: '' }); onChange?.();
    } catch (x) { setMsg({ type: 'err', text: x.message }); }
  };
  return (
    <article className="card lab">
      <header><b>🧪 {lab.testName}</b><Badge s={lab.status} /></header>
      <p className="muted">{showWho ? `${lab.patientName} · ` : `${lab.doctorName} · `}{lab.appointmentCode}{lab.instructions && ` · ${lab.instructions}`}</p>
      <div className="progress" role="progressbar" aria-valuemin="0" aria-valuemax="3" aria-valuenow={idx} aria-label="Lab test progress">
        <div className="bar"><i style={{ width: `${(idx / (LAB_STEPS.length - 1)) * 100}%` }} /></div>
        <div className="steps">{LAB_STEPS.map((s, k) => <div key={s} className={`step ${k <= idx ? 'done' : ''}`}><span>{ICON[s]}</span><small>{s}</small></div>)}</div>
      </div>
      <ul className="timeline">{[...lab.history].reverse().map((h, k) => <li key={k}><b>{h.status}</b> <span className="muted">{fmtStamp(h.at)}{h.note && ` · ${h.note}`}</span></li>)}</ul>
      {(lab.resultText || lab.file?.fileId) && (
        <div className="result">
          <b>📄 Results</b>
          {lab.resultText && <pre>{lab.resultText}</pre>}
          {lab.file?.fileId && <button className="btn ghost small" onClick={() => openFile(lab.file.fileId)}>📎 Open {lab.file.name}</button>}
        </div>
      )}
      {doctor && (
        <details className="update">
          <summary>Update progress or add results</summary>
          <form className="form" onSubmit={save}>
            <div className="row">
              <label>Stage<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{LAB_STEPS.slice(idx).map((s) => <option key={s}>{s}</option>)}</select></label>
              <label>Note for the patient<input value={f.note} maxLength="300" onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" /></label>
            </div>
            <label>Write the results<textarea rows="3" value={f.resultText} onChange={(e) => setF({ ...f, resultText: e.target.value })} placeholder="e.g. LDL 110 mg/dL (normal)" /></label>
            <label>Or upload the report (PDF/image, max 5 MB)<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
            <Msg m={msg} /><button className="btn small">Save update</button>
          </form>
        </details>
      )}
    </article>
  );
}

function PrescribeForm({ apptId, onSaved }) {
  const [mode, setMode] = useState('write');
  const [meds, setMeds] = useState([{ name: '', timesPerDay: 1, mg: '', days: '' }]);
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState();
  const setMed = (i, k) => (e) => setMeds(meds.map((m, j) => (j === i ? { ...m, [k]: e.target.value } : m)));
  const submit = async (e) => {
    e.preventDefault(); setMsg();
    try {
      const body = mode === 'write' ? { kind: 'written', diagnosis, notes, medicines: meds } : { kind: 'upload', diagnosis, notes, file: file && (await fileToPayload(file)) };
      if (mode === 'upload' && !file) throw new Error('Choose a prescription file to upload.');
      await api(`/appointments/${apptId}/prescriptions`, { method: 'POST', body });
      setMeds([{ name: '', timesPerDay: 1, mg: '', days: '' }]); setDiagnosis(''); setNotes(''); setFile(null);
      setMsg({ type: 'ok', text: '✅ Prescription sent to the patient.' }); onSaved();
    } catch (x) { setMsg({ type: 'err', text: x.message }); }
  };
  return (
    <form className="card form" onSubmit={submit}>
      <h3>➕ Add a prescription</h3>
      <div className="seg"><button type="button" className={mode === 'write' ? 'on' : ''} onClick={() => setMode('write')}>✍️ Write it</button><button type="button" className={mode === 'upload' ? 'on' : ''} onClick={() => setMode('upload')}>📎 Upload it</button></div>
      <label>Diagnosis (optional)<input value={diagnosis} maxLength="200" onChange={(e) => setDiagnosis(e.target.value)} /></label>
      {mode === 'write' ? (
        <>
          {meds.map((m, i) => (
            <div className="med" key={i}>
              <label>Tablet name<input value={m.name} onChange={setMed(i, 'name')} placeholder="e.g. Amlodipine" /></label>
              <label>Times a day<select value={m.timesPerDay} onChange={setMed(i, 'timesPerDay')}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></label>
              <label>MG<input type="number" min="1" value={m.mg} onChange={setMed(i, 'mg')} placeholder="500" /></label>
              <label>Days<input type="number" min="1" max="365" value={m.days} onChange={setMed(i, 'days')} placeholder="7" /></label>
              {meds.length > 1 && <button type="button" className="link danger" onClick={() => setMeds(meds.filter((_, j) => j !== i))}>Remove</button>}
            </div>
          ))}
          <button type="button" className="link" onClick={() => setMeds([...meds, { name: '', timesPerDay: 1, mg: '', days: '' }])}>+ Add another tablet</button>
        </>
      ) : <label>Prescription file (PDF/image, max 5 MB)<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} /></label>}
      <label>Notes for the patient (optional)<textarea rows="2" maxLength="1000" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Take after food" /></label>
      <Msg m={msg} /><button className="btn">Send prescription</button>
    </form>
  );
}

const COMMON_TESTS = ['Complete blood count (CBC)', 'Lipid profile', 'Fasting blood sugar', 'HbA1c', 'Thyroid profile (TSH)', 'Liver function test', 'Kidney function test', 'Urine routine', 'ECG', 'Chest X-ray'];
function LabOrderForm({ apptId, onSaved }) {
  const [testName, setTestName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [msg, setMsg] = useState();
  const submit = async (e) => {
    e.preventDefault(); setMsg();
    try { await api(`/appointments/${apptId}/labs`, { method: 'POST', body: { testName, instructions } }); setTestName(''); setInstructions(''); onSaved(); }
    catch (x) { setMsg({ type: 'err', text: x.message }); }
  };
  return (
    <form className="card form" onSubmit={submit}>
      <h3>➕ Order a lab test</h3>
      <div className="row">
        <label>Test name<input list="tests" value={testName} onChange={(e) => setTestName(e.target.value)} required /></label>
        <label>Instructions (optional)<input value={instructions} maxLength="500" onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Fasting for 10 hours" /></label>
      </div>
      <datalist id="tests">{COMMON_TESTS.map((t) => <option key={t} value={t} />)}</datalist>
      <Msg m={msg} /><button className="btn">Order test</button>
    </form>
  );
}

export function AppointmentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const doctor = user.role === 'doctor';
  const [d, setD] = useState();
  const [msg, setMsg] = useState();
  const [cancel, setCancel] = useState(false);
  const load = () => api('/appointments/' + id).then(setD).catch((e) => setMsg({ type: 'err', text: e.message }));
  useEffect(() => { load(); }, [id]);
  if (!d) return msg ? <Msg m={msg} /> : <Empty emoji="⏳">Loading…</Empty>;
  const { appointment: a, prescriptions, labTests } = d;
  const live = a.status === 'Pending' || a.status === 'Confirmed';
  const canRecord = a.status === 'Confirmed' || a.status === 'Completed';
  const setStatus = async (status) => {
    setMsg();
    try { await api(`/doctor/appointments/${a.id}/status`, { method: 'PATCH', body: { status } }); load(); }
    catch (e) { setMsg({ type: 'err', text: e.message }); }
  };
  return (
    <section className="stack">
      <Link to="/appointments" className="back">← Back to appointments</Link>
      <h1>📋 Appointment {a.appointmentId}</h1>
      <div className="two">
        <Ticket a={a} />
        <div className="stack">
          {doctor && a.patientInfo && <div className="card"><h3>🧑 Patient</h3><dl><dt>Name</dt><dd>{a.patientInfo.name}</dd><dt>Age</dt><dd>{a.patientInfo.age}</dd><dt>Gender</dt><dd>{a.patientInfo.gender}</dd><dt>Phone</dt><dd>{a.patientInfo.phone}</dd></dl></div>}
          {a.status === 'Cancelled' && a.cancellation && <div className="msg err">❌ Cancelled by {a.cancellation.by === user.role ? 'you' : a.cancellation.by}: {a.cancellation.reason}</div>}
          <Msg m={msg} />
          <div className="actions">
            {doctor && a.status === 'Pending' && <button className="btn" onClick={() => setStatus('Confirmed')}>✅ Confirm</button>}
            {doctor && a.status === 'Confirmed' && <button className="btn" disabled={isFuture(a) && a.date > new Date().toLocaleDateString('en-CA')} onClick={() => setStatus('Completed')}>🏁 Mark completed</button>}
            {live && (doctor ? a.date >= new Date().toLocaleDateString('en-CA') : isFuture(a)) && <button className="btn ghost danger" onClick={() => setCancel(true)}>Cancel with a reason…</button>}
          </div>
        </div>
      </div>

      <h2>💊 Prescriptions</h2>
      {prescriptions.length ? prescriptions.map((p) => <PrescriptionCard key={p.id} p={p} />) : <Empty emoji="💊">{doctor ? 'No prescription yet.' : 'Your doctor has not added a prescription yet. It will appear here.'}</Empty>}
      {doctor && canRecord && <PrescribeForm apptId={a.id} onSaved={load} />}

      <h2>🧪 Lab tests</h2>
      {labTests.length ? labTests.map((l) => <LabCard key={l.id} lab={l} doctor={doctor} onChange={load} />) : <Empty emoji="🧪">{doctor ? 'No lab tests ordered.' : 'No lab tests ordered for this visit.'}</Empty>}
      {doctor && canRecord && <LabOrderForm apptId={a.id} onSaved={load} />}
      {cancel && <ReasonDialog appt={a} onClose={() => setCancel(false)} onDone={() => { setCancel(false); load(); }} />}
    </section>
  );
}
