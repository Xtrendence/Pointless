import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { updateLinearEstimate } from "../lib/linear";
import { changedScores, RoomSync, type RoomView, type Vote } from "../lib/room";
import { setSavedName } from "../lib/profile";

export function useRoom(code: string) {
  const [view, setView] = useState<RoomView | null>(null);
  const [linearError, setLinearError] = useState<string | null>(null);
  const roomRef = useRef<RoomSync | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    RoomSync.open(code).then((room) => {
      if (cancelled) return room.close();
      roomRef.current = room;
      // Every open tab pushes saved scores to Linear when the build has a key (a no-op
      // otherwise), no matter who clicked save. Duplicate updates are harmless: same value.
      // shortcut: a score saved while no key holder has the room open never reaches Linear, add a "pushed" flag on the ticket record if that matters
      let scores: Map<string, Vote | null> | null = null; // null until synced, so history isn't re-sent
      unsubscribe = room.subscribe((view) => {
        setView(view);
        if (!view.synced) return;
        for (const [id, score] of scores ? changedScores(scores, view.tickets) : []) {
          updateLinearEstimate(id, score).then(
            () => setLinearError(null),
            (err) => {
              console.error(`Failed to update ${id} in Linear`, err);
              setLinearError(`Linear was not updated for ${id}: ${err instanceof Error ? err.message : err}`);
            },
          );
        }
        scores = new Map(view.tickets.map((t) => [t.id, t.score]));
      });
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
  const saveScore = useCallback((score: Vote | null) => roomRef.current?.saveScore(score), []);
  const selectTicket = useCallback((id: string) => roomRef.current?.selectTicket(id), []);

  return { view, linearError, join, rename, vote, reveal, reset, removeMember, saveScore, selectTicket };
}
