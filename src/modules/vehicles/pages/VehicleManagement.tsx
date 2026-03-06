// src/modules/vehicles/pages/VehicleManagement.tsx
// FIX #1: Full dark-mode CSS variable theming
// FIX #5: current_mileage field
// FIX #6: Insurance & roadworthy doc upload, expiry tracking, alerts
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/utils";

type Vehicle = {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  fuel_type: string | null;
  status: string;
  current_mileage: number | null;
  mileage_updated_at: string | null;
  insurance_expiry: string | null;
  roadworthy_expiry: string | null;
  insurance_doc_url: string | null;
  roadworthy_doc_url: string | null;
  notes: string | null;
  created_at: string;
};

type FormData = {
  plate_number: string; make: string; model: string; year: string;
  color: string; fuel_type: string; status: string;
  current_mileage: string;
  insurance_expiry: string; roadworthy_expiry: string; notes: string;
};

const EMPTY: FormData = {
  plate_number: "", make: "", model: "", year: "", color: "",
  fuel_type: "petrol", status: "active", current_mileage: "",
  insurance_expiry: "", roadworthy_expiry: "", notes: "",
};

const STATUSES     = ["all", "active", "inactive", "maintenance"];
const FUEL_TYPES   = ["petrol", "diesel", "hybrid", "electric"];
const STATUS_OPTS  = ["active", "inactive", "maintenance", "decommissioned"];

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function ExpiryCell({ date, label }: { date: string | null; label: string }) {
  const days = daysUntil(date);
  const expired = days !== null && days < 0;
  const soon    = days !== null && days >= 0 && days <= 30;
  const color   = expired ? "var(--red)" : soon ? "var(--amber)" : "var(--text-muted)";
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color }}>
        {date ? fmtDate(date) : "—"}
        {expired && " ⚠️"}
        {!expired && soon && " ⏰"}
      </div>
    </div>
  );
}

