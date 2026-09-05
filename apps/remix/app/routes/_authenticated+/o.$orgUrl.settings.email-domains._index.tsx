import { useCurrentOrganisation } from '@documenso/lib/client-only/providers/organisation';
import { IS_BILLING_ENABLED, IS_DOCUMENSO_CLOUD } from '@documenso/lib/constants/app';
import { canExecuteOrganisationAction } from '@documenso/lib/utils/organisations';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';

import { OrganisationEmailDomainCreateDialog } from '~/components/dialogs/organisation-email-domain-create-dialog';
import { SettingsHeader } from '~/components/general/settings-header';
import { EmailDomainsUpsell } from '~/components/general/settings-upsell/email-domains-upsell';
import { OrganisationEmailDomainsDataTable } from '~/components/tables/organisation-email-domains-table';
import { appMetaTags } from '~/utils/meta';

export function meta() {
  return appMetaTags(msg`Email Domains`);
}

export default function OrganisationSettingsEmailDomains() {
  const { t } = useLingui();

  const organisation = useCurrentOrganisation();

  const isEmailDomainsEnabled = true;

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
