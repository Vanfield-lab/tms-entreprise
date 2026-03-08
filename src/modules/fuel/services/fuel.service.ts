// src/modules/fuel/services/fuel.service.ts
import { supabase } from "@/lib/supabase";

// ─── Create draft then immediately submit ─────────────────────────────────────
// Requester only needs: vehicle, purpose, notes.
// Fuel type is auto-resolved from the vehicle profile on the DB side.
// Liters and amount are left NULL — transport supervisor fills them during recording.
export async function createAndSubmitFuelRequest(input: {
  vehicle_id: string;
  purpose:    string;
  notes?:     string | null;
  fuel_type?: string | null; // optional override; DB resolves from vehicle if null
}): Promise<string> {
  const { data: draftId, error: draftErr } = await supabase.rpc("create_fuel_request_draft", {
    p_vehicle_id: input.vehicle_id,
    p_driver_id:  null,
    p_fuel_type:  input.fuel_type ?? null,
    p_liters:     null,
    p_amount:     null,
    p_vendor:     null,
    p_purpose:    input.purpose,
    p_notes:      input.notes ?? null,
  });
  if (draftErr) throw draftErr;

  const { error: subErr } = await supabase.rpc("submit_fuel_request", {
    p_fuel_request_id: draftId,
  });
  if (subErr) throw subErr;

  return draftId as string;
}

// ─── Corporate: approve or reject ────────────────────────────────────────────
export async function approveFuelRequest(
  fuelRequestId: string,
  action: "approved" | "rejected",
  comment?: string
): Promise<void> {
  const { error } = await supabase.rpc("approve_fuel_request", {
    p_fuel_request_id: fuelRequestId,
    p_action:          action,
    p_comment:         comment ?? null,
  });
  if (error) throw error;
}

// ─── Transport: record dispensed fuel ────────────────────────────────────────
export async function recordFuel(
  fuelRequestId: string,
  input: {
    actual_liters:  number;
    actual_amount:  number;
    vendor?:        string | null;
    mileage?:       number | null;
    receipt_url?:   string | null;
    notes?:         string | null;
  }
): Promise<void> {
  const { error } = await supabase.rpc("record_fuel_request", {
    p_fuel_request_id: fuelRequestId,
    p_actual_liters:   input.actual_liters,
    p_actual_amount:   input.actual_amount,
    p_vendor:          input.vendor ?? null,
    p_mileage:         input.mileage ?? null,
    p_receipt_url:     input.receipt_url ?? null,
    p_notes:           input.notes ?? null,
  });
  if (error) throw error;
}