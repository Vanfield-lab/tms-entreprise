// src/modules/users/pages/AdminUserManagement.tsx
// Complete user management: create directly, approve requests, deactivate — all in-app.
// No Supabase dashboard needed.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createSystemUser, rejectUserRequest, listProfiles, setUserStatus } from "../services/userManagement.service";
import { fmtDateTime } from "@/lib/utils";

type Tab = "create" | "requests" | "users";

type PendingRequest = {
  id: string;
  full_name: string;
  email: string;
  division_id: string;
  unit_id: string;
  requested_role: string;
  status: string;
  created_at: string;
};

type Profile = {
  user_id: string;
  full_name: string;
  system_role: string;
  status: string;
  division_id: string | null;
  unit_id: string | null;
  position_title: string | null;
};

type Division = { id: string; name: string };
type Unit = { id: string; name: string; division_id: string };

const ROLES = [
  { value: "staff", label: "Staff" },
  { value: "unit_head", label: "Unit Head" },
  { value: "driver", label: "Driver" },
  { value: "transport_supervisor", label: "Transport Supervisor" },
  { value: "corporate_approver", label: "Corporate Approver" },
  { value: "admin", label: "Admin" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-rose-100 text-rose-700",
  corporate_approver: "bg-violet-100 text-violet-700",
  transport_supervisor: "bg-amber-100 text-amber-700",
  driver: "bg-emerald-100 text-emerald-700",
  unit_head: "bg-sky-100 text-sky-700",
  staff: "bg-gray-100 text-gray-600",
};

const inputCls = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-transparent transition-all";

// ─── Password generator ───────────────────────────────────────────────────────
function generatePassword(length = 12): string {
  const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789@#$!";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => charset[b % charset.length])
    .join("");
}

export default function AdminUserManagement() {
  const [tab, setTab] = useState<Tab>("requests");
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileSearch, setProfileSearch] = useState("");

  // Create form state
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", system_role: "staff",
    division_id: "", unit_id: "", position_title: "",
  });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState<{ name: string; email: string; password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Per-request approve state
  const [reqForm, setReqForm] = useState<Record<string, { password: string; position_title: string; acting: boolean }>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);

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

  const filteredUnits = (divId: string) => units.filter((u) => !divId || u.division_id === divId);

  // ── Create user directly ──────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.password || !form.system_role) {
      setCreateError("Full name, email, password and role are required.");
      return;
    }
    setCreateSaving(true);
    setCreateError("");
    try {
      await createSystemUser({
        email: form.email.trim(),
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
    } catch (err: any) {
      setCreateError(err.message || "Failed to create user.");
    } finally {
      setCreateSaving(false);
    }
  };

  // ── Approve request ───────────────────────────────────────────────────────
  const approveRequest = async (r: PendingRequest) => {
    const rf = reqForm[r.id];
    const password = rf?.password?.trim();
    if (!password) return;

    setReqForm((m) => ({ ...m, [r.id]: { ...m[r.id], acting: true } }));
    try {
      await createSystemUser({
        email: r.email,
        password,
        full_name: r.full_name,
        system_role: r.requested_role,
        division_id: r.division_id,
        unit_id: r.unit_id,
        position_title: rf?.position_title?.trim() || null,
        request_id: r.id,
      });
      await load();
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setReqForm((m) => ({ ...m, [r.id]: { ...m[r.id], acting: false } }));
    }
  };

  const rejectRequest = async (id: string) => {
    setRejectingId(id);
    try {
      await rejectUserRequest(id);
      await load();
    } finally {
      setRejectingId(null);
    }
  };

  // ── Toggle user active/inactive ───────────────────────────────────────────
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleStatus = async (p: Profile) => {
    setTogglingId(p.user_id);
    try {
      await setUserStatus(p.user_id, p.status === "active" ? "inactive" : "active");
      await load();
    } finally {
      setTogglingId(null);
    }
  };

  const pendingCount = requests.length;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">User Management</h1>
        <p className="page-sub">Create accounts, approve requests, manage access</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {(["requests", "create", "users"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "requests" ? "Pending Requests" : t === "create" ? "Create User" : "All Users"}
            {t === "requests" && pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          {/* ── Pending Requests ── */}
          {tab === "requests" && (
            <div className="space-y-3">
              {requests.length === 0 ? (
                <EmptyState icon="👤" message="No pending requests" subtitle="New access requests from staff will appear here" />
              ) : (
                requests.map((r) => {
                  const rf = reqForm[r.id] || { password: "", position_title: "", acting: false };
                  const setRf = (patch: Partial<typeof rf>) =>
                    setReqForm((m) => ({ ...m, [r.id]: { ...m[r.id], ...patch } }));

                  return (
                    <div key={r.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm text-gray-900">{r.full_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{r.email}</p>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">Requested {fmtDateTime(r.created_at)}</p>
                        </div>
                        <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[r.requested_role] || "bg-gray-100 text-gray-600"}`}>
                          {r.requested_role?.replace(/_/g, " ")}
                        </span>
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500">Set a password for this account *</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Temporary password"
                              value={rf.password}
                              onChange={(e) => setRf({ password: e.target.value })}
                              className={inputCls + " font-mono"}
                            />
                            <button
                              type="button"
                              onClick={() => setRf({ password: generatePassword() })}
                              className="shrink-0 px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors whitespace-nowrap"
                            >
                              Generate
                            </button>
                          </div>
                          <p className="text-xs text-gray-400">Share this with the user — they can change it after logging in.</p>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500">Position Title (optional)</label>
                          <input
                            placeholder="e.g. Senior Driver"
                            value={rf.position_title}
                            onChange={(e) => setRf({ position_title: e.target.value })}
                            className={inputCls}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <button
                            onClick={() => rejectRequest(r.id)}
                            disabled={rejectingId === r.id}
                            className="py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-xl hover:bg-red-50 transition-colors disabled:opacity-40"
                          >
                            {rejectingId === r.id ? "Rejecting…" : "Reject"}
                          </button>
                          <button
                            onClick={() => approveRequest(r)}
                            disabled={!rf.password.trim() || rf.acting}
                            className="py-2.5 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {rf.acting ? "Creating…" : "Approve & Create ✓"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Create User Directly ── */}
          {tab === "create" && (
            <div className="max-w-xl space-y-4">
              {createSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                    </svg>
                    User created successfully!
                  </div>
                  <div className="bg-white rounded-xl border border-emerald-200 p-3 space-y-1 text-xs font-mono">
                    <div><span className="text-gray-400">Name:</span> {createSuccess.name}</div>
                    <div><span className="text-gray-400">Email:</span> {createSuccess.email}</div>
                    <div><span className="text-gray-400">Password:</span> <span className="font-bold text-emerald-700">{createSuccess.password}</span></div>
                  </div>
                  <p className="text-xs text-emerald-600">⚠️ Share the password with the user now — it won't be shown again.</p>
                  <button onClick={() => setCreateSuccess(null)} className="text-xs text-emerald-700 underline">Dismiss</button>
                </div>
              )}

              <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">New User Account</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Creates the login account and profile in one step</p>
                </div>
                <div className="p-5 space-y-4">
                  {/* Name & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500">Full Name *</label>
                      <input
                        className={inputCls}
                        placeholder="John Doe"
                        value={form.full_name}
                        onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500">Email Address *</label>
                      <input
                        type="email"
                        className={inputCls}
                        placeholder="john@organization.com"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-500">Temporary Password *</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showPassword ? "text" : "password"}
                          className={inputCls + " pr-10"}
                          placeholder="Min. 8 characters"
                          value={form.password}
                          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => { const p = generatePassword(); setForm((f) => ({ ...f, password: p })); setShowPassword(true); }}
                        className="shrink-0 px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                      >
                        Generate
                      </button>
                    </div>
                    <p className="text-xs text-gray-400">User can change this after first login.</p>
                  </div>

                  {/* Role */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-500">System Role *</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {ROLES.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, system_role: r.value }))}
                          className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all text-left ${
                            form.system_role === r.value
                              ? "bg-black text-white border-black"
                              : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Division & Unit */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500">Division</label>
                      <select
                        className={inputCls}
                        value={form.division_id}
                        onChange={(e) => setForm((f) => ({ ...f, division_id: e.target.value, unit_id: "" }))}
                      >
                        <option value="">— None —</option>
                        {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500">Unit</label>
                      <select
                        className={inputCls}
                        value={form.unit_id}
                        onChange={(e) => setForm((f) => ({ ...f, unit_id: e.target.value }))}
                        disabled={!form.division_id}
                      >
                        <option value="">— None —</option>
                        {filteredUnits(form.division_id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Position Title */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-500">Position Title</label>
                    <input
                      className={inputCls}
                      placeholder="e.g. Senior Driver, IT Officer"
                      value={form.position_title}
                      onChange={(e) => setForm((f) => ({ ...f, position_title: e.target.value }))}
                    />
                  </div>

                  {createError && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"/>
                      </svg>
                      {createError}
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={createSaving}
                      className="flex items-center gap-2 px-5 py-2.5 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40"
                    >
                      {createSaving ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Creating…
                        </span>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                          </svg>
                          Create Account
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* ── All Users ── */}
          {tab === "users" && (
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <input
                  className="tms-input"
                  style={{ maxWidth: 260 }}
                  placeholder="Search name, role…"
                  value={profileSearch}
                  onChange={(e) => setProfileSearch(e.target.value)}
                />
                <span className="text-xs text-gray-400 font-mono ml-auto">{profiles.length} users</span>
              </div>

              {profiles
                .filter((p) => !profileSearch || [p.full_name, p.system_role, p.position_title || ""].join(" ").toLowerCase().includes(profileSearch.toLowerCase()))
                .map((p) => (
                  <div key={p.user_id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm text-gray-900 truncate">{p.full_name}</p>
                          <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[p.system_role] || "bg-gray-100 text-gray-600"}`}>
                            {p.system_role?.replace(/_/g, " ")}
                          </span>
                          {p.status !== "active" && (
                            <span className="shrink-0 inline-flex px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-medium">
                              {p.status}
                            </span>
                          )}
                        </div>
                        {p.position_title && (
                          <p className="text-xs text-gray-400 mt-0.5">{p.position_title}</p>
                        )}
                      </div>
                      <button
                        onClick={() => toggleStatus(p)}
                        disabled={togglingId === p.user_id}
                        className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 ${
                          p.status === "active"
                            ? "border border-red-200 text-red-600 hover:bg-red-50"
                            : "border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        }`}
                      >
                        {togglingId === p.user_id ? "…" : p.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                ))}

              {profiles.length === 0 && (
                <EmptyState icon="👥" message="No users yet" subtitle="Create a user or approve a pending request" />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function EmptyState({ icon, message, subtitle }: { icon: string; message: string; subtitle: string }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-sm font-medium text-gray-600">{message}</p>
      <p className="text-xs mt-1">{subtitle}</p>
    </div>
  );
}