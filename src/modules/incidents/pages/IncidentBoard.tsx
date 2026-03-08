// src/modules/incidents/pages/IncidentBoard.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageSpinner, EmptyState, Badge, Card, Btn, Field, Textarea, CountPill, TabBar } from "@/components/TmsUI";
import { fmtDateTime } from "@/lib/utils";

type Incident = {
  id: string; incident_type: string; title: string; description: string;
  status: string; priority: string; created_at: string; updated_at: string;
  supervisor_notes: string | null; acknowledged_at: string | null; resolved_at: string | null;
  attachments: { url: string; name: string; type: string }[];
  vehicles: { plate_number: string } | null;
  reporter: { full_name: string } | null;
  acknowledged_profiles: { full_name: string } | null;
};

type Tab = "open" | "acknowledged" | "in_progress" | "resolved";

const STATUS_LABEL: Record<string, string> = {
  open: "Open", acknowledged: "Acknowledged", in_progress: "In Progress", resolved: "Resolved",
};
const PRIORITY_COLOR: Record<string, string> = {
  low: "var(--text-dim)", normal: "var(--text-muted)", high: "var(--amber)", critical: "var(--red)",
};
const TYPE_ICON: Record<string, string> = {
  accident: "🚨", breakdown: "🔧", maintenance: "⚙️", other: "📋",
};

export default function IncidentBoard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("open");
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("incident_reports")
      .select(`id,incident_type,title,description,status,priority,created_at,updated_at,
        supervisor_notes,acknowledged_at,resolved_at,attachments,
        vehicles(plate_number),
        reporter:reported_by(full_name),
        acknowledged_profiles:acknowledged_by(full_name)`)
      .order("created_at", { ascending: false });
    setIncidents((data as unknown as Incident[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const act = async (id: string, action: "acknowledge" | "in_progress" | "resolve") => {
    setActing(m => ({ ...m, [id]: true }));
    const statusMap = { acknowledge: "acknowledged", in_progress: "in_progress", resolve: "resolved" };
    const { data: { user } } = await supabase.auth.getUser();
    const update: Record<string, unknown> = { status: statusMap[action], updated_at: new Date().toISOString() };
    if (notes[id]) update.supervisor_notes = notes[id];
    if (action === "acknowledge") { update.acknowledged_by = user?.id; update.acknowledged_at = new Date().toISOString(); }
    if (action === "resolve") { update.resolved_by = user?.id; update.resolved_at = new Date().toISOString(); }
    await supabase.from("incident_reports").update(update).eq("id", id);
    await load();
    setActing(m => ({ ...m, [id]: false }));
    setExpanded(null);
  };

  const visible = incidents.filter(i => i.status === tab);

  const tabs: { value: Tab; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "acknowledged", label: "Acknowledged" },
    { value: "in_progress", label: "In Progress" },
    { value: "resolved", label: "Resolved" },
  ];

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Incident Reports</h1>
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab}
        counts={{
          open: incidents.filter(i => i.status === "open").length,
          acknowledged: incidents.filter(i => i.status === "acknowledged").length,
          in_progress: incidents.filter(i => i.status === "in_progress").length,
          resolved: incidents.filter(i => i.status === "resolved").length,
        }} />

      {visible.length === 0 ? (
        <EmptyState title={`No ${STATUS_LABEL[tab].toLowerCase()} incidents`} />
      ) : (
        <div className="space-y-3">
          {visible.map(inc => {
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
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{inc.reporter?.full_name ?? "—"}</span>
                          {inc.vehicles && <span className="text-xs" style={{ color: "var(--text-dim)" }}>· {inc.vehicles.plate_number}</span>}
                          <span className="text-xs font-medium capitalize" style={{ color: PRIORITY_COLOR[inc.priority] }}>
                            {inc.priority === "critical" ? "🔴" : inc.priority === "high" ? "🟠" : ""} {inc.priority}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>{fmtDateTime(inc.created_at)}</p>
                      </div>
                    </div>
                    <Badge status={inc.status} label={STATUS_LABEL[inc.status] ?? inc.status} />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <div className="pt-3">
                      <p className="text-sm" style={{ color: "var(--text)" }}>{inc.description}</p>
                    </div>

                    {inc.supervisor_notes && (
                      <div className="rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Previous Notes</p>
                        <p className="text-sm" style={{ color: "var(--text)" }}>{inc.supervisor_notes}</p>
                      </div>
                    )}

                    {inc.attachments?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {inc.attachments.map((a, i) => (
                          <a key={i} href={a.url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
                            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--accent)" }}>
                            {a.type?.startsWith("image") ? "🖼" : "📄"} {a.name}
                          </a>
                        ))}
                      </div>
                    )}

                    <Field label="Supervisor Notes">
                      <Textarea rows={2} placeholder="Add notes or update…"
                        value={notes[inc.id] ?? ""}
                        onChange={e => setNotes(m => ({ ...m, [inc.id]: e.target.value }))} />
                    </Field>

                    <div className="flex flex-wrap gap-2">
                      {inc.status === "open" && (
                        <Btn size="sm" variant="primary" loading={acting[inc.id]} onClick={() => act(inc.id, "acknowledge")}>
                          Acknowledge
                        </Btn>
                      )}
                      {inc.status === "acknowledged" && (
                        <Btn size="sm" variant="amber" loading={acting[inc.id]} onClick={() => act(inc.id, "in_progress")}>
                          Mark In Progress
                        </Btn>
                      )}
                      {(inc.status === "acknowledged" || inc.status === "in_progress") && (
                        <Btn size="sm" variant="success" loading={acting[inc.id]} onClick={() => act(inc.id, "resolve")}>
                          Mark Resolved
                        </Btn>
                      )}
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