import { useEffect, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Log, LogState } from "src/types/Log";
import { insertLog } from "src/services/insertLog";

interface LimaLogPayload {
  instance_name: string;
  message: string;
  message_id: string;
  timestamp: string;
}

const DEFAULT_LIMA_START_STATE: LogState = {
  error: [],
  isLoading: false,
  isSuccess: undefined,
  stderr: [],
  stdout: [],
};

const getStartLogsQueryKey = (instanceName: string) => ["lima", "start-logs", instanceName];

/**
 * Tracks logs for the "start instance" operation.
 * The instance is only considered ready when `isSuccess` is true,
 * meaning all probes (including claude CLI availability) have passed.
 */
export function useOnLimaStartLogs(
  instanceName: string,
  options?: { onSuccess?: () => void },
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => getStartLogsQueryKey(instanceName), [instanceName]);
  const onSuccessRef = useRef(options?.onSuccess);

  useEffect(() => {
    onSuccessRef.current = options?.onSuccess;
  }, [options?.onSuccess]);

  const { data } = useQuery({
    gcTime: Infinity,
    initialData: DEFAULT_LIMA_START_STATE,
    queryFn: () => queryClient.getQueryData<LogState>(queryKey),
    queryKey,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!instanceName) {
      return;
    }

    let active = true;
    const unlistenPromises: Promise<() => void>[] = [];

    const updateCache = (updater: (prev: LogState) => LogState) => {
      if (!active) {
        return;
      }
      queryClient.setQueryData<LogState>(queryKey, (prev) => {
        if (!prev) {
          return DEFAULT_LIMA_START_STATE;
        }
        return updater(prev);
      });
    };

    // 1. Start
    unlistenPromises.push(
      listen<LimaLogPayload>("lima-instance-start", (event) => {
        if (event.payload.instance_name !== instanceName) {
          return;
        }
        updateCache(() => ({
          ...DEFAULT_LIMA_START_STATE,
          isLoading: true,
        }));
      }),
    );

    // 2. Stdout
    unlistenPromises.push(
      listen<LimaLogPayload>("lima-instance-start-stdout", (event) => {
        const { instance_name, message, message_id, timestamp } = event.payload;
        if (instance_name !== instanceName) {
          return;
        }
        updateCache((prev) => {
          if (prev.stdout.some((l) => l.id === message_id)) {
            return prev;
          }
          const newLog: Log = { id: message_id, message, timestamp };
          return { ...prev, stdout: insertLog(prev.stdout, newLog) };
        });
      }),
    );

    // 3. Stderr
    unlistenPromises.push(
      listen<LimaLogPayload>("lima-instance-start-stderr", (event) => {
        const { instance_name, message, message_id, timestamp } = event.payload;
        if (instance_name !== instanceName) {
          return;
        }
        updateCache((prev) => {
          if (prev.stderr.some((l) => l.id === message_id)) {
            return prev;
          }
          const newLog: Log = { id: message_id, message, timestamp };
          return { ...prev, stderr: insertLog(prev.stderr, newLog) };
        });
      }),
    );

    // 4. Error
    unlistenPromises.push(
      listen<LimaLogPayload>("lima-instance-start-error", (event) => {
        if (event.payload.instance_name !== instanceName) {
          return;
        }
        const { message, message_id, timestamp } = event.payload;
        updateCache((prev) => {
          if (prev.error.some((l) => l.id === message_id)) {
            return prev;
          }
          const newLog: Log = { id: message_id, message, timestamp };
          return { ...prev, isLoading: false, error: insertLog(prev.error, newLog) };
        });
      }),
    );

    // 5. Success — all probes passed, everything is installed
    unlistenPromises.push(
      listen<LimaLogPayload>("lima-instance-start-success", (event) => {
        if (event.payload.instance_name !== instanceName) {
          return;
        }
        updateCache((prev) => ({
          ...prev,
          isLoading: false,
          isSuccess: true,
        }));
        queryClient.invalidateQueries({ queryKey: ["instances"] });
        onSuccessRef.current?.();
      }),
    );

    return () => {
      active = false;
      void Promise.allSettled(unlistenPromises).then((results) => {
        for (const result of results) {
          if (result.status === "fulfilled") {
            try {
              result.value();
            } catch {
              // already cleaned up
            }
          }
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceName, queryClient, queryKey]);

  return {
    error: data?.error ?? [],
    isLoading: data?.isLoading ?? false,
    isSuccess: data?.isSuccess,
    reset: () => queryClient.setQueryData(queryKey, DEFAULT_LIMA_START_STATE),
    stderr: data?.stderr ?? [],
    stdout: data?.stdout ?? [],
  };
}
