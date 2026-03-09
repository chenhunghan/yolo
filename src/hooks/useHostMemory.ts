import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export function useHostMemory() {
  const { data: hostMemoryGiB } = useQuery({
    queryFn: () => invoke<number>("get_host_memory_gib_cmd"),
    queryKey: ["host_memory_gib"],
    staleTime: Number.POSITIVE_INFINITY,
  });

  return { hostMemoryGiB: hostMemoryGiB ?? 0 };
}
