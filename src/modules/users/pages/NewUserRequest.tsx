// src/modules/users/pages/NewUserRequest.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Division = { id: string; name: string };
type Unit = { id: string; name: string; division_id: string };

const ROLES = [
  { value: "staff", label: "Staff", desc: "General department staff" },
  { value: "driver", label: "Driver", desc: "Vehicle operator" },
  { value: "unit_head", label: "Unit Head", desc: "Head of a unit" },
  { value: "transport_supervisor", label: "Transport Supervisor", desc: "Manages fleet & dispatch" },
  { value: "corporate_approver", label: "Corporate Approver", desc: "Approves bookings & fuel" },
];

const inputCls = "w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-transparent transition-all";

export default function NewUserRequest() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [role, setRole] = useState("staff");
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: u }] = await Promise.all([
        supabase.from("divisions").select("id,name").order("name"),
        supabase.from("units").select("id,name,division_id").order("name"),
      ]);
      setDivisions((d as Division[]) || []);
      setUnits((u as Unit[]) || []);
    })();
  }, []);

  const filteredUnits = units.filter((u) => !divisionId || u.division_id === divisionId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !divisionId || !unitId) {
      setError("Please fill in all required fields.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data: me } = await supabase.auth.getUser();
      const { error: err } = await supabase.from("user_requests").insert({
        requested_by: me.user!.id,
        full_name: fullName.trim(),
        email: email.trim(),
        division_id: divisionId,
        unit_id: unitId,
        requested_role: role,
        status: "pending",
      });
      if (err) throw err;
      setFullName("");
      setEmail("");
      setDivisionId("");
      setUnitId("");
      setRole("staff");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (e: any) {
      setError(e.message || "Failed to submit request.");
    } finally {
      setSaving(false);
    }
  };

  const selectedRole = ROLES.find((r) => r.value === role);

  return (
    <div className="space-y-4 max-w-xl">
      <div className="page-header">
        <h1 className="page-title">Request New User</h1>
        <p className="page-sub">Request system access for a new team member</p>
      </div>

      {success && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
          Request submitted. An admin will review and activate the account.
        </div>
      )}

      <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">User Details</h3>
          <p className="text-xs text-gray-400 mt-0.5">Fill in the details for the new team member</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Full Name *</label>
              <input
                className={inputCls}
                placeholder="e.g. John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Email Address *</label>
              <input
                type="email"
                className={inputCls}
                placeholder="john@organization.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Division & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Division *</label>
              <select
                className={inputCls}
                value={divisionId}
                onChange={(e) => { setDivisionId(e.target.value); setUnitId(""); }}
                required
              >
                <option value="">— Select division —</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">Unit *</label>
              <select
                className={inputCls}
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                disabled={!divisionId}
                required
              >
                <option value="">— Select unit —</option>
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">System Role *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                    role === r.value
                      ? "bg-black text-white border-black"
                      : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className={`text-xs font-semibold ${role === r.value ? "text-white" : "text-gray-800"}`}>
                    {r.label}
                  </div>
                  <div className={`text-xs mt-0.5 ${role === r.value ? "text-white/70" : "text-gray-400"}`}>
                    {r.desc}
                  </div>
                </button>
              ))}
            </div>
            {selectedRole && (
              <p className="text-xs text-gray-400 mt-1">
                Selected: <span className="font-medium text-gray-600">{selectedRole.label}</span> — {selectedRole.desc}
              </p>
            )}
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                  </svg>
                  Submit Request
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}