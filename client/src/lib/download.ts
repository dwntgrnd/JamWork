import { ApiError } from './api';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/** Parse the filename from a Content-Disposition header, if present. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^"]+)"?/.exec(header);
  return match ? match[1] : null;
}

/**
 * Download a report's stored Markdown. The endpoint returns `text/markdown`
 * with a Content-Disposition attachment header — not JSON — so this uses raw
 * `fetch` (credentialed) rather than {@link apiGet}, then triggers a browser
 * download via a blob + programmatic anchor click.
 */
export async function downloadReportMarkdown(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/reports/${id}/markdown`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError(response.status, `Failed to download report (HTTP ${response.status})`);
  }

  const blob = await response.blob();
  const filename =
    filenameFromDisposition(response.headers.get('Content-Disposition')) ??
    `status-report-${id}.md`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
