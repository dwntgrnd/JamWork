import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useReports, invalidateReports, useDeleteReport } from '@/hooks/use-reports';
import { useAuth } from '@/hooks/use-auth';
import { apiPost, getErrorMessage } from '@/lib/api';
import { reportTypeLabel, formatReportDateTime, triggeredByLabel } from '@/lib/report-format';
import { DeleteReportDialog } from '@/components/report/delete-report-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ReportDetail, ReportSummary } from '@/types/report';

export default function ReportsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { data: reports, isPending, isError, refetch } = useReports();
  const deleteReport = useDeleteReport();
  const [toDelete, setToDelete] = useState<ReportSummary | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleConfirmDelete = () => {
    if (!toDelete) return;
    deleteReport.mutate(toDelete.id, {
      onSuccess: () => toast.success('Report deleted'),
      onError: (err) => toast.error(getErrorMessage(err, 'Failed to delete report')),
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { report } = await apiPost<{ report: ReportDetail }>('/reports');
      await invalidateReports();
      navigate(`/reports/${report.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to generate report'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-[960px] mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Status Reports</h1>
            <p className="mt-1 text-sm text-muted-foreground">A shared snapshot of work across all projects.</p>
          </div>
          <Button variant="emphasis" className="gap-2 font-semibold" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate Report
          </Button>
        </div>

        {isPending ? (
          <div role="status" aria-label="Loading reports" className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : isError ? (
          <div className="mt-12 flex flex-col items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">Failed to load reports.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !reports || reports.length === 0 ? (
          <div className="mt-12 flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h2 className="mb-1 text-lg font-medium text-foreground">No reports yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Generate your first status report to capture a shared snapshot of where every project stands.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {reports.map((report) => (
              <li key={report.id} className="flex items-center">
                <Link
                  to={`/reports/${report.id}`}
                  className="flex flex-1 items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{formatReportDateTime(report.generatedAt)}</span>
                    {report.triggeredBy && (
                      <span className="ml-2 text-sm text-muted-foreground">{triggeredByLabel(report.triggeredBy)}</span>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {reportTypeLabel(report.type)}
                  </Badge>
                </Link>
                {isAdmin && (
                  <button
                    type="button"
                    aria-label="Delete report"
                    onClick={() => setToDelete(report)}
                    disabled={deleteReport.isPending}
                    className="shrink-0 px-4 py-3 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <DeleteReportDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
