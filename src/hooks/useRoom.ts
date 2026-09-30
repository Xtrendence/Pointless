import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { RoomSync, type RoomView, type Vote } from "../lib/room";
import { setSavedName } from "../lib/profile";

export function useRoom(code: string) {
  const [view, setView] = useState<RoomView | null>(null);
  const roomRef = useRef<RoomSync | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    RoomSync.open(code).then((room) => {
      if (cancelled) return room.close();
      roomRef.current = room;
      unsubscribe = room.subscribe(setView);
      room.connect();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      roomRef.current?.close();
      roomRef.current = null;
    };
  }, [code]);

  const join = useCallback((name: string, adoptId?: string) => {
    const room = roomRef.current;
    if (!room) return { success: false, error: "Still connecting…" } as const;
    const clash = room.findMemberByName(name);
    if (clash && clash.id !== adoptId) {
      return { success: false, error: "Name already taken", takenBy: clash } as const;
    }
    room.join(name, adoptId);
    void setSavedName(name.trim());
    return { success: true } as const;
  }, []);

  const rename = useCallback((name: string) => {
    const room = roomRef.current;
    const me = room?.view().me;
    if (!room || !me) return { success: false, error: "Not in the room" } as const;
    if (room.findMemberByName(name, me.id)) {
      return { success: false, error: "Name already taken" } as const;
    }
    room.rename(name);
    void setSavedName(name.trim());
    return { success: true } as const;
  }, []);

  const vote = useCallback((value: Vote | null) => roomRef.current?.vote(value), []);
  const reveal = useCallback(() => roomRef.current?.reveal(), []);
  const reset = useCallback(() => roomRef.current?.reset(), []);
  const removeMember = useCallback((id: string) => roomRef.current?.removeMember(id), []);

  return { view, join, rename, vote, reveal, reset, removeMember };
}
