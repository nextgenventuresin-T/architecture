import { useCallback, useEffect, useState } from 'react';
import { toApiError } from '../api/axiosClient';

/**
 * Runs an async loader and tracks loading/error/data for it. Every screen in
 * this interface uses it so loading and error states behave identically.
 *
 * `deps` controls when the loader re-runs, exactly like useEffect.
 */
export function useAsync(loader, deps = []) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await run());
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setIsLoading(false);
    }
  }, [run]);

  useEffect(() => {
    let active = true;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await run();
        if (active) setData(result);
      } catch (caught) {
        if (active) setError(toApiError(caught));
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [run]);

  return { data, isLoading, error, reload, setData };
}

export default useAsync;
