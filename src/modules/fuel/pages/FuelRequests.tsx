// src/modules/fuel/pages/FuelRequests.tsx
import { useEffect, useState } from "react";
import { listMyFuelRequests } from "../services/fuel.service";
import { fmtDateTime } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

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

export default function FuelRequests() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const data = await listMyFuelRequests();
    setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    load();

    // Real-time subscription
    const channel = supabase
      .channel("fuel_requests_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "fuel_requests" }, () => {
        load();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">My Fuel Requests</h2>
          <p className="text-xs text-gray-400 mt-0.5">Track your submitted requests</p>
        </div>
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">
          {rows.length}
        </span>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {r.purpose || <span className="text-gray-400 italic">No purpose specified</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{fmtDateTime(r.created_at)}</p>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                  <span>{STATUS_ICON[r.status] ?? "•"}</span>
                  {r.status}
                </span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
                <StatCell label="Fuel" value={r.fuel_type ? r.fuel_type.charAt(0).toUpperCase() + r.fuel_type.slice(1) : "—"} />
                <StatCell label="Liters" value={r.liters != null ? `${r.liters}L` : "—"} />
                <StatCell
                  label="Est. Cost"
                  value={r.estimated_cost ? `GHS ${Number(r.estimated_cost).toLocaleString()}` : "—"}
                />
              </div>
              {r.actual_cost && (
                <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <span className="text-xs text-blue-700">
                    Actual cost recorded: <strong>GHS {Number(r.actual_cost).toLocaleString()}</strong>
                  </span>
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

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-3xl mb-2">⛽</div>
      <p className="text-sm font-medium text-gray-500">No fuel requests yet</p>
      <p className="text-xs mt-1">Submit a request using the form above</p>
    </div>
  );
}