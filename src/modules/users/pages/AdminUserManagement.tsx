// src/modules/users/pages/AdminUserManagement.tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import {
  PageSpinner, EmptyState, Modal, Field, Input, Select,
  Btn, Alert, Badge, SearchInput, Card, TabBar, CountPill,
} from "@/components/TmsUI";
import {
  createSystemUser, listProfiles, setUserStatus,
  rejectUserRequest,
} from "../services/userManagement.service";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "requests" | "create" | "users";

type Division = { id: string; name: string };
type Unit      = { id: string; name: string; division_id: string };

type PendingRequest = {
  id: string; full_name: string; email: string;
  requested_role: string; division_id: string | null;
  unit_id: string | null; created_at: string; status: string;
};

type Profile = {
  user_id: string; full_name: string; system_role: string;
  status: string; division_id: string | null; unit_id: string | null;
  position_title: string | null;
};

const TABS: { value: Tab; label: string }[] = [
  { value: "requests", label: "Requests" },
  { value: "create",   label: "Create"   },
  { value: "users",    label: "Users"    },
];

const ROLES = [
  { value: "staff",                label: "Staff"                },
  { value: "unit_head",            label: "Unit Head"            },
  { value: "driver",               label: "Driver"               },
  { value: "transport_supervisor", label: "Transport Supervisor" },
  { value: "corporate_approver",   label: "Corporate Approver"   },
  { value: "admin",                label: "Administrator"        },
];

function genPassword(length = 12) {
  const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(b => charset[b % charset.length]).join("");
}

// ─── Context menu ─────────────────────────────────────────────────────────────
// Single state object eliminates the two-setState race condition.
// createPortal into document.body escapes .card { overflow:hidden }.
// All styling uses inline styles (no Tailwind) so CSS variable resolution
// is guaranteed even inside the portal.
type CtxItem = { label: string; icon: string; cls?: string; onClick: () => void };

type MenuState = { top: number; left: number } | null;

