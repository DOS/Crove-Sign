import { Button } from '@documenso/ui/primitives/button';
import { Trans } from '@lingui/react/macro';
import { Link } from 'react-router';

// PLACEHOLDER LEGAL TEXT: replace with a privacy policy reviewed for the
// operating entity before relying on it commercially.
export default function PrivacyPolicy() {
  return (
    <div>
      <article className="prose dark:prose-invert">
        <h1>
          <Trans>Privacy Policy</Trans>
        </h1>

        <p>
          <Trans>
            Last updated: September 2026. This policy explains what personal data Crove Sign processes, why, and the
            choices you have.
          </Trans>
        </p>

        <h2>
          <Trans>1. Data We Process</Trans>
        </h2>
        <p>
          <Trans>
            Account data (name, email, avatar) synced from your identity provider, the documents you upload, signature
            and audit metadata, and technical logs such as IP address and user agent required to operate the service.
          </Trans>
        </p>

        <h2>
          <Trans>2. Why We Process It</Trans>
        </h2>
        <p>
          <Trans>
            To provide the signing service, keep documents and audit trails verifiable, send you transactional emails
            about your documents, prevent abuse, and comply with legal obligations.
          </Trans>
        </p>

        <h2>
          <Trans>3. Document Confidentiality</Trans>
        </h2>
        <p>
          <Trans>
            Your documents are processed only to deliver the service. We do not use your document contents for
            advertising or train models on them.
          </Trans>
        </p>

        <h2>
          <Trans>4. Data Sharing</Trans>
        </h2>
        <p>
          <Trans>
            We share data only with the infrastructure providers that operate the Crove OS ecosystem, with recipients
            and senders involved in a signing workflow, and where required by law.
          </Trans>
        </p>

        <h2>
          <Trans>5. Retention</Trans>
        </h2>
        <p>
          <Trans>
            Documents and audit records are retained while your account is active and as required for the integrity of
            completed signings. You can request deletion of your account and associated data.
          </Trans>
        </p>

        <h2>
          <Trans>6. Your Rights</Trans>
        </h2>
        <p>
          <Trans>
            You can access, correct, export, or delete your personal data through your account settings or by contacting
            support through the Crove OS ecosystem channels.
          </Trans>
        </p>

        <h2>
          <Trans>7. Contact</Trans>
        </h2>
        <p>
          <Trans>Privacy questions can be sent through the support channels of the Crove OS ecosystem.</Trans>
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
