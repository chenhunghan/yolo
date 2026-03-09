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
  instanceRunning: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RemoveMountConfirmDialog({
  open,
  hostPath,
  instanceRunning,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove Mount</DialogTitle>
          <DialogDescription>
            {instanceRunning
              ? "This will restart the sandbox to remove the mount."
              : "Remove this mount from the sandbox configuration."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4">
          <p className="text-sm font-mono truncate" title={hostPath}>{hostPath}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>
            {instanceRunning ? "Restart & Remove" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
