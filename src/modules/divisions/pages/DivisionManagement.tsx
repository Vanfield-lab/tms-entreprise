// src/modules/divisions/pages/DivisionManagement.tsx
// FIX #1: Full dark mode via CSS variables
// FIX #8: Auto-generate unit `code` from name so not-null constraint is satisfied
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/utils";

type Division = { id: string; name: string; unit_count: number; created_at: string };
type Unit     = {
  id: string; name: string; code: string | null;
  division_id: string; division_name: string;
  parent_unit_id: string | null; created_at: string;
};

const TABS = [
  { value: "divisions", label: "Divisions" },
  { value: "units",     label: "Units"     },
];

/** Generate a short code from a name, e.g. "News & Current Affairs" → "NCA001" */
function autoCode(name: string): string {
  const initials = name
    .replace(/[^a-zA-Z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .join("")
    .slice(0, 5);
  const suffix = String(Math.floor(Math.random() * 900) + 100);
  return (initials || "UNIT") + suffix;
}

export default function DivisionManagement() {
  const [divisions,      setDivisions]     = useState<Division[]>([]);
  const [units,          setUnits]         = useState<Unit[]>([]);
  const [loading,        setLoading]       = useState(true);
  const [tab,            setTab]           = useState("divisions");
  const [q,              setQ]             = useState("");

  // Division form
  const [showDivForm,    setShowDivForm]   = useState(false);
  const [divName,        setDivName]       = useState("");
  const [editingDivId,   setEditingDivId]  = useState<string | null>(null);
  const [divSaving,      setDivSaving]     = useState(false);
  const [divError,       setDivError]      = useState<string | null>(null);

  // Unit form
  const [showUnitForm,   setShowUnitForm]  = useState(false);
  const [unitName,       setUnitName]      = useState("");
  const [unitCode,       setUnitCode]      = useState("");
  const [unitDivisionId, setUnitDivisionId]= useState("");
  const [unitParentId,   setUnitParentId]  = useState("");
  const [editingUnitId,  setEditingUnitId] = useState<string | null>(null);
  const [unitSaving,     setUnitSaving]    = useState(false);
  const [unitError,      setUnitError]     = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: d }, { data: u }] = await Promise.all([
      supabase.from("divisions").select("id,name,created_at").order("name"),
      supabase.from("units").select("id,name,code,division_id,parent_unit_id,created_at").order("name"),
    ]);

    const divArr = (d as any[]) || [];
    const unitArr = (u as any[]) || [];

    const divMap = Object.fromEntries(divArr.map((x: any) => [x.id, x.name]));

    const enrichedDivs: Division[] = divArr.map((x: any) => ({
      id: x.id, name: x.name, created_at: x.created_at,
      unit_count: unitArr.filter((uu: any) => uu.division_id === x.id).length,
    }));

    const enrichedUnits: Unit[] = unitArr.map((x: any) => ({
      id: x.id, name: x.name, code: x.code,
      division_id: x.division_id,
      division_name: divMap[x.division_id] ?? "—",
      parent_unit_id: x.parent_unit_id,
      created_at: x.created_at,
    }));

    setDivisions(enrichedDivs);
    setUnits(enrichedUnits);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Division CRUD
  const openAddDiv  = () => { setDivName(""); setEditingDivId(null); setDivError(null); setShowDivForm(true); };
  const openEditDiv = (d: Division) => { setDivName(d.name); setEditingDivId(d.id); setDivError(null); setShowDivForm(true); };

  const saveDiv = async () => {
    if (!divName.trim()) { setDivError("Name is required."); return; }
    setDivSaving(true); setDivError(null);
    try {
      const { error: e } = editingDivId
        ? await supabase.from("divisions").update({ name: divName.trim() }).eq("id", editingDivId)
        : await supabase.from("divisions").insert({ name: divName.trim() });
      if (e) throw e;
      setShowDivForm(false); await load();
    } catch (e: any) { setDivError(e.message ?? "Save failed."); }
    finally { setDivSaving(false); }
  };

  // Unit CRUD
  const openAddUnit = () => {
    setUnitName(""); setUnitCode(""); setUnitDivisionId(""); setUnitParentId("");
    setEditingUnitId(null); setUnitError(null); setShowUnitForm(true);
  };
  const openEditUnit = (u: Unit) => {
    setUnitName(u.name); setUnitCode(u.code || "");
    setUnitDivisionId(u.division_id); setUnitParentId(u.parent_unit_id || "");
    setEditingUnitId(u.id); setUnitError(null); setShowUnitForm(true);
  };

  // FIX #8: Auto-generate code if blank before insert/update
  const saveUnit = async () => {
    if (!unitName.trim() || !unitDivisionId) { setUnitError("Name and division are required."); return; }
    setUnitSaving(true); setUnitError(null);
    try {
      const resolvedCode = (unitCode.trim() || autoCode(unitName)).toUpperCase();
      const payload = {
        name: unitName.trim(),
        code: resolvedCode,
        division_id: unitDivisionId,
        parent_unit_id: unitParentId || null,
      };
      const { error: e } = editingUnitId
        ? await supabase.from("units").update(payload).eq("id", editingUnitId)
        : await supabase.from("units").insert(payload);
      if (e) throw e;
      setShowUnitForm(false); await load();
    } catch (e: any) { setUnitError(e.message ?? "Save failed."); }
    finally { setUnitSaving(false); }
  };

  const filteredDivs  = divisions.filter(d => !q || d.name.toLowerCase().includes(q.toLowerCase()));
  const filteredUnits = units.filter(u =>
    !q || [u.name, u.division_name, u.code].join(" ").toLowerCase().includes(q.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Divisions & Units</h1>
        <button className="btn btn-primary" onClick={tab === "divisions" ? openAddDiv : openAddUnit}>
          + Add {tab === "divisions" ? "Division" : "Unit"}
        </button>
      </div>

      {/* Tabs */}
      <div className="tab-group">
        {TABS.map(t => (
          <button
            key={t.value}
            className={`tab-item ${tab === t.value ? "active" : ""}`}
            onClick={() => { setTab(t.value); setQ(""); }}
          >
            {t.label}
            <span className="count-pill">
              {t.value === "divisions" ? divisions.length : units.length}
            </span>
          </button>
        ))}
      </div>

      <input
        className="tms-input max-w-xs"
        placeholder={`Search ${tab}…`}
        value={q}
        onChange={e => setQ(e.target.value)}
      />

      {/* Divisions */}
      {tab === "divisions" && (
        filteredDivs.length === 0 ? (
          <div className="card p-8 text-center" style={{ color: "var(--text-muted)" }}>No divisions found.</div>
        ) : (
          <div className="space-y-2">
            {filteredDivs.map(d => (
              <div key={d.id} className="card p-4 flex items-center justify-between gap-3">
                <div>
                  <p style={{ fontWeight: 600, color: "var(--text)" }}>{d.name}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {d.unit_count} unit{d.unit_count !== 1 ? "s" : ""} · Created {fmtDate(d.created_at)}
                  </p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => openEditDiv(d)}>Edit</button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Units */}
      {tab === "units" && (
        filteredUnits.length === 0 ? (
          <div className="card p-8 text-center" style={{ color: "var(--text-muted)" }}>No units found.</div>
        ) : (
          <>
            {/* Mobile */}
            <div className="sm:hidden space-y-2">
              {filteredUnits.map(u => (
                <div key={u.id} className="card p-4 flex items-center justify-between gap-3">
                  <div>
                    <p style={{ fontWeight: 600, color: "var(--text)" }}>{u.name}</p>
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {u.code && <span style={{ fontFamily: "'IBM Plex Mono', monospace", marginRight: 6 }}>{u.code}</span>}
                      {u.division_name}{u.parent_unit_id ? " · Sub-unit" : ""}
                    </p>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEditUnit(u)}>Edit</button>
                </div>
              ))}
            </div>
            {/* Desktop */}
            <div className="hidden sm:block card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="tms-table">
                  <thead>
                    <tr>{["Unit Name", "Code", "Division", "Parent Unit", "Created", ""].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filteredUnits.map(u => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 600 }}>{u.name}</td>
                        <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--text-muted)" }}>{u.code || "—"}</td>
                        <td>{u.division_name}</td>
                        <td style={{ color: "var(--text-muted)" }}>
                          {u.parent_unit_id ? (units.find(x => x.id === u.parent_unit_id)?.name ?? "—") : "—"}
                        </td>
                        <td style={{ color: "var(--text-muted)" }}>{fmtDate(u.created_at)}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => openEditUnit(u)}>Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}

      {/* Division Modal */}
      {showDivForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowDivForm(false)}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, width: "100%", maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{editingDivId ? "Edit Division" : "Add Division"}</h3>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="form-label">Division Name <span style={{ color: "var(--red)" }}>*</span></label>
                <input className="tms-input" placeholder="e.g. News & Current Affairs" value={divName} onChange={e => setDivName(e.target.value)} />
              </div>
              {divError && <div className="alert alert-error"><span className="alert-icon">✕</span><span className="alert-content">{divError}</span></div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setShowDivForm(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={divSaving} onClick={saveDiv}>{divSaving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unit Modal */}
      {showUnitForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowUnitForm(false)}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, width: "100%", maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{editingUnitId ? "Edit Unit" : "Add Unit"}</h3>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="form-label">Unit Name <span style={{ color: "var(--red)" }}>*</span></label>
                <input className="tms-input" placeholder="e.g. Sports Desk" value={unitName}
                  onChange={e => { setUnitName(e.target.value); if (!unitCode) setUnitCode(autoCode(e.target.value)); }} />
              </div>
              <div>
                <label className="form-label">Unit Code <span style={{ fontSize: 10, color: "var(--text-dim)" }}>(auto-generated if blank)</span></label>
                <input className="tms-input" style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  placeholder="e.g. SPORT001" value={unitCode}
                  onChange={e => setUnitCode(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="form-label">Division <span style={{ color: "var(--red)" }}>*</span></label>
                <select className="tms-select" value={unitDivisionId} onChange={e => setUnitDivisionId(e.target.value)}>
                  <option value="">Select division…</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Parent Unit (optional)</label>
                <select className="tms-select" value={unitParentId} onChange={e => setUnitParentId(e.target.value)}>
                  <option value="">None (top-level)</option>
                  {units.filter(u => u.division_id === unitDivisionId && u.id !== editingUnitId).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              {unitError && <div className="alert alert-error"><span className="alert-icon">✕</span><span className="alert-content">{unitError}</span></div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setShowUnitForm(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={unitSaving} onClick={saveUnit}>{unitSaving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}