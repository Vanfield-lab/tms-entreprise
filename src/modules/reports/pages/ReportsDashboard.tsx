// src/modules/reports/pages/ReportsDashboard.tsx
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PageSpinner, Card, CardHeader, CardBody, StatCard, Btn, Badge } from "@/components/TmsUI";
import { fmtMoney } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────
type Period = "week" | "month" | "quarter" | "year";
type KPI = {
  total_bookings: number; approved_bookings: number; rejected_bookings: number;
  completed_bookings: number; total_fuel_requests: number; total_fuel_amount: number;
  total_fuel_liters: number; total_maintenance: number; active_vehicles: number;
  active_drivers: number;
};
type BookingRow   = { status: string; booking_type: string; trip_date: string; purpose: string; created_at: string };
type FuelRow      = { status: string; amount: number | null; liters: number | null; vendor: string | null; request_date: string; vehicles: { plate_number: string; fuel_type: string | null } | null };
type MaintRow     = { status: string; issue_type: string | null; created_at: string; vehicles: { plate_number: string } | null };
type VehicleUtil  = { plate_number: string; trip_count: number; total_km: number | null };

// ── Period helpers ───────────────────────────────────────────────────────────
function getPeriodRange(period: Period): { from: string; to: string; label: string } {
  const now = new Date();
  let from = new Date(), to = new Date();

  if (period === "week") {
    const dow = now.getDay();
    from = new Date(now); from.setDate(now.getDate() - dow); from.setHours(0,0,0,0);
    to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23,59,59,999);
  } else if (period === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    from = new Date(now.getFullYear(), q * 3, 1);
    to   = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
  } else {
    from = new Date(now.getFullYear(), 0, 1);
    to   = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
  }

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const labels: Record<Period, string> = {
    week:    `Week of ${monthNames[from.getMonth()]} ${from.getDate()}`,
    month:   `${monthNames[from.getMonth()]} ${from.getFullYear()}`,
    quarter: `Q${Math.floor(from.getMonth()/3)+1} ${from.getFullYear()}`,
    year:    `${from.getFullYear()}`,
  };
  return { from: fmt(from), to: fmt(to), label: labels[period] };
}

