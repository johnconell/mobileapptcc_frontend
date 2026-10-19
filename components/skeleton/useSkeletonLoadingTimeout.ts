import { useEffect, useState } from 'react';

export function useSkeletonLoadingTimeout(
  isLoading: boolean,
  timeoutMs = 10_000,
  retryKey: string | number = 0,
) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return undefined;
    }

    setTimedOut(false);
    const timeout = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timeout);
  }, [isLoading, timeoutMs, retryKey]);

  return timedOut;
}
