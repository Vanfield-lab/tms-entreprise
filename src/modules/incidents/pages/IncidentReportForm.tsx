// src/modules/incidents/pages/IncidentReportForm.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Alert, Btn, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/TmsUI";

type Vehicle = { id: string; plate_number: string };

const INCIDENT_TYPES = [
  { value: "accident", label: "Accident" },
  { value: "breakdown", label: "Breakdown" },
  { value: "maintenance", label: "Maintenance Issue" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

type Attachment = { url: string; name: string; type: string };

export default function IncidentReportForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [incidentType, setIncidentType] = useState("breakdown");
  const [priority, setPriority] = useState("normal");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.from("vehicles").select("id,plate_number").eq("status", "active").order("plate_number")
      .then(({ data }) => setVehicles((data as Vehicle[]) || []));
  }, []);

  const uploadFiles = async (files: FileList) => {
    setUploading(true);
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("incident-attachments").upload(path, file);
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("incident-attachments").getPublicUrl(path);
        newAttachments.push({ url: urlData.publicUrl, name: file.name, type: file.type });
      }
    }
    setAttachments(prev => [...prev, ...newAttachments]);
    setUploading(false);
  };

  const removeAttachment = (idx: number) =>
    setAttachments(prev => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    let driverId: string | null = null;
    if (user) {
      const { data: dr } = await supabase.from("drivers").select("id").eq("user_id", user.id).single();
      driverId = (dr as any)?.id ?? null;
    }
    const { error: insertErr } = await supabase.from("incident_reports").insert({
      reported_by: user?.id,
      vehicle_id: vehicleId || null,
      driver_id: driverId,
      incident_type: incidentType,
      title: title.trim(),
      description: description.trim(),
      priority,
      attachments: attachments,
      status: "open",
    });
    setSaving(false);
    if (insertErr) { setError(insertErr.message); return; }
    setSuccess(true);
    onSubmitted?.();
  };

  const reset = () => {
    setVehicleId(""); setIncidentType("breakdown"); setPriority("normal");
    setTitle(""); setDescription(""); setAttachments([]);
    setSuccess(false); setError(null);
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
          style={{ background: "var(--green-dim)" }}>
          <svg className="w-7 h-7" style={{ color: "var(--green)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>Incident Reported</h2>
        <p className="text-sm mt-1 mb-6" style={{ color: "var(--text-muted)" }}>Your report has been submitted. Transport supervisor will review.</p>
        <Btn variant="ghost" onClick={reset}>Report Another</Btn>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader title="Report an Incident" subtitle="Accidents, breakdowns, maintenance or other matters" />
      <CardBody className="space-y-4">
        {error && <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Incident Type" required>
            <Select value={incidentType} onChange={e => setIncidentType(e.target.value)}>
              {INCIDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Priority" required>
            <Select value={priority} onChange={e => setPriority(e.target.value)}>
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Vehicle (if applicable)">
          <Select value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
            <option value="">— Select vehicle —</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
          </Select>
        </Field>

        <Field label="Title" required>
          <Input placeholder="Brief summary of the incident" value={title} onChange={e => setTitle(e.target.value)} />
        </Field>

        <Field label="Description" required>
          <Textarea rows={4} placeholder="Describe what happened in detail…" value={description}
            onChange={e => setDescription(e.target.value)} />
        </Field>

        {/* File upload */}
        <Field label="Photos / Documents">
          <label className="flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
            style={{ borderColor: "var(--border-bright)", background: "var(--surface-2)" }}>
            <svg className="w-8 h-8" style={{ color: "var(--text-dim)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              {uploading ? "Uploading…" : "Tap to attach photos or files"}
            </span>
            <input type="file" accept="image/*,.pdf,.doc,.docx" multiple className="hidden"
              onChange={e => e.target.files && uploadFiles(e.target.files)} disabled={uploading} />
          </label>
          {attachments.length > 0 && (
            <div className="space-y-1 mt-2">
              {attachments.map((a, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <span className="flex-1 truncate" style={{ color: "var(--text)" }}>{a.name}</span>
                  <button onClick={() => removeAttachment(i)} style={{ color: "var(--red)" }} className="shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
        </Field>

        <div className="flex justify-end pt-2">
          <Btn variant="primary" onClick={submit} loading={saving || uploading}>Submit Report</Btn>
        </div>
      </CardBody>
    </Card>
  );
}