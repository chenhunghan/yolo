import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateStartInstanceDialogs } from "./CreateStartInstanceDialogs";
import type { LimaConfig } from "src/types/LimaConfig";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- Mocks ---

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args: unknown) => {
    // Return empty instances so create dialog auto-opens
    if (cmd === "get_all_yolo_instances_cmd") {
      return Promise.resolve([]);
    }
    if (cmd === "get_host_memory_gib_cmd") {
      return Promise.resolve(16);
    }
    if (cmd === "get_lima_guest_home_cmd") {
      return Promise.resolve("/home/user.linux");
    }
    return Promise.resolve(mockInvoke(cmd, args));
  },
}));

const { eventListeners } = vi.hoisted(() => ({
  eventListeners: {} as Record<string, ((event: unknown) => void)[]>,
}));

const mockListen = vi.fn((event: string, handler: (event: unknown) => void) => {
  if (!eventListeners[event]) {
    eventListeners[event] = [];
  }
  eventListeners[event].push(handler);
  return Promise.resolve(() => {
    eventListeners[event] = eventListeners[event].filter((h) => h !== handler);
  });
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (event: unknown) => void) => mockListen(event, handler),
}));

const emitEvent = (eventName: string, payload: unknown) => {
  const listeners = eventListeners[eventName];
  if (listeners) {
    listeners.forEach((handler) => handler({ payload }));
  }
};

// Mock useCreateLimaInstanceDraft
const mockDraftConfig: LimaConfig = {
  containerd: { system: false, user: false },
  cpus: 4,
  disk: "40GiB",
  images: [{ arch: "aarch64", location: "https://example.com/image.img" }],
  memory: "8GiB",
  mounts: [],
  portForwards: [],
  probes: [],
};

const mockResetDraft = vi.fn();
const mockUseCreateLimaInstanceDraft = vi.fn(() => ({
  draftConfig: mockDraftConfig,
  instanceName: "test-instance",
  isLoading: false,
  nameExists: false,
  resetDraft: mockResetDraft,
  setInstanceName: vi.fn(),
  setMemory: vi.fn(),
  starship: true,
  setStarship: vi.fn(),
  syncClaudeJson: true,
  setSyncClaudeJson: vi.fn(),
  draftMounts: [],
  addDraftMount: vi.fn(),
  removeDraftMount: vi.fn(),
  toggleDraftMountWritable: vi.fn(),
}));

vi.mock("src/hooks/useCreateLimaInstanceDraft", () => ({
  useCreateLimaInstanceDraft: () => mockUseCreateLimaInstanceDraft(),
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// --- Test Setup ---

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe("CreateStartInstanceDialogs", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key in eventListeners) {
      delete eventListeners[key];
    }
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CreateStartInstanceDialogs />
      </QueryClientProvider>,
    );
  };

  const submitCreate = async () => {
    // Dialog auto-opens because no instances exist
    await waitFor(() => {
      expect(screen.getByText("Create Sandbox")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
  };

  const expectCreateCommandAndDialog = async () => {
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("create_lima_instance_cmd", {
        config: mockDraftConfig,
        instanceName: "test-instance",
        syncClaudeJson: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Creating Sandbox")).toBeInTheDocument();
    });
  };

  const emitCreateLogsAndVerify = async () => {
    act(() => {
      emitEvent("lima-instance-create", {
        instance_name: "test-instance",
        message: "Starting creation...",
        message_id: "1",
        timestamp: new Date().toISOString(),
      });
      emitEvent("lima-instance-create-stdout", {
        instance_name: "test-instance",
        message: "Downloading image...",
        message_id: "2",
        timestamp: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Downloading image...")).toBeInTheDocument();
    });
  };

  const completeCreateAndAutoStart = async () => {
    act(() => {
      emitEvent("lima-instance-create-success", {
        instance_name: "test-instance",
        message: "Created successfully",
        message_id: "3",
        timestamp: new Date().toISOString(),
      });
    });

    // Auto-transitions to Starting Sandbox dialog
    await waitFor(() => {
      expect(screen.getByText("Starting Sandbox...")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("start_lima_instance_cmd", {
        instanceName: "test-instance",
      });
    });
  };

  it("successfully creates and transitions to starting", async () => {
    renderComponent();
    await submitCreate();
    await expectCreateCommandAndDialog();
    await emitCreateLogsAndVerify();
    await completeCreateAndAutoStart();
  }, 30_000);

  it("handles creation failure gracefully", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Create Sandbox")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getByText("Creating Sandbox")).toBeInTheDocument();
    });

    act(() => {
      emitEvent("lima-instance-create-error", {
        instance_name: "test-instance",
        message: "Creation failed due to disk error",
        message_id: "err1",
        timestamp: new Date().toISOString(),
      });
    });

    // Should still show Creating dialog (no auto-transition to success)
    await waitFor(() => {
      expect(screen.queryByText("Sandbox Ready")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Creating Sandbox")).toBeInTheDocument();
  });

  it("handles start failure gracefully", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("Create Sandbox")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.getByText("Creating Sandbox")).toBeInTheDocument());

    act(() => {
      emitEvent("lima-instance-create-success", {
        instance_name: "test-instance",
        message: "Created",
        message_id: "s1",
        timestamp: new Date().toISOString(),
      });
    });

    await waitFor(() => expect(screen.getByText("Starting Sandbox...")).toBeInTheDocument());

    act(() => {
      emitEvent("lima-instance-start-error", {
        instance_name: "test-instance",
        message: "Failed to boot",
        message_id: "err2",
        timestamp: new Date().toISOString(),
      });
    });

    expect(screen.queryByText("Sandbox Ready")).not.toBeInTheDocument();
  }, 30_000);
});
