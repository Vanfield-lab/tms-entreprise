// src/modules/maintenance/pages/ReportMaintenance.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Vehicle = { id: string; plate_number: string };

const ISSUE_TYPES = [
  "Engine problem",
  "Tire issue",
  "Brake failure",
  "Electrical fault",
  "AC/Heating",
  "Body damage",
  "Oil leak",
  "Transmission",
  "Fuel system",
  "Other",
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low", color: "text-green-600 bg-green-50 border-green-200" },
  { value: "medium", label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "high", label: "High", color: "text-orange-600 bg-orange-50 border-orange-200" },
  { value: "critical", label: "Critical", color: "text-red-600 bg-red-50 border-red-200" },
];

export default function ReportMaintenance() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("vehicles")
      .select("id,plate_number")
      .eq("status", "active")
      .order("plate_number")
      .then(({ data }) => setVehicles((data as Vehicle[]) || []));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId) { setError("Please select a vehicle."); return; }
    if (!description.trim()) { setError("Please describe the issue."); return; }
    setSaving(true);
    setError("");
    try {
      const { data: me } = await supabase.auth.getUser();
      const { error: err } = await supabase.from("maintenance_requests").insert({
        vehicle_id: vehicleId,
        issue_type: issueType || "Other",
        description: description.trim(),
        priority,
        reported_by: me.user?.id,
        status: "reported",
      });
      if (err) throw err;
      setVehicleId("");
      setIssueType("");
      setDescription("");
      setPriority("medium");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (e: any) {
      setError(e.message || "Failed to submit report.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-transparent transition-all";

  return (
    <div className="space-y-4 max-w-xl">
      <div className="page-header">
        <h1 className="page-title">Report Maintenance Issue</h1>
        <p className="page-sub">Submit a vehicle fault or maintenance request</p>
      </div>

      {success && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
          Maintenance issue reported. Transport will review shortly.
        </div>
      )}

      <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Issue Details</h3>
          <p className="text-xs text-gray-400 mt-0.5">Describe the problem clearly so it can be actioned quickly</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Vehicle */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Vehicle *</label>
            <select
              className={inputCls}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              required
            >
              <option value="">— Select a vehicle —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate_number}</option>
              ))}
            </select>
          </div>

          {/* Issue type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Issue Type</label>
            <select className={inputCls} value={issueType} onChange={(e) => setIssueType(e.target.value)}>
              <option value="">— Select type —</option>
              {ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Priority</label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`py-2 text-xs font-medium rounded-xl border transition-all ${
                    priority === p.value
                      ? p.color + " ring-2 ring-offset-1 ring-gray-900/10"
                      : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Description *</label>
            <textarea
              rows={4}
              className={inputCls + " resize-none"}
              placeholder="Describe what's wrong in detail. Include when it started, any sounds or warning lights, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"/>
              </svg>
              {error}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting…
                </span>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                  </svg>
                  Submit Report
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}