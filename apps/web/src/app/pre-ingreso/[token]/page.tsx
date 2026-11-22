import { CandidateShell } from '@/components/candidate-shell';
import { PreOnboardingWizard } from '@/components/pre-onboarding-wizard';

export default async function PreIngresoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <CandidateShell>
      <PreOnboardingWizard token={token} />
    </CandidateShell>
  );
}
