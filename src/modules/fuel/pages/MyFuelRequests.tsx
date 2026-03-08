// src/modules/fuel/pages/MyFuelRequests.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { PageSpinner, EmptyState, Badge, Card, SearchInput } from "@/components/TmsUI";

type FuelRequest = {
  id: string;
  status: string;
  purpose: string | null;
  notes: string | null;
  liters: number | null;
  amount: number | null;
  mileage: number | null;
  vendor: string | null;
  receipt_url: string | null;
  request_date: string;
  created_at: string;
  vehicles: { plate_number: string; fuel_type: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft:     "Draft",
  submitted: "Submitted",
  approved:  "Approved",
  rejected:  "Rejected",
  recorded:  "Received",
};

const STATUS_ICON: Record<string, string> = {
  draft:     "✏️",
  submitted: "⏳",
  approved:  "✅",
  rejected:  "❌",
  recorded:  "⛽",
};

const FILTERS = ["all", "submitted", "approved", "recorded", "rejected", "draft"];

export default function MyFuelRequests() {
  const [rows,        setRows]        = useState<FuelRequest[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [statusFilter,setStatusFilter]= useState("all");
  const [q,           setQ]           = useState("");

  // ── Load: use created_by (RLS policy) ────────────────────────────────────
  // The RLS SELECT policy on fuel_requests is:
  //   created_by = auth.uid()  OR  role IN (admin, transport_supervisor, corporate_approver)
  // So we simply query all — RLS filters to the user's own rows automatically.
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("fuel_requests")
      .select("id,status,purpose,notes,liters,amount,mileage,vendor,receipt_url,request_date,created_at,vehicles(plate_number,fuel_type)")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) console.error("MyFuelRequests load:", error.message);
    setRows((data as unknown as FuelRequest[]) || []);
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

  const filtered = rows.filter(r => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchQ = !q || (r.purpose ?? "").toLowerCase().includes(q.toLowerCase())
      || (r.vehicles?.plate_number ?? "").toLowerCase().includes(q.toLowerCase());
    return matchStatus && matchQ;
  });

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Fuel Requests</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {rows.length} total request{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="sm:w-64">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search purpose, vehicle…"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
              style={{
                background: statusFilter === f ? "var(--accent)" : "var(--surface-2)",
                color: statusFilter === f ? "#fff" : "var(--text-muted)",
                border: "1px solid " + (statusFilter === f ? "var(--accent)" : "var(--border)"),
              }}
            >
              {f === "all" ? "All" : STATUS_LABEL[f] ?? f}
              {f !== "all" && (
                <span className="ml-1 opacity-70">
                  {rows.filter(r => r.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No requests found"
          subtitle={statusFilter === "all"
            ? "You haven't submitted any fuel requests yet."
            : `No ${STATUS_LABEL[statusFilter] ?? statusFilter} requests.`}
        />
      ) : (
        <>
          {/* ── Mobile cards ── */}
          <div className="sm:hidden space-y-3">
            {filtered.map(r => (
              <Card key={r.id}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>
                        {r.purpose || "Fuel Request"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {r.vehicles?.plate_number ?? "—"} · {fmtDate(r.request_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span>{STATUS_ICON[r.status]}</span>
                      <Badge status={r.status} label={STATUS_LABEL[r.status]} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span style={{ color: "var(--text-dim)" }}>Fuel Type</span>
                      <p className="font-medium capitalize" style={{ color: "var(--text)" }}>
                        {r.vehicles?.fuel_type ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-dim)" }}>Liters Dispensed</span>
                      <p className="font-medium" style={{ color: "var(--text)" }}>
                        {r.liters != null ? `${r.liters}L` : "Pending"}
                      </p>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-dim)" }}>Amount</span>
                      <p className="font-medium" style={{ color: "var(--text)" }}>
                        {r.amount != null ? fmtMoney(r.amount) : "Pending"}
                      </p>
                    </div>
                    {r.mileage != null && (
                      <div>
                        <span style={{ color: "var(--text-dim)" }}>Mileage</span>
                        <p className="font-medium" style={{ color: "var(--text)" }}>
                          {r.mileage.toLocaleString()} km
                        </p>
                      </div>
                    )}
                    {r.vendor && (
                      <div className="col-span-2">
                        <span style={{ color: "var(--text-dim)" }}>Vendor</span>
                        <p className="font-medium" style={{ color: "var(--text)" }}>{r.vendor}</p>
                      </div>
                    )}
                  </div>

                  {r.receipt_url && (
                    <a
                      href={r.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: "var(--accent)" }}
                    >
                      📄 View Receipt
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* ── Desktop table ── */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tms-table">
                <thead>
                  <tr>
                    <th>Purpose</th>
                    <th>Vehicle</th>
                    <th>Fuel Type</th>
                    <th>Liters</th>
                    <th>Amount</th>
                    <th>Mileage</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td className="font-medium max-w-[180px] truncate">{r.purpose || "—"}</td>
                      <td>{r.vehicles?.plate_number ?? "—"}</td>
                      <td className="capitalize">{r.vehicles?.fuel_type ?? "—"}</td>
                      <td>{r.liters != null ? `${r.liters}L` : <span style={{ color: "var(--text-dim)" }}>Pending</span>}</td>
                      <td>{r.amount != null ? fmtMoney(r.amount) : <span style={{ color: "var(--text-dim)" }}>Pending</span>}</td>
                      <td>{r.mileage != null ? `${r.mileage.toLocaleString()} km` : "—"}</td>
                      <td>
                        <Badge status={r.status} label={STATUS_LABEL[r.status]} />
                      </td>
                      <td className="whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {fmtDate(r.request_date)}
                      </td>
                      <td>
                        {r.receipt_url
                          ? <a href={r.receipt_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                              📄 View
                            </a>
                          : <span style={{ color: "var(--text-dim)" }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}