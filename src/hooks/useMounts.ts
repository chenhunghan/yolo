import { invoke } from "@tauri-apps/api/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { LimaConfig, Mount } from "src/types/LimaConfig";

export function useMounts(instanceName: string | null) {
  const queryClient = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ["lima-config", instanceName],
    queryFn: () => invoke<LimaConfig>("read_lima_yaml_cmd", { instanceName }),
    enabled: !!instanceName,
  });

  const mounts: Mount[] = config?.mounts ?? [];

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["lima-config", instanceName] });
  }, [queryClient, instanceName]);

  const addMount = useCallback(
    async (hostPath: string, mountPoint: string, writable: boolean) => {
      if (!instanceName) return;
      await invoke("add_mount_cmd", { instanceName, hostPath, mountPoint, writable });
      invalidate();
    },
    [instanceName, invalidate],
  );

  const removeMount = useCallback(
    async (hostPath: string) => {
      if (!instanceName) return;
      await invoke("remove_mount_cmd", { instanceName, hostPath });
      invalidate();
    },
    [instanceName, invalidate],
  );

  const copyFileToGuest = useCallback(
    async (hostPath: string, guestPath: string) => {
      if (!instanceName) return;
      await invoke("copy_file_to_guest_cmd", { instanceName, hostPath, guestPath });
    },
    [instanceName],
  );

  const existingMountPoints = mounts
    .map((m) => m.mountPoint)
    .filter((p): p is string => !!p);

  return { mounts, addMount, removeMount, copyFileToGuest, existingMountPoints };
}
