import { FolderOpen, Plus, X } from "lucide-react";
import type { Mount } from "src/types/LimaConfig";
import { Button } from "./ui/button";

interface Props {
  mounts: Mount[];
  onRemoveMount: (hostPath: string) => void;
  onAddMount: () => void;
}

function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "folder";
}

export function MountSidebar({ mounts, onRemoveMount, onAddMount }: Props) {
  if (mounts.length === 0) return null;

  return (
    <div className="w-48 border-l border-border flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mounts</span>
        <Button variant="ghost" size="icon-xs" onClick={onAddMount} title="Add mount">
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {mounts.map((mount) => {
          const hostPath = mount.location ?? "";
          return (
            <div
              key={hostPath}
              className="flex items-center gap-2 px-3 py-1.5 group hover:bg-muted/50"
              title={`${hostPath} → ${mount.mountPoint ?? ""}\n${mount.writable ? "writable" : "read-only"}`}
            >
              <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-xs truncate flex-1">{folderName(hostPath)}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100 size-5"
                onClick={() => onRemoveMount(hostPath)}
                title="Remove mount"
              >
                <X className="size-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
