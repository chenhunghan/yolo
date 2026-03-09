import { useCallback, useMemo } from "react";
import type { useCreateLimaInstanceDraft } from "src/hooks/useCreateLimaInstanceDraft";
import { useHostMemory } from "src/hooks/useHostMemory";
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
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Spinner } from "./ui/spinner";
import { FolderOpen, Plus, X } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { ChangeEvent } from "react";

interface Props {
  open: boolean;
  dismissible?: boolean;
  draft: ReturnType<typeof useCreateLimaInstanceDraft>;
  onDialogOpenChange: (open: boolean) => void;
  onClickCreate: () => void;
}

const ALL_MEMORY_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128];

function folderName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "folder";
}

export function CreateInstanceDialog({
  open,
  dismissible = true,
  draft,
  onDialogOpenChange,
  onClickCreate,
}: Props) {
  const {
    instanceName, setInstanceName, nameExists, isLoading,
    draftConfig, setMemory, starship, setStarship,
    syncClaudeJson, setSyncClaudeJson,
    draftMounts, addDraftMount, removeDraftMount, toggleDraftMountWritable,
  } = draft;
  const { hostMemoryGiB } = useHostMemory();

  const memoryOptions = useMemo(
    () => ALL_MEMORY_OPTIONS.filter((v) => v <= hostMemoryGiB),
    [hostMemoryGiB],
  );

  const handleCancel = useCallback(() => {
    onDialogOpenChange(false);
  }, [onDialogOpenChange]);

  const handleCreate = useCallback(() => {
    onClickCreate();
    onDialogOpenChange(false);
  }, [onClickCreate, onDialogOpenChange]);

  const handleNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setInstanceName(e.target.value);
    },
    [setInstanceName],
  );

  const handleMemoryChange = useCallback(
    (value: string | null) => {
      setMemory(value || "4GiB");
    },
    [setMemory],
  );

  const handleStarshipChange = useCallback(
    (checked: boolean) => {
      setStarship(checked);
    },
    [setStarship],
  );

  const handleSyncClaudeJsonChange = useCallback(
    (checked: boolean) => {
      setSyncClaudeJson(checked);
    },
    [setSyncClaudeJson],
  );

  const handleBrowseMount = useCallback(async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (selected) {
      addDraftMount(selected as string, true);
    }
  }, [addDraftMount]);

  return (
    <Dialog open={open} onOpenChange={onDialogOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={dismissible}>
        <DialogHeader>
          <DialogTitle>Create Sandbox</DialogTitle>
          <DialogDescription>
            An isolated, hardened sandbox for your yolo-mode agents.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="px-4 py-4 flex flex-col gap-4">
              <div className="grid grid-cols-[60px_1fr] items-center gap-4">
                <Label htmlFor="instanceName" className="text-muted-foreground">
                  Name
                </Label>
                <div className="flex flex-col gap-1 min-w-0">
                  <Input
                    type="text"
                    id="instanceName"
                    value={instanceName}
                    onChange={handleNameChange}
                    className="w-full min-w-0"
                    size="sm"
                  />
                  {nameExists && (
                    <p className="text-xs text-red-500">
                      An instance with this name already exists
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[60px_1fr] items-center gap-4">
                <Label htmlFor="memory" className="text-muted-foreground">
                  RAM
                </Label>
                <Select value={draftConfig?.memory || "4GiB"} onValueChange={handleMemoryChange}>
                  <SelectTrigger id="memory" className="w-full" size="sm">
                    <SelectValue placeholder="Select memory" />
                  </SelectTrigger>
                  <SelectContent>
                    {memoryOptions.map((gib) => (
                      <SelectItem key={gib} value={`${gib}GiB`}>
                        {gib}GiB
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-[60px_1fr] items-center gap-4">
                <span />
                <Label htmlFor="starship" className="flex items-center gap-2 text-muted-foreground cursor-pointer">
                  <Checkbox
                    id="starship"
                    checked={starship}
                    onCheckedChange={handleStarshipChange}
                  />
                  Starship prompt
                </Label>
              </div>
              <div className="grid grid-cols-[60px_1fr] items-center gap-4">
                <span />
                <Label htmlFor="syncClaudeJson" className="flex items-center gap-2 text-muted-foreground cursor-pointer">
                  <Checkbox
                    id="syncClaudeJson"
                    checked={syncClaudeJson}
                    onCheckedChange={handleSyncClaudeJsonChange}
                  />
                  Sync ~/.claude.json
                </Label>
              </div>

              {/* Mounts section */}
              <hr className="border-border" />
              <div className="grid grid-cols-[60px_1fr] items-start gap-4">
                <Label className="text-muted-foreground pt-1">Mounts</Label>
                <div className="flex flex-col gap-1.5">
                  {draftMounts.map((mount) => {
                    const hostPath = mount.location ?? "";
                    return (
                      <div key={hostPath} className="flex items-center gap-1.5 group">
                        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-xs truncate flex-1 font-mono" title={hostPath}>
                          {folderName(hostPath)}
                        </span>
                        <button
                          type="button"
                          className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer px-1 rounded"
                          onClick={() => toggleDraftMountWritable(hostPath)}
                          title={mount.writable ? "Click to make read-only" : "Click to make writable"}
                        >
                          {mount.writable ? "rw" : "r"}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="size-5 opacity-0 group-hover:opacity-100"
                          onClick={() => removeDraftMount(hostPath)}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={handleBrowseMount}
                    title="Add folder"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              {dismissible && (
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              )}
              <Button variant="default" onClick={handleCreate} disabled={nameExists}>
                Create
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
