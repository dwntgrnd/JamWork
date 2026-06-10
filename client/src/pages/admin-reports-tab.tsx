import { AdminReportsScheduleCard } from './admin-reports-schedule-card';
import { AdminReportsRecipientsCard } from './admin-reports-recipients-card';

export function AdminReportsTab() {
  return (
    <div className="space-y-6">
      <AdminReportsScheduleCard />
      <AdminReportsRecipientsCard />
    </div>
  );
}
