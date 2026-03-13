// src/modules/fuel/pages/FuelRequests.tsx
// Shows the current user's own fuel requests. Uses RLS (created_by = auth.uid()).
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate, fmtMoney } from "@/lib/utils";

type FuelStatus = "draft" | "submitted" | "approved" | "rejected" | "recorded";

type FuelRequest = {
  id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  purpose: string | null;
  liters: number | null;
  amount: number | null;
  vendor: string | null;
  notes: string | null;
  status: FuelStatus;
  request_date: string | null;
  created_at: string;
};

const STATUS_BADGE: Record<FuelStatus, string> = {
  draft:     "badge badge-draft",
  submitted: "badge badge-submitted",
  approved:  "badge badge-approved",
  rejected:  "badge badge-rejected",
  recorded:  "badge badge-recorded",
};

const STATUS_LABEL: Record<FuelStatus, string> = {
  draft:     "Draft",
  submitted: "Pending Approval",
  approved:  "Approved",
  rejected:  "Rejected",
  recorded:  "Recorded / Dispensed",
};

type Enriched = FuelRequest & { plate_number?: string; driver_name?: string };

export default function FuelRequests() {
  const [rows,    setRows]    = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<FuelStatus | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // RLS ensures only own requests are returned
    const { data, error } = await supabase
      .from("fuel_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) { setLoading(false); return; }
    const raw = (data ?? []) as FuelRequest[];

    // Enrich with vehicle plates
    const vehicleIds = [...new Set(raw.map(r => r.vehicle_id).filter(Boolean))];
    const driverIds  = [...new Set(raw.map(r => r.driver_id).filter(Boolean))] as string[];

    const [{ data: vehicles }, { data: drivers }] = await Promise.all([
      vehicleIds.length
        ? supabase.from("vehicles").select("id,plate_number").in("id", vehicleIds)
        : Promise.resolve({ data: [] }),
      driverIds.length
        ? supabase.from("drivers").select("id,full_name,license_number").in("id", driverIds)
        : Promise.resolve({ data: [] }),
    ]);

    const vMap = Object.fromEntries((vehicles ?? []).map((v: any) => [v.id, v.plate_number]));
    const dMap = Object.fromEntries((drivers  ?? []).map((d: any) => [d.id, d.full_name || d.license_number]));

    setRows(raw.map(r => ({
      ...r,
      plate_number: r.vehicle_id ? (vMap[r.vehicle_id] ?? "—") : "—",
      driver_name:  r.driver_id ? dMap[r.driver_id] ?? "—" : "—",
    })));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("my_fuel_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "fuel_requests" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = filter === "all" ? rows : rows.filter(r => r.status === filter);

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">My Fuel Requests</h1>
        <p className="page-sub">{rows.length} total request{rows.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["all", "draft", "submitted", "approved", "rejected", "recorded"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`btn btn-sm ${filter === s ? "btn-primary" : "btn-ghost"}`}
          >
            {s === "all" ? "All" : STATUS_LABEL[s as FuelStatus]}
            {s !== "all" && (
              <span style={{
                marginLeft: 4,
                background: "var(--surface-2)",
                borderRadius: 9999,
                padding: "1px 6px",
                fontSize: 11,
                color: "var(--text-muted)",
              }}>
                {rows.filter(r => r.status === s).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">⛽</div>
          <p>No fuel requests{filter !== "all" ? ` with status "${filter}"` : ""}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className="card" style={{ overflow: "hidden" }}>
              <button
                className="w-full text-left"
                style={{ padding: "12px 16px", background: "none", border: "none", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
                        {r.purpose || "Fuel Request"}
                      </span>
                      <span className={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      {r.plate_number} · {fmtDate(r.request_date)} · {fmtDate(r.created_at)}
                    </div>
                  </div>
                  <span style={{ color: "var(--text-dim)", fontSize: 18 }}>{expanded === r.id ? "▴" : "▾"}</span>
                </div>
              </button>

              {expanded === r.id && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2" style={{ fontSize: 13 }}>
                    {[
                      ["Vehicle",  r.plate_number],
                      ["Driver",   r.driver_name],
                      ["Litres",   r.liters != null ? `${r.liters} L` : "—"],
                      ["Amount",   r.amount != null ? fmtMoney(r.amount) : "—"],
                      ["Vendor",   r.vendor || "—"],
                      ["Status",   STATUS_LABEL[r.status]],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 2 }}>{label}</div>
                        <div style={{ color: "var(--text)", fontWeight: 500 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {r.notes && (
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                      <span style={{ color: "var(--text-dim)" }}>Notes: </span>{r.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}