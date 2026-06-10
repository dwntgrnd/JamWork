import { useMutation, useQuery } from '@tanstack/react-query';
import { apiDelete, apiGet } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { ReportSummary, ReportDetail } from '@/types/report';

export const REPORTS_KEY = ['reports'] as const;

/** Stable query key for a single report detail. */
export const reportKey = (id: string) => ['reports', id] as const;

/**
 * The report archive — newest-first list of stored reports.
 * Mutations (generating a report) call {@link invalidateReports} to refresh
 * every consumer.
 */
export function useReports() {
  return useQuery({
    queryKey: REPORTS_KEY,
    queryFn: () => apiGet<{ reports: ReportSummary[] }>('/reports').then((d) => d.reports),
  });
}

/** A single stored report with its parsed payload. Idle until `id` is provided. */
export function useReport(id: string | undefined) {
  return useQuery({
    queryKey: reportKey(id ?? ''),
    queryFn: () => apiGet<{ report: ReportDetail }>(`/reports/${id}`).then((d) => d.report),
    enabled: !!id,
  });
}

/** Refetch every report query everywhere it's used. Safe to call from any handler. */
export function invalidateReports(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
}

/** Hard-delete a report (admin-only on the server). Refreshes the archive on success. */
export function useDeleteReport() {
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/reports/${id}`),
    onSuccess: () => invalidateReports(),
  });
}
