import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface Props {
  open: boolean;
  hostPath: string;
  guestHome: string;
  instanceRunning: boolean;
  instanceStopped: boolean;
  existingMountPoints: string[];
  onConfirm: (mountPoint: string, writable: boolean) => void;
  onCancel: () => void;
}

function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "folder";
}

export function MountConfirmDialog({
  open,
  hostPath,
  guestHome,
  instanceRunning,
  instanceStopped,
  existingMountPoints,
  onConfirm,
  onCancel,
}: Props) {
  const defaultMountPoint = useMemo(
    () => `${guestHome}/${folderName(hostPath)}`,
    [hostPath, guestHome],
  );

  const [mountPoint, setMountPoint] = useState(defaultMountPoint);
  const [writable, setWritable] = useState(true);

  useEffect(() => {
    setMountPoint(defaultMountPoint);
    setWritable(true);
  }, [defaultMountPoint]);

  const collision = existingMountPoints.includes(mountPoint);

  const handleConfirm = useCallback(() => {
    if (!collision) {
      onConfirm(mountPoint, writable);
    }
  }, [collision, mountPoint, writable, onConfirm]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mount Folder</DialogTitle>
          <DialogDescription>
            {instanceRunning
              ? "This will restart the sandbox to apply the mount."
              : instanceStopped
                ? "The sandbox is stopped. Mount will be available on next start."
                : "Mount will be configured for the new sandbox."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">Host folder</Label>
            <p className="text-sm font-mono truncate" title={hostPath}>{hostPath}</p>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="mountPoint" className="text-muted-foreground text-xs">
              Guest mount point
            </Label>
            <Input
              id="mountPoint"
              value={mountPoint}
              onChange={(e) => setMountPoint(e.target.value)}
              size="sm"
              className="font-mono text-sm"
            />
            {collision && (
              <p className="text-xs text-red-500">Mount point already exists</p>
            )}
          </div>

          <Label htmlFor="writable" className="flex items-center gap-2 text-muted-foreground cursor-pointer">
            <Checkbox
              id="writable"
              checked={writable}
              onCheckedChange={(c) => setWritable(!!c)}
            />
            Writable
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="default" onClick={handleConfirm} disabled={collision || !mountPoint}>
            {instanceRunning ? "Restart & Mount" : "Mount"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
