import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { DASHBOARD_PATHS, ROLE_LABELS } from "../lib/constants";
import { useAuth } from "../context/AuthContext";

const roles = ["student", "advisor", "teacher", "admin"];

export function LoginPage() {
  const { session, setSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ role: params.get("role") || "", email: params.get("email") || "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to={DASHBOARD_PATHS[session.role]} replace />;
  const submit = async (event) => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const payload = await api("/auth/login", { method: "POST", body: { ...form, email: form.email.trim().toLowerCase() } });
      const data = payload.data || {};
      const me = await api("/auth/me", { token: data.token });
      const user = me.data?.user || data.user || {};
      const next = { token: data.token, userId: user._id || user.id, role: user.role || form.role, name: user.name, email: user.email, profile: me.data?.profile || data.profile, loginAt: new Date().toISOString() };
      setSession(next); navigate(DASHBOARD_PATHS[next.role]);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <AuthFrame title="Welcome back" subtitle="Sign in to your Academic Radar portal.">
    <form onSubmit={submit} className="form-stack">
      <Field label="Role"><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} required><option value="">Select role</option>{roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></Field>
      <Field label="Email"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.edu" required /></Field>
      <Field label="Password"><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter your password" required /></Field>
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Signing in…" : "Login"}</button>
    </form>
    <p className="auth-footer">No account yet? <Link to="/register">Create an account</Link></p>
  </AuthFrame>;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ role: "student", name: "", email: "", password: "", confirm: "", studentId: "", batch: "", level: "1", term: "1", section: "A", advisorId: "", teacherId: "", username: "", department: "CSE", batchFocus: "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
  const submit = async (event) => {
    event.preventDefault(); setError("");
    if (form.password !== form.confirm) return setError("Password and confirmation do not match.");
    setBusy(true);
    try {
      const body = { role: form.role, name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password, department: form.department.trim() };
      if (form.role === "student") Object.assign(body, { studentId: form.studentId.trim(), batch: form.batch.trim(), level: Number(form.level), term: Number(form.term), section: form.section.trim().toUpperCase() });
      if (form.role === "advisor") Object.assign(body, { advisorId: form.advisorId.trim(), batchFocus: form.batchFocus.trim() });
      if (form.role === "teacher") Object.assign(body, { teacherId: form.teacherId.trim(), username: form.username.trim() });
      await api("/auth/register", { method: "POST", body });
      navigate(`/login?role=${encodeURIComponent(form.role)}&email=${encodeURIComponent(form.email)}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <AuthFrame title="Create an account" subtitle="Choose a portal role and complete your profile.">
    <form onSubmit={submit} className="form-stack">
      <Field label="Role"><select value={form.role} onChange={(event) => set("role", event.target.value)}>{roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></Field>
      <Field label="Full name"><input value={form.name} onChange={(event) => set("name", event.target.value)} required placeholder="Your name" /></Field>
      {form.role === "student" && <><Field label="Student ID"><input value={form.studentId} onChange={(event) => set("studentId", event.target.value)} required placeholder="2201001" /></Field><Field label="Batch"><input value={form.batch} onChange={(event) => set("batch", event.target.value)} required placeholder="2022" /></Field><Field label="Level"><input type="number" min="1" max="8" value={form.level} onChange={(event) => set("level", event.target.value)} required /></Field><Field label="Term"><select value={form.term} onChange={(event) => set("term", event.target.value)}><option value="1">Term 1</option><option value="2">Term 2</option></select></Field><Field label="Section"><input value={form.section} onChange={(event) => set("section", event.target.value.toUpperCase())} required maxLength="10" placeholder="A" /></Field></>}
      {form.role === "advisor" && <><Field label="Advisor ID"><input value={form.advisorId} onChange={(event) => set("advisorId", event.target.value)} required placeholder="ADV-102" /></Field><Field label="Batch focus"><input value={form.batchFocus} onChange={(event) => set("batchFocus", event.target.value)} placeholder="60-62" /></Field></>}
      {form.role === "teacher" && <><Field label="Teacher ID"><input value={form.teacherId} onChange={(event) => set("teacherId", event.target.value)} required placeholder="TCH-102" /></Field><Field label="Username"><input value={form.username} onChange={(event) => set("username", event.target.value)} required placeholder="j.smith" /></Field></>}
      {form.role !== "admin" && <Field label="Department"><input value={form.department} onChange={(event) => set("department", event.target.value)} required placeholder="CSE" /></Field>}
      <Field label="Email"><input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} required placeholder="you@example.edu" /></Field>
      <Field label="Password"><input type="password" value={form.password} onChange={(event) => set("password", event.target.value)} required minLength="6" placeholder="At least 6 characters" /></Field>
      <Field label="Confirm password"><input type="password" value={form.confirm} onChange={(event) => set("confirm", event.target.value)} required placeholder="Re-enter password" /></Field>
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Creating account…" : "Register"}</button>
    </form>
    <p className="auth-footer">Already registered? <Link to="/login">Log in</Link></p>
  </AuthFrame>;
}

function AuthFrame({ title, subtitle, children }) { return <main className="auth-wrap"><section className="auth-card"><Link to="/login" className="auth-brand">Academic Radar</Link><h1 className="auth-title">{title}</h1><p className="auth-sub">{subtitle}</p>{children}</section></main>; }
function Field({ label, children }) { return <label className="form-group"><span>{label}</span>{children}</label>; }
