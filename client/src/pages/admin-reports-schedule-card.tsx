import { useState, useEffect } from 'react';
import { apiGet, apiPut, getErrorMessage } from '@/lib/api';
import { ReportSchedule } from '@/types/report';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Info } from 'lucide-react';

/** Monday(1) .. Sunday(7), ISO 8601 — values are ints, sent as numbers. */
const DAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

/** "00:00" .. "23:00", hourly. Stored as "HH:00", displayed with a UTC label. */
const TIME_OPTIONS: string[] = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

const DEFAULT_SCHEDULE: ReportSchedule = {
  enabled: false,
  dayOfWeek: 1,
  sendTimeUtc: '09:00',
  frequency: 'weekly',
};

function scheduleEquals(a: ReportSchedule, b: ReportSchedule): boolean {
  return (
    a.enabled === b.enabled &&
    a.dayOfWeek === b.dayOfWeek &&
    a.sendTimeUtc === b.sendTimeUtc &&
    a.frequency === b.frequency
  );
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function AdminReportsScheduleCard() {
  const [form, setForm] = useState<ReportSchedule>(DEFAULT_SCHEDULE);
  const [saved, setSaved] = useState<ReportSchedule>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<ReportSchedule>('/admin/report-schedule');
        if (cancelled) return;
        // Normalize "HH:MM:SS" → "HH:MM" defensively; backend already sends HH:MM.
        const normalized: ReportSchedule = { ...data, sendTimeUtc: data.sendTimeUtc.slice(0, 5) };
        setForm(normalized);
        setSaved(normalized);
      } catch (err: unknown) {
        if (!cancelled) setLoadError(getErrorMessage(err, 'Failed to load schedule'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = !scheduleEquals(form, saved);

  const update = (patch: Partial<ReportSchedule>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setSaveError('');
    setSuccess('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSuccess('');
    try {
      const result = await apiPut<ReportSchedule>('/admin/report-schedule', form);
      const normalized: ReportSchedule = { ...result, sendTimeUtc: result.sendTimeUtc.slice(0, 5) };
      setForm(normalized);
      setSaved(normalized);
      setSuccess('Schedule saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, 'Failed to save schedule'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule Configuration</CardTitle>
        <CardDescription>
          Set when the status report is automatically generated and emailed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading schedule…</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <div className="space-y-6">
            {/* Master toggle — part of the form, persisted on Save (not instant). */}
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="schedule-enabled">Enable scheduled reports</Label>
                <p className="text-xs text-muted-foreground">
                  When off, the schedule is kept but no reports are sent.
                </p>
              </div>
              <Switch
                id="schedule-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => update({ enabled: v })}
              />
            </div>

            {/* Fields are muted (not disabled) when off — configure before enabling. */}
            <div className={`space-y-4 ${form.enabled ? '' : 'opacity-50'}`}>
              <div className="space-y-2">
                <Label htmlFor="schedule-frequency">Frequency</Label>
                <Select value={form.frequency} disabled>
                  <SelectTrigger id="schedule-frequency" className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={form.frequency}>{capitalize(form.frequency)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-day">Day of week</Label>
                <Select
                  value={String(form.dayOfWeek)}
                  onValueChange={(v) => update({ dayOfWeek: Number(v) })}
                >
                  <SelectTrigger id="schedule-day" className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_OPTIONS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-time">Time (UTC)</Label>
                <Select
                  value={form.sendTimeUtc}
                  onValueChange={(v) => update({ sendTimeUtc: v })}
                >
                  <SelectTrigger id="schedule-time" className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t} UTC
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Schedule runs in UTC. No timezone conversion is applied.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={!isDirty || saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              {success && <span className="text-sm text-success">✓ {success}</span>}
              {saveError && <span className="text-sm text-destructive">{saveError}</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
