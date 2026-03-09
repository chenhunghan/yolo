import { useLimaInstance } from "src/hooks/useLimaInstance";
import { useLimaInstances } from "src/hooks/useLimaInstances";
import { useCreateLimaInstanceDraft } from "src/hooks/useCreateLimaInstanceDraft";
import { CreateInstanceDialog } from "./CreateInstanceDialog";
import { CreatingInstanceDialog } from "./CreatingInstanceDialog";
import { ErrorCreateInstanceDialog } from "./ErrorCreateInstanceDialog";
import { StartingInstanceDialog } from "./StartingInstanceDialog";
import { useCallback, useEffect, useState } from "react";
import { useOnLimaCreateLogs } from "src/hooks/useOnLimaCreateLogs";

interface Props {
  pendingMountPath?: string | null;
  onPendingMountConsumed?: () => void;
}

export function CreateStartInstanceDialogs({ pendingMountPath, onPendingMountConsumed }: Props) {
  const [createDialogUserOpen, setCreateDialogUserOpen] = useState(false);
  const [creatingInstanceDialogOpen, setCreatingInstanceDialogOpen] = useState(false);
  const [startingInstanceDialogOpen, setStartingInstanceDialogOpen] = useState(false);

  const { createInstance, startInstance } = useLimaInstance();
  const { instances, isLoading: isLoadingInstances } = useLimaInstances();
  const draft = useCreateLimaInstanceDraft();
  const { draftConfig, instanceName, resetDraft, syncClaudeJson, addDraftMount } = draft;

  const [createdName, setCreatedName] = useState("");
  const { reset: resetCreateLogs } = useOnLimaCreateLogs(createdName);

  // Open create dialog when no yolo-* instances exist
  const hasNoInstances = !isLoadingInstances && instances.length === 0;
  const createInstanceDialogOpen = createDialogUserOpen || hasNoInstances;

  // Handle pending mount from drag-drop when no instance exists
  useEffect(() => {
    if (pendingMountPath) {
      addDraftMount(pendingMountPath, true);
      setCreateDialogUserOpen(true);
      onPendingMountConsumed?.();
    }
  }, [pendingMountPath, addDraftMount, onPendingMountConsumed]);

  const handleCreateInstance = useCallback(() => {
    if (!draftConfig || !instanceName) {
      return;
    }
    setCreatedName(instanceName);
    setCreatingInstanceDialogOpen(true);
    createInstance({ config: draftConfig, instanceName, syncClaudeJson });
  }, [createInstance, draftConfig, instanceName, syncClaudeJson]);

  const handleRetry = useCallback(() => {
    resetCreateLogs();
    setCreateDialogUserOpen(true);
  }, [resetCreateLogs]);

  const handleCloseError = useCallback(() => {
    resetCreateLogs();
  }, [resetCreateLogs]);

  // Auto-start after successful creation
  const handleCreateInstanceSuccess = useCallback(() => {
    setCreatingInstanceDialogOpen(false);
    setStartingInstanceDialogOpen(true);
    startInstance(createdName);
    resetDraft();
  }, [createdName, startInstance, resetDraft]);

  const handleStartInstanceSuccess = useCallback(() => {
    setStartingInstanceDialogOpen(false);
  }, []);

  return (
    <>
      <CreateInstanceDialog
        open={createInstanceDialogOpen}
        dismissible={!hasNoInstances}
        draft={draft}
        onDialogOpenChange={setCreateDialogUserOpen}
        onClickCreate={handleCreateInstance}
      />
      <CreatingInstanceDialog
        open={creatingInstanceDialogOpen}
        onDialogOpenChange={setCreatingInstanceDialogOpen}
        onCreateInstanceSuccess={handleCreateInstanceSuccess}
        instanceName={createdName}
      />
      <ErrorCreateInstanceDialog
        onRetry={handleRetry}
        onClose={handleCloseError}
        instanceName={createdName}
      />
      <StartingInstanceDialog
        open={startingInstanceDialogOpen}
        onDialogOpenChange={setStartingInstanceDialogOpen}
        onSuccess={handleStartInstanceSuccess}
        instanceName={createdName}
      />
    </>
  );
}
