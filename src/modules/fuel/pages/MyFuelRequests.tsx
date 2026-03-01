// src/modules/fuel/pages/MyFuelRequests.tsx
// Driver-specific fuel requests view with detail drill-in
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/utils";
import FuelRequestDetail from "./FuelRequestDetail";

type FuelRequest = {
  id: string;
  status: string;
  fuel_type: string;
  liters: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  purpose: string;
  notes: string;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  recorded: "bg-blue-100 text-blue-700",
};

const STATUS_ICON: Record<string, string> = {
  draft: "✏️",
  submitted: "⏳",
  approved: "✅",
  rejected: "❌",
  recorded: "⛽",
};

export default function MyFuelRequests() {
  const [rows, setRows] = useState<FuelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    const { data: me } = await supabase.auth.getUser();
    if (!me.user) return;

    // Get driver record for this user
    const { data: driver } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", me.user.id)
      .single();

    let query = supabase
      .from("fuel_requests")
      .select("id,status,fuel_type,liters,estimated_cost,actual_cost,purpose,notes,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (driver) {
      query = query.eq("driver_id", driver.id);
    } else {
      // fallback: requests created by this profile (if non-driver submitted)
      query = query.eq("requested_by", me.user.id);
    }

    const { data } = await query;
    setRows((data as FuelRequest[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();

    const channel = supabase
      .channel("my_fuel_requests_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "fuel_requests" }, () => { load(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (selected) {
    return <FuelRequestDetail requestId={selected} onBack={() => setSelected(null)} />;
  }

  const filtered = rows.filter((r) => statusFilter === "all" || r.status === statusFilter);
  const pendingCount = rows.filter((r) => r.status === "submitted").length;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">My Fuel Requests</h1>
        <p className="page-sub">
          {rows.length} request{rows.length !== 1 ? "s" : ""}
          {pendingCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
              {pendingCount}
            </span>
          )}
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {["all", "submitted", "approved", "recorded", "rejected"].map((s) => {
          const count = s === "all" ? rows.length : rows.filter((r) => r.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                statusFilter === s
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s.replace("_", " ")} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-2">⛽</div>
          <p className="text-sm font-medium text-gray-500">
            {rows.length === 0 ? "No fuel requests yet" : "No requests match this filter"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all"
              onClick={() => setSelected(r.id)}
            >
              <div className="px-4 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {r.purpose || <span className="text-gray-400 italic">No purpose</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{fmtDateTime(r.created_at)}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_ICON[r.status]} {r.status}
                  </span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
                <StatCell label="Fuel" value={r.fuel_type ? r.fuel_type.charAt(0).toUpperCase() + r.fuel_type.slice(1) : "—"} />
                <StatCell label="Liters" value={r.liters != null ? `${r.liters}L` : "—"} />
                <StatCell
                  label={r.actual_cost ? "Actual Cost" : "Est. Cost"}
                  value={
                    (r.actual_cost ?? r.estimated_cost)
                      ? `GHS ${Number(r.actual_cost ?? r.estimated_cost).toLocaleString()}`
                      : "—"
                  }
                />
              </div>
              {r.status === "rejected" && r.notes && (
                <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">
                  ❌ Rejected: {r.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-sm font-semibold text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}