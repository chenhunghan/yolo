import { FolderOpen } from "lucide-react";

interface Props {
  visible: boolean;
}

export function DropOverlay({ visible }: Props) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/50 p-12">
        <FolderOpen className="size-12 text-primary/70" />
        <p className="text-lg font-medium text-foreground">Drop folder to mount</p>
        <p className="text-sm text-muted-foreground">or drop a file to copy into the sandbox</p>
      </div>
    </div>
  );
}
