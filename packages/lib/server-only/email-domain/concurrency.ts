import { MAX_CONCURRENT_EXTERNAL_OPERATIONS } from './constants';

export type Semaphore = {
  run: <TResult>(task: () => Promise<TResult>) => Promise<TResult>;
};

/**
 * A counting semaphore over asynchronous work.
 *
 * Tasks must never acquire the semaphore recursively, otherwise the pool can
 * deadlock waiting on a slot held by its own caller.
 */
export const createSemaphore = (limit: number): Semaphore => {
  let activeCount = 0;
  const waiters: Array<() => void> = [];

  const release = () => {
    const nextWaiter = waiters.shift();

    // Handing the slot straight to a waiter keeps `activeCount` correct without
    // a decrement/increment pair that another task could slip in between.
    if (nextWaiter) {
      nextWaiter();
      return;
    }

    activeCount -= 1;
  };

  const acquire = async (): Promise<void> => {
    if (activeCount < limit) {
      activeCount += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  };

  return {
    run: async (task) => {
      await acquire();

      try {
        return await task();
      } finally {
        release();
      }
    },
  };
};

/**
 * Shared ceiling for every outbound DNS and SES call.
 *
 * Verification is triggered both by an administrator pressing "Verify" — which
 * fans out across every domain in an organisation at once — and by an hourly job.
 * Without a process-wide bound a single click could open hundreds of concurrent
 * sockets to resolvers and to SES.
 */
export const externalOperationSemaphore = createSemaphore(MAX_CONCURRENT_EXTERNAL_OPERATIONS);
