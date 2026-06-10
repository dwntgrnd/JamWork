import { useState, useEffect } from 'react';
import { apiGet, apiPut, getErrorMessage } from '@/lib/api';
import { ReportRecipient } from '@/types/report';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export function AdminReportsRecipientsCard() {
  const [recipients, setRecipients] = useState<ReportRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toggleError, setToggleError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<{ recipients: ReportRecipient[] }>('/admin/report-recipients');
        if (!cancelled) setRecipients(data.recipients);
      } catch (err: unknown) {
        if (!cancelled) setLoadError(getErrorMessage(err, 'Failed to load recipients'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic toggle: flip immediately, revert on failure (matches Settings page).
  const handleToggle = async (userId: string, enabled: boolean) => {
    const previous = recipients;
    setRecipients((prev) => prev.map((r) => (r.userId === userId ? { ...r, enabled } : r)));
    setToggleError('');
    try {
      await apiPut<{ userId: string; enabled: boolean }>(`/admin/report-recipients/${userId}`, { enabled });
    } catch (err: unknown) {
      setRecipients(previous); // rollback
      setToggleError(getErrorMessage(err, 'Failed to update recipient'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report Recipients</CardTitle>
        <CardDescription>
          Choose which team members receive the scheduled status report email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members to configure.</p>
        ) : (
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Receive</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell className="font-medium">{r.displayName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={(v) => handleToggle(r.userId, v)}
                        aria-label={`Receive reports: ${r.displayName}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {toggleError && <p className="text-sm text-destructive">{toggleError}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