function CtxMenu({ items }: { items: CtxItem[] }) {
  const [menu, setMenu] = useState<MenuState>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);

  // Close on outside click or scroll while menu is open
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", close, true);
    window.addEventListener("scroll",     () => setMenu(null), { capture: true, once: true });
    return () => document.removeEventListener("mousedown", close, true);
  }, [menu]);

  const toggle = () => {
    // If already open, close
    if (menu) { setMenu(null); return; }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const W = 192; // menu width px
    // Right-align to trigger, clamped to viewport
    const left = Math.min(
      Math.max(8, rect.right - W),
      window.innerWidth - W - 8,
    );

    // Single setState call — coords + open in one update, no race
    setMenu({ top: rect.bottom + 6, left });
  };

  return (
    <>
      {/* ⋯ trigger */}
      <button
        ref={triggerRef}
        onClick={toggle}
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={!!menu}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, padding: 0,
          background: "transparent", border: "1px solid var(--border)",
          borderRadius: 8, cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: 16, letterSpacing: 2,
          flexShrink: 0,
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
        }}
      >
        •••
      </button>

      {/* Dropdown — portalled to body, position:fixed, z-index above everything */}
      {menu && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position:     "fixed",
            top:          menu.top,
            left:         menu.left,
            width:        192,
            zIndex:       2147483647,   // max z-index, beats everything
            background:   "var(--surface)",
            border:       "1px solid var(--border)",
            borderRadius: 12,
            boxShadow:    "0 4px 6px -1px rgba(0,0,0,0.10), 0 16px 40px -4px rgba(0,0,0,0.18)",
            padding:      "4px 0",
            overflow:     "hidden",
            transform:    "translateZ(0)",   // force GPU layer — fixes iOS Safari fixed bug
            WebkitTransform: "translateZ(0)",
          }}
        >
          {items.map((item, i) => {
            const fg =
              item.cls === "danger"  ? "var(--red)"   :
              item.cls === "warning" ? "var(--amber)"  :
              item.cls === "success" ? "var(--green)"  :
              "var(--text)";
            const hoverBg =
              item.cls === "danger"  ? "rgba(220,38,38,0.09)"  :
              item.cls === "warning" ? "rgba(217,119,6,0.09)"   :
              item.cls === "success" ? "rgba(22,163,74,0.09)"   :
              "var(--surface-2)";
            return (
              <button
                key={i}
                role="menuitem"
                onClick={() => { setMenu(null); item.onClick(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "10px 16px", minHeight: 44,
                  background: "transparent", border: "none",
                  color: fg, cursor: "pointer",
                  fontSize: 13, fontWeight: 500,
                  textAlign: "left",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ fontFamily: "inherit" }}>{item.label}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Inline confirm dialog ────────────────────────────────────────────────────
function ConfirmDialog({
  open, title, message, confirmLabel = "Confirm", variant = "danger",
  onConfirm, onCancel,
}: {
  open: boolean; title: string; message: string; confirmLabel?: string;
  variant?: "danger" | "warning"; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[color:var(--surface)] border border-[color:var(--border)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-base font-semibold text-[color:var(--text)] mb-2">{title}</h3>
        <p className="text-sm text-[color:var(--text-muted)] mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant={variant === "danger" ? "danger" : "amber"} onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminUserManagement() {
  const [tab,       setTab]      = useState<Tab>("requests");
  const [divisions, setDivisions]= useState<Division[]>([]);
  const [units,     setUnits]    = useState<Unit[]>([]);
  const [requests,  setRequests] = useState<PendingRequest[]>([]);
  const [profiles,  setProfiles] = useState<Profile[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [search,    setSearch]   = useState("");

  // Create form
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", system_role: "staff",
    division_id: "", unit_id: "", position_title: "",
  });
  const [createSaving,  setCreateSaving]  = useState(false);
  const [createError,   setCreateError]   = useState("");
  const [createSuccess, setCreateSuccess] = useState<{ name: string; email: string; password: string } | null>(null);
  const [showPassword,  setShowPassword]  = useState(false);

  // Edit user modal
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: "", system_role: "staff", division_id: "", unit_id: "", position_title: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState("");

  // Delete confirm
  const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);
  const [deleteActing,    setDeleteActing]     = useState(false);

  // Per-request approve state
  const [reqForm,      setReqForm]      = useState<Record<string, { password: string; position_title: string; acting: boolean }>>({});
  const [rejectingId,  setRejectingId]  = useState<string | null>(null);
  const [togglingId,   setTogglingId]   = useState<string | null>(null);

  // Reset password
  const [resetProfile, setResetProfile] = useState<Profile | null>(null);
  const [resetPwd,     setResetPwd]     = useState("");
  const [resetSaving,  setResetSaving]  = useState(false);
  const [resetError,   setResetError]   = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

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

  // ── Create user ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.full_name || !form.email || !form.password) {
      setCreateError("Full name, email and password are required."); return;
    }
    setCreateSaving(true); setCreateError("");
    try {
      await createSystemUser({
        email:          form.email.trim(),
        password:       form.password,
        full_name:      form.full_name.trim(),
        system_role:    form.system_role,
        division_id:    form.division_id || null,
        unit_id:        form.unit_id     || null,
        position_title: form.position_title.trim() || null,
      });
      setCreateSuccess({ name: form.full_name, email: form.email, password: form.password });
      setForm({ full_name: "", email: "", password: "", system_role: "staff", division_id: "", unit_id: "", position_title: "" });
      await load();
    } catch (e: any) {
      setCreateError(e.message ?? "Failed to create user.");
    } finally { setCreateSaving(false); }
  };

  // ── Approve request ──────────────────────────────────────────────────────
  const approveRequest = async (r: PendingRequest) => {
    const rf = reqForm[r.id];
    if (!rf?.password) return;
    setReqForm(m => ({ ...m, [r.id]: { ...m[r.id], acting: true } }));
    try {
      await createSystemUser({
        email:          r.email,
        password:       rf.password,
        full_name:      r.full_name,
        system_role:    r.requested_role,
        division_id:    r.division_id,
        unit_id:        r.unit_id,
        position_title: rf.position_title || null,
        request_id:     r.id,
      });
      await load();
    } catch (e: any) {
      alert(e.message ?? "Failed to approve request.");
    } finally {
      setReqForm(m => ({ ...m, [r.id]: { ...m[r.id], acting: false } }));
    }
  };

  // ── Reject request ───────────────────────────────────────────────────────
  const rejectRequest = async (id: string) => {
    setRejectingId(id);
    try { await rejectUserRequest(id); await load(); }
    finally { setRejectingId(null); }
  };

  // ── Toggle active / inactive ─────────────────────────────────────────────
  const toggleStatus = async (p: Profile) => {
  setTogglingId(p.user_id);

  try {
    const nextStatus = p.status === "active" ? "disabled" : "active";
    await setUserStatus(p.user_id, nextStatus);
    await load();
  } catch (e: any) {
    alert(e.message ?? "Failed to update user status.");
    console.error("toggleStatus failed:", e);
  } finally {
    setTogglingId(null);
  }
};

  // ── Edit user ────────────────────────────────────────────────────────────
  const openEdit = (p: Profile) => {
    setEditingProfile(p);
    setEditForm({
      full_name:      p.full_name,
      system_role:    p.system_role,
      division_id:    p.division_id ?? "",
      unit_id:        p.unit_id     ?? "",
      position_title: p.position_title ?? "",
    });
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editingProfile || !editForm.full_name.trim()) { setEditError("Full name is required."); return; }
    setEditSaving(true); setEditError("");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name:      editForm.full_name.trim(),
          system_role:    editForm.system_role,
          division_id:    editForm.division_id || null,
          unit_id:        editForm.unit_id     || null,
          position_title: editForm.position_title.trim() || null,
        })
        .eq("user_id", editingProfile.user_id);
      if (error) throw error;
      setEditingProfile(null);
      await load();
    } catch (e: any) { setEditError(e.message ?? "Save failed."); }
    finally { setEditSaving(false); }
  };

  // ── Delete user ──────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingProfile) return;
    setDeleteActing(true);
    try {
      await setUserStatus(deletingProfile.user_id, "disabled");
      await supabase.from("profiles").delete().eq("user_id", deletingProfile.user_id);
      setDeletingProfile(null);
      await load();
    } finally { setDeleteActing(false); }
  };

  // ── Reset password ────────────────────────────────────────────────────────────
  // supabase.auth.admin requires the service-role key — NOT available in browser.
  // Route through the reset-password Edge Function which uses SUPABASE_SERVICE_ROLE_KEY.
  const handleResetPassword = async () => {
    if (!resetProfile || !resetPwd.trim()) { setResetError("New password is required."); return; }
    if (resetPwd.trim().length < 8) { setResetError("Password must be at least 8 characters."); return; }
    setResetSaving(true); setResetError("");
    setResetSuccess("");
    try {
      // Explicitly attach the session token — required for Edge Function auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated.");
      const res = await supabase.functions.invoke("reset-password", {
        body: { target_user_id: resetProfile.user_id, new_password: resetPwd.trim() },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      setResetSuccess(`Password reset successfully for ${resetProfile.full_name}.`);
          setResetPwd("");
          setTimeout(() => {
            setResetProfile(null);
            setResetSuccess("");
          }, 1800);
    } catch (e: any) { setResetError(e.message ?? "Failed to reset password."); }
    finally { setResetSaving(false); }
  };

  const filteredProfiles = profiles.filter(p =>
    !search || [p.full_name, p.system_role, p.position_title ?? ""].join(" ")
      .toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">User Management</h1>
        <p className="text-xs text-[color:var(--text-muted)] mt-0.5">Create accounts, approve requests, manage access</p>
      </div>

      <TabBar
        tabs={TABS}
        active={tab}
        onChange={setTab}
        counts={{ requests: requests.length, users: profiles.length }}
      />

      {/* ════════════════════════════════════════════
          REQUESTS TAB
      ════════════════════════════════════════════ */}
      {tab === "requests" && (
        <>
          {requests.length === 0 ? (
            <EmptyState title="No pending requests" subtitle="User requests will appear here for your review" />
          ) : (
            <div className="space-y-3">
              {requests.map(r => {
                const rf = reqForm[r.id] ?? { password: "", position_title: "", acting: false };
                const update = (key: string, val: string) =>
                  setReqForm(m => ({ ...m, [r.id]: { ...m[r.id], [key]: val } }));
                return (
                  <Card key={r.id}>
                    <div className="p-4 border-b border-[color:var(--border)]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-[color:var(--text)]">{r.full_name}</p>
                          <p className="text-xs text-[color:var(--text-muted)]">{r.email}</p>
                          <span className="mt-1 inline-block"><Badge status={r.requested_role} /></span>
                        </div>
                        <span className="text-xs text-[color:var(--text-dim)] shrink-0">{r.created_at?.slice(0, 10)}</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <Field label="Assign Password">
                        <Input
                          type="password"
                          placeholder="Set login password…"
                          value={rf.password}
                          onChange={e => update("password", e.target.value)}
                        />
                      </Field>
                      <Field label="Position Title (optional)">
                        <Input
                          placeholder="e.g. Senior Reporter"
                          value={rf.position_title}
                          onChange={e => update("position_title", e.target.value)}
                        />
                      </Field>
                      <div className="flex gap-2 pt-1">
                        <Btn
                          variant="primary" size="sm"
                          disabled={!rf.password || rf.acting}
                          loading={rf.acting}
                          onClick={() => approveRequest(r)}
                        >Approve</Btn>
                        <Btn
                          variant="danger" size="sm"
                          loading={rejectingId === r.id}
                          onClick={() => rejectRequest(r.id)}
                        >Reject</Btn>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════
          CREATE TAB
      ════════════════════════════════════════════ */}
      {tab === "create" && (
        <div className="card p-5 space-y-4 max-w-lg">
          {createSuccess ? (
            <div className="space-y-4">
              <Alert type="success">
                <strong>{createSuccess.name}</strong> created. Share credentials securely.
              </Alert>
              <div className="bg-[color:var(--surface-2)] rounded-xl p-4 space-y-2 font-mono text-sm border border-[color:var(--border)]">
                <div><span className="text-[color:var(--text-muted)]">Email: </span>{createSuccess.email}</div>
                <div><span className="text-[color:var(--text-muted)]">Password: </span>{createSuccess.password}</div>
              </div>
              <Btn variant="ghost" onClick={() => setCreateSuccess(null)}>Create another</Btn>
            </div>
          ) : (
            <>
              <Field label="Full Name" required>
                <Input
                  placeholder="Jane Doe"
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                />
              </Field>
              <Field label="Email" required>
                <Input
                  type="email"
                  placeholder="jane@multimedia.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </Field>
              <Field label="Password" required>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 8 characters"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)] px-1"
                    >{showPassword ? "Hide" : "Show"}</button>
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, password: genPassword() }))}
                      className="text-xs text-[color:var(--accent)] hover:underline px-1"
                    >Generate</button>
                  </div>
                </div>
              </Field>
              <Field label="Role" required>
                <Select value={form.system_role} onChange={e => setForm(f => ({ ...f, system_role: e.target.value }))}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Division">
                  <Select
                    value={form.division_id}
                    onChange={e => setForm(f => ({ ...f, division_id: e.target.value, unit_id: "" }))}
                  >
                    <option value="">— None —</option>
                    {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </Field>
                <Field label="Unit">
                  <Select
                    value={form.unit_id}
                    onChange={e => setForm(f => ({ ...f, unit_id: e.target.value }))}
                    disabled={!form.division_id}
                  >
                    <option value="">— None —</option>
                    {filteredUnits(form.division_id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Position Title">
                <Input
                  placeholder="e.g. News Reporter"
                  value={form.position_title}
                  onChange={e => setForm(f => ({ ...f, position_title: e.target.value }))}
                />
              </Field>
              {createError && <Alert type="error">{createError}</Alert>}
              <Btn variant="primary" loading={createSaving} onClick={handleCreate}>
                Create User
              </Btn>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════
          USERS TAB
      ════════════════════════════════════════════ */}
      {tab === "users" && (
        <>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, role, position…"
          />

          {filteredProfiles.length === 0 ? (
            <EmptyState title="No users found" subtitle="Try a different search term" />
          ) : (
            <>
              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {filteredProfiles.map(p => (
                  <Card key={p.user_id}>
                    <div className="p-4 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm text-[color:var(--text)]">{p.full_name}</p>
                          <Badge status={p.system_role} />
                          {p.status !== "active" && <Badge status="inactive" />}
                        </div>
                        {p.position_title && (
                          <p className="text-xs text-[color:var(--text-muted)] mt-0.5">{p.position_title}</p>
                        )}
                      </div>
                      {/* ⋯ menu — portal renders above all cards */}
                      <CtxMenu items={[
                        {
                          label: "Edit", icon: "✏️",
                          onClick: () => openEdit(p),
                        },
                        {
                          label:   p.status === "active" ? "Deactivate" : "Activate",
                          icon:    p.status === "active" ? "🔒" : "✅",
                          cls:     p.status === "active" ? "warning" : "success",
                          onClick: () => toggleStatus(p),
                        },
                        {
                          label: "Reset Password", icon: "🔑",
                          onClick: () => {
                            setResetProfile(p);
                            setResetPwd("");
                            setResetError("");
                            setResetSuccess("");
                          },
                        },
                        {
                          label: "Delete", icon: "🗑️", cls: "danger",
                          onClick: () => setDeletingProfile(p),
                        },
                      ]} />
                    </div>
                  </Card>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="tms-table">
                    <thead>
                      <tr>{["Name","Role","Position","Status","Actions"].map(h => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {filteredProfiles.map(p => (
                        <tr key={p.user_id}>
                          <td className="font-medium">{p.full_name}</td>
                          <td><Badge status={p.system_role} /></td>
                          <td className="text-[color:var(--text-muted)]">{p.position_title ?? "—"}</td>
                          <td><Badge status={p.status} /></td>
                          <td className="text-center" >
                            <div className="flex justify-center">
                            <CtxMenu items={[
                              {
                                label: "Edit",
                                icon: "✏️",
                                onClick: () => openEdit(p),
                              },
                              {
                                label: p.status === "active" ? "Deactivate" : "Activate",
                                icon: p.status === "active" ? "🔒" : "✅",
                                cls: p.status === "active" ? "warning" : "success",
                                onClick: () => toggleStatus(p),
                              },
                              {
                                label: "Reset Password",
                                icon: "🔑",
                                onClick: () => {
                                  setResetProfile(p);
                                  setResetPwd("");
                                  setResetError("");
                                  setResetSuccess("");
                                },
                              },
                              {
                                label: "Delete",
                                icon: "🗑️",
                                cls: "danger",
                                onClick: () => setDeletingProfile(p),
                              },
                            ]} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Edit User Modal ──────────────────────────────────────────────── */}
      <Modal open={!!editingProfile} onClose={() => setEditingProfile(null)} title="Edit User" maxWidth="max-w-lg">
        <div className="space-y-4">
          <Field label="Full Name" required>
            <Input
              value={editForm.full_name}
              onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Full name"
            />
          </Field>
          <Field label="Role" required>
            <Select value={editForm.system_role} onChange={e => setEditForm(f => ({ ...f, system_role: e.target.value }))}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Division">
              <Select
                value={editForm.division_id}
                onChange={e => setEditForm(f => ({ ...f, division_id: e.target.value, unit_id: "" }))}
              >
                <option value="">— None —</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Unit">
              <Select
                value={editForm.unit_id}
                onChange={e => setEditForm(f => ({ ...f, unit_id: e.target.value }))}
                disabled={!editForm.division_id}
              >
                <option value="">— None —</option>
                {filteredUnits(editForm.division_id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Position Title">
            <Input
              value={editForm.position_title}
              onChange={e => setEditForm(f => ({ ...f, position_title: e.target.value }))}
              placeholder="e.g. News Reporter"
            />
          </Field>
          {editError && <Alert type="error">{editError}</Alert>}
          <div className="flex justify-end gap-3">
            <Btn variant="ghost" onClick={() => setEditingProfile(null)}>Cancel</Btn>
            <Btn variant="primary" onClick={saveEdit} loading={editSaving}>Save Changes</Btn>
          </div>
        </div>
      </Modal>

      {/* ── Reset Password Modal ────────────────────────────────────────── */}
      {resetProfile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[color:var(--surface)] border border-[color:var(--border)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-semibold text-[color:var(--text)] mb-1">Reset Password</h3>
            <p className="text-sm text-[color:var(--text-muted)] mb-4">
              Set a new password for <strong>{resetProfile.full_name}</strong>.
            </p>
            <Field label="New Password" required>
              <Input
                type="password"
                value={resetPwd}
                onChange={e => setResetPwd(e.target.value)}
                placeholder="Min. 8 characters"
              />
            </Field>
            {resetError && <p className="text-sm mt-2" style={{ color: "var(--red)" }}>{resetError}</p>}
            {resetSuccess && (
              <p className="text-sm mt-2" style={{ color: "var(--green)" }}>
                {resetSuccess}
              </p>
            )}
            <div className="flex justify-end gap-3 mt-5">
              <Btn variant="ghost" onClick={() => setResetProfile(null)}>Cancel</Btn>
              <Btn variant="primary" loading={resetSaving} onClick={handleResetPassword}>Reset Password</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deletingProfile}
        title="Delete User"
        message={`Remove ${deletingProfile?.full_name ?? "this user"}? Their profile will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete User"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeletingProfile(null)}
      />
    </div>
  );
}