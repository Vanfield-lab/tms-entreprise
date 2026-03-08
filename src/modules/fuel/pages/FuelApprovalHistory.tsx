// src/modules/fuel/pages/FuelApprovalHistory.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageSpinner, EmptyState, Badge, Card, SearchInput } from "@/components/TmsUI";
import { fmtDate, fmtMoney } from "@/lib/utils";

type Row = {
  id: string; status: string; purpose: string | null; notes: string | null;
  liters: number | null; amount: number | null; request_date: string; updated_at: string;
  vehicles: { plate_number: string; fuel_type: string | null } | null;
  profiles: { full_name: string } | null;
  fuel_approvals: { action: string; comment: string | null; acted_at: string; profiles: { full_name: string } | null }[] | null;
};

const STATUS_LABEL: Record<string, string> = { approved: "Approved", rejected: "Rejected", recorded: "Recorded" };
const FILTERS = ["all", "approved", "rejected", "recorded"];

export default function FuelApprovalHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("fuel_requests")
        .select(`id,status,purpose,notes,liters,amount,request_date,updated_at,
          vehicles(plate_number,fuel_type),
          profiles!created_by(full_name),
          fuel_approvals(action,comment,acted_at,acted_by,profiles:acted_by(full_name))`)
        .in("status", ["approved", "rejected", "recorded"])
        .order("updated_at", { ascending: false })
        .limit(500);
      setRows((data as unknown as Row[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter(r => {
    const mS = filter === "all" || r.status === filter;
    const mQ = !q || (r.purpose ?? "").toLowerCase().includes(q.toLowerCase())
      || (r.vehicles?.plate_number ?? "").toLowerCase().includes(q.toLowerCase())
      || (r.profiles?.full_name ?? "").toLowerCase().includes(q.toLowerCase());
    return mS && mQ;
  });

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fuel Approval History</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{rows.length} decisions recorded</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="sm:w-64"><SearchInput value={q} onChange={setQ} placeholder="Search…" /></div>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
              style={{
                background: filter === f ? "var(--accent)" : "var(--surface-2)",
                color: filter === f ? "#fff" : "var(--text-muted)",
                border: "1px solid " + (filter === f ? "var(--accent)" : "var(--border)"),
              }}>
              {f === "all" ? "All" : STATUS_LABEL[f] ?? f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No records" subtitle="Approved/rejected fuel requests appear here" />
      ) : (
        <>
          {/* Mobile */}
          <div className="sm:hidden space-y-3">
            {filtered.map(r => {
              const approval = r.fuel_approvals?.[0];
              return (
                <Card key={r.id}>
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{r.purpose || "Fuel Request"}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {r.profiles?.full_name ?? "—"} · {r.vehicles?.plate_number ?? "—"} · {r.vehicles?.fuel_type ?? "—"}
                        </p>
                      </div>
                      <Badge status={r.status} label={STATUS_LABEL[r.status] ?? r.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span style={{ color: "var(--text-dim)" }}>Liters</span>
                        <p className="font-medium" style={{ color: "var(--text)" }}>{r.liters != null ? `${r.liters}L` : "—"}</p></div>
                      <div><span style={{ color: "var(--text-dim)" }}>Amount</span>
                        <p className="font-medium" style={{ color: "var(--text)" }}>{r.amount != null ? fmtMoney(r.amount) : "—"}</p></div>
                    </div>
                    {approval && (
                      <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--surface-2)" }}>
                        <span style={{ color: "var(--text-dim)" }}>Decision by </span>
                        <span style={{ color: "var(--text)" }}>{approval.profiles?.full_name ?? "—"}</span>
                        <span style={{ color: "var(--text-dim)" }}> · {fmtDate(approval.acted_at)}</span>
                        {approval.comment && <p className="mt-1 italic" style={{ color: "var(--text-muted)" }}>{approval.comment}</p>}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Desktop */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tms-table">
                <thead>
                  <tr><th>Requested By</th><th>Vehicle</th><th>Fuel Type</th><th>Purpose</th>
                    <th>Liters</th><th>Amount</th><th>Decision</th><th>Decided By</th><th>Comment</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const approval = r.fuel_approvals?.[0];
                    return (
                      <tr key={r.id}>
                        <td className="font-medium">{r.profiles?.full_name ?? "—"}</td>
                        <td>{r.vehicles?.plate_number ?? "—"}</td>
                        <td className="capitalize">{r.vehicles?.fuel_type ?? "—"}</td>
                        <td className="max-w-[140px] truncate">{r.purpose || "—"}</td>
                        <td>{r.liters != null ? `${r.liters}L` : "—"}</td>
                        <td>{r.amount != null ? fmtMoney(r.amount) : "—"}</td>
                        <td><Badge status={r.status} label={STATUS_LABEL[r.status] ?? r.status} /></td>
                        <td>{approval?.profiles?.full_name ?? "—"}</td>
                        <td className="max-w-[120px] truncate text-xs" style={{ color: "var(--text-muted)" }}>{approval?.comment ?? "—"}</td>
                        <td className="whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(r.updated_at)}</td>
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