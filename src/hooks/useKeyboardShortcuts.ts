import { useEffect, useRef } from "preact/hooks";

interface KeyboardShortcutsOptions {
  onVote: (value: number | string) => void;
  onReveal: () => void;
  onReset: () => void;
  canReveal: boolean;
  showResults: boolean;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions) {
  // Read the latest options at key press time, so a key pressed right after a
  // re-render never acts on the previous state
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      const { onVote, onReveal, onReset, canReveal, showResults } = latest.current;
      // Ignore if user is typing in an input field
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Leave browser shortcuts alone (Cmd/Ctrl+R to refresh, Cmd+1-9 to switch tabs, ...)
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      // Number keys 1-9 for voting
      if (!showResults && key >= "1" && key <= "9") {
        const fibValues = [1, 2, 3, 5, 8, 13, 21, 34, 55];
        const index = parseInt(key) - 1;
        if (index < fibValues.length) {
          onVote(fibValues[index]);
        }
        return;
      }

      // R for reset
      if (key === "r") {
        event.preventDefault();
        onReset();
        return;
      }

      // V for reveal
      if (key === "v" && canReveal && !showResults) {
        event.preventDefault();
        onReveal();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);
}
