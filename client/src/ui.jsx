import { createContext, useContext } from 'react';
import { DAYS } from './api';

export const AuthCtx = createContext();
export const useAuth = () => useContext(AuthCtx);

export const Badge = ({ s }) => <span className={`badge ${s}`}>{s}</span>;
export const Msg = ({ m }) => (m ? <div className={`msg ${m.type}`} role="status">{m.text}</div> : null);
export const Empty = ({ children }) => <p className="empty">{children}</p>;

export function PatientFields({ f, set }) {
  return (
    <>
      <div className="row">
        <label>Age<input type="number" min="0" max="120" value={f.age ?? ''} onChange={set('age')} required /></label>
        <label>Gender
          <select value={f.gender || ''} onChange={set('gender')} required>
            <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
          </select>
        </label>
      </div>
      <label>Address<textarea rows="2" value={f.address || ''} onChange={set('address')} /></label>
    </>
  );
}

export function DoctorFields({ f, setF, set }) {
  const toggle = (d) => setF({ ...f, availableDays: f.availableDays.includes(d) ? f.availableDays.filter((x) => x !== d) : [...f.availableDays, d] });
  const time = (k) => (e) => setF({ ...f, availableTime: { ...f.availableTime, [k]: e.target.value } });
  return (
    <>
      <div className="row">
        <label>Specialization<input value={f.specialization || ''} onChange={set('specialization')} required /></label>
        <label>Qualification<input value={f.qualification || ''} onChange={set('qualification')} placeholder="MBBS, MD" required /></label>
      </div>
      <div className="row">
        <label>Experience (years)<input type="number" min="0" value={f.experience ?? ''} onChange={set('experience')} required /></label>
        <label>Consultation fee (₹)<input type="number" min="0" value={f.consultationFee ?? ''} onChange={set('consultationFee')} required /></label>
      </div>
      <fieldset>
        <legend>Available days</legend>
        <div className="chips">
          {DAYS.map((d) => (
            <label key={d} className={`chip ${f.availableDays.includes(d) ? 'on' : ''}`}>
              <input type="checkbox" checked={f.availableDays.includes(d)} onChange={() => toggle(d)} />{d.slice(0, 3)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="row three">
        <label>From<input type="time" value={f.availableTime.start} onChange={time('start')} required /></label>
        <label>To<input type="time" value={f.availableTime.end} onChange={time('end')} required /></label>
        <label>Slot length
          <select value={f.slotDuration} onChange={set('slotDuration')}>
            {[15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
          </select>
        </label>
      </div>
    </>
  );
}