export default function VehicleManagement() {
  const [vehicles,  setVehicles]  = useState<Vehicle[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form,      setForm]      = useState<FormData>(EMPTY);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [q,         setQ]         = useState("");
  const [tab,       setTab]       = useState("all");

  // Doc upload state
  const [insuranceFile,   setInsuranceFile]   = useState<File | null>(null);
  const [roadworthyFile,  setRoadworthyFile]  = useState<File | null>(null);
  const [uploadingDoc,    setUploadingDoc]    = useState(false);
  const insRef  = useRef<HTMLInputElement>(null);
  const rwRef   = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("vehicles")
      .select("id,plate_number,make,model,year,color,fuel_type,status,current_mileage,mileage_updated_at,insurance_expiry,roadworthy_expiry,insurance_doc_url,roadworthy_doc_url,notes,created_at")
      .order("plate_number");
    setVehicles((data as Vehicle[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setForm(EMPTY); setEditingId(null); setError(null);
    setInsuranceFile(null); setRoadworthyFile(null);
    setShowForm(true);
  };
  const openEdit = (v: Vehicle) => {
    setForm({
      plate_number: v.plate_number, make: v.make || "", model: v.model || "",
      year: v.year ? String(v.year) : "", color: v.color || "",
      fuel_type: v.fuel_type || "petrol", status: v.status,
      current_mileage: v.current_mileage != null ? String(v.current_mileage) : "",
      insurance_expiry: v.insurance_expiry || "",
      roadworthy_expiry: v.roadworthy_expiry || "",
      notes: v.notes || "",
    });
    setEditingId(v.id); setError(null);
    setInsuranceFile(null); setRoadworthyFile(null);
    setShowForm(true);
  };

  const uploadDoc = async (file: File, vehicleId: string, type: "insurance" | "roadworthy"): Promise<string> => {
    const ext  = file.name.split(".").pop();
    const path = `${vehicleId}/${type}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("vehicle-docs").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("vehicle-docs").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const save = async () => {
    if (!form.plate_number.trim()) { setError("Plate number is required."); return; }
    setSaving(true); setError(null);
    try {
      const payload: any = {
        plate_number:    form.plate_number.trim().toUpperCase(),
        make:            form.make.trim() || null,
        model:           form.model.trim() || null,
        year:            form.year ? parseInt(form.year) : null,
        color:           form.color.trim() || null,
        fuel_type:       form.fuel_type || null,
        status:          form.status,
        current_mileage: form.current_mileage ? parseInt(form.current_mileage) : null,
        insurance_expiry:  form.insurance_expiry  || null,
        roadworthy_expiry: form.roadworthy_expiry || null,
        notes:           form.notes.trim() || null,
      };

      let vehicleId = editingId;
      if (editingId) {
        const { error: e } = await supabase.from("vehicles").update(payload).eq("id", editingId);
        if (e) throw e;
      } else {
        const { data: inserted, error: e } = await supabase.from("vehicles").insert(payload).select("id").single();
        if (e) throw e;
        vehicleId = (inserted as any).id;
      }

      // Upload docs if provided
      if (vehicleId) {
        setUploadingDoc(true);
        if (insuranceFile) {
          const url = await uploadDoc(insuranceFile, vehicleId, "insurance");
          await supabase.from("vehicles").update({ insurance_doc_url: url }).eq("id", vehicleId);
        }
        if (roadworthyFile) {
          const url = await uploadDoc(roadworthyFile, vehicleId, "roadworthy");
          await supabase.from("vehicles").update({ roadworthy_doc_url: url }).eq("id", vehicleId);
        }
        setUploadingDoc(false);
      }

      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const f = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }));

  const tabs = STATUSES.map(s => ({ value: s, label: s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1) }));
  const counts: Record<string, number> = Object.fromEntries(
    STATUSES.map(s => [s, s === "all" ? vehicles.length : vehicles.filter(v => v.status === s).length])
  );

  const filtered = vehicles
    .filter(v => tab === "all" || v.status === tab)
    .filter(v => !q || [v.plate_number, v.make, v.model, v.color].join(" ").toLowerCase().includes(q.toLowerCase()));

  // Expiry alerts (insurance or roadworthy within 30 days or expired)
  const expiryAlerts = vehicles.filter(v => {
    const ins = daysUntil(v.insurance_expiry);
    const rw  = daysUntil(v.roadworthy_expiry);
    return (ins !== null && ins <= 30) || (rw !== null && rw <= 30);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Vehicle Management</h1>
          <p className="page-sub">{vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""} registered</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Vehicle</button>
      </div>

      {/* Expiry alerts */}
      {expiryAlerts.length > 0 && (
        <div className="alert alert-amber">
          <span className="alert-icon">⚠️</span>
          <span className="alert-content">
            <strong>{expiryAlerts.length}</strong> vehicle{expiryAlerts.length > 1 ? "s have" : " has"} insurance or roadworthy certificates expiring within 30 days.
            {" "}{expiryAlerts.map(v => v.plate_number).join(", ")}
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
            {counts[t.value] > 0 && (
              <span className="count-pill">{counts[t.value]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        className="tms-input max-w-xs"
        placeholder="Search plate, make, model…"
        value={q}
        onChange={e => setQ(e.target.value)}
      />

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center" style={{ color: "var(--text-muted)" }}>No vehicles found.</div>
        ) : filtered.map(v => {
          const insDays = daysUntil(v.insurance_expiry);
          const rwDays  = daysUntil(v.roadworthy_expiry);
          return (
            <div key={v.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                    {v.plate_number}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {[v.year, v.make, v.model].filter(Boolean).join(" ") || "—"}
                    {v.color && ` · ${v.color}`}
                  </div>
                </div>
                <span className={`badge badge-${v.status === "active" ? "approved" : v.status === "maintenance" ? "amber" : "closed"}`}>
                  {v.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div style={{ fontSize: 12 }}>
                  <div style={{ color: "var(--text-dim)", marginBottom: 2 }}>Fuel type</div>
                  <div style={{ color: "var(--text)", textTransform: "capitalize" }}>{v.fuel_type || "—"}</div>
                </div>
                <div style={{ fontSize: 12 }}>
                  <div style={{ color: "var(--text-dim)", marginBottom: 2 }}>Mileage</div>
                  <div style={{ color: "var(--text)" }}>{v.current_mileage != null ? `${v.current_mileage.toLocaleString()} km` : "—"}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <ExpiryCell date={v.insurance_expiry} label="Insurance" />
                <ExpiryCell date={v.roadworthy_expiry} label="Roadworthy" />
              </div>

              {(v.insurance_doc_url || v.roadworthy_doc_url) && (
                <div className="flex gap-2">
                  {v.insurance_doc_url && (
                    <a href={v.insurance_doc_url} target="_blank" rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm">📄 Insurance</a>
                  )}
                  {v.roadworthy_doc_url && (
                    <a href={v.roadworthy_doc_url} target="_blank" rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm">📄 Roadworthy</a>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button className="btn btn-ghost btn-sm flex-1" onClick={() => openEdit(v)}>Edit</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center" style={{ color: "var(--text-muted)" }}>No vehicles found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tms-table">
              <thead>
                <tr>
                  <th>Plate</th>
                  <th>Vehicle</th>
                  <th>Fuel / Type</th>
                  <th>Mileage</th>
                  <th>Insurance</th>
                  <th>Roadworthy</th>
                  <th>Docs</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id}>
                    <td>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13 }}>{v.plate_number}</div>
                    </td>
                    <td>
                      <div>{[v.year, v.make, v.model].filter(Boolean).join(" ") || "—"}</div>
                      {v.color && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{v.color}</div>}
                    </td>
                    <td style={{ textTransform: "capitalize", fontSize: 13 }}>{v.fuel_type || "—"}</td>
                    <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
                      {v.current_mileage != null ? `${v.current_mileage.toLocaleString()} km` : "—"}
                    </td>
                    <td><ExpiryCell date={v.insurance_expiry} label="" /></td>
                    <td><ExpiryCell date={v.roadworthy_expiry} label="" /></td>
                    <td>
                      <div className="flex gap-1">
                        {v.insurance_doc_url && (
                          <a href={v.insurance_doc_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, color: "var(--accent)" }}>Ins ↗</a>
                        )}
                        {v.roadworthy_doc_url && (
                          <a href={v.roadworthy_doc_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, color: "var(--accent)", marginLeft: 6 }}>RW ↗</a>
                        )}
                        {!v.insurance_doc_url && !v.roadworthy_doc_url && (
                          <span style={{ color: "var(--text-dim)", fontSize: 12 }}>—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${v.status === "active" ? "approved" : v.status === "maintenance" ? "amber" : "closed"}`}>
                        {v.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(v)}>Edit</button>
                    </td>
                  </tr>
                ))}
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
            {/* Modal header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                {editingId ? "Edit Vehicle" : "Add Vehicle"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                style={{ color: "var(--text-muted)", padding: 4, borderRadius: 8, lineHeight: 1 }}
              >✕</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {/* Plate */}
              <div style={{ gridColumn: "1/-1" }}>
                <label className="form-label">Plate Number <span style={{ color: "var(--red)" }}>*</span></label>
                <input className="tms-input" value={form.plate_number} onChange={e => f("plate_number", e.target.value.toUpperCase())} placeholder="GR-1234-23" />
              </div>
              <div>
                <label className="form-label">Make</label>
                <input className="tms-input" value={form.make} onChange={e => f("make", e.target.value)} placeholder="Toyota" />
              </div>
              <div>
                <label className="form-label">Model</label>
                <input className="tms-input" value={form.model} onChange={e => f("model", e.target.value)} placeholder="Land Cruiser" />
              </div>
              <div>
                <label className="form-label">Year</label>
                <input className="tms-input" type="number" value={form.year} onChange={e => f("year", e.target.value)} placeholder="2022" />
              </div>
              <div>
                <label className="form-label">Color</label>
                <input className="tms-input" value={form.color} onChange={e => f("color", e.target.value)} placeholder="White" />
              </div>
              <div>
                <label className="form-label">Fuel Type</label>
                <select className="tms-select" value={form.fuel_type} onChange={e => f("fuel_type", e.target.value)}>
                  {FUEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select className="tms-select" value={form.status} onChange={e => f("status", e.target.value)}>
                  {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Mileage */}
              <div style={{ gridColumn: "1/-1" }}>
                <label className="form-label">Current Mileage (km)</label>
                <input
                  className="tms-input"
                  type="number"
                  value={form.current_mileage}
                  onChange={e => f("current_mileage", e.target.value)}
                  placeholder="e.g. 45000"
                />
                <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                  This is updated automatically each time fuel is recorded.
                </p>
              </div>

              {/* Insurance */}
              <div>
                <label className="form-label">Insurance Expiry</label>
                <input className="tms-input" type="date" value={form.insurance_expiry} onChange={e => f("insurance_expiry", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Roadworthy Expiry</label>
                <input className="tms-input" type="date" value={form.roadworthy_expiry} onChange={e => f("roadworthy_expiry", e.target.value)} />
              </div>

              {/* Doc uploads */}
              <div>
                <label className="form-label">Insurance Certificate</label>
                <input ref={insRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => setInsuranceFile(e.target.files?.[0] ?? null)} />
                <button
                  className="btn btn-ghost btn-sm w-full"
                  onClick={() => insRef.current?.click()}
                  style={{ justifyContent: "flex-start" }}
                >
                  {insuranceFile ? `📄 ${insuranceFile.name}` : "📁 Upload PDF / Image"}
                </button>
              </div>
              <div>
                <label className="form-label">Roadworthy Certificate</label>
                <input ref={rwRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => setRoadworthyFile(e.target.files?.[0] ?? null)} />
                <button
                  className="btn btn-ghost btn-sm w-full"
                  onClick={() => rwRef.current?.click()}
                  style={{ justifyContent: "flex-start" }}
                >
                  {roadworthyFile ? `📄 ${roadworthyFile.name}` : "📁 Upload PDF / Image"}
                </button>
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
                <button className="btn btn-primary" disabled={saving || uploadingDoc} onClick={save}>
                  {saving || uploadingDoc ? "Saving…" : editingId ? "Update Vehicle" : "Add Vehicle"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}