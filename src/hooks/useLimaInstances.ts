import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import type { LimaInstance } from "../types/LimaInstance";

export function useLimaInstances() {
  const {
    data: instances = [],
    isLoading,
    error,
    refetch: loadInstances,
  } = useQuery({
    queryFn: async () => {
      return await invoke<LimaInstance[]>("get_all_yolo_instances_cmd");
    },
    queryKey: ["instances"],
    refetchOnWindowFocus: "always",
    refetchInterval: 5_000, // Poll every 5 seconds to keep status fresh
    staleTime: 5_000,
  });

  return {
    error,
    instances,
    isLoading,
    loadInstances,
    refreshInstances: loadInstances,
  };
}
