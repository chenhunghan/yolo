import { useMemo } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface Props {
  open: boolean;
  hostPath: string;
  guestHome: string;
  onConfirm: (guestPath: string) => void;
  onCancel: () => void;
}

function fileName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "file";
}

export function FileCopyConfirmDialog({
  open,
  hostPath,
  guestHome,
  onConfirm,
  onCancel,
}: Props) {
  const guestPath = useMemo(
    () => `${guestHome}/${fileName(hostPath)}`,
    [hostPath, guestHome],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Copy File</DialogTitle>
          <DialogDescription>
            Copy this file into the sandbox. This is a one-time copy, not a live mount.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-xs">From</p>
            <p className="text-sm font-mono truncate" title={hostPath}>{hostPath}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-xs">To</p>
            <p className="text-sm font-mono truncate" title={guestPath}>{guestPath}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="default" onClick={() => onConfirm(guestPath)}>Copy</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
