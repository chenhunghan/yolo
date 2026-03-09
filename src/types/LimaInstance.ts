import type { InstanceStatus } from "./InstanceStatus";

export type Arch = "x86_64" | "aarch64";

export interface LimaInstance {
  name: string;
  status: InstanceStatus;
  cpus: number;
  memory: string;
  disk: string;
  arch: Arch;
  version?: string;
  ssh_address?: string;
  ssh_local_port?: number;
  dir?: string;
}
