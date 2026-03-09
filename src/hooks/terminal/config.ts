/**
 * Terminal configuration for @xterm/xterm.
 */
import type { ITerminalOptions } from "@xterm/xterm";

/** Font family used by the terminal renderer. */
export const TERMINAL_FONT_FAMILY = "FiraCode Nerd Font, monospace";

/** Options passed to new Terminal() */
export const XTERM_OPTIONS: ITerminalOptions = {
  fontFamily: TERMINAL_FONT_FAMILY,
  fontSize: 14,
  lineHeight: 1,
  cursorStyle: "block",
  cursorBlink: true,
  scrollback: 10000,
  theme: {
    // Monokai Pro
    background: "#0a0a0b",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    selectionBackground: "#878b9180",
    black: "#333333",
    red: "#c4265e",
    green: "#86b42b",
    yellow: "#b3b42b",
    blue: "#6a7ec8",
    magenta: "#8c6bc8",
    cyan: "#56adbc",
    white: "#e3e3dd",
    brightBlack: "#75715e",
    brightRed: "#f92672",
    brightGreen: "#a6e22e",
    brightYellow: "#e2e22e",
    brightBlue: "#819aff",
    brightMagenta: "#ae81ff",
    brightCyan: "#66d9ef",
    brightWhite: "#f8f8f2",
  },
};

export const TERMINAL_METRICS = {
  fontFamily: TERMINAL_FONT_FAMILY,
  fontSize: 14,
  lineHeight: 1,
  scrollbarWidth: 14,
  minimumCols: 2,
  minimumRows: 1,
} as const;