// ── Excel export (pure CSV approach, works universally) ─────────────────────
function exportToCSV(period: Period, kpi: KPI, bookings: BookingRow[], fuel: FuelRow[], maint: MaintRow[]) {
  const { label } = getPeriodRange(period);
  const rows: string[][] = [];
  rows.push([`TMS Report — ${label}`, "", "", ""]);
  rows.push([]);
  rows.push(["SUMMARY", ""]);
  rows.push(["Total Bookings",     String(kpi.total_bookings)]);
  rows.push(["Completed Trips",    String(kpi.completed_bookings)]);
  rows.push(["Approved Bookings",  String(kpi.approved_bookings)]);
  rows.push(["Rejected Bookings",  String(kpi.rejected_bookings)]);
  rows.push(["Fuel Requests",      String(kpi.total_fuel_requests)]);
  rows.push(["Fuel Amount (GHS)",  String(kpi.total_fuel_amount ?? 0)]);
  rows.push(["Fuel Liters",        String(kpi.total_fuel_liters ?? 0)]);
  rows.push(["Maintenance Issues", String(kpi.total_maintenance)]);
  rows.push([]);
  rows.push(["BOOKINGS", "Purpose", "Type", "Status", "Date"]);
  for (const b of bookings) {
    rows.push(["", b.purpose ?? "—", b.booking_type ?? "—", b.status, b.trip_date]);
  }
  rows.push([]);
  rows.push(["FUEL REQUESTS", "Vehicle", "Fuel Type", "Liters", "Amount", "Vendor", "Date"]);
  for (const f of fuel) {
    rows.push([
      "", f.vehicles?.plate_number ?? "—", f.vehicles?.fuel_type ?? "—",
      String(f.liters ?? "—"), String(f.amount ?? "—"), f.vendor ?? "—", f.request_date,
    ]);
  }
  rows.push([]);
  rows.push(["MAINTENANCE", "Vehicle", "Issue Type", "Status", "Date"]);
  for (const m of maint) {
    rows.push(["", m.vehicles?.plate_number ?? "—", m.issue_type ?? "—", m.status, m.created_at.slice(0,10)]);
  }

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `TMS_Report_${label.replace(/\s+/g,"_")}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── Simple bar component ─────────────────────────────────────────────────────
function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
        <span>{label}</span><span className="font-semibold" style={{ color: "var(--text)" }}>{value}</span>
      </div>
      <div className="w-full h-2 rounded-full" style={{ background: "var(--surface-2)" }}>
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Donut component ──────────────────────────────────────────────────────────
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-xs text-center py-4" style={{ color: "var(--text-dim)" }}>No data</div>;
  let offset = 0;
  const radius = 40; const circ = 2 * Math.PI * radius;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0">
        {data.filter(d => d.value > 0).map((d, i) => {
          const pct = d.value / total;
          const dash = pct * circ;
          const seg = (
            <circle key={i} cx="50" cy="50" r={radius} fill="none" stroke={d.color} strokeWidth="18"
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
              transform="rotate(-90 50 50)" />
          );
          offset += dash;
          return seg;
        })}
        <text x="50" y="54" textAnchor="middle" fontSize="14" fontWeight="bold" fill="var(--text)">{total}</text>
      </svg>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{d.label}</span>
            <span className="text-xs font-semibold ml-auto pl-4" style={{ color: "var(--text)" }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ReportsDashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [fuel, setFuel] = useState<FuelRow[]>([]);
  const [maint, setMaint] = useState<MaintRow[]>([]);
  const [utilization, setUtilization] = useState<VehicleUtil[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getPeriodRange(period);

    const [{ data: b }, { data: f }, { data: m }, { data: v }] = await Promise.all([
      supabase.from("bookings").select("status,booking_type,trip_date,purpose,created_at")
        .gte("created_at", from).lte("created_at", to + "T23:59:59").limit(1000),
      supabase.from("fuel_requests").select("status,amount,liters,vendor,request_date,vehicles(plate_number,fuel_type)")
        .gte("created_at", from).lte("created_at", to + "T23:59:59").limit(1000),
      supabase.from("maintenance_requests").select("status,issue_type,created_at,vehicles(plate_number)")
        .gte("created_at", from).lte("created_at", to + "T23:59:59").limit(1000),
      supabase.from("v_vehicle_utilization_30d").select("*").limit(50),
    ]);

    const bRows = (b as BookingRow[]) || [];
    const fRows = (f as unknown as FuelRow[]) || [];
    const mRows = (m as unknown as MaintRow[]) || [];
    const vRows = (v as unknown as VehicleUtil[]) || [];

    setBookings(bRows); setFuel(fRows); setMaint(mRows); setUtilization(vRows);

    setKpi({
      total_bookings:     bRows.length,
      approved_bookings:  bRows.filter(r => ["approved","dispatched","in_progress","completed","closed"].includes(r.status)).length,
      rejected_bookings:  bRows.filter(r => r.status === "rejected").length,
      completed_bookings: bRows.filter(r => ["completed","closed"].includes(r.status)).length,
      total_fuel_requests: fRows.length,
      total_fuel_amount:   fRows.reduce((s, r) => s + (r.amount ?? 0), 0),
      total_fuel_liters:   fRows.reduce((s, r) => s + (r.liters ?? 0), 0),
      total_maintenance:   mRows.length,
      active_vehicles:     vRows.length,
      active_drivers:      0,
    });

    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const { label } = getPeriodRange(period);

  // Booking status distribution
  const bookingStatusData = [
    { label: "Completed", value: kpi?.completed_bookings ?? 0, color: "var(--green)" },
    { label: "Approved",  value: bookings.filter(b => b.status === "approved").length, color: "var(--accent)" },
    { label: "Rejected",  value: kpi?.rejected_bookings ?? 0, color: "var(--red)" },
    { label: "Pending",   value: bookings.filter(b => ["draft","submitted"].includes(b.status)).length, color: "var(--amber)" },
  ];

  // Booking type breakdown
  const typeCount: Record<string, number> = {};
  for (const b of bookings) typeCount[b.booking_type] = (typeCount[b.booking_type] ?? 0) + 1;
  const maxType = Math.max(...Object.values(typeCount), 1);

  // Maintenance by status
  const maintStatusData = [
    { label: "Reported",    value: maint.filter(m => m.status === "reported").length,    color: "var(--amber)" },
    { label: "In Progress", value: maint.filter(m => m.status === "in_progress").length, color: "var(--accent)" },
    { label: "Completed",   value: maint.filter(m => ["completed","closed"].includes(m.status)).length, color: "var(--green)" },
  ];

  const periods: { value: Period; label: string }[] = [
    { value: "week",    label: "This Week"    },
    { value: "month",   label: "This Month"   },
    { value: "quarter", label: "This Quarter" },
    { value: "year",    label: "This Year"    },
  ];

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-5">
      {/* Header with period selector + export */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            {periods.map(p => (
              <button key={p.value} onClick={() => setPeriod(p.value)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: period === p.value ? "var(--accent)" : "var(--surface)",
                  color: period === p.value ? "#fff" : "var(--text-muted)",
                }}>
                {p.label}
              </button>
            ))}
          </div>
          <Btn variant="ghost" size="sm"
            onClick={() => kpi && exportToCSV(period, kpi, bookings, fuel, maint)}>
            ⬇ Export
          </Btn>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Bookings"  value={kpi?.total_bookings ?? 0}    accent="accent" />
        <StatCard label="Completed Trips" value={kpi?.completed_bookings ?? 0} accent="green" />
        <StatCard label="Fuel Requests"   value={kpi?.total_fuel_requests ?? 0} accent="amber" />
        <StatCard label="Maintenance"     value={kpi?.total_maintenance ?? 0}  accent="red" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Fuel Spend" value={fmtMoney(kpi?.total_fuel_amount ?? 0)} accent="accent" />
        <StatCard label="Liters Dispensed" value={`${(kpi?.total_fuel_liters ?? 0).toLocaleString()} L`} />
        <StatCard label="Rejected Bookings" value={kpi?.rejected_bookings ?? 0} accent="red" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Booking Status" />
          <CardBody>
            <DonutChart data={bookingStatusData} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Maintenance Status" />
          <CardBody>
            <DonutChart data={maintStatusData} />
          </CardBody>
        </Card>
      </div>

      {/* Booking type breakdown */}
      {Object.keys(typeCount).length > 0 && (
        <Card>
          <CardHeader title="Bookings by Type" />
          <CardBody className="space-y-3">
            {Object.entries(typeCount).sort((a,b) => b[1]-a[1]).map(([type, count]) => (
              <Bar key={type} label={type.charAt(0).toUpperCase() + type.slice(1)} value={count} max={maxType} color="var(--accent)" />
            ))}
          </CardBody>
        </Card>
      )}

      {/* Fuel summary */}
      {fuel.length > 0 && (
        <Card>
          <CardHeader title="Fuel Summary" />
          <CardBody>
            {/* By vehicle */}
            {(() => {
              const byVehicle: Record<string, { liters: number; amount: number }> = {};
              for (const f of fuel) {
                const plate = f.vehicles?.plate_number ?? "Unknown";
                if (!byVehicle[plate]) byVehicle[plate] = { liters: 0, amount: 0 };
                byVehicle[plate].liters += f.liters ?? 0;
                byVehicle[plate].amount += f.amount ?? 0;
              }
              const maxL = Math.max(...Object.values(byVehicle).map(v => v.liters), 1);
              return (
                <div className="space-y-3">
                  {Object.entries(byVehicle).sort((a,b) => b[1].amount - a[1].amount).map(([plate, v]) => (
                    <div key={plate}>
                      <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                        <span>{plate}</span>
                        <span className="font-semibold" style={{ color: "var(--text)" }}>{v.liters.toFixed(1)}L · {fmtMoney(v.amount)}</span>
                      </div>
                      <div className="w-full h-2 rounded-full" style={{ background: "var(--surface-2)" }}>
                        <div className="h-2 rounded-full" style={{ width: `${Math.round(v.liters/maxL*100)}%`, background: "var(--amber)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardBody>
        </Card>
      )}

      {/* Vehicle utilization */}
      {utilization.length > 0 && (
        <Card>
          <CardHeader title="Vehicle Utilization (30 days)" />
          <CardBody>
            <div className="overflow-x-auto">
              <table className="tms-table">
                <thead>
                  <tr><th>Vehicle</th><th>Trips</th><th>Total KM</th></tr>
                </thead>
                <tbody>
                  {utilization.sort((a,b) => b.trip_count - a.trip_count).map(v => (
                    <tr key={v.plate_number}>
                      <td className="font-medium">{v.plate_number}</td>
                      <td>{v.trip_count}</td>
                      <td>{v.total_km != null ? `${v.total_km.toLocaleString()} km` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Maintenance detail */}
      {maint.length > 0 && (
        <Card>
          <CardHeader title="Maintenance Issues" />
          <CardBody>
            <div className="sm:hidden space-y-2">
              {maint.slice(0,20).map((m,i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-2 border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{m.vehicles?.plate_number ?? "—"}</p>
                    <p className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>{m.issue_type ?? "—"}</p>
                  </div>
                  <Badge status={m.status} />
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="tms-table">
                <thead><tr><th>Vehicle</th><th>Issue</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {maint.slice(0,50).map((m,i) => (
                    <tr key={i}>
                      <td>{m.vehicles?.plate_number ?? "—"}</td>
                      <td className="capitalize">{m.issue_type ?? "—"}</td>
                      <td><Badge status={m.status} /></td>
                      <td className="text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{m.created_at.slice(0,10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}