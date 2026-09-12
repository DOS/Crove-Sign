import { Prisma } from '@prisma/client';
import { z } from 'zod';

const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

const readConflictTarget = (meta: unknown): string => {
  const asArray = z.array(z.string()).safeParse(meta);

  if (asArray.success) {
    return asArray.data.join(',');
  }

  const asString = z.string().safeParse(meta);

  if (asString.success) {
    return asString.data;
  }

  return '';
};

/**
 * The column a unique-constraint violation was raised against, or null when the
 * error is something else entirely.
 *
 * Prisma reports the target either as a list of columns or as the constraint
 * name, so both shapes are reduced to one searchable string.
 */
export const readPrismaUniqueConflictTarget = (error: unknown): string | null => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }

  if (error.code !== PRISMA_UNIQUE_CONSTRAINT_CODE) {
    return null;
  }

  return readConflictTarget(error.meta?.target);
};

export const isPrismaConflictOn = (error: unknown, column: string): boolean => {
  const target = readPrismaUniqueConflictTarget(error);

  return target?.includes(column) ?? false;
};
