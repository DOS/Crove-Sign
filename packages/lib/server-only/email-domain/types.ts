/**
 * A DNS record an administrator has to publish, in the shape consumed by the
 * tRPC response schema and the records dialog.
 */
export type EmailDomainDnsRecord = {
  name: string;
  value: string;
  type: string;
};

export type EmailDomainTransitionEvent =
  | 'created'
  | 'verified'
  | 'downgraded'
  | 'reregistered'
  | 'deleted'
  | 'takeover';
