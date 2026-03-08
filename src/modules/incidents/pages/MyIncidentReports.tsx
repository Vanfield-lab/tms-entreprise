// src/modules/incidents/pages/MyIncidentReports.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageSpinner, EmptyState, Badge, Card } from "@/components/TmsUI";
import { fmtDateTime } from "@/lib/utils";

type Incident = {
  id: string; incident_type: string; title: string; description: string;
  status: string; priority: string; created_at: string; updated_at: string;
  supervisor_notes: string | null; acknowledged_at: string | null; resolved_at: string | null;
  attachments: { url: string; name: string; type: string }[];
  vehicles: { plate_number: string } | null;
  acknowledged_profiles: { full_name: string } | null;
  resolved_profiles: { full_name: string } | null;
};

const STATUS_STEPS = ["open", "acknowledged", "in_progress", "resolved"];
const STATUS_LABEL: Record<string, string> = {
  open: "Open", acknowledged: "Acknowledged", in_progress: "In Progress", resolved: "Resolved",
};
const PRIORITY_COLOR: Record<string, string> = {
  low: "var(--text-dim)", normal: "var(--text-muted)", high: "var(--amber)", critical: "var(--red)",
};
const TYPE_ICON: Record<string, string> = {
  accident: "🚨", breakdown: "🔧", maintenance: "⚙️", other: "📋",
};

export default function MyIncidentReports() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase.from("incident_reports")
      .select(`id,incident_type,title,description,status,priority,created_at,updated_at,
        supervisor_notes,acknowledged_at,resolved_at,attachments,
        vehicles(plate_number),
        acknowledged_profiles:acknowledged_by(full_name),
        resolved_profiles:resolved_by(full_name)`)
      .eq("reported_by", user.id)
      .order("created_at", { ascending: false });
    setIncidents((data as unknown as Incident[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">My Incident Reports</h1>
      </div>

      {incidents.length === 0 ? (
        <EmptyState title="No incidents reported" subtitle="Your submitted incident reports will appear here" />
      ) : (
        <div className="space-y-3">
          {incidents.map(inc => {
            const stepIdx = STATUS_STEPS.indexOf(inc.status);
            const isOpen = expanded === inc.id;
            return (
              <Card key={inc.id}>
                <button className="w-full text-left px-4 py-3" onClick={() => setExpanded(isOpen ? null : inc.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="text-xl shrink-0">{TYPE_ICON[inc.incident_type] ?? "📋"}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>{inc.title}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>{inc.incident_type.replace("_", " ")}</span>
                          {inc.vehicles && <span className="text-xs" style={{ color: "var(--text-dim)" }}>{inc.vehicles.plate_number}</span>}
                          <span className="text-xs font-medium capitalize" style={{ color: PRIORITY_COLOR[inc.priority] }}>{inc.priority}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge status={inc.status} label={STATUS_LABEL[inc.status] ?? inc.status} />
                      <span className="text-xs" style={{ color: "var(--text-dim)" }}>{fmtDateTime(inc.created_at)}</span>
                    </div>
                  </div>

                  {/* Progress tracker */}
                  <div className="mt-3">
                    <div className="flex items-center gap-0">
                      {STATUS_STEPS.map((step, i) => {
                        const done = i <= stepIdx;
                        const current = i === stepIdx;
                        return (
                          <div key={step} className="flex items-center flex-1 last:flex-none">
                            <div className="flex flex-col items-center gap-1">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                style={{
                                  background: done ? "var(--accent)" : "var(--surface-2)",
                                  color: done ? "#fff" : "var(--text-dim)",
                                  border: `2px solid ${current ? "var(--accent)" : done ? "var(--accent)" : "var(--border)"}`,
                                  boxShadow: current ? "0 0 0 3px var(--accent-dim)" : "none",
                                }}>
                                {done && i < stepIdx ? "✓" : i + 1}
                              </div>
                              <span className="text-xs whitespace-nowrap" style={{ color: done ? "var(--text)" : "var(--text-dim)", fontSize: 9 }}>
                                {STATUS_LABEL[step]}
                              </span>
                            </div>
                            {i < STATUS_STEPS.length - 1 && (
                              <div className="flex-1 h-0.5 mx-1 mb-4"
                                style={{ background: i < stepIdx ? "var(--accent)" : "var(--border)" }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <div className="pt-3">
                      <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Description</p>
                      <p className="text-sm" style={{ color: "var(--text)" }}>{inc.description}</p>
                    </div>

                    {inc.supervisor_notes && (
                      <div className="rounded-xl p-3" style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)" }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: "var(--accent)" }}>Supervisor Notes</p>
                        <p className="text-sm" style={{ color: "var(--text)" }}>{inc.supervisor_notes}</p>
                      </div>
                    )}

                    {inc.acknowledged_at && (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Acknowledged by <strong>{inc.acknowledged_profiles?.full_name ?? "supervisor"}</strong> on {fmtDateTime(inc.acknowledged_at)}
                      </p>
                    )}
                    {inc.resolved_at && (
                      <p className="text-xs" style={{ color: "var(--green)" }}>
                        ✓ Resolved by <strong>{inc.resolved_profiles?.full_name ?? "supervisor"}</strong> on {fmtDateTime(inc.resolved_at)}
                      </p>
                    )}

                    {inc.attachments?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>Attachments</p>
                        <div className="flex flex-wrap gap-2">
                          {inc.attachments.map((a, i) => (
                            <a key={i} href={a.url} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
                              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--accent)" }}>
                              {a.type.startsWith("image") ? "🖼" : "📄"} {a.name}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
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