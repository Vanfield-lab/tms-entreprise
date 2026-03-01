// src/modules/maintenance/pages/MaintenanceHistory.tsx
// Shows maintenance history per vehicle with drill-in details
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate, fmtDateTime } from "@/lib/utils";

type Vehicle = { id: string; plate_number: string; make?: string; model?: string };
type Request = {
  id: string;
  vehicle_id: string;
  issue_type: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
  closed_at?: string;
  notes?: string;
};

const STATUS_STYLES: Record<string, string> = {
  reported: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  in_progress: "bg-violet-100 text-violet-700",
  completed: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-200 text-gray-600",
  rejected: "bg-red-100 text-red-700",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-green-50 text-green-600 border-green-200",
  medium: "bg-amber-50 text-amber-600 border-amber-200",
  high: "bg-orange-50 text-orange-600 border-orange-200",
  critical: "bg-red-50 text-red-600 border-red-200",
};

export default function MaintenanceHistory() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: r }] = await Promise.all([
        supabase.from("vehicles").select("id,plate_number,make,model").order("plate_number"),
        supabase
          .from("maintenance_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(400),
      ]);
      setVehicles((v as Vehicle[]) || []);
      setRequests((r as Request[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = requests.filter((r) => {
    const matchVehicle = selectedVehicle === "all" || r.vehicle_id === selectedVehicle;
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchSearch = !search || [r.issue_type, r.description, r.status].join(" ").toLowerCase().includes(search.toLowerCase());
    return matchVehicle && matchStatus && matchSearch;
  });

  const vehicleMap: Record<string, Vehicle> = {};
  vehicles.forEach((v) => { vehicleMap[v.id] = v; });

  // Stats for selected vehicle
  const vehicleRequests = selectedVehicle === "all" ? requests : requests.filter((r) => r.vehicle_id === selectedVehicle);
  const stats = {
    total: vehicleRequests.length,
    open: vehicleRequests.filter((r) => !["closed", "rejected"].includes(r.status)).length,
    closed: vehicleRequests.filter((r) => r.status === "closed").length,
    critical: vehicleRequests.filter((r) => r.priority === "critical").length,
  };

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Maintenance History</h1>
        <p className="page-sub">Full maintenance record per vehicle</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-gray-900" },
          { label: "Open", value: stats.open, color: "text-amber-600" },
          { label: "Closed", value: stats.closed, color: "text-emerald-600" },
          { label: "Critical", value: stats.critical, color: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-200 px-4 py-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="tms-select"
          style={{ maxWidth: 220 }}
          value={selectedVehicle}
          onChange={(e) => setSelectedVehicle(e.target.value)}
        >
          <option value="all">All Vehicles</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate_number}{v.make ? ` — ${v.make} ${v.model || ""}`.trim() : ""}
            </option>
          ))}
        </select>
        <select
          className="tms-select"
          style={{ maxWidth: 160 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          {["reported", "approved", "in_progress", "completed", "closed", "rejected"].map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
        <input
          className="tms-input"
          style={{ maxWidth: 200 }}
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-gray-400 font-mono ml-auto">{filtered.length} records</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-3xl mb-2">🔧</div>
          <p className="text-sm">No maintenance records found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const vehicle = vehicleMap[r.vehicle_id];
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div
                  className="px-4 py-3 flex items-start justify-between gap-2 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{r.issue_type || "Issue"}</span>
                      {vehicle && (
                        <span className="font-mono text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
                          {vehicle.plate_number}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{r.description}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-medium capitalize ${PRIORITY_STYLES[r.priority] ?? "bg-gray-50 border-gray-200 text-gray-500"}`}>
                      {r.priority}
                    </span>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {r.status.replace("_", " ")}
                    </span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                </div>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/50 space-y-2 pt-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-400 block">Reported</span>
                        <span className="font-medium text-gray-700">{fmtDateTime(r.created_at)}</span>
                      </div>
                      {r.closed_at && (
                        <div>
                          <span className="text-gray-400 block">Closed</span>
                          <span className="font-medium text-gray-700">{fmtDateTime(r.closed_at)}</span>
                        </div>
                      )}
                    </div>
                    {r.description && (
                      <div className="text-xs">
                        <span className="text-gray-400 block mb-1">Full Description</span>
                        <p className="text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 leading-relaxed">{r.description}</p>
                      </div>
                    )}
                    {r.notes && (
                      <div className="text-xs">
                        <span className="text-gray-400 block mb-1">Resolution Notes</span>
                        <p className="text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 leading-relaxed">{r.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}