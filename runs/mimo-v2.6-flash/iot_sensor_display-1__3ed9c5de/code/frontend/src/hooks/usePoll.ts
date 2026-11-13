import { useEffect, useRef, useState } from "react";

type PollState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
};

export function usePoll<T>(
  load: () => Promise<T>,
  deps: unknown[],
  intervalMs = 10000,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const next = await loadRef.current();
        if (alive) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();
    const timer = window.setInterval(() => void run(), intervalMs);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, intervalMs]);

  return {
    data,
    error,
    loading,
    refresh: () => setTick((value) => value + 1),
  };
}
