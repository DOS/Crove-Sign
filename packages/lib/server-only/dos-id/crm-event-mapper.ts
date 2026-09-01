import { NEXT_PUBLIC_WEBAPP_URL } from '../../constants/app';
import { publishDosEcosystemEvent } from './publish-dos-event';

export type ContractCompletedEventData = {
  envelopeId: string;
  documentId?: number;
  title: string;
  userId: number;
  userEmail?: string;
  teamId?: number;
  organisationId?: string;
  qrToken?: string | null;
  artifactRoot?: string | null;
  recipients?: Array<{
    email: string;
    name: string;
    role: string;
    signingStatus?: string;
    signedAt?: Date | string | null;
  }>;
};

/**
 * Maps and dispatches a structured `contract.completed` / `contract.signed` event
 * directly formatted for ingestion by Twenty CRM and Crove Desk.
 */
export async function dispatchContractCompletedToCrm(
  eventData: ContractCompletedEventData,
): Promise<void> {
  const baseUrl = NEXT_PUBLIC_WEBAPP_URL();
  const customerEmails = (eventData.recipients || [])
    .map((r) => r.email.toLowerCase())
    .filter(Boolean);

  const payload: Record<string, unknown> = {
    contract_id: eventData.envelopeId,
    envelope_id: eventData.envelopeId,
    document_id: eventData.documentId,
    title: eventData.title,
    status: 'COMPLETED',
    customer_emails: customerEmails,
    primary_customer_email: customerEmails[0] || eventData.userEmail || '',
    owner_email: eventData.userEmail,
    org_id: eventData.organisationId,
    team_id: eventData.teamId,
    artifact_root: eventData.artifactRoot,
    signers: (eventData.recipients || []).map((r) => ({
      email: r.email,
      name: r.name,
      role: r.role,
      status: r.signingStatus || 'SIGNED',
      signed_at: r.signedAt ? new Date(r.signedAt).toISOString() : new Date().toISOString(),
    })),
    download_url: eventData.documentId
      ? `${baseUrl}/api/v1/documents/${eventData.documentId}/download`
      : `${baseUrl}/api/v2/documents/${eventData.envelopeId}/download`,
    verification_url: eventData.qrToken
      ? `${baseUrl}/articles/verify-document?token=${encodeURIComponent(eventData.qrToken)}`
      : `${baseUrl}/articles/verify-document`,
    completed_at: new Date().toISOString(),
  };

  await publishDosEcosystemEvent({
    event: 'contract.completed',
    data: payload,
  });
}
