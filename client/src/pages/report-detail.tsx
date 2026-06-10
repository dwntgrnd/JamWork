import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import { useReport, useDeleteReport } from '@/hooks/use-reports';
import { useAuth } from '@/hooks/use-auth';
import { downloadReportMarkdown } from '@/lib/download';
import { getErrorMessage } from '@/lib/api';
import { reportTypeLabel, formatReportDateTime, triggeredByLabel } from '@/lib/report-format';
import { ReportView } from '@/components/report/report-view';
import { DeleteReportDialog } from '@/components/report/delete-report-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { isAdminOrOwner } from '@/types';

export default function ReportDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = isAdminOrOwner(user?.role);
  const { data: report, isPending, isError, refetch } = useReport(id);
  const deleteReport = useDeleteReport();
  const [showDelete, setShowDelete] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!id) return;
    setDownloading(true);
    try {
      await downloadReportMarkdown(id);
    } catch {
      toast.error('Failed to download Markdown');
    } finally {
      setDownloading(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!id) return;
    deleteReport.mutate(id, {
      onSuccess: () => {
        toast.success('Report deleted');
        navigate('/reports');
      },
      onError: (err) => toast.error(getErrorMessage(err, 'Failed to delete report')),
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-[960px] mx-auto">
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to reports
        </Link>

        {isPending ? (
          <div role="status" aria-label="Loading report" className="mt-6 animate-pulse space-y-4">
            <div className="h-8 w-64 rounded bg-muted" />
            <div className="h-4 w-96 rounded bg-muted" />
            <div className="h-4 w-80 rounded bg-muted" />
          </div>
        ) : isError || !report ? (
          <div className="mt-12 flex flex-col items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">Failed to load report.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 mb-8 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-foreground">Status Report</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatReportDateTime(report.generatedAt)}</span>
                  <Badge variant="secondary">{reportTypeLabel(report.type)}</Badge>
                  {report.triggeredBy && <span>{triggeredByLabel(report.triggeredBy)}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" onClick={handleDownload} disabled={downloading}>
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download Markdown
                </Button>
                {isAdmin && (
                  <Button
                    variant="outline"
                    onClick={() => setShowDelete(true)}
                    disabled={deleteReport.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                )}
              </div>
            </div>

            <ReportView payload={report.payload} />
          </>
        )}
      </div>

      <DeleteReportDialog open={showDelete} onOpenChange={setShowDelete} onConfirm={handleConfirmDelete} />
    </div>
  );
}
