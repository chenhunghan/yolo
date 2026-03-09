import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface DropPayload {
  paths: string[];
}

export type DragState = "idle" | "hovering";

export function useDragDrop(onDrop: (paths: string[]) => void) {
  const [dragState, setDragState] = useState<DragState>("idle");

  useEffect(() => {
    const window = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    window.onDragDropEvent((event) => {
      if (event.payload.type === "enter") {
        setDragState("hovering");
      } else if (event.payload.type === "drop") {
        setDragState("idle");
        onDrop(event.payload.paths);
      } else if (event.payload.type === "leave") {
        setDragState("idle");
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [onDrop]);

  return { dragState };
}
