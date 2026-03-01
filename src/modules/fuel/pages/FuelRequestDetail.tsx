// src/modules/fuel/pages/FuelRequestDetail.tsx
// Usage: <FuelRequestDetail requestId={id} onBack={() => setSelected(null)} />
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/utils";

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
  vehicles?: { plate_number: string } | null;
  drivers?: { license_number: string; profiles?: { full_name: string } | null } | null;
};

type AuditEntry = {
  id: string;
  action: string;
  actor_user_id: string;
  metadata: any;
  created_at: string;
};

type Profile = { id: string; full_name: string };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  recorded: "bg-blue-100 text-blue-700",
};

const ACTION_ICON: Record<string, string> = {
  create: "✏️",
  submit: "📤",
  approve: "✅",
  reject: "❌",
  record: "⛽",
  update: "🔄",
};

export default function FuelRequestDetail({
  requestId,
  onBack,
}: {
  requestId: string;
  onBack: () => void;
}) {
  const [request, setRequest] = useState<FuelRequest | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: a }] = await Promise.all([
        supabase
          .from("fuel_requests")
          .select("*,vehicles(plate_number),drivers(license_number,profiles(full_name))")
          .eq("id", requestId)
          .single(),
        supabase
          .from("audit_logs")
          .select("id,action,actor_user_id,metadata,created_at")
          .eq("entity_type", "fuel_request")
          .eq("entity_id", requestId)
          .order("created_at", { ascending: true }),
      ]);

      setRequest(r as FuelRequest);
      const entries = (a as AuditEntry[]) || [];
      setAudit(entries);

      const uids = [...new Set(entries.map((e) => e.actor_user_id).filter(Boolean))];
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
    })();

    // Real-time
    const ch = supabase
      .channel(`fuel_detail_${requestId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "fuel_requests", filter: `id=eq.${requestId}` }, (payload) => {
        setRequest((prev) => prev ? { ...prev, ...(payload.new as Partial<FuelRequest>) } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [requestId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-sm">Request not found.</p>
        <button className="mt-4 text-xs underline text-gray-500" onClick={onBack}>← Back</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="mt-0.5 shrink-0 w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">
            {request.purpose || "Fuel Request"}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[request.status] ?? "bg-gray-100 text-gray-600"}`}>
              {request.status}
            </span>
            <span className="text-xs text-gray-400 capitalize">{request.fuel_type}</span>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-sm text-gray-900">Request Details</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-gray-100">
          <StatCell label="Fuel Type" value={request.fuel_type ? request.fuel_type.charAt(0).toUpperCase() + request.fuel_type.slice(1) : "—"} />
          <StatCell label="Liters" value={request.liters != null ? `${request.liters}L` : "—"} />
          <StatCell label="Est. Cost" value={request.estimated_cost ? `GHS ${Number(request.estimated_cost).toLocaleString()}` : "—"} />
          <StatCell
            label="Actual Cost"
            value={request.actual_cost ? `GHS ${Number(request.actual_cost).toLocaleString()}` : "—"}
            highlight={!!request.actual_cost}
          />
        </div>
        <div className="p-5 space-y-3 border-t border-gray-100">
          {request.vehicles && <Detail label="Vehicle" value={request.vehicles.plate_number} />}
          {request.drivers && (
            <Detail label="Driver" value={request.drivers.profiles?.full_name || request.drivers.license_number} />
          )}
          {request.notes && <Detail label="Notes" value={request.notes} />}
          <Detail label="Submitted" value={fmtDateTime(request.created_at)} />
        </div>
      </div>

      {/* Audit Trail */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-sm text-gray-900">Audit Trail</h3>
        </div>
        {audit.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">No audit history found.</div>
        ) : (
          <div className="relative">
            <div className="absolute left-[1.85rem] top-0 bottom-0 w-px bg-gray-100" />
            <div className="p-4 space-y-0">
              {audit.map((entry, i) => {
                const actionKey = entry.action.split("_")[0];
                const isLast = i === audit.length - 1;
                return (
                  <div key={entry.id} className="flex gap-3 relative">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-sm z-10">
                      {ACTION_ICON[actionKey] ?? "📝"}
                    </div>
                    <div className={`flex-1 min-w-0 ${!isLast ? "pb-4 border-b border-gray-50 mb-0" : "pb-0"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-sm font-medium text-gray-900 capitalize">
                            {entry.action.replace(/_/g, " ")}
                          </span>
                          {profiles[entry.actor_user_id] && (
                            <span className="ml-1.5 text-xs text-gray-400">by {profiles[entry.actor_user_id]}</span>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-gray-400 font-mono whitespace-nowrap">
                          {fmtDateTime(entry.created_at)}
                        </span>
                      </div>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <div className="mt-1 text-xs text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5 font-mono">
                          {Object.entries(entry.metadata)
                            .filter(([, v]) => v != null && v !== "")
                            .map(([k, v]) => (
                              <span key={k} className="inline-block mr-3">
                                <span className="text-gray-400">{k}:</span> {String(v)}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`px-4 py-3 text-center ${highlight ? "bg-blue-50" : ""}`}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${highlight ? "text-blue-700" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 text-xs font-medium text-gray-400 w-24 mt-0.5">{label}</span>
      <span className="text-sm text-gray-700 flex-1">{value}</span>
    </div>
  );
}