// src/modules/trips/pages/DriverTrips.tsx
// Driver's active + completed trips — start trip, log odometer, complete, report issues
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { fmtDate, fmtDateTime } from "@/lib/utils";

type Trip = {
  id: string;
  purpose: string;
  trip_date: string;
  trip_time: string | null;
  pickup_location: string;
  dropoff_location: string;
  status: string;
  passengers: number | null;
  notes: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  plate_number?: string;
  make?: string;
  model?: string;
  // Trip log fields
  started_at?: string | null;
  completed_at?: string | null;
  odometer_start?: number | null;
  odometer_end?: number | null;
  trip_notes?: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  dispatched:  "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed:   "bg-emerald-100 text-emerald-700",
  closed:      "bg-gray-100 text-gray-500",
  cancelled:   "bg-red-100 text-red-600",
};

const STATUS_LABEL: Record<string, string> = {
  dispatched:  "Dispatched",
  in_progress: "In Progress",
  completed:   "Completed",
  closed:      "Closed",
  cancelled:   "Cancelled",
};

export default function DriverTrips() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [acting, setActing] = useState<string | null>(null);

  // Start-trip modal
  const [startModal, setStartModal] = useState<Trip | null>(null);
  const [odoStart, setOdoStart] = useState("");
  const [startNote, setStartNote] = useState("");

  // Complete-trip modal
  const [completeModal, setCompleteModal] = useState<Trip | null>(null);
  const [odoEnd, setOdoEnd] = useState("");
  const [completeNote, setCompleteNote] = useState("");
  const [reportIssue, setReportIssue] = useState(false);
  const [issueDesc, setIssueDesc] = useState("");

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);

    // Get driver record
    const { data: dr } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!dr) { setLoading(false); return; }
    setDriverId(dr.id);

    // Load trips assigned to this driver
    const { data } = await supabase
      .from("bookings")
      .select(`
        id, purpose, trip_date, trip_time, pickup_location, dropoff_location,
        status, passengers, notes, vehicle_id, driver_id,
        started_at, completed_at, odometer_start, odometer_end, trip_notes,
        vehicles(plate_number, make, model)
      `)
      .eq("driver_id", dr.id)
      .order("trip_date", { ascending: false });

    const enriched: Trip[] = ((data as any[]) || []).map((t) => ({
      ...t,
      plate_number: t.vehicles?.plate_number,
      make: t.vehicles?.make,
      model: t.vehicles?.model,
    }));

    setTrips(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  // Real-time updates
  useEffect(() => {
    if (!driverId) return;
    const ch = supabase
      .channel(`driver-trips-${driverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [driverId]);

  const startTrip = async () => {
    if (!startModal) return;
    setActing(startModal.id);
    try {
      await supabase.rpc("update_trip_status", {
        p_booking_id: startModal.id,
        p_new_status: "in_progress",
      });
      // Log odometer start
      if (odoStart) {
        await supabase.from("bookings").update({
          odometer_start: parseInt(odoStart),
          started_at: new Date().toISOString(),
          trip_notes: startNote || null,
        }).eq("id", startModal.id);
      }
      setStartModal(null); setOdoStart(""); setStartNote("");
      await load();
    } finally {
      setActing(null);
    }
  };

  const completeTrip = async () => {
    if (!completeModal) return;
    setActing(completeModal.id);
    try {
      await supabase.from("bookings").update({
        odometer_end: odoEnd ? parseInt(odoEnd) : null,
        completed_at: new Date().toISOString(),
        trip_notes: completeNote || null,
      }).eq("id", completeModal.id);

      await supabase.rpc("update_trip_status", {
        p_booking_id: completeModal.id,
        p_new_status: "completed",
      });

      // Report vehicle issue if flagged
      if (reportIssue && issueDesc.trim()) {
        await supabase.from("maintenance_requests").insert({
          vehicle_id: completeModal.vehicle_id,
          reported_by: user!.id,
          issue_type: "post_trip",
          description: issueDesc.trim(),
          priority: "medium",
          status: "submitted",
        });
      }

      setCompleteModal(null); setOdoEnd(""); setCompleteNote("");
      setReportIssue(false); setIssueDesc("");
      await load();
    } finally {
      setActing(null);
    }
  };

  const activeTrips  = trips.filter((t) => ["dispatched", "in_progress"].includes(t.status));
  const historyTrips = trips.filter((t) => ["completed", "closed", "cancelled"].includes(t.status));
  const displayed    = tab === "active" ? activeTrips : historyTrips;

  if (loading) return <LoadingSpinner />;

  if (!driverId) {
    return (
      <div className="text-center py-16 space-y-2">
        <div className="text-4xl">🚗</div>
        <p className="font-medium text-gray-700">No driver profile linked</p>
        <p className="text-sm text-gray-400">Contact your transport supervisor to link your account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">My Trips</h1>
        <p className="page-sub">Manage your assigned trips</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Active" value={activeTrips.length} color="text-amber-600" />
        <MiniStat label="Completed" value={historyTrips.filter((t) => t.status === "completed").length} color="text-emerald-600" />
        <MiniStat label="Total" value={trips.length} color="text-gray-800" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(["active", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "active" ? "Active Trips" : "History"}
            {t === "active" && activeTrips.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeTrips.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Trip cards */}
      {displayed.length === 0 ? (
        <div className="text-center py-14">
          <div className="text-3xl mb-2">{tab === "active" ? "🟡" : "📂"}</div>
          <p className="text-sm text-gray-500 font-medium">
            {tab === "active" ? "No active trips" : "No trip history yet"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {tab === "active" ? "You'll see dispatched trips here." : "Completed trips will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((t) => {
            const isActive = acting === t.id;
            const kmDriven = t.odometer_start && t.odometer_end
              ? t.odometer_end - t.odometer_start
              : null;

            return (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">{t.purpose}</p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">
                      {fmtDate(t.trip_date)}{t.trip_time ? ` · ${t.trip_time}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[t.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </div>

                {/* Route */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="flex items-stretch gap-3">
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <div className="w-2 h-2 rounded-full border-2 border-gray-300 bg-white" />
                      <div className="w-0.5 flex-1 bg-gray-200 min-h-[16px]" />
                      <div className="w-2 h-2 rounded-full bg-black" />
                    </div>
                    <div className="flex flex-col gap-2 justify-between">
                      <p className="text-xs text-gray-500">{t.pickup_location}</p>
                      <p className="text-xs font-medium text-gray-900">{t.dropoff_location}</p>
                    </div>
                  </div>
                </div>

                {/* Vehicle + odometer */}
                <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap gap-3 text-xs">
                  {t.plate_number && (
                    <span className="flex items-center gap-1 text-gray-600">
                      <span className="text-gray-400">🚘</span>
                      {t.plate_number} {t.make && t.model ? `· ${t.make} ${t.model}` : ""}
                    </span>
                  )}
                  {t.odometer_start && (
                    <span className="flex items-center gap-1 text-gray-600 font-mono">
                      <span className="text-gray-400">🏁</span>
                      Start: {t.odometer_start.toLocaleString()} km
                    </span>
                  )}
                  {t.odometer_end && (
                    <span className="flex items-center gap-1 text-gray-600 font-mono">
                      <span className="text-gray-400">🏁</span>
                      End: {t.odometer_end.toLocaleString()} km
                      {kmDriven !== null && ` (${kmDriven.toLocaleString()} km driven)`}
                    </span>
                  )}
                  {t.passengers && (
                    <span className="flex items-center gap-1 text-gray-600">
                      <span className="text-gray-400">👥</span>
                      {t.passengers} passenger{t.passengers !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="px-4 py-3 flex gap-2">
                  {t.status === "dispatched" && (
                    <button
                      onClick={() => { setStartModal(t); setOdoStart(""); setStartNote(""); }}
                      disabled={isActive}
                      className="flex-1 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-40"
                    >
                      {isActive ? "Starting…" : "▶ Start Trip"}
                    </button>
                  )}
                  {t.status === "in_progress" && (
                    <button
                      onClick={() => { setCompleteModal(t); setOdoEnd(""); setCompleteNote(""); setReportIssue(false); setIssueDesc(""); }}
                      disabled={isActive}
                      className="flex-1 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40"
                    >
                      {isActive ? "Completing…" : "✓ Complete Trip"}
                    </button>
                  )}
                  {["completed", "closed"].includes(t.status) && t.started_at && (
                    <p className="text-xs text-gray-400 font-mono">
                      Completed {fmtDateTime(t.completed_at ?? t.started_at)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Start Trip Modal ── */}
      {startModal && (
        <Modal title="Start Trip" subtitle={startModal.purpose} onClose={() => setStartModal(null)}>
          <p className="text-xs text-gray-500 mb-3">
            You're about to start this trip. Record the vehicle's starting odometer reading.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Odometer Reading (km) *</label>
              <input
                type="number"
                className={inputCls}
                placeholder="e.g. 45320"
                value={odoStart}
                onChange={(e) => setOdoStart(e.target.value)}
                min="0"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Pre-departure Notes (optional)</label>
              <textarea
                className={inputCls + " resize-none"}
                rows={2}
                placeholder="Any observations before departure…"
                value={startNote}
                onChange={(e) => setStartNote(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button onClick={() => setStartModal(null)} className="py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={startTrip}
                disabled={!odoStart || acting !== null}
                className="py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-40"
              >
                {acting ? "Starting…" : "Start Trip ▶"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Complete Trip Modal ── */}
      {completeModal && (
        <Modal title="Complete Trip" subtitle={completeModal.purpose} onClose={() => setCompleteModal(null)}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">End Odometer Reading (km)</label>
              <input
                type="number"
                className={inputCls}
                placeholder={completeModal.odometer_start ? `Started at ${completeModal.odometer_start}` : "e.g. 45450"}
                value={odoEnd}
                onChange={(e) => setOdoEnd(e.target.value)}
                min="0"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Trip Notes (optional)</label>
              <textarea
                className={inputCls + " resize-none"}
                rows={2}
                placeholder="Any notes about the trip…"
                value={completeNote}
                onChange={(e) => setCompleteNote(e.target.value)}
              />
            </div>

            {/* Report vehicle issue */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setReportIssue((r) => !r)}
                className="w-full px-4 py-3 flex items-center justify-between text-sm hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2 font-medium text-gray-700">
                  <span>🔧</span> Report a vehicle issue?
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${reportIssue ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              {reportIssue && (
                <div className="px-4 pb-3 border-t border-gray-100">
                  <textarea
                    className={inputCls + " resize-none mt-3"}
                    rows={2}
                    placeholder="Describe the issue (e.g. noise from engine, worn tyre)…"
                    value={issueDesc}
                    onChange={(e) => setIssueDesc(e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1.5">This will create a maintenance report automatically.</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button onClick={() => setCompleteModal(null)} className="py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={completeTrip}
                disabled={acting !== null}
                className="py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40"
              >
                {acting ? "Saving…" : "Complete ✓"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Shared components ──────────────────────────────────────────

function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

function LoadingSpinner() {
  return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" /></div>;
}

const inputCls = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-transparent transition-all";