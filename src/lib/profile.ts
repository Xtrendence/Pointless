import { generateSecretKey } from "nostr-tools/pure";
import { idbGet, idbSet } from "./idb";

const NAME_KEY = "profile:name";
const SECRET_KEY = "profile:secret";
const LS_NAME_KEY = "pointless:name";

// The name is shared across every room, so it only has to be set once.
// It is mirrored to localStorage so losing one of the two stores isn't fatal.
export async function getSavedName(): Promise<string> {
  const stored = await idbGet<string>(NAME_KEY);
  if (stored) return stored;
  try {
    const fallback = localStorage.getItem(LS_NAME_KEY);
    if (fallback) {
      await idbSet(NAME_KEY, fallback);
      return fallback;
    }
  } catch {
    // storage unavailable
  }
  return "";
}

export async function setSavedName(name: string): Promise<void> {
  await idbSet(NAME_KEY, name);
  try {
    localStorage.setItem(LS_NAME_KEY, name);
  } catch {
    // storage unavailable
  }
}

let secretPromise: Promise<Uint8Array> | null = null;

// Per-browser signing key for relay events. It carries no meaning for the app.
export function getSecretKey(): Promise<Uint8Array> {
  if (!secretPromise) {
    secretPromise = (async () => {
      const stored = await idbGet<Uint8Array>(SECRET_KEY);
      if (stored instanceof Uint8Array && stored.length === 32) return stored;
      const created = generateSecretKey();
      await idbSet(SECRET_KEY, created);
      return created;
    })();
  }
  return secretPromise;
}
