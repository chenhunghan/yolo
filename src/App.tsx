import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreateStartInstanceDialogs } from "src/components/CreateStartInstanceDialogs";
import type { TabGroup } from "src/components/TermTabs";
import { TermTabs } from "src/components/TermTabs";
import { EmptyTerminalState } from "src/components/EmptyTerminalState";
import { DropOverlay } from "src/components/DropOverlay";
import { MountConfirmDialog } from "src/components/MountConfirmDialog";
import { FileCopyConfirmDialog } from "src/components/FileCopyConfirmDialog";
import { RemoveMountConfirmDialog } from "src/components/RemoveMountConfirmDialog";
import { MountSidebar } from "src/components/MountSidebar";
import { useInstanceLifecycleEvents } from "src/hooks/useInstanceLifecycleEvents";
import { useDragDrop } from "src/hooks/useDragDrop";
import { useMounts } from "src/hooks/useMounts";
import { Skeleton } from "./components/ui/skeleton";
import { Spinner } from "./components/ui/spinner";
import { invoke } from "@tauri-apps/api/core";
import * as log from "@tauri-apps/plugin-log";
import { useSelectedInstance } from "src/hooks/useSelectedInstance";
import { InstanceStatus } from "src/types/InstanceStatus";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export function App() {
  useInstanceLifecycleEvents();
  const { selectedName, selectedInstance } = useSelectedInstance();
  const hasInstance = Boolean(selectedName);
  const isInstanceRunning = selectedInstance?.status === InstanceStatus.Running;
  const isInstanceStopped = selectedInstance?.status === InstanceStatus.Stopped;
  const [limaTabs, setLimaTabs] = useState<TabGroup[]>([]);
  const [limaActive, setLimaActive] = useState("");
  const limaNextId = useRef(0);

  // Mounts
  const { mounts, addMount, removeMount, copyFileToGuest, existingMountPoints } = useMounts(selectedName);

  // Drop state
  const [pendingFolderDrop, setPendingFolderDrop] = useState<string | null>(null);
  const [pendingFileDrop, setPendingFileDrop] = useState<string | null>(null);
  const [pendingRemoveMount, setPendingRemoveMount] = useState<string | null>(null);
  const [pendingMountForCreate, setPendingMountForCreate] = useState<string | null>(null);

  const handleDrop = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      const path = paths[0];
      try {
        const isDir = await invoke<boolean>("is_directory_cmd", { path });
        if (isDir) {
          if (hasInstance) {
            setPendingFolderDrop(path);
          } else {
            // No instance — open Create dialog with this folder pre-configured
            setPendingMountForCreate(path);
          }
        } else {
          if (hasInstance && isInstanceRunning) {
            setPendingFileDrop(path);
          }
          // File drop without a running instance — ignore silently
        }
      } catch {
        if (hasInstance && isInstanceRunning) {
          setPendingFileDrop(path);
        }
      }
    },
    [hasInstance, isInstanceRunning],
  );

  const { dragState } = useDragDrop(handleDrop);

  // Mount confirm: stop → add mount → start
  const handleMountConfirm = useCallback(
    async (mountPoint: string, writable: boolean) => {
      if (!pendingFolderDrop || !selectedName) return;
      try {
        if (isInstanceRunning) {
          await invoke("stop_lima_instance_cmd", { instanceName: selectedName });
          // Wait briefly for stop to complete
          await new Promise((r) => setTimeout(r, 2000));
        }
        await addMount(pendingFolderDrop, mountPoint, writable);
        if (isInstanceRunning) {
          await invoke("start_lima_instance_cmd", { instanceName: selectedName });
        }
      } catch (e) {
        log.error(`Failed to mount: ${e}`);
      }
      setPendingFolderDrop(null);
    },
    [pendingFolderDrop, selectedName, isInstanceRunning, addMount],
  );

  // File copy confirm
  const handleFileCopyConfirm = useCallback(
    async (guestPath: string) => {
      if (!pendingFileDrop) return;
      try {
        await copyFileToGuest(pendingFileDrop, guestPath);
      } catch (e) {
        log.error(`Failed to copy file: ${e}`);
      }
      setPendingFileDrop(null);
    },
    [pendingFileDrop, copyFileToGuest],
  );

  // Remove mount: stop → remove → start
  const handleRemoveMountConfirm = useCallback(async () => {
    if (!pendingRemoveMount || !selectedName) return;
    try {
      if (isInstanceRunning) {
        await invoke("stop_lima_instance_cmd", { instanceName: selectedName });
        await new Promise((r) => setTimeout(r, 2000));
      }
      await removeMount(pendingRemoveMount);
      if (isInstanceRunning) {
        await invoke("start_lima_instance_cmd", { instanceName: selectedName });
      }
    } catch (e) {
      log.error(`Failed to remove mount: ${e}`);
    }
    setPendingRemoveMount(null);
  }, [pendingRemoveMount, selectedName, isInstanceRunning, removeMount]);

  // Browse for folder to mount
  const handleBrowseMount = useCallback(async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (selected) {
      setPendingFolderDrop(selected as string);
    }
  }, []);

  const handleCancelFolderDrop = useCallback(() => setPendingFolderDrop(null), []);
  const handleCancelFileDrop = useCallback(() => setPendingFileDrop(null), []);
  const handleCancelRemoveMount = useCallback(() => setPendingRemoveMount(null), []);
  const handleCancelPendingMount = useCallback(() => setPendingMountForCreate(null), []);
  const handleRequestRemoveMount = useCallback(
    (hostPath: string) => setPendingRemoveMount(hostPath),
    [],
  );

  // Close all terminal tabs when no instance is selected
  useEffect(() => {
    if (!hasInstance) {
      setLimaTabs((prev) => {
        for (const tab of prev) {
          for (const term of tab.terminals) {
            if (term.sessionId) {
              invoke("close_pty_cmd", { sessionId: term.sessionId }).catch((error) =>
                log.error("Failed to close PTY:", error),
              );
            }
          }
        }
        return [];
      });
      setLimaActive("");
    }
  }, [hasInstance]);

  // Handlers
  const nextId = (counter: React.RefObject<number>) => {
    counter.current += 1;
    return counter.current;
  };

  const addTab = (
    setTabs: React.Dispatch<React.SetStateAction<TabGroup[]>>,
    counter: React.RefObject<number>,
    setActive: React.Dispatch<React.SetStateAction<string>>,
    options?: { name?: string; command?: string; args?: string[] },
  ) => {
    const tabId = nextId(counter);
    const termId = nextId(counter);
    const newTab: TabGroup = {
      id: `tab-${tabId}`,
      name: options?.name ?? "shell",
      terminals: [{ id: termId, name: options?.name ?? "shell", command: options?.command, args: options?.args }],
    };
    setTabs((prev) => [...prev, newTab]);
    setActive(`tab-${tabId}`);
  };

  const addSideBySide = (
    tabId: string,
    setTabs: React.Dispatch<React.SetStateAction<TabGroup[]>>,
    counter: React.RefObject<number>,
  ) => {
    const termId = nextId(counter);
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id === tabId && tab.terminals.length < 10) {
          return {
            ...tab,
            terminals: [...tab.terminals, { id: termId, name: "shell" }],
          };
        }
        return tab;
      }),
    );
  };

  const removeTab = (
    tabId: string,
    currentTabs: TabGroup[],
    setTabs: React.Dispatch<React.SetStateAction<TabGroup[]>>,
    activeTab: string,
    setActiveTab: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    const tabIdx = currentTabs.findIndex((t) => t.id === tabId);
    if (tabIdx === -1) {
      return;
    }

    const tab = currentTabs[tabIdx];

    tab.terminals.forEach((term) => {
      if (term.sessionId) {
        invoke("close_pty_cmd", { sessionId: term.sessionId }).catch((error) =>
          log.error("Failed to close PTY:", error),
        );
      }
    });

    const nextTabs = currentTabs.filter((t) => t.id !== tabId);
    setTabs(nextTabs);

    if (activeTab === tabId) {
      if (nextTabs.length > 0) {
        const nextActiveIdx = Math.max(0, tabIdx - 1);
        setActiveTab(nextTabs[nextActiveIdx].id);
      } else {
        setActiveTab("");
      }
    }
  };

  const removeTerminal = (
    tabId: string,
    termId: number,
    currentTabs: TabGroup[],
    setTabs: React.Dispatch<React.SetStateAction<TabGroup[]>>,
    activeTab: string,
    setActiveTab: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    const tab = currentTabs.find((t) => t.id === tabId);
    if (!tab) return;

    const term = tab.terminals.find((t) => t.id === termId);
    if (term?.sessionId) {
      invoke("close_pty_cmd", { sessionId: term.sessionId }).catch((error) =>
        log.error("Failed to close PTY:", error),
      );
    }

    const remaining = tab.terminals.filter((t) => t.id !== termId);
    if (remaining.length === 0) {
      const tabIdx = currentTabs.findIndex((t) => t.id === tabId);
      const nextTabs = currentTabs.filter((t) => t.id !== tabId);
      setTabs(nextTabs);

      if (activeTab === tabId) {
        if (nextTabs.length > 0) {
          const nextActiveIdx = Math.max(0, tabIdx - 1);
          setActiveTab(nextTabs[nextActiveIdx].id);
        } else {
          setActiveTab("");
        }
      }
    } else {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, terminals: remaining } : t)),
      );
    }
  };

  const handleTerminalSessionCreated = (
    tabId: string,
    termId: number,
    sessionId: string,
    setTabs: React.Dispatch<React.SetStateAction<TabGroup[]>>,
  ) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) {
          return tab;
        }
        return {
          ...tab,
          terminals: tab.terminals.map((term) => {
            if (term.id !== termId) {
              return term;
            }
            return { ...term, sessionId };
          }),
        };
      }),
    );
  };

  const handleTerminalCwdChanged = (
    tabId: string,
    termId: number,
    cwd: string,
    setTabs: React.Dispatch<React.SetStateAction<TabGroup[]>>,
  ) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) {
          return tab;
        }
        return {
          ...tab,
          terminals: tab.terminals.map((term) => {
            if (term.id !== termId) {
              return term;
            }
            return { ...term, cwd };
          }),
        };
      }),
    );
  };

  const handleLimaSessionCreated = useCallback(
    (tabId: string, termId: number, sessionId: string) => {
      handleTerminalSessionCreated(tabId, termId, sessionId, setLimaTabs);
    },
    [],
  );

  const handleLimaCwdChanged = useCallback((tabId: string, termId: number, cwd: string) => {
    handleTerminalCwdChanged(tabId, termId, cwd, setLimaTabs);
  }, []);

  const handleAddLimaTab = useCallback(() => {
    addTab(setLimaTabs, limaNextId, setLimaActive);
  }, []);

  const handleAddLimaSideBySide = useCallback((tabId: string) => {
    addSideBySide(tabId, setLimaTabs, limaNextId);
  }, []);

  const handleRemoveLimaTab = useCallback(
    (tabId: string) => {
      removeTab(tabId, limaTabs, setLimaTabs, limaActive, setLimaActive);
    },
    [limaActive, limaTabs],
  );

  const handleRemoveLimaTerminal = useCallback(
    (tabId: string, termId: number) => {
      removeTerminal(tabId, termId, limaTabs, setLimaTabs, limaActive, setLimaActive);
    },
    [limaActive, limaTabs],
  );

  const [guestHome, setGuestHome] = useState("/tmp");
  useEffect(() => {
    invoke<string>("get_lima_guest_home_cmd").then(setGuestHome).catch(() => {});
  }, []);

  const limaCommand = selectedName ? "limactl" : "zsh";
  const limaArgs = useMemo(
    () => (selectedName ? ["shell", "--shell", "/usr/bin/zsh", "--workdir", guestHome, selectedName] : []),
    [selectedName, guestHome],
  );

  const handleAddClaudeTab = useCallback(() => {
    addTab(setLimaTabs, limaNextId, setLimaActive, {
      name: "Claude Code",
      command: limaCommand,
      args: [...limaArgs, "zsh", "-ilc", "claude --dangerously-skip-permissions"],
    });
  }, [limaCommand, limaArgs]);

  const handleAddLimaBtopTab = useCallback(() => {
    addTab(setLimaTabs, limaNextId, setLimaActive, {
      name: "btop",
      command: limaCommand,
      args: [...limaArgs, "btop"],
    });
  }, [limaCommand, limaArgs]);

  const limaEmptyState = useMemo(
    () => (
      <EmptyTerminalState
        onAddTerminal={handleAddLimaTab}
        onAddClaude={handleAddClaudeTab}
        disabled={!isInstanceRunning}
      />
    ),
    [handleAddLimaTab, handleAddClaudeTab, isInstanceRunning],
  );

  const isLoading = !selectedInstance && hasInstance;

  return (
    <div className="h-full w-full overflow-hidden">
      <DropOverlay visible={dragState === "hovering" && hasInstance} />
      <CreateStartInstanceDialogs
        pendingMountPath={pendingMountForCreate}
        onPendingMountConsumed={handleCancelPendingMount}
      />

      {/* Mount confirm dialog */}
      {pendingFolderDrop && hasInstance && (
        <MountConfirmDialog
          open
          hostPath={pendingFolderDrop}
          guestHome={guestHome}
          instanceRunning={isInstanceRunning}
          instanceStopped={isInstanceStopped}
          existingMountPoints={existingMountPoints}
          onConfirm={handleMountConfirm}
          onCancel={handleCancelFolderDrop}
        />
      )}

      {/* File copy dialog */}
      {pendingFileDrop && hasInstance && (
        <FileCopyConfirmDialog
          open
          hostPath={pendingFileDrop}
          guestHome={guestHome}
          onConfirm={handleFileCopyConfirm}
          onCancel={handleCancelFileDrop}
        />
      )}

      {/* Remove mount confirm */}
      {pendingRemoveMount && (
        <RemoveMountConfirmDialog
          open
          hostPath={pendingRemoveMount}
          instanceRunning={isInstanceRunning}
          onConfirm={handleRemoveMountConfirm}
          onCancel={handleCancelRemoveMount}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-full w-full flex items-center justify-center">
          <div title="Loading...">
            <Spinner />
          </div>
        </Skeleton>
      ) : (
        <div className="h-full w-full flex">
          {hasInstance && (
            <>
              <div className="flex-1 min-w-0">
                <TermTabs
                  tabs={limaTabs}
                  activeTabId={limaActive}
                  initialCommand={limaCommand}
                  initialArgs={limaArgs}
                  onSessionCreated={handleLimaSessionCreated}
                  onCwdChanged={handleLimaCwdChanged}
                  onTabChange={setLimaActive}
                  onAddTab={handleAddLimaTab}
                  onAddClaudeTab={handleAddClaudeTab}
                  onAddBtopTab={handleAddLimaBtopTab}
                  onAddSideBySide={handleAddLimaSideBySide}
                  onRemoveTab={handleRemoveLimaTab}
                  onRemoveTerminal={handleRemoveLimaTerminal}
                  emptyState={limaEmptyState}
                  addDisabled={!isInstanceRunning}
                />
              </div>
              <MountSidebar
                mounts={mounts}
                onRemoveMount={handleRequestRemoveMount}
                onAddMount={handleBrowseMount}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
