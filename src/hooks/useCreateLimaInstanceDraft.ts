import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LimaConfig, Mount } from "src/types/LimaConfig";
import { useDefaultYoloboxConfig } from "./useDefaultYoloboxConfig";
import { useLimaInstances } from "./useLimaInstances";

function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "folder";
}

const STARSHIP_MARKER = "starship";

const generateInstanceName = (existingNames?: Set<string>) => {
  for (let i = 0; i < 10; i++) {
    const name = `yolo-${Math.random().toString(36).substring(2, 6)}`;
    if (!existingNames || !existingNames.has(name)) return name;
  }
  return `yolo-${Math.random().toString(36).substring(2, 8)}`;
};

/**
 * Hook to manage a draft Lima configuration for creating a NEW yolobox instance.
 */
export function useCreateLimaInstanceDraft() {
  const { instances } = useLimaInstances();

  const existingNames = useMemo(
    () => new Set(instances.map((i) => i.name)),
    [instances],
  );

  const { defaultConfig, isLoading: isLoadingDefault } = useDefaultYoloboxConfig();

  const [instanceName, setInstanceName] = useState(() => generateInstanceName());
  const [memory, setMemory] = useState<string | undefined>(undefined);
  const [starship, setStarship] = useState(true);
  const [syncClaudeJson, setSyncClaudeJson] = useState(true);
  const [draftMounts, setDraftMounts] = useState<Mount[]>([]);
  const [guestHome, setGuestHome] = useState("/home/user.linux");

  useEffect(() => {
    invoke<string>("get_lima_guest_home_cmd").then(setGuestHome).catch(() => {});
  }, []);

  const addDraftMount = useCallback((hostPath: string, writable: boolean) => {
    setDraftMounts((prev) => [
      ...prev,
      { location: hostPath, mountPoint: `${guestHome}/${folderName(hostPath)}`, writable },
    ]);
  }, [guestHome]);

  const removeDraftMount = useCallback((hostPath: string) => {
    setDraftMounts((prev) => prev.filter((m) => m.location !== hostPath));
  }, []);

  const toggleDraftMountWritable = useCallback((hostPath: string) => {
    setDraftMounts((prev) =>
      prev.map((m) => m.location === hostPath ? { ...m, writable: !m.writable } : m),
    );
  }, []);

  const draftConfig = useMemo<LimaConfig | undefined>(() => {
    if (!defaultConfig) return undefined;
    let config = defaultConfig;
    if (memory) {
      config = { ...config, memory };
    }
    if (!starship && config.provision) {
      config = {
        ...config,
        provision: config.provision.filter((p) => !p.script.includes(STARSHIP_MARKER)),
      };
    }
    if (draftMounts.length > 0) {
      config = {
        ...config,
        mounts: [...(config.mounts ?? []), ...draftMounts],
      };
    }
    return config;
  }, [defaultConfig, memory, starship, draftMounts]);

  const isLoading = isLoadingDefault || !draftConfig;

  const resetDraft = useCallback(() => {
    setMemory(undefined);
    setStarship(true);
    setSyncClaudeJson(true);
    setDraftMounts([]);
    setInstanceName(generateInstanceName(existingNames));
  }, [existingNames]);

  const nameExists = existingNames.has(instanceName);

  return {
    draftConfig,
    instanceName,
    isLoading,
    nameExists,
    resetDraft,
    setInstanceName,
    setMemory,
    starship,
    setStarship,
    syncClaudeJson,
    setSyncClaudeJson,
    draftMounts,
    addDraftMount,
    removeDraftMount,
    toggleDraftMountWritable,
  };
}
