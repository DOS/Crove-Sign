import { IS_EMAIL_DOMAINS_ENABLED } from '@documenso/lib/constants/app';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';

import { OrganisationEmailDomainCreateDialog } from '~/components/dialogs/organisation-email-domain-create-dialog';
import { SettingsHeader } from '~/components/general/settings-header';
import { OrganisationEmailDomainsDataTable } from '~/components/tables/organisation-email-domains-table';
import { appMetaTags } from '~/utils/meta';

export function meta() {
  return appMetaTags(msg`Email Domains`);
}

export default function OrganisationSettingsEmailDomains() {
  const { t } = useLingui();

  const isEmailDomainsEnabled = IS_EMAIL_DOMAINS_ENABLED();

  if (!isEmailDomainsEnabled) {
    return (
      <div>
        <SettingsHeader
          hideDivider
          title={t`Email Domains`}
          subtitle={t`Here you can add email domains to your organisation.`}
        />

        <Alert className="mt-8" variant="neutral">
          <AlertTitle>
            <Trans>Email Domains</Trans>
          </AlertTitle>

          <AlertDescription>
            <Trans>Custom sending domains are disabled on this installation.</Trans>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <SettingsHeader
        hideDivider
        title={t`Email Domains`}
        subtitle={t`Here you can add email domains to your organisation.`}
      >
        <OrganisationEmailDomainCreateDialog />
      </SettingsHeader>

      <section>
        <OrganisationEmailDomainsDataTable />
      </section>
    </div>
  );
}
