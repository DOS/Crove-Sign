import { describe, expect, it, vi } from 'vitest';

import { dispatchContractCompletedToCrm } from './crm-event-mapper';
import * as publishModule from './publish-dos-event';

describe('crm-event-mapper', () => {
  it('should format and dispatch contract.completed payload for Twenty CRM and Crove Desk', async () => {
    const publishSpy = vi.spyOn(publishModule, 'publishDosEcosystemEvent').mockResolvedValue(undefined);

    const mockData = {
      envelopeId: 'env_crm_test_123',
      documentId: 1001,
      title: 'Enterprise Master Service Agreement',
      userId: 1,
      userEmail: 'sales@crove.com',
      teamId: 5,
      organisationId: 'org_acme_corp',
      qrToken: 'qr_secret_token_abc',
      artifactRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      recipients: [
        {
          email: 'ceo@acme.com',
          name: 'John Doe',
          role: 'SIGNER',
          signingStatus: 'SIGNED',
          signedAt: new Date('2026-08-31T10:00:00Z'),
        },
      ],
    };

    await dispatchContractCompletedToCrm(mockData);

    expect(publishSpy).toHaveBeenCalledTimes(1);
    const callArgs = publishSpy.mock.calls[0][0];

    expect(callArgs.event).toBe('contract.completed');
    expect(callArgs.data.contract_id).toBe('env_crm_test_123');
    expect(callArgs.data.title).toBe('Enterprise Master Service Agreement');
    expect(callArgs.data.customer_emails).toEqual(['ceo@acme.com']);
    expect(callArgs.data.primary_customer_email).toBe('ceo@acme.com');
    expect(callArgs.data.artifact_root).toBe(mockData.artifactRoot);
    expect(callArgs.data.download_url).toContain('/api/v1/documents/1001/download');
    expect(callArgs.data.verification_url).toContain('/articles/verify-document?token=qr_secret_token_abc');
    expect((callArgs.data.signers as any[])[0].name).toBe('John Doe');

    publishSpy.mockRestore();
  });
});
