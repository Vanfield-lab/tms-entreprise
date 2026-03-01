// src/modules/bookings/pages/MyBookings.tsx  (updated — real-time + detail drill-in)
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import BookingDetailView from "./BookingDetailView";

type Booking = {
  id: string;
  purpose: string;
  trip_date: string;
  trip_time: string;
  status: string;
  booking_type: string;
  pickup_location: string;
  dropoff_location: string;
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  dispatched: "bg-blue-100 text-blue-700",
  in_progress: "bg-violet-100 text-violet-700",
  completed: "bg-cyan-100 text-cyan-700",
  closed: "bg-gray-200 text-gray-600",
};

export default function MyBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { data } = await supabase
      .from("bookings")
      .select("id,purpose,trip_date,trip_time,status,booking_type,pickup_location,dropoff_location")
      .eq("requested_by", user.user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setBookings((data as Booking[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();

    // Real-time subscription
    const channel = supabase
      .channel("my_bookings_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => { load(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const submit = async (id: string) => {
    setSubmitting(id);
    await supabase.rpc("submit_booking", { p_booking_id: id });
    await load();
    setSubmitting(null);
  };

  if (selected) {
    return <BookingDetailView bookingId={selected} onBack={() => setSelected(null)} />;
  }

  const filtered = bookings.filter((b) => statusFilter === "all" || b.status === statusFilter);
  const draftCount = bookings.filter((b) => b.status === "draft").length;
  const pendingCount = bookings.filter((b) => b.status === "submitted").length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">My Bookings</h1>
          <p className="page-sub">
            {bookings.length} booking{bookings.length !== 1 ? "s" : ""}
            {(draftCount > 0 || pendingCount > 0) && (
              <span className="ml-2 text-xs text-amber-600">
                {draftCount > 0 && `${draftCount} draft`}
                {draftCount > 0 && pendingCount > 0 && " · "}
                {pendingCount > 0 && `${pendingCount} pending`}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {["all", "draft", "submitted", "approved", "dispatched", "in_progress", "completed", "closed", "rejected"].map((s) => {
          const count = s === "all" ? bookings.length : bookings.filter((b) => b.status === s).length;
          if (s !== "all" && count === 0) return null;
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
              {s.replace("_", " ")} {count > 0 && <span className="opacity-70 ml-0.5">{count}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState hasBookings={bookings.length > 0} />
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <div
              key={b.id}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all"
              onClick={() => setSelected(b.id)}
            >
              <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{b.purpose}</p>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">{b.booking_type}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[b.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {b.status.replace("_", " ")}
                  </span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
              <div className="px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  {b.trip_date} at {b.trip_time}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  </svg>
                  <span className="truncate">{b.pickup_location} → {b.dropoff_location}</span>
                </div>
              </div>
              {b.status === "draft" && (
                <div className="px-4 pb-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => { e.stopPropagation(); submit(b.id); }}
                    disabled={submitting === b.id}
                    className="w-full py-2 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40"
                  >
                    {submitting === b.id ? "Submitting…" : "Submit for Approval →"}
                  </button>
                </div>
              )}
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
      <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"/>
    </div>
  );
}

function EmptyState({ hasBookings }: { hasBookings: boolean }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
      </svg>
      <p className="text-sm font-medium">
        {hasBookings ? "No bookings match this filter" : "No bookings yet"}
      </p>
      {!hasBookings && <p className="text-xs mt-1">Create your first booking using "New Booking"</p>}
    </div>
  );
}