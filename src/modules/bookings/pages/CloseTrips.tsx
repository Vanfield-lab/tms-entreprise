// src/modules/bookings/pages/CloseTrips.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/utils";

type Booking = {
  id: string;
  purpose: string;
  trip_date: string;
  status: string;
  pickup_location: string;
  dropoff_location: string;
};

export default function CloseTrips() {
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState<string | null>(null);
  const [closed, setClosed] = useState<string[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("bookings")
      .select("id,purpose,trip_date,status,pickup_location,dropoff_location")
      .eq("status", "completed")
      .order("trip_date", { ascending: false });
    setItems((data as Booking[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const closeTrip = async (id: string) => {
    setClosing(id);
    await supabase.rpc("close_booking", { p_booking_id: id });
    setClosed((prev) => [...prev, id]);
    await load();
    setClosing(null);
  };

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Close Completed Trips</h1>
        <p className="page-sub">
          {items.length} trip{items.length !== 1 ? "s" : ""} awaiting closure
        </p>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {items.map((b) => (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{b.purpose}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Trip on {fmtDate(b.trip_date)}
                  </p>
                </div>
                <span className="shrink-0 inline-flex px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium capitalize">
                  {b.status}
                </span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-gray-500 min-w-0">
                  <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  </svg>
                  <span className="truncate">{b.pickup_location} → {b.dropoff_location}</span>
                </div>
                <button
                  onClick={() => closeTrip(b.id)}
                  disabled={closing === b.id}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40"
                >
                  {closing === b.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                      Closing…
                    </span>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Close Trip
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 text-gray-400">
      <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-50 flex items-center justify-center">
        <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-600">All caught up!</p>
      <p className="text-xs mt-1">No completed trips awaiting closure</p>
    </div>
  );
}