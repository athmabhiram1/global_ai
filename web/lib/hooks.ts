"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type DecisionListItem, type RepItem } from "./api";

export interface PollState<T> {
  data: T | null;
  error: string | null;
  connected: boolean;
  refresh: () => void;
}

/**
 * Polls the decisions ledger every 5s while mounted. Keeps the last
 * successful payload on failure and flips `connected` to false instead of
 * fabricating rows.
 */
export function useDecisions(pollMs = 5000): PollState<DecisionListItem[]> {
  const [data, setData] = useState<DecisionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    api
      .decisions()
      .then((rows) => {
        setData(rows);
        setError(null);
        setConnected(true);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setConnected(false);
      });
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, pollMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh, pollMs]);

  return { data, error, connected, refresh };
}

/** Polls source reputation every 15s. Same honest-disconnect semantics. */
export function useReputation(pollMs = 15000): PollState<RepItem[]> {
  const [data, setData] = useState<RepItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    api
      .reputation()
      .then((rows) => {
        setData(rows);
        setError(null);
        setConnected(true);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setConnected(false);
      });
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, pollMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh, pollMs]);

  return { data, error, connected, refresh };
}
