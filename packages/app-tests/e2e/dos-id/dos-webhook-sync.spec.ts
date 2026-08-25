import crypto from 'node:crypto';
import { prisma } from '@documenso/prisma';
import { expect, test } from '@playwright/test';

test.describe('[DOS Webhook Sync]: /api/webhooks/dos-org-sync', () => {
  const webhookSecret = process.env.CROVE_DOS_WEBHOOK_SECRET || process.env.NEXT_PRIVATE_DOS_WEBHOOK_SECRET || 'test-dos-webhook-secret';
  
  const generateSignature = (body: string, secret: string) => {
    return `sha256=${crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
  };

  test('should reject requests with invalid signature', async ({ request }) => {
    const payload = {
      event: 'organization.created',
      data: {
        id: 'org_invalid_sig',
        name: 'Invalid Sig Org',
        owner_email: 'invalid@example.com',
      },
    };
    const bodyStr = JSON.stringify(payload);

    const response = await request.post('/api/webhooks/dos-org-sync', {
      data: bodyStr,
      headers: {
        'Content-Type': 'application/json',
        'X-DOS-Signature': 'sha256=invalid_signature_hash_1234567890abcdef',
      },
    });

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should process organization.created event with valid signature', async ({ request }) => {
    const timestamp = Date.now();
    const testOrgId = `org_test_${timestamp}`;
    const testOwnerEmail = `owner_${timestamp}@crove.test`;
    const orgName = `Test Enterprise Org ${timestamp}`;
    const orgSlug = `test-org-${timestamp}`;

    const payload = {
      event: 'organization.created',
      data: {
        id: testOrgId,
        name: orgName,
        slug: orgSlug,
        owner_email: testOwnerEmail,
        owner_name: 'Test Owner',
      },
    };
    const bodyStr = JSON.stringify(payload);
    const signature = generateSignature(bodyStr, webhookSecret);

    const response = await request.post('/api/webhooks/dos-org-sync', {
      data: bodyStr,
      headers: {
        'Content-Type': 'application/json',
        'X-DOS-Signature': signature,
      },
    });

    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);

    // Verify organization and user were created in database
    const createdOrg = await prisma.organisation.findFirst({
      where: { OR: [{ id: testOrgId }, { url: orgSlug }] },
      include: { members: true, teams: true },
    });

    expect(createdOrg).toBeTruthy();
    expect(createdOrg?.name).toBe(orgName);

    const owner = await prisma.user.findFirst({
      where: { email: testOwnerEmail.toLowerCase() },
    });
    expect(owner).toBeTruthy();
  });

  test('should process organization.updated event', async ({ request }) => {
    const timestamp = Date.now();
    const testOrgId = `org_update_${timestamp}`;
    const testOwnerEmail = `owner_up_${timestamp}@crove.test`;

    // 1. Create initial org
    const initialPayload = {
      event: 'organization.created',
      data: {
        id: testOrgId,
        name: `Initial Name ${timestamp}`,
        slug: `initial-slug-${timestamp}`,
        owner_email: testOwnerEmail,
      },
    };
    const initialBody = JSON.stringify(initialPayload);
    await request.post('/api/webhooks/dos-org-sync', {
      data: initialBody,
      headers: {
        'Content-Type': 'application/json',
        'X-DOS-Signature': generateSignature(initialBody, webhookSecret),
      },
    });

    // 2. Send update event
    const updatedName = `Updated Name ${timestamp}`;
    const updatePayload = {
      event: 'organization.updated',
      data: {
        id: testOrgId,
        name: updatedName,
        slug: `updated-slug-${timestamp}`,
      },
    };
    const updateBody = JSON.stringify(updatePayload);

    const response = await request.post('/api/webhooks/dos-org-sync', {
      data: updateBody,
      headers: {
        'Content-Type': 'application/json',
        'X-DOS-Signature': generateSignature(updateBody, webhookSecret),
      },
    });

    expect(response.status()).toBe(200);

    // Verify updated name
    const org = await prisma.organisation.findFirst({
      where: { id: testOrgId },
    });
    expect(org?.name).toBe(updatedName);
  });

  test('should process member_added and member_removed events', async ({ request }) => {
    const timestamp = Date.now();
    const testOrgId = `org_members_${timestamp}`;
    const testOwnerEmail = `owner_mem_${timestamp}@crove.test`;
    const newMemberEmail = `member_${timestamp}@crove.test`;

    // 1. Create Org
    const createPayload = {
      event: 'organization.created',
      data: {
        id: testOrgId,
        name: `Member Org ${timestamp}`,
        slug: `member-org-${timestamp}`,
        owner_email: testOwnerEmail,
      },
    };
    const createBody = JSON.stringify(createPayload);
    await request.post('/api/webhooks/dos-org-sync', {
      data: createBody,
      headers: {
        'Content-Type': 'application/json',
        'X-DOS-Signature': generateSignature(createBody, webhookSecret),
      },
    });

    // 2. Add member
    const addMemberPayload = {
      event: 'organization.member_added',
      data: {
        org_id: testOrgId,
        user_email: newMemberEmail,
        user_name: 'New Member',
        role: 'MEMBER',
      },
    };
    const addMemberBody = JSON.stringify(addMemberPayload);
    const addRes = await request.post('/api/webhooks/dos-org-sync', {
      data: addMemberBody,
      headers: {
        'Content-Type': 'application/json',
        'X-DOS-Signature': generateSignature(addMemberBody, webhookSecret),
      },
    });
    expect(addRes.status()).toBe(200);

    // Verify member exists
    const user = await prisma.user.findFirst({
      where: { email: newMemberEmail.toLowerCase() },
    });
    expect(user).toBeTruthy();

    const member = await prisma.organisationMember.findUnique({
      where: {
        userId_organisationId: {
          userId: user!.id,
          organisationId: testOrgId,
        },
      },
    });
    expect(member).toBeTruthy();

    // 3. Remove member
    const removeMemberPayload = {
      event: 'organization.member_removed',
      data: {
        org_id: testOrgId,
        user_email: newMemberEmail,
      },
    };
    const removeMemberBody = JSON.stringify(removeMemberPayload);
    const removeRes = await request.post('/api/webhooks/dos-org-sync', {
      data: removeMemberBody,
      headers: {
        'Content-Type': 'application/json',
        'X-DOS-Signature': generateSignature(removeMemberBody, webhookSecret),
      },
    });
    expect(removeRes.status()).toBe(200);

    // Verify membership removed
    const memberAfter = await prisma.organisationMember.findUnique({
      where: {
        userId_organisationId: {
          userId: user!.id,
          organisationId: testOrgId,
        },
      },
    });
    expect(memberAfter).toBeNull();
  });
});
