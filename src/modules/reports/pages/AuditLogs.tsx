// src/modules/reports/pages/AuditLogs.tsx
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/utils";

type Audit = {
  id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: any;
  created_at: string;
};

type Profile = { id: string; full_name: string };

const ACTION_COLOR: Record<string, string> = {
  create: "text-emerald-600",
  submit: "text-amber-600",
  approve: "text-emerald-600",
  reject: "text-red-500",
  dispatch: "text-blue-600",
  update: "text-cyan-600",
  delete: "text-red-500",
  close: "text-gray-500",
  record: "text-violet-600",
  override: "text-orange-500",
};

const ACTION_BG: Record<string, string> = {
  create: "bg-emerald-50 border-emerald-200",
  submit: "bg-amber-50 border-amber-200",
  approve: "bg-emerald-50 border-emerald-200",
  reject: "bg-red-50 border-red-200",
  dispatch: "bg-blue-50 border-blue-200",
  update: "bg-cyan-50 border-cyan-200",
  delete: "bg-red-50 border-red-200",
  close: "bg-gray-50 border-gray-200",
  record: "bg-violet-50 border-violet-200",
  override: "bg-orange-50 border-orange-200",
};

const ENTITY_ICON: Record<string, string> = {
  booking: "📋",
  fuel_request: "⛽",
  maintenance_request: "🔧",
  user_request: "👤",
  vehicle: "🚗",
  driver: "🪪",
  shift: "📅",
  trip: "🗺️",
};

export default function AuditLogs() {
  const [rows, setRows] = useState<Audit[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("audit_logs")
      .select("id,actor_user_id,action,entity_type,entity_id,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    const logs = (data as Audit[]) || [];
    setRows(logs);

    // resolve unique actor UUIDs to names
    const uids = [...new Set(logs.map((r) => r.actor_user_id).filter(Boolean))];
    if (uids.length) {
      const { data: pdata } = await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", uids);
      const map: Record<string, string> = {};
      (pdata as Profile[] || []).forEach((p) => { map[p.id] = p.full_name; });
      setProfiles(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchQ = !q || [r.action, r.entity_type, profiles[r.actor_user_id] || "", r.entity_id].join(" ").toLowerCase().includes(q);
    const matchAction = !actionFilter || r.action.startsWith(actionFilter);
    const matchEntity = !entityFilter || r.entity_type === entityFilter;
    return matchQ && matchAction && matchEntity;
  });

  const uniqueActions = [...new Set(rows.map((r) => r.action.split("_")[0]))].sort();
  const uniqueEntities = [...new Set(rows.map((r) => r.entity_type))].sort();

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Audit Logs</h1>
        <p className="page-sub">Complete record of all system actions</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="tms-input"
          style={{ maxWidth: 260 }}
          placeholder="Search actor, action, entity…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <select
          className="tms-select"
          style={{ maxWidth: 160 }}
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
        >
          <option value="">All actions</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          className="tms-select"
          style={{ maxWidth: 200 }}
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(0); }}
        >
          <option value="">All entities</option>
          {uniqueEntities.map((e) => (
            <option key={e} value={e}>{e.replace(/_/g, " ")}</option>
          ))}
        </select>
        <span className="text-xs font-mono text-gray-400 ml-auto">
          {filtered.length} entries
        </span>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-row">Loading audit logs…</div>
        ) : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Actor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const actionKey = r.action.split("_")[0];
                const isOpen = expanded === r.id;
                return (
                  <>
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setExpanded(isOpen ? null : r.id)}>
                      <td className="font-mono text-xs text-gray-400 whitespace-nowrap">
                        {fmtDateTime(r.created_at)}
                      </td>
                      <td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-mono font-semibold ${ACTION_BG[actionKey] || "bg-gray-50 border-gray-200"} ${ACTION_COLOR[actionKey] || "text-gray-600"}`}>
                          {r.action}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base leading-none">{ENTITY_ICON[r.entity_type] || "📄"}</span>
                          <div>
                            <span className="text-xs font-medium text-gray-700 capitalize">{r.entity_type?.replace(/_/g, " ")}</span>
                            <span className="ml-2 font-mono text-xs text-gray-400" title={r.entity_id}>
                              #{r.entity_id?.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="text-xs text-gray-600 font-medium">
                          {profiles[r.actor_user_id] || (
                            <span className="font-mono text-gray-400">{r.actor_user_id?.slice(0, 8)}…</span>
                          )}
                        </span>
                      </td>
                      <td>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.id}-exp`}>
                        <td colSpan={5} className="px-4 pb-3 bg-gray-50">
                          <pre className="bg-white border border-gray-200 rounded-xl p-3 text-xs font-mono text-gray-600 whitespace-pre-wrap overflow-x-auto">
                            {JSON.stringify(r.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">No audit logs found</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <button
            className="btn btn-ghost btn-sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}