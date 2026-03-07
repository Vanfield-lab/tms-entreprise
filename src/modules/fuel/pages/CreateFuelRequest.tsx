// src/modules/fuel/pages/CreateFuelRequest.tsx
// FIX #3 & #4: Removed fuel_type, liters, estimated_cost from form.
// The fuel_requests table's create_fuel_request_draft RPC is called without those fields.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Vehicle = { id: string; plate_number: string; make: string | null; model: string | null };
type Driver  = { id: string; license_number: string; full_name: string };

export default function CreateFuelRequest() {
  const [vehicles,  setVehicles]  = useState<Vehicle[]>([]);
  const [drivers,   setDrivers]   = useState<Driver[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [driverId,  setDriverId]  = useState("");
  const [purpose,   setPurpose]   = useState("");
  const [notes,     setNotes]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: me } = await supabase.auth.getUser();
      const isDriver = !!me.user;

      const [{ data: v }, { data: d }] = await Promise.all([
        supabase.from("vehicles").select("id,plate_number,make,model").eq("status", "active").order("plate_number"),
        supabase.from("drivers").select("id,license_number,user_id").eq("employment_status", "active"),
      ]);

      setVehicles((v as Vehicle[]) || []);

      // Enrich drivers with names
      const rows = (d as any[]) || [];
      const userIds = rows.map(r => r.user_id).filter(Boolean);
      let nameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id,full_name")
          .in("user_id", userIds);
        nameMap = Object.fromEntries(((profiles as any[]) || []).map(p => [p.user_id, p.full_name]));
      }
      setDrivers(rows.map(r => ({
        id: r.id,
        license_number: r.license_number,
        full_name: r.user_id ? (nameMap[r.user_id] ?? r.license_number) : r.license_number,
      })));

      // Auto-select current driver if user is a driver
      if (me.user) {
        const myDriver = rows.find(r => r.user_id === me.user!.id);
        if (myDriver) setDriverId(myDriver.id);
      }
    })();
  }, []);

  const submit = async () => {
  if (!purpose.trim()) {
    setError("Purpose is required.");
    return;
  }

  setSaving(true);
  setError(null);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("You must be signed in to create a fuel request.");
    }

    const { data: draft, error: insertErr } = await supabase
      .from("fuel_requests")
      .insert({
        created_by: user.id,
        vehicle_id: vehicleId || null,
        driver_id: driverId || null,
        request_date: new Date().toISOString().slice(0, 10),
        purpose: purpose.trim(),
        notes: notes.trim() || null,
        status: "draft",
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    const { error: submitErr } = await supabase.rpc("submit_fuel_request", {
      p_fuel_request_id: (draft as any).id,
      p_meta: {},
    });

    if (submitErr) throw submitErr;

    setVehicleId("");
    setDriverId("");
    setPurpose("");
    setNotes("");
    setSuccess(true);
    setTimeout(() => setSuccess(false), 5000);
  } catch (e: any) {
    setError(e.message ?? "Submission failed.");
  } finally {
    setSaving(false);
  }
};
  return (
    <div className="max-w-lg space-y-4">
      {success && (
        <div className="alert alert-success">
          <span className="alert-icon">✓</span>
          <span className="alert-content">Fuel request submitted successfully.</span>
          <button className="alert-close" onClick={() => setSuccess(false)}>✕</button>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">New Fuel Request</h2>
        </div>
        <div className="card-body space-y-4">

          {/* Vehicle */}
          <div>
            <label className="form-label">Vehicle</label>
            <select className="tms-select" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
              <option value="">— Select vehicle (optional) —</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.plate_number}{v.make ? ` · ${v.make}${v.model ? " " + v.model : ""}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Driver */}
          <div>
            <label className="form-label">Driver</label>
            <select className="tms-select" value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">— Select driver (optional) —</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.full_name} · {d.license_number}</option>
              ))}
            </select>
          </div>

          {/* Purpose */}
          <div>
            <label className="form-label">Purpose <span className="text-[color:var(--red)]">*</span></label>
            <textarea
              className="tms-textarea"
              rows={3}
              placeholder="e.g. Field assignment to Kumasi on 12 March"
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Additional Notes</label>
            <textarea
              className="tms-textarea"
              rows={2}
              placeholder="Any extra information…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="alert alert-error">
              <span className="alert-icon">✕</span>
              <span className="alert-content">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              className="btn btn-ghost"
              onClick={() => { setVehicleId(""); setDriverId(""); setPurpose(""); setNotes(""); setError(null); }}
              disabled={saving}
            >
              Clear
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !purpose.trim()}>
              {saving ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}