// src/modules/fuel/pages/FuelRecordQueue.tsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageSpinner, EmptyState, Badge, Card, CountPill, Field, Input, Btn } from "@/components/TmsUI";
import { fmtDate, fmtMoney } from "@/lib/utils";

type FuelRow = {
  id: string;
  status: string;
  purpose: string | null;
  notes: string | null;
  liters: number | null;
  amount: number | null;
  mileage: number | null;
  receipt_url: string | null;
  request_date: string;
  created_at: string;
  vehicles: { plate_number: string; fuel_type: string | null; current_mileage: number | null } | null;
  profiles: { full_name: string } | null;
};

type RecordState = {
  liters:      string;
  amount:      string;
  mileage:     string;
  vendor:      string;
  notes:       string;
  receiptFile: File | null;
  uploading:   boolean;
  saving:      boolean;
  error:       string;
};

const EMPTY_STATE: RecordState = {
  liters: "", amount: "", mileage: "", vendor: "",
  notes: "", receiptFile: null, uploading: false, saving: false, error: "",
};

export default function FuelRecordQueue() {
  const [rows,    setRows]    = useState<FuelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [state,   setState]   = useState<Record<string, RecordState>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const s = (id: string): RecordState => state[id] ?? EMPTY_STATE;
  const u = (id: string, patch: Partial<RecordState>) =>
    setState(m => ({ ...m, [id]: { ...s(id), ...patch } }));

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("fuel_requests")
      .select("id,status,purpose,notes,liters,amount,mileage,receipt_url,request_date,created_at,vehicles(plate_number,fuel_type,current_mileage),profiles!created_by(full_name)")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) console.error("FuelRecordQueue:", error.message);
    setRows((data as unknown as FuelRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Upload receipt to storage ─────────────────────────────────────────────
  const uploadReceipt = async (id: string, file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `receipts/${id}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("fuel-receipts").upload(path, file);
    if (error) { u(id, { error: "Receipt upload failed: " + error.message }); return null; }
    const { data: url } = supabase.storage.from("fuel-receipts").getPublicUrl(path);
    return url.publicUrl;
  };

  // ── Record fuel ───────────────────────────────────────────────────────────
  const record = async (id: string) => {
    const st = s(id);
    if (!st.liters) { u(id, { error: "Liters dispensed is required." }); return; }
    if (!st.amount) { u(id, { error: "Actual cost is required." }); return; }

    u(id, { saving: true, error: "" });
    try {
      let receiptUrl: string | null = null;
      if (st.receiptFile) {
        u(id, { uploading: true });
        receiptUrl = await uploadReceipt(id, st.receiptFile);
        u(id, { uploading: false });
        if (!receiptUrl) { u(id, { saving: false }); return; }
      }

      const { error } = await supabase.rpc("record_fuel_request", {
        p_fuel_request_id: id,
        p_actual_liters:   parseFloat(st.liters),
        p_actual_amount:   parseFloat(st.amount),
        p_vendor:          st.vendor.trim() || null,
        p_mileage:         st.mileage ? parseFloat(st.mileage) : null,
        p_receipt_url:     receiptUrl,
        p_notes:           st.notes.trim() || null,
      });
      if (error) throw error;

      setState(m => { const n = { ...m }; delete n[id]; return n; });
      await load();
    } catch (e: any) {
      u(id, { error: e.message ?? "Failed to record." });
    } finally {
      u(id, { saving: false, uploading: false });
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Record Fuel</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Enter dispensed amount for approved fuel requests
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No approved requests" subtitle="Approved fuel requests awaiting recording appear here" />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <CountPill n={rows.length} color="green" />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>ready to record</span>
          </div>

          {/* ── Mobile cards ── */}
          <div className="sm:hidden space-y-4">
            {rows.map(r => {
              const st = s(r.id);
              return (
                <Card key={r.id}>
                  {/* Request info */}
                  <div
                    className="px-4 py-3 border-b"
                    style={{ borderColor: "var(--border)", background: "var(--green-dim)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm" style={{ color: "var(--text)" }}>
                          {r.profiles?.full_name ?? "—"}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {r.vehicles?.plate_number ?? "—"} · {r.vehicles?.fuel_type ?? "—"} · {fmtDate(r.request_date)}
                        </p>
                        {r.purpose && (
                          <p className="text-xs mt-1 italic" style={{ color: "var(--text-muted)" }}>
                            "{r.purpose}"
                          </p>
                        )}
                      </div>
                      <Badge status={r.status} />
                    </div>
                  </div>

                  {/* Input fields */}
                  <div className="p-4 space-y-3">
                    {st.error && (
                      <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--red-dim)", color: "var(--red)" }}>
                        {st.error}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Liters Dispensed *">
                        <Input type="number" min="0" step="0.1" placeholder="0.0"
                          value={st.liters} onChange={e => u(r.id, { liters: e.target.value })} />
                      </Field>
                      <Field label="Actual Cost (GHS) *">
                        <Input type="number" min="0" step="0.01" placeholder="0.00"
                          value={st.amount} onChange={e => u(r.id, { amount: e.target.value })} />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Mileage (km)">
                        <Input type="number" min="0" step="1"
                          placeholder={r.vehicles?.current_mileage?.toString() ?? "Current km"}
                          value={st.mileage} onChange={e => u(r.id, { mileage: e.target.value })} />
                      </Field>
                      <Field label="Vendor / Station">
                        <Input placeholder="e.g. Total Spintex"
                          value={st.vendor} onChange={e => u(r.id, { vendor: e.target.value })} />
                      </Field>
                    </div>

                    <Field label="Notes">
                      <Input placeholder="Pump #, attendant name…"
                        value={st.notes} onChange={e => u(r.id, { notes: e.target.value })} />
                    </Field>

                    {/* Receipt upload */}
                    <Field label="Receipt (optional)">
                      <div
                        className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border"
                        style={{ borderColor: "var(--border)", background: "var(--input-bg)" }}
                        onClick={() => fileInputRefs.current[r.id]?.click()}
                      >
                        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                          {st.receiptFile ? `📄 ${st.receiptFile.name}` : "📎 Attach receipt…"}
                        </span>
                        <input
                          type="file" accept="image/*,.pdf"
                          className="hidden"
                          ref={el => { fileInputRefs.current[r.id] = el; }}
                          onChange={e => u(r.id, { receiptFile: e.target.files?.[0] ?? null })}
                        />
                      </div>
                      {st.receiptFile && (
                        <button
                          className="text-xs mt-1"
                          style={{ color: "var(--red)" }}
                          onClick={() => u(r.id, { receiptFile: null })}
                        >
                          Remove
                        </button>
                      )}
                    </Field>

                    <Btn
                      variant="primary"
                      className="w-full"
                      loading={st.saving || st.uploading}
                      onClick={() => record(r.id)}
                    >
                      {st.uploading ? "Uploading receipt…" : "⛽ Record Fuel Dispensed"}
                    </Btn>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* ── Desktop table ── */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="tms-table" style={{ minWidth: 960 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 130 }}>Requested By</th>
                    <th style={{ minWidth: 110 }}>Vehicle</th>
                    <th style={{ minWidth: 90 }}>Fuel Type</th>
                    <th style={{ minWidth: 90 }}>Purpose</th>
                    <th style={{ minWidth: 110 }}>Liters Dispensed *</th>
                    <th style={{ minWidth: 130 }}>Actual Cost (GHS) *</th>
                    <th style={{ minWidth: 110 }}>Mileage (km)</th>
                    <th style={{ minWidth: 120 }}>Vendor / Station</th>
                    <th style={{ minWidth: 110 }}>Notes</th>
                    <th style={{ minWidth: 110 }}>Receipt</th>
                    <th style={{ minWidth: 80 }}>Date</th>
                    <th style={{ minWidth: 100 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const st = s(r.id);
                    return (
                      <tr key={r.id}>
                        <td className="font-medium">{r.profiles?.full_name ?? "—"}</td>
                        <td>{r.vehicles?.plate_number ?? "—"}</td>
                        <td className="capitalize">{r.vehicles?.fuel_type ?? "—"}</td>
                        <td className="max-w-[120px] truncate text-xs" style={{ color: "var(--text-muted)" }}>
                          {r.purpose || "—"}
                        </td>
                        <td>
                          <input
                            type="number" min="0" step="0.1" placeholder="L"
                            value={st.liters}
                            onChange={e => u(r.id, { liters: e.target.value })}
                            className="tms-input"
                            style={{ width: 90 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number" min="0" step="0.01" placeholder="GHS"
                            value={st.amount}
                            onChange={e => u(r.id, { amount: e.target.value })}
                            className="tms-input"
                            style={{ width: 100 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number" min="0" step="1"
                            placeholder={r.vehicles?.current_mileage?.toString() ?? "km"}
                            value={st.mileage}
                            onChange={e => u(r.id, { mileage: e.target.value })}
                            className="tms-input"
                            style={{ width: 90 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text" placeholder="Vendor"
                            value={st.vendor}
                            onChange={e => u(r.id, { vendor: e.target.value })}
                            className="tms-input"
                            style={{ width: 100 }}
                          />
                        </td>
                        <td>
                          <input
                            type="text" placeholder="Notes"
                            value={st.notes}
                            onChange={e => u(r.id, { notes: e.target.value })}
                            className="tms-input"
                            style={{ width: 100 }}
                          />
                        </td>
                        <td>
                          <label className="cursor-pointer inline-flex items-center gap-1 text-xs font-medium"
                            style={{ color: st.receiptFile ? "var(--green)" : "var(--text-muted)" }}>
                            {st.receiptFile ? `📄 ${st.receiptFile.name.slice(0,10)}…` : "📎 Attach"}
                            <input
                              type="file" accept="image/*,.pdf" className="hidden"
                              onChange={e => u(r.id, { receiptFile: e.target.files?.[0] ?? null })}
                            />
                          </label>
                        </td>
                        <td className="whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>
                          {fmtDate(r.request_date)}
                        </td>
                        <td>
                          {st.error && (
                            <p className="text-xs mb-1" style={{ color: "var(--red)" }}>{st.error}</p>
                          )}
                          <Btn
                            size="sm"
                            variant="primary"
                            loading={st.saving || st.uploading}
                            onClick={() => record(r.id)}
                          >
                            Record
                          </Btn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}