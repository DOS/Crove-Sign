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
