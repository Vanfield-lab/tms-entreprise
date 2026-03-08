// src/modules/fleet/pages/MileageLog.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageSpinner, EmptyState, Card, SearchInput, Badge } from "@/components/TmsUI";
import { fmtDate } from "@/lib/utils";

type Vehicle = {
  id: string; plate_number: string; make: string | null; model: string | null;
  current_mileage: number | null; last_service_mileage: number | null;
  next_service_mileage: number | null; initial_mileage: number | null;
  fuel_type: string | null;
};

type LogEntry = {
  id: string; vehicle_id: string; mileage_at_fueling: number; source: string;
  notes: string | null; recorded_at: string;
  profiles: { full_name: string } | null;
  fuel_requests: { purpose: string | null; vendor: string | null } | null;
};

export default function MileageLog() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: l }] = await Promise.all([
        supabase.from("vehicles").select("id,plate_number,make,model,current_mileage,last_service_mileage,next_service_mileage,initial_mileage,fuel_type").order("plate_number"),
        supabase.from("fuel_mileage_log")
          .select("id,vehicle_id,mileage_at_fueling,source,notes,recorded_at,profiles!recorded_by(full_name),fuel_requests(purpose,vendor)")
          .order("recorded_at", { ascending: false })
          .limit(500),
      ]);
      setVehicles((v as Vehicle[]) || []);
      setLogs((l as unknown as LogEntry[]) || []);
      setLoading(false);
    })();
  }, []);

  const filteredLogs = logs.filter(l => {
    const vMatch = selectedVehicle === "all" || l.vehicle_id === selectedVehicle;
    const qMatch = !q || (vehicles.find(v => v.id === l.vehicle_id)?.plate_number ?? "").toLowerCase().includes(q.toLowerCase());
    return vMatch && qMatch;
  });

  const getServiceStatus = (v: Vehicle) => {
    const cur = v.current_mileage ?? 0;
    const next = v.next_service_mileage ?? 5000;
    const diff = next - cur;
    if (diff <= 0) return { label: "Overdue", color: "var(--red)", bg: "var(--red-dim)" };
    if (diff <= 500) return { label: `Due in ${diff.toLocaleString()} km`, color: "var(--amber)", bg: "var(--amber-dim)" };
    return { label: `${diff.toLocaleString()} km to service`, color: "var(--green)", bg: "var(--green-dim)" };
  };

  const sourceLabel: Record<string, string> = { fuel_record: "⛽ Fuel Record", initial: "🚗 Initial", manual: "✏️ Manual" };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Mileage Log</h1>
      </div>

      {/* Vehicle summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {vehicles.map(v => {
          const svc = getServiceStatus(v);
          const pct = v.next_service_mileage
            ? Math.min(100, ((v.current_mileage ?? 0) - (v.last_service_mileage ?? 0)) / 5000 * 100)
            : 0;
          return (
            <Card key={v.id} className={selectedVehicle === v.id ? "ring-2 ring-[color:var(--accent)]" : ""}>
              <button className="w-full text-left p-4" onClick={() => setSelectedVehicle(selectedVehicle === v.id ? "all" : v.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{v.plate_number}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{[v.make, v.model].filter(Boolean).join(" ") || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono font-semibold" style={{ color: "var(--text)" }}>
                      {(v.current_mileage ?? 0).toLocaleString()} km
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-dim)" }}>current</p>
                  </div>
                </div>
                {/* Service progress bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-dim)" }}>
                    <span>Service interval (5,000 km)</span>
                    <span style={{ color: svc.color, fontWeight: 600 }}>{svc.label}</span>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ background: "var(--surface-2)" }}>
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: svc.color }} />
                  </div>
                  <div className="flex justify-between text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                    <span>Last: {(v.last_service_mileage ?? 0).toLocaleString()} km</span>
                    <span>Next: {(v.next_service_mileage ?? 5000).toLocaleString()} km</span>
                  </div>
                </div>
              </button>
            </Card>
          );
        })}
      </div>

      {/* Log entries */}
      <div className="flex flex-col sm:flex-row gap-2 items-center">
        <div className="sm:w-64">
          <SearchInput value={q} onChange={setQ} placeholder="Filter by plate…" />
        </div>
        <select className="tms-select sm:w-48"
          value={selectedVehicle}
          onChange={e => setSelectedVehicle(e.target.value)}>
          <option value="all">All vehicles</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
        </select>
        <p className="text-sm ml-auto" style={{ color: "var(--text-muted)" }}>{filteredLogs.length} entries</p>
      </div>

      {filteredLogs.length === 0 ? (
        <EmptyState title="No mileage entries" subtitle="Mileage is logged when fuel is recorded or vehicle is added" />
      ) : (
        <>
          {/* Mobile */}
          <div className="sm:hidden space-y-2">
            {filteredLogs.map(l => {
              const v = vehicles.find(v => v.id === l.vehicle_id);
              return (
                <Card key={l.id}>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{v?.plate_number ?? "—"}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{sourceLabel[l.source] ?? l.source} · {fmtDate(l.recorded_at)}</p>
                        {l.fuel_requests?.purpose && <p className="text-xs italic" style={{ color: "var(--text-dim)" }}>{l.fuel_requests.purpose}</p>}
                      </div>
                      <p className="font-mono font-bold text-base" style={{ color: "var(--accent)" }}>
                        {l.mileage_at_fueling.toLocaleString()} km
                      </p>
                    </div>
                    {(l.fuel_requests?.vendor || l.notes) && (
                      <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                        {l.fuel_requests?.vendor ?? l.notes}
                      </p>
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
                  <tr><th>Vehicle</th><th>Mileage (km)</th><th>Source</th><th>Purpose / Notes</th><th>Vendor</th><th>Recorded By</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {filteredLogs.map(l => {
                    const v = vehicles.find(v => v.id === l.vehicle_id);
                    return (
                      <tr key={l.id}>
                        <td className="font-medium">{v?.plate_number ?? "—"}</td>
                        <td className="font-mono font-semibold">{l.mileage_at_fueling.toLocaleString()}</td>
                        <td className="text-xs">{sourceLabel[l.source] ?? l.source}</td>
                        <td className="max-w-[160px] truncate text-xs" style={{ color: "var(--text-muted)" }}>
                          {l.fuel_requests?.purpose ?? l.notes ?? "—"}
                        </td>
                        <td className="text-xs">{l.fuel_requests?.vendor ?? "—"}</td>
                        <td className="text-xs">{l.profiles?.full_name ?? "—"}</td>
                        <td className="whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(l.recorded_at)}</td>
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