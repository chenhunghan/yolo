import { useEffect, useRef } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import init, { FrankenTermWeb } from "../wasm/frankenterm-web/FrankenTerm";

interface SessionInfo {
  id: string;
  alive: boolean;
}

export function Terminal({ sessionId = "default", cwd }: { sessionId?: string; cwd?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<FrankenTermWeb | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let disposed = false;

    (async () => {
      // 1. Load WASM
      await init();
      if (disposed || !canvasRef.current || !containerRef.current) return;

      // 2. Create FrankenTermWeb + init with canvas
      const term = new FrankenTermWeb();
      const dpr = window.devicePixelRatio || 1;
      const container = containerRef.current;

      // Derive initial cols/rows from actual container size
      const cellWidth = 9;
      const cellHeight = 18;
      const initialCols = Math.max(1, Math.floor(container.clientWidth / cellWidth));
      const initialRows = Math.max(1, Math.floor(container.clientHeight / cellHeight));

      await term.init(canvasRef.current, {
        cols: initialCols,
        rows: initialRows,
        cellWidth,
        cellHeight,
        dpr,
        rendererBackend: "auto",
        bracketedPaste: true,
        focusEvents: true,
      });

      // Initial fitToContainer syncs renderer + terminal engine + canvas CSS
      const initialGeo = term.fitToContainer(container.clientWidth, container.clientHeight, dpr);
      let currentCols = initialGeo.cols;
      let currentRows = initialGeo.rows;

      termRef.current = term;

      // 3. Create Tauri Channel for PTY -> frontend bytes
      const onData = new Channel<number[]>();
      onData.onmessage = (bytes: number[]) => {
        if (disposed) return;

        const data = new Uint8Array(bytes);
        term.feed(data);

        // Terminal query replies (e.g. cursor position reports)
        const replies = term.drainReplyBytes();
        for (let i = 0; i < replies.length; i++) {
          const chunk = replies[i] as Uint8Array;
          if (chunk.length > 0) {
            invoke("write_pty", { sessionId, data: Array.from(chunk) });
          }
        }
      };

      // 4. Check if session already exists (survives Vite HMR)
      const sessions: SessionInfo[] = await invoke("list_sessions");
      const existing = sessions.find((s) => s.id === sessionId && s.alive);

      if (existing) {
        await invoke("attach_shell", {
          sessionId,
          cols: currentCols,
          rows: currentRows,
          onData,
        });
      } else {
        await invoke("spawn_shell", {
          sessionId,
          cols: currentCols,
          rows: currentRows,
          onData,
          cwd: cwd ?? null,
        });
      }

      // 5. Render loop
      const renderLoop = () => {
        if (disposed) return;
        try {
          term.render();
        } catch (e) {
          console.error("render error:", e);
        }
        rafRef.current = requestAnimationFrame(renderLoop);
      };
      rafRef.current = requestAnimationFrame(renderLoop);

      // Selection state for mouse-based text selection
      let selectionStart = -1;
      let selecting = false;

      // Skip flushing focus event to PTY on initial attach (prevents ^[[I on startup)
      let skipFocusFlush = true;

      // 6. Keyboard input -> PTY stdin
      const handleKeyDown = (e: KeyboardEvent) => {
        // Cmd+C / Ctrl+C with selection -> copy to clipboard
        if ((e.metaKey || e.ctrlKey) && e.key === "c") {
          const text = term.copySelection();
          if (text) {
            navigator.clipboard.writeText(text);
            e.preventDefault();
            return;
          }
        }
        e.preventDefault();
        term.input({
          kind: "key",
          phase: "down",
          key: e.key,
          code: e.code,
          repeat: e.repeat,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
        });
        flushInputBytes(term, sessionId);
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        term.input({
          kind: "key",
          phase: "up",
          key: e.key,
          code: e.code,
          repeat: false,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
        });
        flushInputBytes(term, sessionId);
      };

      // 7. Mouse input (with text selection)
      const handleMouseDown = (e: MouseEvent) => {
        const [x, y] = cellCoordsFromMouse(e);
        if (e.button === 0) {
          selectionStart = y * currentCols + x;
          selecting = true;
          term.clearSelection();
        }
        term.input({
          kind: "mouse",
          phase: "down",
          x,
          y,
          button: e.button,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
        });
        flushInputBytes(term, sessionId);
      };

      const handleMouseUp = (e: MouseEvent) => {
        const [x, y] = cellCoordsFromMouse(e);
        selecting = false;
        term.input({
          kind: "mouse",
          phase: "up",
          x,
          y,
          button: e.button,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
        });
        flushInputBytes(term, sessionId);
      };

      const handleMouseMove = (e: MouseEvent) => {
        const [x, y] = cellCoordsFromMouse(e);
        if (selecting && e.buttons === 1) {
          const selectionEnd = y * currentCols + x;
          term.setSelectionRange(selectionStart, selectionEnd);
        }
        term.input({
          kind: "mouse",
          phase: e.buttons ? "drag" : "move",
          x,
          y,
          button: e.button,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
        });
        flushInputBytes(term, sessionId);
      };

      const handleWheel = (e: WheelEvent) => {
        const [x, y] = cellCoordsFromMouse(e);
        term.input({
          kind: "wheel",
          x,
          y,
          dx: Math.sign(e.deltaX),
          dy: Math.sign(e.deltaY),
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
        });
        flushInputBytes(term, sessionId);
      };

      // 8. Paste
      const handlePaste = (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData("text");
        if (text) {
          term.pasteText(text);
          flushInputBytes(term, sessionId);
        }
      };

      // 9. Focus/blur
      const handleFocus = () => {
        term.input({ kind: "focus", focused: true });
        if (skipFocusFlush) {
          skipFocusFlush = false;
          // Drain the focus escape sequence but don't send to PTY
          term.drainEncodedInputBytes();
          return;
        }
        flushInputBytes(term, sessionId);
      };
      const handleBlur = () => {
        term.input({ kind: "focus", focused: false });
        flushInputBytes(term, sessionId);
      };

      // 10. Container resize -> refit grid
      let resizeTimer = 0;
      const observer = new ResizeObserver(() => {
        if (disposed) return;
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          if (disposed) return;
          const newDpr = window.devicePixelRatio || 1;
          try {
            const geometry = term.fitToContainer(
              container.clientWidth,
              container.clientHeight,
              newDpr,
            );
            if (geometry.cols !== currentCols || geometry.rows !== currentRows) {
              currentCols = geometry.cols;
              currentRows = geometry.rows;
              invoke("resize_pty", {
                sessionId,
                cols: currentCols,
                rows: currentRows,
              });
            }
          } catch (e) {
            console.error("fitToContainer error:", e);
          }
        }, 150);
      });

      const canvas = canvasRef.current;
      canvas.addEventListener("keydown", handleKeyDown);
      canvas.addEventListener("keyup", handleKeyUp);
      canvas.addEventListener("mousedown", handleMouseDown);
      canvas.addEventListener("mouseup", handleMouseUp);
      canvas.addEventListener("mousemove", handleMouseMove);
      canvas.addEventListener("wheel", handleWheel, { passive: true });
      canvas.addEventListener("paste", handlePaste);
      canvas.addEventListener("focus", handleFocus);
      canvas.addEventListener("blur", handleBlur);

      // Make canvas focusable
      canvas.tabIndex = 0;
      canvas.style.outline = "none";
      canvas.focus();

      // Observe the container div for resize
      observer.observe(container);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      // Detach channel but keep the PTY alive (survives HMR)
      invoke("detach_shell", { sessionId });
      termRef.current?.destroy();
      termRef.current = null;
    };
  }, [sessionId, cwd]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
          touchAction: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      />
    </div>
  );
}

function flushInputBytes(term: FrankenTermWeb, sessionId: string) {
  const chunks = term.drainEncodedInputBytes();
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] as Uint8Array;
    if (chunk.length > 0) {
      invoke("write_pty", { sessionId, data: Array.from(chunk) });
    }
  }
}

function cellCoordsFromMouse(e: MouseEvent): [number, number] {
  const canvas = e.target as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  const cellW = 9;
  const cellH = 18;
  const x = Math.floor((e.clientX - rect.left) / cellW);
  const y = Math.floor((e.clientY - rect.top) / cellH);
  return [Math.max(0, x), Math.max(0, y)];
}
