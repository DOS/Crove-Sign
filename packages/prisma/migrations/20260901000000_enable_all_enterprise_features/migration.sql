-- Update default SubscriptionClaim entries to unlock all Enterprise features
UPDATE "SubscriptionClaim"
SET 
  "teamCount" = 0,
  "memberCount" = 0,
  "envelopeItemCount" = 100,
  "recipientCount" = 100,
  "flags" = jsonb_build_object(
    'allowCustomBranding', true,
    'hidePoweredBy', true,
    'unlimitedDocuments', true,
    'emailDomains', true,
    'embedAuthoring', true,
    'embedAuthoringWhiteLabel', true,
    'embedSigning', true,
    'embedSigningWhiteLabel', true,
    'cfr21', true,
    'hipaa', true,
    'authenticationPortal', true,
    'allowLegacyEnvelopes', true,
    'signingReminders', true,
    'cscQesSigning', true,
    'disableEmails', false
  ),
  "updatedAt" = NOW()
WHERE "id" IN ('free', 'enterprise', 'individual', 'team', 'platform', 'earlyAdopter');

-- Update all existing OrganisationClaim rows to unlock all Enterprise features
UPDATE "OrganisationClaim"
SET
  "teamCount" = 0,
  "memberCount" = 0,
  "envelopeItemCount" = 100,
  "recipientCount" = 100,
  "flags" = jsonb_build_object(
    'allowCustomBranding', true,
    'hidePoweredBy', true,
    'unlimitedDocuments', true,
    'emailDomains', true,
    'embedAuthoring', true,
    'embedAuthoringWhiteLabel', true,
    'embedSigning', true,
    'embedSigningWhiteLabel', true,
    'cfr21', true,
    'hipaa', true,
    'authenticationPortal', true,
    'allowLegacyEnvelopes', true,
    'signingReminders', true,
    'cscQesSigning', true,
    'disableEmails', false
  ),
  "updatedAt" = NOW();
