// src/modules/drivers/pages/DriverManagement.tsx
// FIX #2: Avoid stack depth – no nested inserts that trigger recursive DB calls
// FIX #1: Full dark mode via CSS variables only
// FIX #11: Team, role (group leader/assistant/member), route assignment in driver form
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/utils";

type Driver = {
  id: string;
  full_name: string | null;
  license_number: string;
  license_expiry: string | null;
  license_class: string | null;
  employment_status: string;
  user_id: string | null;
  phone: string | null;
  team_id: string | null;
  team_name: string | null;
  team_role: string | null;
  route_id: string | null;
  route_name: string | null;
  driver_type: string | null;
  notes: string | null;
};

type Team  = { id: string; name: string };
type Route = { id: string; name: string; route_type: string };
type UserProfile = { user_id: string; full_name: string };

type FormData = {
  user_id: string;
  license_number: string;
  license_expiry: string;
  license_class: string;
  employment_status: string;
  phone: string;
  team_id: string;
  team_role: string;
  route_id: string;
  driver_type: string;
  notes: string;
};

const EMPTY: FormData = {
  user_id: "", license_number: "", license_expiry: "", license_class: "",
  employment_status: "active", phone: "", team_id: "", team_role: "member",
  route_id: "", driver_type: "tv", notes: "",
};

const EMP_STATUSES = ["all", "active", "inactive", "suspended", "on_leave"];
const TEAM_ROLES   = [
  { value: "leader",    label: "Group Leader" },
  { value: "assistant", label: "Assistant"    },
  { value: "member",    label: "Member"       },
];
const DRIVER_TYPES = [
  { value: "tv",    label: "TV Driver"    },
  { value: "radio", label: "Radio Driver" },
];
const LICENSE_CLASSES = ["A", "B", "C", "D", "E"];

function daysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  return Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000);
}

