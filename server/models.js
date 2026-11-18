import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// Every document sent to the client gets `id` instead of `_id`; secrets never leave the server.
mongoose.set('toJSON', {
  transform: (_doc, ret) => {
    if (ret._id) { ret.id = String(ret._id); delete ret._id; }
    delete ret.__v; delete ret.passwordHash; delete ret.slotKey;
    return ret;
  },
});

export const LAB_STEPS = ['Ordered', 'Sample Collected', 'Processing', 'Report Ready'];
const ref = (to) => ({ type: Schema.Types.ObjectId, ref: to, required: true, index: true });
const fileField = { fileId: Schema.Types.ObjectId, name: String, mime: String };
const userBase = {
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: String,
  passwordHash: { type: String, required: true },
};

export const Patient = model('Patient', new Schema({
  role: { type: String, default: 'patient' }, ...userBase,
  age: Number, gender: String, address: String,
}, { timestamps: true }));

export const Doctor = model('Doctor', new Schema({
  role: { type: String, default: 'doctor' }, ...userBase,
  specialization: String, qualification: String, experience: Number, consultationFee: Number,
  availableDays: [String], availableTime: { start: String, end: String },
  slotDuration: { type: Number, default: 30 },
}, { timestamps: true }));

export const Appointment = model('Appointment', new Schema({
  appointmentId: { type: String, unique: true },
  patient: ref('Patient'), doctor: ref('Doctor'),
  patientName: String, doctorName: String,
  date: { type: String, index: true }, time: String, reason: String,
  status: { type: String, enum: ['Pending', 'Confirmed', 'Completed', 'Cancelled'], default: 'Confirmed' },
  cancellation: { by: String, reason: String, at: Date },
  // Unique while the appointment is active; removed on cancel. This is what blocks double booking in the DB.
  slotKey: { type: String, unique: true, sparse: true },
}, { timestamps: true }));

const appointmentLink = { appointment: ref('Appointment'), appointmentCode: String, patient: ref('Patient'), doctor: ref('Doctor'), patientName: String, doctorName: String };

export const Prescription = model('Prescription', new Schema({
  ...appointmentLink,
  kind: { type: String, enum: ['written', 'upload'] },
  diagnosis: String, notes: String,
  medicines: [{ _id: false, name: String, timesPerDay: Number, mg: String, days: Number }],
  file: fileField,
}, { timestamps: true }));

export const LabTest = model('LabTest', new Schema({
  ...appointmentLink,
  testName: String, instructions: String,
  status: { type: String, enum: LAB_STEPS, default: 'Ordered' },
  history: [{ _id: false, status: String, note: String, at: Date }],
  resultText: String, file: fileField,
}, { timestamps: true }));

export const FileDoc = model('FileDoc', new Schema({
  data: Buffer, mime: String, name: String, patient: ref('Patient'), doctor: ref('Doctor'),
}, { timestamps: true }));

export const Counter = model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }));

// Content shown on the patient home page (managed directly in the database)
export const Organ = model('Organ', new Schema({
  slug: { type: String, unique: true }, name: String, emoji: String, color: String, tagline: String,
  overview: String, location: String, specialist: String, specialistKeyword: String,
  functions: [String], conditions: [String], care: [String], warningSigns: [String], facts: [String],
  order: { type: Number, default: 0 },
}));
export const Banner = model('Banner', new Schema({
  title: String, subtitle: String, emoji: String, colors: [String],
  cta: { label: String, to: String }, order: { type: Number, default: 0 }, active: { type: Boolean, default: true },
}));
export const Offer = model('Offer', new Schema({
  title: String, description: String, emoji: String, tag: String,
  order: { type: Number, default: 0 }, active: { type: Boolean, default: true },
}));
