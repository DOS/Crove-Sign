import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CopyIcon,
  FileTextIcon,
  Loader2Icon,
  ShieldCheckIcon,
  UploadCloudIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { appMetaTags } from '~/utils/meta';

export function meta() {
  return appMetaTags(msg`Verify Document - Blockchain Integrity Receipt`);
}

export default function VerifyDocumentPage() {
  const { _ } = useLingui();

  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [clientHash, setClientHash] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const calculateFileSha256 = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return '0x' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const handleFileProcess = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert(_(msg`Please upload a valid PDF document.`));
      return;
    }

    setIsLoading(true);
    setSelectedFileName(file.name);
    setVerificationResult(null);

    try {
      // 1. Calculate SHA-256 hash in browser
      const hash = await calculateFileSha256(file);
      setClientHash(hash);

      // 2. Submit file to verification API
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/v1/attestation/verify', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setVerificationResult(data.result);
      } else {
        setVerificationResult({
          isValid: false,
          status: 'NOT_FOUND',
          documentHash: hash,
          disclaimer: data.message || _(msg`Verification failed.`),
        });
      }
    } catch (error) {
      console.error('Error during document verification:', error);
      setVerificationResult({
        isValid: false,
        status: 'NOT_FOUND',
        documentHash: clientHash || '0x0',
        disclaimer: _(msg`An unexpected error occurred while communicating with the verification service.`),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheckIcon className="h-8 w-8 text-emerald-500" />
        </div>
        <h1 className="font-bold text-3xl tracking-tight text-foreground md:text-4xl">
          <Trans>Document Integrity Verification</Trans>
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-muted-foreground text-sm md:text-base">
          <Trans>
            Verify the cryptographic tamper-evident receipt and on-chain attestation of any signed document on DOS Chain / EAS.
          </Trans>
        </p>
      </div>

      {/* Drag & Drop Upload Card */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            <Trans>Upload Final PDF</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>Drag and drop your sealed document to compute its SHA-256 hash and verify on-chain records.</Trans>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border/80 hover:border-primary/50'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileProcess(file);
            }}
            onClick={() => {
              document.getElementById('verify-file-input')?.click();
            }}
          >
            <input
              id="verify-file-input"
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileProcess(file);
              }}
            />

            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2Icon className="h-10 w-10 animate-spin text-primary" />
                <p className="font-medium text-sm text-foreground">
                  <Trans>Computing cryptographic hash and querying DOS Chain...</Trans>
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <UploadCloudIcon className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-foreground">
                  <Trans>Click to browse or drag & drop sealed PDF here</Trans>
                </p>
                <p className="text-muted-foreground text-xs">
                  <Trans>PDF files only (client-side SHA-256 computation)</Trans>
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Verification Result Card */}
      {verificationResult && (
        <div className="mt-8 space-y-6">
          <Card
            className={`border ${
              verificationResult.isValid
                ? 'border-emerald-500/40 bg-emerald-50/10'
                : 'border-amber-500/40 bg-amber-50/10'
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="flex items-center gap-3">
                {verificationResult.isValid ? (
                  <CheckCircle2Icon className="h-8 w-8 text-emerald-500" />
                ) : (
                  <AlertCircleIcon className="h-8 w-8 text-amber-500" />
                )}
                <div>
                  <CardTitle className="text-xl">
                    {verificationResult.isValid ? (
                      <Trans>Blockchain Integrity Verified</Trans>
                    ) : (
                      <Trans>No On-Chain Record Found</Trans>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {verificationResult.isValid
                      ? _(msg`This document matches byte-for-byte with the tamper-evident attestation on DOS Chain.`)
                      : _(msg`The cryptographic hash of this file does not match any confirmed blockchain receipt.`)}
                  </CardDescription>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 font-semibold text-xs ${
                  verificationResult.isValid
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}
              >
                {verificationResult.status}
              </span>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border bg-background p-3">
                  <span className="text-muted-foreground text-xs font-semibold uppercase">
                    <Trans>Computed SHA-256 Hash</Trans>
                  </span>
                  <div className="mt-1 flex items-center justify-between">
                    <code className="truncate text-xs text-foreground font-mono">{verificationResult.documentHash}</code>
                    <button
                      className="ml-2 text-muted-foreground hover:text-foreground"
                      onClick={() => copyToClipboard(verificationResult.documentHash, 'hash')}
                      title="Copy Hash"
                    >
                      <CopyIcon className="h-4 w-4" />
                    </button>
                  </div>
                  {copiedField === 'hash' && (
                    <span className="text-[10px] text-emerald-600 font-medium"><Trans>Copied!</Trans></span>
                  )}
                </div>

                {verificationResult.attestationUid && (
                  <div className="rounded-lg border bg-background p-3">
                    <span className="text-muted-foreground text-xs font-semibold uppercase">
                      <Trans>EAS Attestation UID</Trans>
                    </span>
                    <div className="mt-1 flex items-center justify-between">
                      <code className="truncate text-xs text-foreground font-mono">{verificationResult.attestationUid}</code>
                      <button
                        className="ml-2 text-muted-foreground hover:text-foreground"
                        onClick={() => copyToClipboard(verificationResult.attestationUid, 'uid')}
                        title="Copy UID"
                      >
                        <CopyIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {copiedField === 'uid' && (
                      <span className="text-[10px] text-emerald-600 font-medium"><Trans>Copied!</Trans></span>
                    )}
                  </div>
                )}
              </div>

              {verificationResult.isValid && (
                <div className="rounded-lg border bg-background p-4 space-y-3">
                  <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <FileTextIcon className="h-4 w-4 text-primary" />
                    <Trans>Attestation Details</Trans>
                  </h4>
                  <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
                    <div>
                      <span className="text-muted-foreground"><Trans>Document Title</Trans>:</span>
                      <p className="font-medium text-foreground">{verificationResult.envelopeTitle || 'Document'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground"><Trans>Anchored At</Trans>:</span>
                      <p className="font-medium text-foreground">{verificationResult.anchoredAt ? new Date(verificationResult.anchoredAt).toLocaleString() : 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground"><Trans>Network</Trans>:</span>
                      <p className="font-medium text-foreground">DOS Chain (EAS Layer)</p>
                    </div>
                  </div>

                  {verificationResult.signers && verificationResult.signers.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <span className="text-muted-foreground text-xs"><Trans>Signers</Trans>:</span>
                      <div className="mt-1 space-y-1">
                        {verificationResult.signers.map((signer: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="text-foreground font-medium">{signer.name} ({signer.email})</span>
                            <span className="text-muted-foreground capitalize">{signer.role}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Legal & Technical Disclaimer */}
              <div className="rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground leading-relaxed">
                <strong><Trans>Disclaimer</Trans>:</strong> {verificationResult.disclaimer}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-12 text-center">
        <Button variant="outline" asChild>
          <Link to="/">
            <Trans>Back to Home</Trans>
          </Link>
        </Button>
      </div>
    </div>
  );
}