export default function DriverManagement() {
  const [drivers,      setDrivers]      = useState<Driver[]>([]);
  const [teams,        setTeams]        = useState<Team[]>([]);
  const [routes,       setRoutes]       = useState<Route[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [form,         setForm]         = useState<FormData>(EMPTY);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [q,            setQ]            = useState("");
  const [tab,          setTab]          = useState("all");

  const load = async () => {
    setLoading(true);

    // FIX #2: Do NOT join profiles via foreign key in the same query.
    // Split into separate queries to avoid recursive trigger cascade.
    const [{ data: driverData }, { data: teamData }, { data: routeData }] = await Promise.all([
      supabase.from("drivers")
        .select("id,user_id,license_number,license_expiry,license_class,employment_status,phone,team_id,team_role,route_id,driver_type,notes,created_at")
        .order("license_number"),
      supabase.from("driver_teams").select("id,name").order("name"),
      supabase.from("evening_routes").select("id,name,route_type").order("route_type,name"),
    ]);

    const rows    = (driverData as any[]) || [];
    const teamArr = (teamData  as Team[]) || [];
    const routeArr = (routeData as Route[]) || [];
    setTeams(teamArr);
    setRoutes(routeArr);

    const teamMap  = Object.fromEntries(teamArr.map(t => [t.id, t.name]));
    const routeMap = Object.fromEntries(routeArr.map(r => [r.id, r.name]));

    // Fetch profiles separately
    const userIds = rows.map((d: any) => d.user_id).filter(Boolean);
    let nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id,full_name")
        .in("user_id", userIds);
      nameMap = Object.fromEntries(((profiles as any[]) || []).map(p => [p.user_id, p.full_name]));
    }

    // Fetch all active user profiles for the user_id picker
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("user_id,full_name")
      .eq("system_role", "driver")
      .order("full_name");
    setUserProfiles((allProfiles as UserProfile[]) || []);

    const enriched: Driver[] = rows.map((d: any) => ({
      id:               d.id,
      user_id:          d.user_id,
      license_number:   d.license_number,
      license_expiry:   d.license_expiry,
      license_class:    d.license_class,
      employment_status: d.employment_status,
      phone:            d.phone,
      team_id:          d.team_id,
      team_name:        d.team_id ? (teamMap[d.team_id] ?? null) : null,
      team_role:        d.team_role,
      route_id:         d.route_id,
      route_name:       d.route_id ? (routeMap[d.route_id] ?? null) : null,
      driver_type:      d.driver_type,
      notes:            d.notes,
      full_name:        d.user_id ? (nameMap[d.user_id] ?? null) : null,
    }));

    setDrivers(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(EMPTY); setEditingId(null); setError(null); setShowForm(true); };
  const openEdit = (d: Driver) => {
    setForm({
      user_id:           d.user_id || "",
      license_number:    d.license_number,
      license_expiry:    d.license_expiry || "",
      license_class:     d.license_class || "",
      employment_status: d.employment_status,
      phone:             d.phone || "",
      team_id:           d.team_id || "",
      team_role:         d.team_role || "member",
      route_id:          d.route_id || "",
      driver_type:       d.driver_type || "tv",
      notes:             d.notes || "",
    });
    setEditingId(d.id); setError(null); setShowForm(true);
  };

  const save = async () => {
    if (!form.license_number.trim()) { setError("Licence number is required."); return; }
    setSaving(true); setError(null);
    try {
      // FIX #2: Only update the drivers table directly. No cascading profile writes here.
      const payload: any = {
        user_id:           form.user_id.trim() || null,
        license_number:    form.license_number.trim().toUpperCase(),
        license_expiry:    form.license_expiry || null,
        license_class:     form.license_class || null,
        employment_status: form.employment_status,
        phone:             form.phone.trim() || null,
        team_id:           form.team_id || null,
        team_role:         form.team_role || "member",
        route_id:          form.route_id || null,
        driver_type:       form.driver_type || "tv",
        notes:             form.notes.trim() || null,
      };

      const { error: e } = editingId
        ? await supabase.from("drivers").update(payload).eq("id", editingId)
        : await supabase.from("drivers").insert(payload);

      if (e) throw e;
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const f = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }));

  const tabs = EMP_STATUSES.map(s => ({
    value: s,
    label: s === "all" ? "All" : s.replace("_", " ").replace(/^\w/, c => c.toUpperCase()),
  }));

  const counts = Object.fromEntries(
    EMP_STATUSES.map(s => [s, s === "all" ? drivers.length : drivers.filter(d => d.employment_status === s).length])
  );

  const expired     = drivers.filter(d => { const n = daysLeft(d.license_expiry); return n !== null && n < 0; });
  const expiringSoon = drivers.filter(d => { const n = daysLeft(d.license_expiry); return n !== null && n >= 0 && n <= 30; });

  const filtered = drivers
    .filter(d => tab === "all" || d.employment_status === tab)
    .filter(d => !q || [d.full_name, d.license_number, d.phone, d.team_name].join(" ").toLowerCase().includes(q.toLowerCase()));

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="spinner" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Driver Management</h1>
          <p className="page-sub">{drivers.length} driver{drivers.length !== 1 ? "s" : ""} registered</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Driver</button>
      </div>

      {/* Expiry alerts */}
      {expired.length > 0 && (
        <div className="alert alert-error">
          <span className="alert-icon">⚠️</span>
          <span className="alert-content">
            <strong>{expired.length}</strong> licence{expired.length > 1 ? "s have" : " has"} expired: {expired.map(d => d.license_number).join(", ")}
          </span>
        </div>
      )}
      {expiringSoon.length > 0 && (
        <div className="alert alert-amber">
          <span className="alert-icon">⏰</span>
          <span className="alert-content">
            <strong>{expiringSoon.length}</strong> licence{expiringSoon.length > 1 ? "s expire" : " expires"} within 30 days: {expiringSoon.map(d => d.license_number).join(", ")}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="tab-group">
        {tabs.map(t => (
          <button
            key={t.value}
            className={`tab-item ${tab === t.value ? "active" : ""}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
            {counts[t.value] > 0 && <span className="count-pill">{counts[t.value]}</span>}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        className="tms-input max-w-xs"
        placeholder="Search name, licence, team…"
        value={q}
        onChange={e => setQ(e.target.value)}
      />

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center" style={{ color: "var(--text-muted)" }}>No drivers found.</div>
        ) : filtered.map(d => {
          const days = daysLeft(d.license_expiry);
          return (
            <div key={d.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                    {d.full_name ?? d.license_number}
                  </div>
                  <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)" }}>
                    {d.license_number}{d.license_class ? ` · Class ${d.license_class}` : ""}
                  </div>
                </div>
                <span className={`badge badge-${d.employment_status === "active" ? "approved" : d.employment_status === "suspended" ? "rejected" : "closed"}`}>
                  {d.employment_status.replace("_", " ")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div style={{ fontSize: 12 }}>
                  <div style={{ color: "var(--text-dim)" }}>Team</div>
                  <div style={{ color: "var(--text)" }}>
                    {d.team_name ?? "—"}
                    {d.team_role && d.team_name && (
                      <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>· {d.team_role}</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 12 }}>
                  <div style={{ color: "var(--text-dim)" }}>Route</div>
                  <div style={{ color: "var(--text)" }}>{d.route_name ?? "—"}</div>
                </div>
                <div style={{ fontSize: 12 }}>
                  <div style={{ color: "var(--text-dim)" }}>Type</div>
                  <div style={{ color: "var(--text)", textTransform: "uppercase" }}>{d.driver_type ?? "TV"}</div>
                </div>
                <div style={{ fontSize: 12 }}>
                  <div style={{ color: "var(--text-dim)" }}>Licence Expiry</div>
                  <div style={{
                    color: days !== null && days < 0 ? "var(--red)" : days !== null && days <= 30 ? "var(--amber)" : "var(--text)",
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    {d.license_expiry ? fmtDate(d.license_expiry) : "—"}
                    {days !== null && days < 0 && " ⚠️"}
                    {days !== null && days >= 0 && days <= 30 && " ⏰"}
                  </div>
                </div>
              </div>

              {d.phone && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>📞 {d.phone}</div>
              )}

              <button className="btn btn-ghost btn-sm w-full" onClick={() => openEdit(d)}>Edit Driver</button>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center" style={{ color: "var(--text-muted)" }}>No drivers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tms-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Licence</th>
                  <th>Team / Role</th>
                  <th>Route</th>
                  <th>Type</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const days = daysLeft(d.license_expiry);
                  return (
                    <tr key={d.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{d.full_name ?? "—"}</div>
                        {d.phone && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.phone}</div>}
                      </td>
                      <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
                        {d.license_number}
                        {d.license_class && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Class {d.license_class}</div>}
                      </td>
                      <td>
                        <div>{d.team_name ?? "—"}</div>
                        {d.team_role && (
                          <span className={`badge badge-${d.team_role === "leader" ? "approved" : d.team_role === "assistant" ? "dispatched" : "draft"}`} style={{ fontSize: 10 }}>
                            {TEAM_ROLES.find(r => r.value === d.team_role)?.label ?? d.team_role}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>{d.route_name ?? "—"}</td>
                      <td>
                        <span className={`badge badge-${d.driver_type === "radio" ? "recorded" : "dispatched"}`} style={{ textTransform: "uppercase" }}>
                          {d.driver_type ?? "TV"}
                        </span>
                      </td>
                      <td style={{
                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 13,
                        color: days !== null && days < 0 ? "var(--red)" : days !== null && days <= 30 ? "var(--amber)" : "var(--text-muted)",
                      }}>
                        {d.license_expiry ? fmtDate(d.license_expiry) : "—"}
                        {days !== null && days < 0 && " ⚠️"}
                        {days !== null && days >= 0 && days <= 30 && " ⏰"}
                      </td>
                      <td>
                        <span className={`badge badge-${d.employment_status === "active" ? "approved" : d.employment_status === "suspended" ? "rejected" : "closed"}`}>
                          {d.employment_status.replace("_", " ")}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}>Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                {editingId ? "Edit Driver" : "Add Driver"}
              </h3>
              <button onClick={() => setShowForm(false)} style={{ color: "var(--text-muted)" }}>✕</button>
            </div>

            <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {/* User account */}
              <div style={{ gridColumn: "1/-1" }}>
                <label className="form-label">Linked User Account</label>
                <select className="tms-select" value={form.user_id} onChange={e => f("user_id", e.target.value)}>
                  <option value="">— No linked account —</option>
                  {userProfiles.map(p => (
                    <option key={p.user_id} value={p.user_id}>{p.full_name}</option>
                  ))}
                </select>
              </div>

              {/* Licence */}
              <div>
                <label className="form-label">Licence Number <span style={{ color: "var(--red)" }}>*</span></label>
                <input className="tms-input" value={form.license_number} onChange={e => f("license_number", e.target.value.toUpperCase())} placeholder="DVS-001234" />
              </div>
              <div>
                <label className="form-label">Licence Class</label>
                <select className="tms-select" value={form.license_class} onChange={e => f("license_class", e.target.value)}>
                  <option value="">— Select —</option>
                  {LICENSE_CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Licence Expiry</label>
                <input className="tms-input" type="date" value={form.license_expiry} onChange={e => f("license_expiry", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input className="tms-input" value={form.phone} onChange={e => f("phone", e.target.value)} placeholder="+233 24 000 0000" />
              </div>

              {/* Employment */}
              <div style={{ gridColumn: "1/-1" }}>
                <label className="form-label">Employment Status</label>
                <select className="tms-select" value={form.employment_status} onChange={e => f("employment_status", e.target.value)}>
                  {["active","inactive","suspended","on_leave"].map(s => (
                    <option key={s} value={s}>{s.replace("_", " ").replace(/^\w/, c => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>

              {/* Team assignment */}
              <div>
                <label className="form-label">Team</label>
                <select className="tms-select" value={form.team_id} onChange={e => f("team_id", e.target.value)}>
                  <option value="">— No team —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Role in Team</label>
                <select className="tms-select" value={form.team_role} onChange={e => f("team_role", e.target.value)}>
                  {TEAM_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {/* Driver type & route */}
              <div>
                <label className="form-label">Driver Type</label>
                <select className="tms-select" value={form.driver_type} onChange={e => f("driver_type", e.target.value)}>
                  {DRIVER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Assigned Route</label>
                <select className="tms-select" value={form.route_id} onChange={e => f("route_id", e.target.value)}>
                  <option value="">— No fixed route —</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>[{r.route_type?.toUpperCase()}] {r.name}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div style={{ gridColumn: "1/-1" }}>
                <label className="form-label">Notes</label>
                <textarea className="tms-textarea" rows={2} value={form.notes} onChange={e => f("notes", e.target.value)} placeholder="Any notes…" />
              </div>

              {error && (
                <div style={{ gridColumn: "1/-1" }} className="alert alert-error">
                  <span className="alert-icon">✕</span>
                  <span className="alert-content">{error}</span>
                </div>
              )}

              <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={saving} onClick={save}>
                  {saving ? "Saving…" : editingId ? "Update Driver" : "Add Driver"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}