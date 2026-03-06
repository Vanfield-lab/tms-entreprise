// src/modules/fuel/pages/FuelRecordQueue.tsx
// FIX #1: Full dark mode CSS variables
// FIX #5: Capture current vehicle mileage when logging fuel receipt
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/utils";

type FuelRequest = {
  id: string;
  status: string;
  purpose: string;
  notes: string | null;
  actual_cost: number | null;
  created_at: string;
  vehicle_id: string | null;
  driver_id: string | null;
  vehicle_plate?: string;
  driver_name?: string;
};

type RecordForm = {
  actual_cost: string;
  current_mileage: string;
  notes: string;
  receipt_file: File | null;
};

const EMPTY_FORM: RecordForm = { actual_cost: "", current_mileage: "", notes: "", receipt_file: null };

export default function FuelRecordingQueue() {
  const [requests, setRequests] = useState<FuelRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [recording, setRecording] = useState<FuelRequest | null>(null);
  const [form,       setForm]     = useState<RecordForm>(EMPTY_FORM);
  const [saving,     setSaving]   = useState(false);
  const [error,      setError]    = useState<string | null>(null);
  const [success,    setSuccess]  = useState<string | null>(null);

  const load = async () => {
    setLoading(true);

    const { data: rows } = await supabase
      .from("fuel_requests")
      .select("id,status,purpose,notes,actual_cost,created_at,vehicle_id,driver_id")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(100);

    const reqRows = (rows as any[]) || [];

    // Enrich vehicle plates and driver names
    const vehicleIds = [...new Set(reqRows.map(r => r.vehicle_id).filter(Boolean))];
    const driverIds  = [...new Set(reqRows.map(r => r.driver_id).filter(Boolean))];

    let vMap: Record<string, string> = {};
    let dMap: Record<string, string> = {};

    if (vehicleIds.length > 0) {
      const { data: vehicles } = await supabase.from("vehicles").select("id,plate_number").in("id", vehicleIds);
      vMap = Object.fromEntries(((vehicles as any[]) || []).map(v => [v.id, v.plate_number]));
    }
    if (driverIds.length > 0) {
      const { data: driverRows } = await supabase.from("drivers").select("id,user_id").in("id", driverIds);
      const userIds = ((driverRows as any[]) || []).map(d => d.user_id).filter(Boolean);
      const driverIdToUser = Object.fromEntries(((driverRows as any[]) || []).map(d => [d.id, d.user_id]));
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id,full_name").in("user_id", userIds);
        const pMap = Object.fromEntries(((profiles as any[]) || []).map(p => [p.user_id, p.full_name]));
        dMap = Object.fromEntries(driverIds.map(did => [did, pMap[driverIdToUser[did]] ?? did]));
      }
    }

    setRequests(reqRows.map(r => ({
      ...r,
      vehicle_plate: r.vehicle_id ? (vMap[r.vehicle_id] ?? "Unknown") : "—",
      driver_name:   r.driver_id  ? (dMap[r.driver_id]  ?? "Unknown") : "—",
    })));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("fuel_recording_queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "fuel_requests" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const openRecord = (req: FuelRequest) => {
    setRecording(req); setForm(EMPTY_FORM); setError(null);
  };

  const submit = async () => {
    if (!recording) return;
    if (!form.actual_cost) { setError("Actual cost is required."); return; }
    setSaving(true); setError(null);
    try {
      // 1. Mark fuel request as recorded
      const { error: rpcErr } = await supabase.rpc("record_fuel_request", {
        p_fuel_request_id: recording.id,
        p_actual_cost:     parseFloat(form.actual_cost),
        p_notes:           form.notes.trim() || null,
        p_meta:            {},
      });
      if (rpcErr) throw rpcErr;

      // FIX #5: If mileage provided, log it and update vehicle
      if (form.current_mileage && recording.vehicle_id) {
        const mileage = parseInt(form.current_mileage);
        if (!isNaN(mileage)) {
          // Insert mileage log
          await supabase.from("fuel_mileage_log").insert({
            vehicle_id:       recording.vehicle_id,
            fuel_request_id:  recording.id,
            mileage_at_fueling: mileage,
          });
          // Trigger in DB updates vehicles.current_mileage automatically
        }
      }

      // Upload receipt if provided
      if (form.receipt_file) {
        const ext  = form.receipt_file.name.split(".").pop();
        const path = `receipts/${recording.id}-${Date.now()}.${ext}`;
        await supabase.storage.from("vehicle-docs").upload(path, form.receipt_file, { upsert: true });
      }

      setSuccess(`Fuel recorded for request ${recording.id.slice(0, 8)}…`);
      setRecording(null);
      setTimeout(() => setSuccess(null), 4000);
      await load();
    } catch (e: any) {
      setError(e.message ?? "Recording failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" /></div>;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Fuel Recording Queue</h1>
        <p className="page-sub">{requests.length} approved request{requests.length !== 1 ? "s" : ""} awaiting recording</p>
      </div>

      {success && (
        <div className="alert alert-success">
          <span className="alert-icon">✓</span>
          <span className="alert-content">{success}</span>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="card p-10 text-center" style={{ color: "var(--text-muted)" }}>
          No approved fuel requests to record.
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {requests.map(req => (
              <div key={req.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p style={{ fontWeight: 600, color: "var(--text)" }}>{req.purpose || "Fuel Request"}</p>
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmtDateTime(req.created_at)}</p>
                  </div>
                  <span className="badge badge-approved">approved</span>
                </div>
                <div className="grid grid-cols-2 gap-2" style={{ fontSize: 12 }}>
                  <div>
                    <div style={{ color: "var(--text-dim)" }}>Vehicle</div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: "var(--text)" }}>{req.vehicle_plate}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-dim)" }}>Driver</div>
                    <div style={{ color: "var(--text)" }}>{req.driver_name}</div>
                  </div>
                </div>
                <button className="btn btn-primary w-full" onClick={() => openRecord(req)}>⛽ Record Fuel</button>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tms-table">
                <thead>
                  <tr>{["Purpose", "Vehicle", "Driver", "Submitted", "Status", ""].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {requests.map(req => (
                    <tr key={req.id}>
                      <td style={{ fontWeight: 600 }}>{req.purpose || "—"}</td>
                      <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>{req.vehicle_plate}</td>
                      <td>{req.driver_name}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmtDateTime(req.created_at)}</td>
                      <td><span className="badge badge-approved">approved</span></td>
                      <td><button className="btn btn-primary btn-sm" onClick={() => openRecord(req)}>Record</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Record modal */}
      {recording && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setRecording(null)}
        >
          <div
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, width: "100%", maxWidth: 440 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Record Fuel Disbursement</h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {recording.purpose} · {recording.vehicle_plate}
              </p>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Actual cost */}
              <div>
                <label className="form-label">Actual Cost (GHS) <span style={{ color: "var(--red)" }}>*</span></label>
                <input
                  className="tms-input"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 350.00"
                  value={form.actual_cost}
                  onChange={e => setForm(f => ({ ...f, actual_cost: e.target.value }))}
                />
              </div>

              {/* FIX #5: Current mileage at time of fueling */}
              {recording.vehicle_id && (
                <div>
                  <label className="form-label">Vehicle Mileage at Fueling (km)</label>
                  <input
                    className="tms-input"
                    type="number"
                    placeholder="e.g. 45230"
                    value={form.current_mileage}
                    onChange={e => setForm(f => ({ ...f, current_mileage: e.target.value }))}
                  />
                  <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                    This updates the vehicle's current mileage in the system.
                  </p>
                </div>
              )}

              {/* Receipt upload */}
              <div>
                <label className="form-label">Receipt (optional)</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display: "block" }}
                  onChange={e => setForm(f => ({ ...f, receipt_file: e.target.files?.[0] ?? null }))}
                />
                {form.receipt_file && (
                  <p style={{ fontSize: 11, color: "var(--green)", marginTop: 4 }}>📎 {form.receipt_file.name}</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="form-label">Notes</label>
                <textarea
                  className="tms-textarea"
                  rows={2}
                  placeholder="Any notes about this fuel dispensing…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {error && (
                <div className="alert alert-error">
                  <span className="alert-icon">✕</span>
                  <span className="alert-content">{error}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setRecording(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={saving} onClick={submit}>
                  {saving ? "Recording…" : "⛽ Confirm & Record"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}