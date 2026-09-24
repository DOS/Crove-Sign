import { Button } from '@documenso/ui/primitives/button';
import { Trans } from '@lingui/react/macro';
import { Link } from 'react-router';

// PLACEHOLDER LEGAL TEXT: replace with terms reviewed for the operating
// entity before relying on them commercially.
export default function TermsOfService() {
  return (
    <div>
      <article className="prose dark:prose-invert">
        <h1>
          <Trans>Terms of Service</Trans>
        </h1>

        <p>
          <Trans>
            Last updated: September 2026. These terms govern your use of Crove Sign, the electronic signature service
            operated as part of the Crove OS ecosystem.
          </Trans>
        </p>

        <h2>
          <Trans>1. Acceptance of Terms</Trans>
        </h2>
        <p>
          <Trans>
            By creating an account or using Crove Sign you agree to these Terms of Service. If you use the service on
            behalf of an organisation, you confirm that you are authorised to bind that organisation.
          </Trans>
        </p>

        <h2>
          <Trans>2. The Service</Trans>
        </h2>
        <p>
          <Trans>
            Crove Sign lets you prepare, send, sign, and manage documents electronically, including advanced electronic
            signatures and optional blockchain-sealed attestation records. The service is provided through the web
            application and its associated APIs.
          </Trans>
        </p>

        <h2>
          <Trans>3. Your Account</Trans>
        </h2>
        <p>
          <Trans>
            You are responsible for safeguarding the credentials to your identity provider account, for the accuracy of
            the information you provide, and for all activity carried out under your account.
          </Trans>
        </p>

        <h2>
          <Trans>4. Your Documents and Content</Trans>
        </h2>
        <p>
          <Trans>
            You retain all rights to the documents you upload and the signatures you apply. You grant us only the
            limited rights needed to store, process, and deliver those documents as part of providing the service.
          </Trans>
        </p>

        <h2>
          <Trans>5. Legal Effect of Electronic Signatures</Trans>
        </h2>
        <p>
          <Trans>
            Electronic signatures carry legal effect under applicable law when the signatory intends to sign. You are
            responsible for ensuring that your use of electronic signatures satisfies the legal requirements of your
            jurisdiction and document type.
          </Trans>
        </p>

        <h2>
          <Trans>6. Acceptable Use</Trans>
        </h2>
        <p>
          <Trans>
            You may not use the service to send unwanted signing requests, to mislead signers about what they are
            signing, or for any unlawful purpose.
          </Trans>
        </p>

        <h2>
          <Trans>7. Availability and Changes</Trans>
        </h2>
        <p>
          <Trans>
            We may modify or discontinue features, and may update these terms. Material changes will be communicated
            through the service before taking effect.
          </Trans>
        </p>

        <h2>
          <Trans>8. Limitation of Liability</Trans>
        </h2>
        <p>
          <Trans>
            To the maximum extent permitted by law, the service is provided "as is" and we are not liable for indirect
            or consequential damages arising from your use of the service.
          </Trans>
        </p>

        <h2>
          <Trans>9. Contact</Trans>
        </h2>
        <p>
          <Trans>Questions about these terms can be sent through the support channels of the Crove OS ecosystem.</Trans>
        </p>
      </article>

      <Link to="/signin" className="mt-8 inline-block">
        <Button>
          <Trans>Back to sign in</Trans>
        </Button>
      </Link>
    </div>
  );
}
