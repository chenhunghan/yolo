import { useCallback } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { LogViewer } from "./LogViewer";
import { useOnLimaStartLogs } from "src/hooks/useOnLimaStartLogs";

import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  instanceName: string | null;
}

export function StartingInstanceDialog({
  open,
  onDialogOpenChange,
  onSuccess,
  instanceName,
}: Props) {
  const logState = useOnLimaStartLogs(instanceName || "", {
    onSuccess,
  });

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      // Only allow closing when provisioning is complete
      if (!newOpen && logState.isSuccess) {
        onDialogOpenChange(false);
        onSuccess?.();
      }
    },
    [logState.isSuccess, onDialogOpenChange, onSuccess],
  );

  const handleClose = useCallback(() => {
    onDialogOpenChange(false);
  }, [onDialogOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={logState.isSuccess}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!logState.isSuccess && !logState.error.length && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {logState.isSuccess
              ? "Sandbox Ready"
              : "Starting Sandbox..."}
          </DialogTitle>
          <DialogDescription>
            {logState.isSuccess
              ? "Your sandbox is ready to use."
              : "Please wait while the sandbox is being provisioned."}
          </DialogDescription>
        </DialogHeader>
        <LogViewer logState={logState} />
        {logState.isSuccess && (
          <DialogFooter>
            <Button variant="default" onClick={handleClose}>
              Done
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
