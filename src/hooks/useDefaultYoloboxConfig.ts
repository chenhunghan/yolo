import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { LimaConfig } from "../types/LimaConfig";

export function useDefaultYoloboxConfig() {
  const {
    data: defaultConfig,
    error,
    isLoading,
    isFetched,
    refetch,
  } = useQuery({
    queryFn: async () => {
      return await invoke<LimaConfig>("get_default_yolobox_config_yaml_cmd");
    },
    queryKey: ["default_yolobox_config"],
  });

  return {
    defaultConfig,
    error,
    isLoading: isLoading || !isFetched,
    refetch,
  };
}
