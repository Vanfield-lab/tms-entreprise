// src/modules/users/pages/AdminUserManagement.tsx
// FIX #1: Full dark mode CSS variables
// FIX #9: Admin password reset via Edge Function
// FIX #10: All users sorted and grouped by division/department
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/utils";
import { listProfiles, rejectUserRequest } from "../services/userManagement.service";

type Division    = { id: string; name: string };
type Unit        = { id: string; name: string; division_id: string };
type PendingRequest = {
  id: string; full_name: string; email: string; system_role: string;
  division_id: string; unit_id: string; position_title: string | null; created_at: string;
};
type Profile = {
  user_id: string; full_name: string; system_role: string; status: string;
  division_id: string | null; unit_id: string | null; position_title: string | null;
};

const ROLES = [
  { value: "staff",                label: "Staff"                },
  { value: "unit_head",            label: "Unit Head"            },
  { value: "driver",               label: "Driver"               },
  { value: "transport_supervisor", label: "Transport Supervisor" },
  { value: "corporate_approver",   label: "Corporate Approver"   },
  { value: "admin",                label: "Administrator"        },
];

type Tab = "requests" | "users" | "create";

function genPassword(length = 12): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(b => charset[b % charset.length]).join("");
}

export default function AdminUserManagement() {
  const [tab,        setTab]        = useState<Tab>("requests");
  const [divisions,  setDivisions]  = useState<Division[]>([]);
  const [units,      setUnits]      = useState<Unit[]>([]);
  const [requests,   setRequests]   = useState<PendingRequest[]>([]);
  const [profiles,   setProfiles]   = useState<Profile[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [profileSearch, setProfileSearch] = useState("");
  const [groupBy,    setGroupBy]    = useState<"division" | "role">("division");

  // Create form
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", system_role: "staff",
    division_id: "", unit_id: "", position_title: "",
  });
  const [createSaving,  setCreateSaving]  = useState(false);
  const [createError,   setCreateError]   = useState("");
  const [createSuccess, setCreateSuccess] = useState<{ name: string; email: string; password: string } | null>(null);
  const [showPassword,  setShowPassword]  = useState(false);

  // Per-request approve state
  const [reqForm, setReqForm] = useState<Record<string, { password: string; acting: boolean }>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approvingSaving, setApprovingSaving] = useState<string | null>(null);

  // Password reset state
  const [resetTargetId,  setResetTargetId]  = useState<string | null>(null);
  const [resetPassword,  setResetPassword]  = useState("");
  const [resetSaving,    setResetSaving]    = useState(false);
  const [resetSuccess,   setResetSuccess]   = useState(false);
  const [resetError,     setResetError]     = useState<string | null>(null);

  const load = async () => {
    const [{ data: d }, { data: u }, { data: r }, profs] = await Promise.all([
      supabase.from("divisions").select("id,name").order("name"),
      supabase.from("units").select("id,name,division_id").order("name"),
      supabase.from("user_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      listProfiles(),
    ]);
    setDivisions((d as Division[]) || []);
    setUnits((u as Unit[]) || []);
    setRequests((r as PendingRequest[]) || []);
    setProfiles(profs as Profile[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredUnits = (divId: string) => units.filter(u => !divId || u.division_id === divId);

  // Create user
  const handleCreate = async () => {
    if (!form.full_name || !form.email || !form.password || !form.system_role) {
      setCreateError("Full name, email, password and role are required."); return;
    }
    setCreateSaving(true); setCreateError("");
    try {
      const { createSystemUser } = await import("../services/userManagement.service");
      await createSystemUser({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        full_name: form.full_name.trim(),
        system_role: form.system_role,
        division_id: form.division_id || null,
        unit_id: form.unit_id || null,
        position_title: form.position_title.trim() || null,
      });
      setCreateSuccess({ name: form.full_name, email: form.email, password: form.password });
      setForm({ full_name: "", email: "", password: "", system_role: "staff", division_id: "", unit_id: "", position_title: "" });
      await load();
    } catch (e: any) {
      setCreateError(e.message ?? "Failed to create user.");
    } finally {
      setCreateSaving(false);
    }
  };

  // Approve request
  const handleApprove = async (req: PendingRequest) => {
    const rf = reqForm[req.id] || { password: "", acting: false };
    if (!rf.password) { alert("Please set a password for this user."); return; }
    setApprovingSaving(req.id);
    try {
      const { createSystemUser } = await import("../services/userManagement.service");
      await createSystemUser({
        email: req.email,
        password: rf.password,
        full_name: req.full_name,
        system_role: req.system_role,
        division_id: req.division_id,
        unit_id: req.unit_id,
        position_title: req.position_title ?? undefined,
        request_id: req.id,
      });
      await load();
    } catch (e: any) {
      alert("Approval failed: " + e.message);
    } finally {
      setApprovingSaving(null);
    }
  };

  // Reject request
  const handleReject = async (id: string) => {
    setRejectingId(id);
    try {
      await rejectUserRequest(id, "Rejected by admin");
      await load();
    } finally { setRejectingId(null); }
  };

  // FIX #9: Admin password reset
  const handleResetPassword = async () => {
    if (!resetTargetId || !resetPassword) return;
    if (resetPassword.length < 8) { setResetError("Password must be at least 8 characters."); return; }
    setResetSaving(true); setResetError(null);
    try {
      const res = await supabase.functions.invoke("reset-password", {
        body: { target_user_id: resetTargetId, new_password: resetPassword },
      });
      if (res.error || res.data?.error) throw new Error(res.error?.message ?? res.data?.error);
      setResetSuccess(true);
      setTimeout(() => { setResetTargetId(null); setResetPassword(""); setResetSuccess(false); }, 2000);
    } catch (e: any) {
      setResetError(e.message ?? "Reset failed.");
    } finally {
      setResetSaving(false);
    }
  };

  // FIX #10: Group profiles by division
  const divMap  = Object.fromEntries(divisions.map(d => [d.id, d.name]));
  const unitMap = Object.fromEntries(units.map(u => [u.id, u.name]));

  const filteredProfiles = profiles.filter(p =>
    !profileSearch || [p.full_name, p.system_role, p.position_title, divMap[p.division_id ?? ""]].join(" ").toLowerCase().includes(profileSearch.toLowerCase())
  );

  // Group by division
  const profilesByDivision = filteredProfiles.reduce<Record<string, Profile[]>>((acc, p) => {
    const key = p.division_id ? (divMap[p.division_id] ?? "Unknown Division") : "No Division";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const divisionGroups = Object.entries(profilesByDivision).sort(([a], [b]) => a.localeCompare(b));

  const ROLE_BADGE: Record<string, string> = {
    admin: "badge-rejected", corporate_approver: "badge-dispatched",
    transport_supervisor: "badge-approved", driver: "badge-recorded",
    unit_head: "badge-amber", staff: "badge-closed",
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="page-title">User Management</h1>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{profiles.length} users · {requests.length} pending</span>
      </div>

      {/* Tabs */}
      <div className="tab-group">
        {([
          { value: "requests", label: "Pending Requests", count: requests.length },
          { value: "users",    label: "All Users",        count: profiles.length  },
          { value: "create",   label: "+ Create User",    count: 0 },
        ] as const).map(t => (
          <button key={t.value} className={`tab-item ${tab === t.value ? "active" : ""}`} onClick={() => setTab(t.value as Tab)}>
            {t.label}
            {t.count > 0 && <span className="count-pill">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── PENDING REQUESTS ── */}
      {tab === "requests" && (
        requests.length === 0 ? (
          <div className="card p-10 text-center" style={{ color: "var(--text-muted)" }}>No pending requests.</div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => {
              const rf = reqForm[req.id] || { password: genPassword(), acting: false };
              return (
                <div key={req.id} className="card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p style={{ fontWeight: 700, color: "var(--text)" }}>{req.full_name}</p>
                      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{req.email}</p>
                    </div>
                    <span className={`badge ${ROLE_BADGE[req.system_role] ?? "badge-closed"}`}>
                      {ROLES.find(r => r.value === req.system_role)?.label ?? req.system_role}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {divMap[req.division_id] ?? "—"} · {unitMap[req.unit_id] ?? "—"}
                    {req.position_title && ` · ${req.position_title}`}
                  </p>
                  <div>
                    <label className="form-label">Initial Password <span style={{ color: "var(--red)" }}>*</span></label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="tms-input flex-1"
                        value={rf.password}
                        onChange={e => setReqForm(f => ({ ...f, [req.id]: { ...rf, password: e.target.value } }))}
                        placeholder="Set password for new user"
                      />
                      <button className="btn btn-ghost btn-sm" onClick={() =>
                        setReqForm(f => ({ ...f, [req.id]: { ...rf, password: genPassword() } }))
                      }>Generate</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="btn btn-success flex-1"
                      disabled={approvingSaving === req.id || !rf.password}
                      onClick={() => handleApprove(req)}
                    >
                      {approvingSaving === req.id ? "Approving…" : "✓ Approve"}
                    </button>
                    <button
                      className="btn btn-danger flex-1"
                      disabled={rejectingId === req.id}
                      onClick={() => handleReject(req.id)}
                    >
                      {rejectingId === req.id ? "Rejecting…" : "✕ Reject"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── ALL USERS (sorted by division) ── */}
      {tab === "users" && (
        <div className="space-y-4">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              className="tms-input"
              style={{ maxWidth: 280 }}
              placeholder="Search name, role, division…"
              value={profileSearch}
              onChange={e => setProfileSearch(e.target.value)}
            />
          </div>

          {/* FIX #10: Grouped by division */}
          {divisionGroups.length === 0 ? (
            <div className="card p-10 text-center" style={{ color: "var(--text-muted)" }}>No users found.</div>
          ) : divisionGroups.map(([divName, divProfiles]) => (
            <div key={divName} className="card overflow-hidden">
              {/* Division header */}
              <div style={{
                padding: "10px 16px",
                background: "var(--surface-2)",
                borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{divName}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{divProfiles.length} user{divProfiles.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-[color:var(--border)]">
                {divProfiles.map(p => (
                  <div key={p.user_id} style={{ padding: "12px 16px" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p style={{ fontWeight: 600, color: "var(--text)" }}>{p.full_name}</p>
                        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {unitMap[p.unit_id ?? ""] ?? "—"}{p.position_title ? ` · ${p.position_title}` : ""}
                        </p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span className={`badge ${ROLE_BADGE[p.system_role] ?? "badge-closed"}`}>
                          {ROLES.find(r => r.value === p.system_role)?.label ?? p.system_role}
                        </span>
                        <span className={`badge badge-${p.status === "active" ? "approved" : "closed"}`}>{p.status}</span>
                      </div>
                    </div>
                    {/* FIX #9: Reset password button */}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 8 }}
                      onClick={() => { setResetTargetId(p.user_id); setResetPassword(genPassword()); setResetError(null); setResetSuccess(false); }}
                    >
                      🔑 Reset Password
                    </button>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="tms-table">
                  <thead>
                    <tr>{["Name", "Unit / Title", "Role", "Status", "Actions"].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {divProfiles.map(p => (
                      <tr key={p.user_id}>
                        <td style={{ fontWeight: 600 }}>{p.full_name}</td>
                        <td>
                          <div style={{ fontSize: 13 }}>{unitMap[p.unit_id ?? ""] ?? "—"}</div>
                          {p.position_title && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.position_title}</div>}
                        </td>
                        <td>
                          <span className={`badge ${ROLE_BADGE[p.system_role] ?? "badge-closed"}`}>
                            {ROLES.find(r => r.value === p.system_role)?.label ?? p.system_role}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${p.status === "active" ? "approved" : "closed"}`}>{p.status}</span>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setResetTargetId(p.user_id); setResetPassword(genPassword()); setResetError(null); setResetSuccess(false); }}
                          >
                            🔑 Reset Password
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CREATE USER ── */}
      {tab === "create" && (
        <div className="card max-w-lg">
          <div className="card-header"><h3 className="card-title">Create New User</h3></div>
          <div className="card-body space-y-4">
            {createSuccess && (
              <div className="alert alert-success">
                <span className="alert-icon">✓</span>
                <div className="alert-content">
                  <div><strong>{createSuccess.name}</strong> created successfully.</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Email: <code>{createSuccess.email}</code> · Password: <code>{createSuccess.password}</code>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="form-label">Full Name <span style={{ color: "var(--red)" }}>*</span></label>
              <input className="tms-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Kwame Mensah" />
            </div>
            <div>
              <label className="form-label">Email <span style={{ color: "var(--red)" }}>*</span></label>
              <input className="tms-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="kwame@multimedia.com.gh" />
            </div>
            <div>
              <label className="form-label">Password <span style={{ color: "var(--red)" }}>*</span></label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="tms-input flex-1"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => setShowPassword(v => !v)}>{showPassword ? "Hide" : "Show"}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setForm(f => ({ ...f, password: genPassword() }))}>Generate</button>
              </div>
            </div>
            <div>
              <label className="form-label">Role <span style={{ color: "var(--red)" }}>*</span></label>
              <select className="tms-select" value={form.system_role} onChange={e => setForm(f => ({ ...f, system_role: e.target.value }))}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="form-label">Division</label>
                <select className="tms-select" value={form.division_id} onChange={e => setForm(f => ({ ...f, division_id: e.target.value, unit_id: "" }))}>
                  <option value="">— None —</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Unit</label>
                <select className="tms-select" value={form.unit_id} onChange={e => setForm(f => ({ ...f, unit_id: e.target.value }))} disabled={!form.division_id}>
                  <option value="">— None —</option>
                  {filteredUnits(form.division_id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="form-label">Position Title</label>
              <input className="tms-input" value={form.position_title} onChange={e => setForm(f => ({ ...f, position_title: e.target.value }))} placeholder="e.g. Senior Reporter" />
            </div>

            {createError && (
              <div className="alert alert-error"><span className="alert-icon">✕</span><span className="alert-content">{createError}</span></div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" disabled={createSaving} onClick={handleCreate}>
                {createSaving ? "Creating…" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PASSWORD RESET MODAL ── */}
      {resetTargetId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setResetTargetId(null)}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, width: "100%", maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Reset User Password</h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {profiles.find(p => p.user_id === resetTargetId)?.full_name}
              </p>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {resetSuccess ? (
                <div className="alert alert-success">
                  <span className="alert-icon">✓</span>
                  <span className="alert-content">Password reset successfully.</span>
                </div>
              ) : (
                <>
                  <div>
                    <label className="form-label">New Password</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="tms-input flex-1" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Min 8 characters" />
                      <button className="btn btn-ghost btn-sm" onClick={() => setResetPassword(genPassword())}>Generate</button>
                    </div>
                  </div>
                  {resetError && (
                    <div className="alert alert-error"><span className="alert-icon">✕</span><span className="alert-content">{resetError}</span></div>
                  )}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" onClick={() => setResetTargetId(null)}>Cancel</button>
                    <button className="btn btn-primary" disabled={resetSaving} onClick={handleResetPassword}>
                      {resetSaving ? "Resetting…" : "Reset Password"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}