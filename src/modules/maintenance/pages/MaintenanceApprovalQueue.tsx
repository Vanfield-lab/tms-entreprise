// src/modules/maintenance/pages/MaintenanceApprovalQueue.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageSpinner, EmptyState, Badge, Card, Btn, Field, Textarea, CountPill } from "@/components/TmsUI";
import { fmtDate, fmtMoney } from "@/lib/utils";

type Request = {
  id: string; issue_type: string | null; issue_description: string; status: string;
  created_at: string; priority: string | null; estimated_cost: number | null;
  scheduled_date: string | null; notes: string | null; requested_by_supervisor: boolean | null;
  vehicles: { plate_number: string } | null;
  reporter: { full_name: string } | null;
};

export default function MaintenanceApprovalQueue() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("maintenance_requests")
      .select("id,issue_type,issue_description,status,created_at,priority,estimated_cost,scheduled_date,notes,requested_by_supervisor,vehicles(plate_number),reporter:reported_by(full_name)")
      .eq("status", "reported")
      .order("created_at", { ascending: false });
    setRequests((data as unknown as Request[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const act = async (id: string, action: "approved" | "rejected") => {
    setActing(m => ({ ...m, [id]: true }));
    await supabase.rpc("approve_maintenance", { p_request_id: id, p_action: action, p_notes: notes[id] ?? null });
    await load();
    setActing(m => ({ ...m, [id]: false }));
    setExpanded(null);
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <CountPill n={requests.length} color="amber" />
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>maintenance request{requests.length !== 1 ? "s" : ""} awaiting approval</span>
      </div>

      {requests.length === 0 ? (
        <EmptyState title="All caught up" subtitle="No maintenance requests pending review" />
      ) : (
        <div className="space-y-3">
          {requests.map(r => {
            const isOpen = expanded === r.id;
            return (
              <Card key={r.id}>
                <button className="w-full text-left px-4 py-3" onClick={() => setExpanded(isOpen ? null : r.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>
                          {r.vehicles?.plate_number ?? "—"} — {(r.issue_type ?? "other").replace("_"," ")}
                        </p>
                        {r.requested_by_supervisor && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                            style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>Supervisor Request</span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {r.reporter?.full_name ?? "—"} · {fmtDate(r.created_at)}
                        {r.priority && r.priority !== "normal" && (
                          <span className="ml-2 font-semibold capitalize"
                            style={{ color: r.priority === "critical" ? "var(--red)" : r.priority === "high" ? "var(--amber)" : "var(--text-dim)" }}>
                            · {r.priority}
                          </span>
                        )}
                      </p>
                    </div>
                    <Badge status={r.status} label="Pending" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <p className="text-sm pt-3" style={{ color: "var(--text)" }}>{r.issue_description}</p>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {r.estimated_cost != null && (
                        <div><span style={{ color: "var(--text-dim)" }}>Estimated Cost</span>
                          <p className="font-semibold" style={{ color: "var(--text)" }}>{fmtMoney(r.estimated_cost)}</p></div>
                      )}
                      {r.scheduled_date && (
                        <div><span style={{ color: "var(--text-dim)" }}>Scheduled Date</span>
                          <p className="font-semibold" style={{ color: "var(--text)" }}>{fmtDate(r.scheduled_date)}</p></div>
                      )}
                    </div>

                    {r.notes && <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>{r.notes}</p>}

                    <Field label="Comment">
                      <Textarea rows={2} placeholder="Optional comment…"
                        value={notes[r.id] ?? ""}
                        onChange={e => setNotes(m => ({ ...m, [r.id]: e.target.value }))} />
                    </Field>

                    <div className="flex gap-2">
                      <Btn variant="success" size="sm" loading={acting[r.id]} onClick={() => act(r.id, "approved")}>
                        Approve
                      </Btn>
                      <Btn variant="danger" size="sm" loading={acting[r.id]} onClick={() => act(r.id, "rejected")}>
                        Reject
                      </Btn>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}