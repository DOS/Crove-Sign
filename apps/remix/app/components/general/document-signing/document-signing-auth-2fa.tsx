import { AppError } from '@documenso/lib/errors/app-error';
import { DocumentAuth, type TRecipientActionAuth } from '@documenso/lib/types/document-auth';
import { trpc } from '@documenso/trpc/react';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import { DialogFooter } from '@documenso/ui/primitives/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@documenso/ui/primitives/form/form';
import { PinInput, PinInputGroup, PinInputSlot } from '@documenso/ui/primitives/pin-input';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { ArrowLeftIcon, KeyIcon, MailIcon, RotateCwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { EnableAuthenticatorAppDialog } from '~/components/forms/2fa/enable-authenticator-app-dialog';

import { useRequiredDocumentSigningAuthContext } from './document-signing-auth-provider';

export type DocumentSigningAuth2FAProps = {
  actionTarget?: 'FIELD' | 'DOCUMENT';
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onReauthFormSubmit: (values?: TRecipientActionAuth) => Promise<void> | void;
};

const Z2FAAuthFormSchema = z.object({
  token: z
    .string()
    .min(6, { message: 'Token must be 6 characters long' })
    .max(6, { message: 'Token must be 6 characters long' }),
});

type T2FAAuthFormSchema = z.infer<typeof Z2FAAuthFormSchema>;

type TwoFactorMethod = 'email' | 'authenticator';

export const DocumentSigningAuth2FA = ({
  actionTarget = 'FIELD',
  onReauthFormSubmit,
  open,
  onOpenChange,
}: DocumentSigningAuth2FAProps) => {
  const { recipient, user, isCurrentlyAuthenticating, setIsCurrentlyAuthenticating } =
    useRequiredDocumentSigningAuthContext();

  const { _ } = useLingui();
  const { toast } = useToast();

  const [selectedMethod, setSelectedMethod] = useState<TwoFactorMethod | null>(() => {
    // If user has authenticator enabled, allow choosing or default to authenticator
    if (user?.twoFactorEnabled) {
      return 'authenticator';
    }
    // Otherwise default to email OTP
    return 'email';
  });

  const [hasSentEmail, setHasSentEmail] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [is2FASetupSuccessful, setIs2FASetupSuccessful] = useState(false);
  const [formErrorCode, setFormErrorCode] = useState<string | null>(null);

  const form = useForm<T2FAAuthFormSchema>({
    resolver: zodResolver(Z2FAAuthFormSchema),
    defaultValues: {
      token: '',
    },
  });

  const { mutateAsync: request2FAEmail } = trpc.document.accessAuth.request2FAEmail.useMutation();

  const sendEmailOtp = async () => {
    if (!recipient.token) {
      return;
    }

    try {
      setIsSendingEmail(true);
      await request2FAEmail({
        token: recipient.token,
      });

      setHasSentEmail(true);
      setIsSendingEmail(false);

      toast({
        title: _(msg`Verification Code Sent`),
        description: _(
          msg`A 6-digit verification code has been sent to ${recipient.email}. Please check your inbox.`,
        ),
      });
    } catch (err) {
      setIsSendingEmail(false);
      const error = AppError.parseError(err);
      toast({
        title: _(msg`Error sending code`),
        description: error.message || _(msg`Could not send verification email. Please try again.`),
        variant: 'destructive',
      });
    }
  };

  const onFormSubmit = async ({ token }: T2FAAuthFormSchema) => {
    try {
      setIsCurrentlyAuthenticating(true);

      await onReauthFormSubmit({
        type: DocumentAuth.TWO_FACTOR_AUTH,
        token,
        method: selectedMethod || 'email',
      });

      setIsCurrentlyAuthenticating(false);
      onOpenChange(false);
    } catch (err) {
      setIsCurrentlyAuthenticating(false);
      const error = AppError.parseError(err);
      setFormErrorCode(error.code);
    }
  };

  useEffect(() => {
    form.reset({
      token: '',
    });

    setIs2FASetupSuccessful(false);
    setFormErrorCode(null);
    setHasSentEmail(false);

    // Auto-select initial method
    if (user?.twoFactorEnabled) {
      setSelectedMethod('authenticator');
    } else {
      setSelectedMethod('email');
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="space-y-4">
      {/* Method switcher if user has both options */}
      {user?.twoFactorEnabled && (
        <div className="flex rounded-lg border p-1 bg-muted/30">
          <Button
            type="button"
            variant={selectedMethod === 'authenticator' ? 'default' : 'ghost'}
            size="sm"
            className="flex-1 text-xs gap-1.5"
            onClick={() => {
              setSelectedMethod('authenticator');
              setFormErrorCode(null);
            }}
          >
            <KeyIcon className="h-3.5 w-3.5" />
            <Trans>Authenticator App</Trans>
          </Button>

          <Button
            type="button"
            variant={selectedMethod === 'email' ? 'default' : 'ghost'}
            size="sm"
            className="flex-1 text-xs gap-1.5"
            onClick={() => {
              setSelectedMethod('email');
              setFormErrorCode(null);
              if (!hasSentEmail) {
                void sendEmailOtp();
              }
            }}
          >
            <MailIcon className="h-3.5 w-3.5" />
            <Trans>Email OTP Code</Trans>
          </Button>
        </div>
      )}

      {selectedMethod === 'email' ? (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                <Trans>Recipient Email:</Trans> <strong className="text-foreground">{recipient.email}</strong>
              </span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                loading={isSendingEmail}
                onClick={sendEmailOtp}
              >
                <RotateCwIcon className="h-3 w-3" />
                {hasSentEmail ? <Trans>Resend Code</Trans> : <Trans>Send Code</Trans>}
              </Button>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onFormSubmit)}>
              <fieldset disabled={isCurrentlyAuthenticating}>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="token"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>
                          <Trans>Enter 6-digit Email Code</Trans>
                        </FormLabel>

                        <FormControl>
                          <PinInput {...field} value={field.value ?? ''} maxLength={6}>
                            {Array(6)
                              .fill(null)
                              .map((_, i) => (
                                <PinInputGroup key={i}>
                                  <PinInputSlot index={i} />
                                </PinInputGroup>
                              ))}
                          </PinInput>
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {formErrorCode && (
                    <Alert variant="destructive">
                      <AlertTitle>
                        <Trans>Verification Failed</Trans>
                      </AlertTitle>
                      <AlertDescription>
                        <Trans>The code you entered is invalid or expired. Please check your email or click Resend Code.</Trans>
                      </AlertDescription>
                    </Alert>
                  )}

                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                      <Trans>Cancel</Trans>
                    </Button>

                    <Button type="submit" loading={isCurrentlyAuthenticating}>
                      <Trans>Verify & Sign</Trans>
                    </Button>
                  </DialogFooter>
                </div>
              </fieldset>
            </form>
          </Form>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onFormSubmit)}>
            <fieldset disabled={isCurrentlyAuthenticating}>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>
                        <Trans>Enter 6-digit Authenticator Code</Trans>
                      </FormLabel>

                      <FormControl>
                        <PinInput {...field} value={field.value ?? ''} maxLength={6}>
                          {Array(6)
                            .fill(null)
                            .map((_, i) => (
                              <PinInputGroup key={i}>
                                <PinInputSlot index={i} />
                              </PinInputGroup>
                            ))}
                        </PinInput>
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                {formErrorCode && (
                  <Alert variant="destructive">
                    <AlertTitle>
                      <Trans>Unauthorized</Trans>
                    </AlertTitle>
                    <AlertDescription>
                      <Trans>We were unable to verify your authenticator code. Please try again or switch to Email OTP.</Trans>
                    </AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                    <Trans>Cancel</Trans>
                  </Button>

                  <Button type="submit" loading={isCurrentlyAuthenticating}>
                    <Trans>Verify & Sign</Trans>
                  </Button>
                </DialogFooter>
              </div>
            </fieldset>
          </form>
        </Form>
      )}
    </div>
  );
};
