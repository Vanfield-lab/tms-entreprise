// src/modules/dispatch/pages/DispatchBoard.tsx
// Enhanced: uses v_driver_availability to show only on-duty drivers,
// warns if driver is already on an active trip, shows shift info
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/utils";

type Booking = {
  id: string;
  purpose: string;
  trip_date: string;
  trip_time: string | null;
  pickup_location: string;
  dropoff_location: string;
  status: string;
  passengers: number | null;
  requested_by: string | null;
  requester_name?: string;
};

type AvailableDriver = {
  driver_id: string;
  driver_name: string;
  license_number: string;
  phone: string | null;
  shift_code: string | null;
  shift_label: string | null;
  start_time: string | null;
  end_time: string | null;
  is_working: boolean;
  is_on_active_trip: boolean;
  is_overridden: boolean;
};

type Vehicle = {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  capacity: number | null;
  status: string;
};

const SHIFT_COLORS: Record<string, string> = {
  A: "bg-amber-100 text-amber-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-violet-100 text-violet-700",
  D: "bg-cyan-100 text-cyan-700",
};

const inputCls  = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10 transition-all";
const selectCls = inputCls;

export default function DispatchBoard() {
  const [bookings, setBookings]               = useState<Booking[]>([]);
  const [vehicles, setVehicles]               = useState<Vehicle[]>([]);
  const [allDrivers, setAllDrivers]           = useState<AvailableDriver[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Record<string, string>>({});
  const [selectedDriver, setSelectedDriver]   = useState<Record<string, string>>({});
  const [notes, setNotes]                     = useState<Record<string, string>>({});
  const [dispatching, setDispatching]         = useState<Record<string, boolean>>({});
  const [loading, setLoading]                 = useState(true);
  const [showAllDrivers, setShowAllDrivers]   = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: b }, { data: v }, { data: d }, { data: p }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id,purpose,trip_date,trip_time,pickup_location,dropoff_location,status,passengers,requested_by")
        .eq("status", "approved")
        .order("trip_date", { ascending: true }),
      supabase
        .from("vehicles")
        .select("id,plate_number,make,model,capacity,status")
        .eq("status", "active")
        .order("plate_number"),
      supabase.from("v_driver_availability").select("*").order("driver_name"),
      supabase.from("profiles").select("user_id,full_name"),
    ]);

    const profileMap: Record<string, string> = {};
    ((p as any[]) || []).forEach((pr: any) => { profileMap[pr.user_id] = pr.full_name; });

    const enrichedBookings: Booking[] = ((b as any[]) || []).map((bk) => ({
      ...bk,
      requester_name: bk.requested_by ? (profileMap[bk.requested_by] ?? "Unknown") : "—",
    }));

    setBookings(enrichedBookings);
    setVehicles((v as Vehicle[]) || []);
    setAllDrivers((d as AvailableDriver[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Real-time subscription
  useEffect(() => {
    const ch = supabase
      .channel("dispatch-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const dispatch = async (bookingId: string) => {
    const vehicleId = selectedVehicle[bookingId];
    const driverId  = selectedDriver[bookingId];
    if (!vehicleId || !driverId) return;

    setDispatching((m) => ({ ...m, [bookingId]: true }));
    try {
      await supabase.rpc("dispatch_booking", {
        p_booking_id: bookingId,
        p_vehicle_id: vehicleId,
        p_driver_id: driverId,
        p_notes: notes[bookingId] || null,
      });
      await load();
    } finally {
      setDispatching((m) => ({ ...m, [bookingId]: false }));
    }
  };

  // Drivers on duty (working shift, not off/rest)
  const onDutyDrivers    = allDrivers.filter((d) => d.is_working);
  const offDutyDrivers   = allDrivers.filter((d) => !d.is_working || !d.shift_code);
  const availableDrivers = onDutyDrivers.filter((d) => !d.is_on_active_trip);
  const busyDrivers      = onDutyDrivers.filter((d) => d.is_on_active_trip);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Dispatch Board</h1>
        <p className="page-sub">Assign vehicles & drivers to approved bookings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="To Dispatch" value={bookings.length} color="text-blue-600" />
        <StatCard label="Available Drivers" value={availableDrivers.length} color="text-emerald-600" />
        <StatCard label="On Active Trip" value={busyDrivers.length} color="text-amber-600" />
        <StatCard label="Vehicles Ready" value={vehicles.length} color="text-gray-800" />
      </div>

      {/* Driver availability summary */}
      {(busyDrivers.length > 0 || offDutyDrivers.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Today's Driver Status</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {[...availableDrivers, ...busyDrivers, ...offDutyDrivers].map((d) => (
              <div key={d.driver_id} className="px-5 py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    d.is_on_active_trip ? "bg-amber-400" :
                    d.is_working ? "bg-emerald-400" : "bg-gray-300"
                  }`} />
                  <p className="text-sm text-gray-900 truncate">{d.driver_name}</p>
                  <span className="text-xs text-gray-400 font-mono hidden sm:block">{d.license_number}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.is_on_active_trip && (
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">On Trip</span>
                  )}
                  {d.shift_code && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${SHIFT_COLORS[d.shift_code] ?? "bg-gray-100 text-gray-500"}`}>
                      {d.shift_code} {d.shift_label ? `· ${d.shift_label}` : ""}
                    </span>
                  )}
                  {!d.shift_code && (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">No schedule</span>
                  )}
                  {d.shift_code && !d.is_working && (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">Off duty</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Booking cards */}
      {bookings.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm font-medium text-gray-600">No approved bookings to dispatch</p>
          <p className="text-xs text-gray-400 mt-1">All approved bookings have been assigned</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const canDispatch    = !!(selectedVehicle[b.id] && selectedDriver[b.id]);
            const isDispatching  = dispatching[b.id];
            const showAll        = showAllDrivers[b.id];

            // For this booking date, prefer on-duty drivers
            const driverOptions  = showAll ? allDrivers : onDutyDrivers;
            const selectedDr     = allDrivers.find((d) => d.driver_id === selectedDriver[b.id]);

            return (
              <div key={b.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 bg-emerald-50/50 border-b border-gray-100 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{b.purpose}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fmtDate(b.trip_date)}{b.trip_time ? ` · ${b.trip_time}` : ""} · Requested by {b.requester_name}
                    </p>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">Approved</span>
                </div>

                {/* Route */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="flex items-stretch gap-3">
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <div className="w-2 h-2 rounded-full border-2 border-gray-400 bg-white"/>
                      <div className="w-0.5 flex-1 bg-gray-200 min-h-[20px]"/>
                      <div className="w-2 h-2 rounded-full bg-black"/>
                    </div>
                    <div className="flex flex-col justify-between gap-2">
                      <p className="text-xs text-gray-500">{b.pickup_location}</p>
                      <p className="text-xs font-medium text-gray-900">{b.dropoff_location}</p>
                    </div>
                  </div>
                  {b.passengers && (
                    <p className="text-xs text-gray-400 mt-2">👥 {b.passengers} passenger{b.passengers !== 1 ? "s" : ""}</p>
                  )}
                </div>

                {/* Assignment */}
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Vehicle */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">Vehicle *</label>
                      <select
                        value={selectedVehicle[b.id] || ""}
                        onChange={(e) => setSelectedVehicle((m) => ({ ...m, [b.id]: e.target.value }))}
                        className={selectCls}
                      >
                        <option value="">Select vehicle…</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.plate_number}{v.make ? ` · ${v.make} ${v.model ?? ""}` : ""}{v.capacity ? ` (${v.capacity} seats)` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Driver */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-500">Driver *</label>
                        <button
                          type="button"
                          onClick={() => setShowAllDrivers((m) => ({ ...m, [b.id]: !m[b.id] }))}
                          className="text-[10px] text-blue-600 hover:underline"
                        >
                          {showAll ? "On-duty only" : `Show all (${allDrivers.length})`}
                        </button>
                      </div>
                      <select
                        value={selectedDriver[b.id] || ""}
                        onChange={(e) => setSelectedDriver((m) => ({ ...m, [b.id]: e.target.value }))}
                        className={selectCls}
                      >
                        <option value="">Select driver…</option>
                        {driverOptions.length > 0 ? (
                          driverOptions.map((d) => (
                            <option
                              key={d.driver_id}
                              value={d.driver_id}
                              disabled={d.is_on_active_trip}
                            >
                              {d.driver_name} · {d.license_number}
                              {d.shift_code ? ` [${d.shift_code}]` : " [No shift]"}
                              {d.is_on_active_trip ? " ⚠ On trip" : ""}
                            </option>
                          ))
                        ) : (
                          <option disabled>No drivers on duty today</option>
                        )}
                      </select>
                      {/* Warning if selected driver is on active trip */}
                      {selectedDr?.is_on_active_trip && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          ⚠️ This driver is currently on an active trip. Confirm before dispatching.
                        </p>
                      )}
                      {/* Warning if selected driver is off duty */}
                      {selectedDr && !selectedDr.is_working && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          ⚠️ This driver is off duty today ({selectedDr.shift_code ?? "no shift"}).
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Notes (optional)</label>
                    <input
                      placeholder="Special instructions…"
                      value={notes[b.id] || ""}
                      onChange={(e) => setNotes((m) => ({ ...m, [b.id]: e.target.value }))}
                      className={inputCls}
                    />
                  </div>

                  <button
                    onClick={() => dispatch(b.id)}
                    disabled={!canDispatch || isDispatching}
                    className="w-full py-2.5 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isDispatching ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                        Dispatching…
                      </span>
                    ) : "Dispatch 🚗"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

function LoadingSpinner() {
  return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" /></div>;
}