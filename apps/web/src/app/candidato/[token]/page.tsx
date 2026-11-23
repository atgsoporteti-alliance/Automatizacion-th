import { CandidateShell } from '@/components/candidate-shell';
import { CandidatePortalDashboard } from '@/components/candidate-portal-dashboard';

export default async function CandidatePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <CandidateShell>
      <CandidatePortalDashboard token={token} />
    </CandidateShell>
  );
}
