import { ShrimpIcon, SquarePlusIcon, TerminalIcon } from "lucide-react";
import { useIsMobile } from "src/hooks/useMediaQuery";
import { Button } from "./ui/button";

export function EmptyTerminalState({
  onAddTerminal,
  onAddClaude,
  disabled,
}: {
  onAddTerminal: () => void;
  onAddClaude: () => void;
  disabled?: boolean;
}) {
  const isMobile = useIsMobile();
  return (
    <div className="flex flex-col h-full w-full items-center justify-center gap-4 px-6 animate-in fade-in duration-500">
      {!isMobile && (
        <div className="p-4 rounded-full bg-muted/30">
          <TerminalIcon className="size-8 text-muted-foreground/40" />
        </div>
      )}
      <div className="flex gap-2">
        <Button
          variant="default"
          size={isMobile ? "xs" : "sm"}
          className="h-7 px-4 text-[10px] gap-2"
          onClick={onAddClaude}
          disabled={disabled}
          title="Launch Claude Code"
        >
          <ShrimpIcon className="size-3" />
          Claude Code
        </Button>
        <Button
          variant="outline"
          size={isMobile ? "xs" : "sm"}
          className="h-7 px-4 text-[10px] gap-2"
          onClick={onAddTerminal}
          disabled={disabled}
          title="New Terminal"
        >
          <SquarePlusIcon className="size-3" />
          Terminal
        </Button>
      </div>
    </div>
  );
}
