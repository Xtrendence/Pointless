import { useEffect, useRef, useState } from "preact/hooks";
import { NAME_MAX_LENGTH } from "../lib/room";
import { setSavedName } from "../lib/profile";

type SaveResult = { success: true } | { success: false; error: string };

/**
 * Shows the current name with a "Change" button that turns into an inline form.
 * By default it only updates the remembered name; pass `onSave` to also
 * rename yourself inside a room.
 */
export function NameEditor({
  name,
  onSave,
  onSaved,
}: {
  name: string;
  onSave?: (name: string) => SaveResult;
  onSaved?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const start = () => {
    setDraft(name);
    setError(null);
    setEditing(true);
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean) return;
    if (clean === name) return setEditing(false);
    if (onSave) {
      const result = onSave(clean);
      if (!result.success) return setError(result.error);
    } else {
      await setSavedName(clean);
    }
    onSaved?.(clean);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="text-grey hidden sm:inline">{name ? "You are" : "No name set"}</span>
        {name && <span className="font-semibold truncate max-w-[10rem]">{name}</span>}
        <button onClick={start} className="btn btn-sm btn-dark" aria-label={name ? "Change your name" : "Set your name"}>
          {name ? "Change" : "Set name"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor="name-editor" className="sr-only">
          Your name
        </label>
        <input
          id="name-editor"
          ref={inputRef}
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          maxLength={NAME_MAX_LENGTH}
          className="field py-1.5! px-3! text-sm w-40 sm:w-52"
          placeholder="Your name"
          autoComplete="nickname"
        />
        <button type="submit" className="btn btn-sm" disabled={!draft.trim()}>
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-dark">
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-orange">
          {error}
        </p>
      )}
    </form>
  );
}
