// src/modules/fuel/pages/FuelReviewQueue.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageSpinner, EmptyState, Badge, Card, CountPill, Field, Input, Btn } from "@/components/TmsUI";
import { fmtDate } from "@/lib/utils";

type FuelRow = {
  id: string;
  status: string;
  purpose: string | null;
  notes: string | null;
  request_date: string;
  created_at: string;
  vehicles: { plate_number: string; fuel_type: string | null } | null;
  profiles: { full_name: string } | null; // via created_by
};

export default function FuelReviewQueue() {
  const [rows,    setRows]    = useState<FuelRow[]>([]);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [acting,  setActing]  = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("fuel_requests")
      .select("id,status,purpose,notes,request_date,created_at,vehicles(plate_number,fuel_type),profiles!created_by(full_name)")
      .eq("status", "submitted")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) console.error("FuelReviewQueue load:", error.message);
    setRows((data as unknown as FuelRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("fuel_review_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "fuel_requests" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const act = async (id: string, action: "approved" | "rejected") => {
    setActing(m => ({ ...m, [id]: true }));
    try {
      const { error } = await supabase.rpc("approve_fuel_request", {
        p_fuel_request_id: id,
        p_action:  action,
        p_comment: comment[id] ?? null,
      });
      if (error) throw error;
      await load();
    } catch (e: any) {
      alert("Action failed: " + e.message);
    } finally {
      setActing(m => ({ ...m, [id]: false }));
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fuel Approvals</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Review and approve fuel requests</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="All caught up" subtitle="No fuel requests awaiting approval" />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <CountPill n={rows.length} color="amber" />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              pending approval{rows.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-4">
            {rows.map(r => (
              <Card key={r.id}>
                {/* Header */}
                <div
                  className="px-4 py-3 border-b flex items-start justify-between gap-3"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--amber-dim)",
                  }}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm" style={{ color: "var(--text)" }}>
                      {r.purpose || "Fuel Request"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Submitted {fmtDate(r.created_at)}
                    </p>
                  </div>
                  <Badge status={r.status} />
                </div>

                {/* Request details — what was actually submitted */}
                <div className="px-4 py-4 space-y-3 border-b" style={{ borderColor: "var(--border)" }}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>Requested By</p>
                      <p className="font-semibold mt-0.5" style={{ color: "var(--text)" }}>
                        {r.profiles?.full_name ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>Vehicle</p>
                      <p className="font-semibold mt-0.5" style={{ color: "var(--text)" }}>
                        {r.vehicles?.plate_number ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>Fuel Type</p>
                      <p className="font-semibold mt-0.5 capitalize" style={{ color: "var(--text)" }}>
                        {r.vehicles?.fuel_type ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: "var(--text-dim)" }}>Date Requested</p>
                      <p className="font-semibold mt-0.5" style={{ color: "var(--text)" }}>
                        {fmtDate(r.request_date)}
                      </p>
                    </div>
                  </div>

                  {r.notes && (
                    <div
                      className="rounded-lg px-3 py-2 text-sm"
                      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                    >
                      <span className="font-medium" style={{ color: "var(--text)" }}>Notes: </span>
                      {r.notes}
                    </div>
                  )}
                </div>

                {/* Approve / Reject */}
                <div className="p-4 space-y-3">
                  <Field label="Comment (optional)">
                    <Input
                      placeholder="Add a comment for the requester…"
                      value={comment[r.id] || ""}
                      onChange={e => setComment(m => ({ ...m, [r.id]: e.target.value }))}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Btn
                      variant="primary"
                      className="flex-1"
                      loading={acting[r.id]}
                      onClick={() => act(r.id, "approved")}
                    >
                      ✅ Approve
                    </Btn>
                    <Btn
                      variant="danger"
                      className="flex-1"
                      loading={acting[r.id]}
                      onClick={() => act(r.id, "rejected")}
                    >
                      ❌ Reject
                    </Btn>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}