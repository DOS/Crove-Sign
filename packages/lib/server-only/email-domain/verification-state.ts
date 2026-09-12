import { CONSECUTIVE_NEGATIVES_BEFORE_DOWNGRADE } from './constants';

/**
 * Consecutive authoritative negatives per row.
 *
 * The count lives in process memory because the persistence model has no column
 * for it. Undercounting is the only failure mode: a restart, or a fleet spread
 * across instances, resets the streak and simply delays a demotion. It can never
 * cause a demotion that the evidence does not support, which is the direction
 * that matters — an ACTIVE domain that is wrongly demoted stops sending mail for
 * a real customer.
 */
const negativeStreaks = new Map<string, number>();

export type NegativeStreakSubject = {
  emailDomainId: string;
  selector: string;
};

/**
 * The selector is part of the key so that reregistering a domain — which rotates
 * the selector and every record the administrator has to republish — starts from
 * a clean streak without an explicit reset.
 */
export const buildNegativeStreakKey = ({ emailDomainId, selector }: NegativeStreakSubject): string => {
  return `${emailDomainId}:${selector}`;
};

export const readNegativeStreak = (key: string): number => {
  return negativeStreaks.get(key) ?? 0;
};

export const recordDefinitiveNegative = (key: string): number => {
  const streak = readNegativeStreak(key) + 1;

  negativeStreaks.set(key, streak);

  return streak;
};

export const clearNegativeStreak = (key: string): void => {
  negativeStreaks.delete(key);
};

export const isDowngradeThresholdReached = (streak: number): boolean => {
  return streak >= CONSECUTIVE_NEGATIVES_BEFORE_DOWNGRADE;
};
