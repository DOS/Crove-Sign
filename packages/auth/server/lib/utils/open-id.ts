import { assertNotPrivateUrl } from '@documenso/lib/server-only/webhooks/assert-webhook-url';
import { z } from 'zod';

const ZOpenIdConfigurationSchema = z.object({
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  userinfo_endpoint: z.string().optional(),
  scopes_supported: z.array(z.string()).optional(),
});

type OpenIdConfiguration = z.infer<typeof ZOpenIdConfigurationSchema>;

type GetOpenIdConfigurationOptions = {
  requiredScopes?: string[];
};

export const getOpenIdConfiguration = async (
  wellKnownUrl: string,
  _options: GetOpenIdConfigurationOptions = {},
): Promise<OpenIdConfiguration> => {
  // The discovery URL is operator-supplied — it comes from an organisation's
  // authentication portal row or from NEXT_PRIVATE_OIDC_WELL_KNOWN — so it is
  // treated like any other outbound target. A self-hosted identity provider on a
  // private address must be listed in NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS.
  await assertNotPrivateUrl(wellKnownUrl);

  const response = await fetch(wellKnownUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC configuration: ${response.statusText}`);
  }

  const rawConfig = await response.json();

  const config = ZOpenIdConfigurationSchema.parse(rawConfig);

  // Validate required endpoints
  if (!config.authorization_endpoint) {
    throw new Error('Missing authorization_endpoint in OIDC configuration');
  }

  return config;
};
