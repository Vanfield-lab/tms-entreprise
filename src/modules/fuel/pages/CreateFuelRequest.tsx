// src/modules/fuel/pages/CreateFuelRequest.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Alert, Btn, Card, CardBody, Field, Input, Select, Textarea } from "@/components/TmsUI";

type Vehicle = { id: string; plate_number: string; fuel_type: string | null };

export default function CreateFuelRequest() {
  const [vehicles,   setVehicles]  = useState<Vehicle[]>([]);
  const [myName,     setMyName]    = useState(""); // display only
  const [vehicleId,  setVehicleId] = useState("");
  const [fuelType,   setFuelType]  = useState(""); // auto-resolved from vehicle
  const [purpose,    setPurpose]   = useState("");
  const [notes,      setNotes]     = useState("");
  const [saving,     setSaving]    = useState(false);
  const [success,    setSuccess]   = useState(false);
  const [error,      setError]     = useState<string | null>(null);

  // ── Load vehicles + current user name ────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .single();
        setMyName(prof?.full_name ?? "You");
      }

      const { data: v } = await supabase
        .from("vehicles")
        .select("id,plate_number,fuel_type")
        .eq("status", "active")
        .order("plate_number");
      setVehicles((v as Vehicle[]) || []);
    })();
  }, []);

  // ── Auto-resolve fuel type when vehicle changes ───────────────────────────
  const handleVehicleChange = (id: string) => {
    setVehicleId(id);
    const v = vehicles.find(v => v.id === id);
    setFuelType(v?.fuel_type ?? "");
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!vehicleId) { setError("Please select a vehicle."); return; }
    if (!purpose.trim()) { setError("Purpose / destination is required."); return; }
    setSaving(true); setError(null);
    try {
      // Create draft with only what the requester knows
      const { data: draftId, error: draftErr } = await supabase.rpc("create_fuel_request_draft", {
        p_vehicle_id: vehicleId,
        p_driver_id:  null,          // requester identity is captured via created_by (auth.uid())
        p_fuel_type:  fuelType || null,
        p_liters:     null,          // transport supervisor fills this during recording
        p_amount:     null,          // transport supervisor fills this during recording
        p_vendor:     null,
        p_purpose:    purpose.trim(),
        p_notes:      notes.trim() || null,
      });
      if (draftErr) throw draftErr;

      // Immediately submit (skip draft step)
      const { error: subErr } = await supabase.rpc("submit_fuel_request", {
        p_fuel_request_id: draftId,
      });
      if (subErr) throw subErr;

      // Reset form
      setVehicleId(""); setFuelType(""); setPurpose(""); setNotes("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (e: any) {
      setError(e.message ?? "Submission failed. Please try again.");
    } finally { setSaving(false); }
  };

  const selectedVehicle = vehicles.find(v => v.id === vehicleId);

  return (
    <div className="max-w-lg space-y-4">
      {success && (
        <Alert type="success" onDismiss={() => setSuccess(false)}>
          Fuel request submitted successfully. The transport supervisor will record the dispensed amount.
        </Alert>
      )}
      {error && (
        <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
      )}

      <Card>
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>New Fuel Request</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Submit a request for fuel. Liters and cost will be entered by the transport supervisor when dispensing.
          </p>
        </div>

        <CardBody className="space-y-4">
          {/* Requested By — read-only, shows current user */}
          <Field label="Requested By">
            <div
              className="px-3 py-2.5 rounded-lg text-sm font-medium"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              {myName || "Loading…"}
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                (you)
              </span>
            </div>
          </Field>

          {/* Vehicle */}
          <Field label="Vehicle" required>
            <Select value={vehicleId} onChange={e => handleVehicleChange(e.target.value)}>
              <option value="">— Select vehicle —</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plate_number}</option>
              ))}
            </Select>
          </Field>

          {/* Fuel Type — auto-resolved, read-only display */}
          {vehicleId && (
            <Field label="Fuel Type">
              <div
                className="px-3 py-2.5 rounded-lg text-sm capitalize"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: fuelType ? "var(--text)" : "var(--text-dim)",
                }}
              >
                {fuelType
                  ? <><span style={{ color: "var(--accent)" }}>⛽</span> {fuelType}</>
                  : "Not set on vehicle profile"}
              </div>
              {!fuelType && (
                <p className="text-xs mt-1" style={{ color: "var(--amber)" }}>
                  Fuel type not set on this vehicle's profile. An admin can update the vehicle profile.
                </p>
              )}
            </Field>
          )}

          {/* Purpose */}
          <Field label="Purpose / Destination" required>
            <Input
              placeholder="e.g. Field assignment to Kumasi, Studio generator top-up"
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
            />
          </Field>

          {/* Notes */}
          <Field label="Additional Notes">
            <Textarea
              placeholder="Any additional information for the transport supervisor…"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </Field>

          {/* Info note */}
          <div
            className="rounded-lg px-3 py-2.5 text-xs"
            style={{
              background: "var(--accent-dim)",
              border: "1px solid var(--accent)",
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "var(--accent)" }}>ℹ Note:</strong> Liters dispensed and actual cost will be
            entered by the transport supervisor at the time of fuelling. Your request will be reviewed by
            the corporate approver first.
          </div>

          <Btn variant="primary" className="w-full" loading={saving} onClick={submit}>
            Submit Fuel Request
          </Btn>
        </CardBody>
      </Card>
    </div>
  );
}