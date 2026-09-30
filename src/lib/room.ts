import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, type Event } from "nostr-tools/pure";
import { decrypt, encrypt, roomKey, roomTopic } from "./crypto";
import { idbDelete, idbGet, idbKeys, idbSet } from "./idb";
import { getSecretKey } from "./profile";

/*
 * There is no server: each room is a set of last-writer-wins records
 * ("meta", "round" and one "m:<memberId>" per member). Records are kept in
 * IndexedDB by every member and exchanged, encrypted, through public Nostr
 * relays. Relays also store the latest copy of each record, so a room survives
 * everyone closing their tab, and any returning member re-publishes what the
 * relays are missing.
 */

export const VOTE_VALUES = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, "?", "☕"] as const;
export type Vote = number | string;

export const ROOM_TTL = 24 * 60 * 60 * 1000;
export const NAME_MAX_LENGTH = 30;

const RELAYS = [
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
  "wss://nostr.mom",
  "wss://relay.nostr.net",
  "wss://nostr.oxtr.dev",
  "wss://offchain.pub",
];
const RECORD_KIND = 30078; // addressable app data, stored by relays
const PRESENCE_KIND = 20078; // ephemeral, only forwarded to live subscribers
const RELAY_RETENTION = 7 * 24 * 60 * 60; // seconds; the app enforces the 24h expiry itself
const HEARTBEAT_INTERVAL = 20_000;
const ONLINE_WINDOW = 50_000;
const SYNC_TIMEOUT = 5_000;

interface MemberValue {
  name: string;
  vote: Vote | null;
  round: string;
  removed: boolean;
  joinedAt: number;
}
interface RoundValue {
  id: string;
  showResults: boolean;
}
interface MetaValue {
  createdAt: number;
}

interface Rec<V = unknown> {
  k: string;
  ts: number;
  w: string;
  v: V;
}

interface StoredRoom {
  code: string;
  records: Record<string, Rec>;
  memberId: string | null;
}

export interface Member {
  id: string;
  name: string;
  vote: Vote | null;
  online: boolean;
}

export interface RoomView {
  code: string;
  exists: boolean;
  expired: boolean;
  synced: boolean;
  connected: boolean;
  members: Member[];
  showResults: boolean;
  me: { id: string; name: string } | null;
  removedSelf: boolean;
  lastActivity: number;
}

let pool: SimplePool | null = null;
function getPool() {
  if (!pool) pool = new SimplePool({ enablePing: true, enableReconnect: true });
  return pool;
}

export function randomId(bytes = 6): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export function generateRoomCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(6))]
    .map((b) => CODE_CHARS[b % CODE_CHARS.length])
    .join("");
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

function isVote(value: unknown): value is Vote {
  return (VOTE_VALUES as readonly unknown[]).includes(value);
}

function isValidRecord(rec: unknown): rec is Rec {
  if (!rec || typeof rec !== "object") return false;
  const r = rec as Rec<Record<string, unknown>>;
  if (typeof r.k !== "string" || typeof r.ts !== "number" || typeof r.w !== "string") return false;
  if (r.ts > Date.now() + ROOM_TTL || !r.v || typeof r.v !== "object") return false;
  const v = r.v;
  if (r.k === "meta") return typeof v.createdAt === "number";
  if (r.k === "round") return typeof v.id === "string" && typeof v.showResults === "boolean";
  if (r.k.startsWith("m:")) {
    return (
      typeof v.name === "string" &&
      v.name.trim().length > 0 &&
      v.name.length <= NAME_MAX_LENGTH &&
      (v.vote === null || isVote(v.vote)) &&
      typeof v.round === "string" &&
      typeof v.removed === "boolean" &&
      typeof v.joinedAt === "number"
    );
  }
  return false;
}

function isNewer(a: Rec, b: Rec | undefined) {
  return !b || a.ts > b.ts || (a.ts === b.ts && a.w > b.w);
}

function lastActivityOf(records: Iterable<Rec>) {
  let latest = 0;
  for (const rec of records) latest = Math.max(latest, rec.ts);
  return latest;
}

const storageKey = (code: string) => `room:${code}`;

export class RoomSync {
  readonly code: string;
  private records = new Map<string, Rec>();
  private relaySeen = new Map<string, number>();
  private presence = new Map<string, number>();
  private memberId: string | null = null;
  private clock = 0;
  private lastCreatedAt = 0;
  private synced = false;
  private connected = false;
  private listeners = new Set<(view: RoomView) => void>();
  private cleanup: (() => void)[] = [];
  private key!: CryptoKey;
  private topic!: string;
  private secret!: Uint8Array;
  private saveTimer: number | undefined;
  private closed = false;

  private constructor(code: string) {
    this.code = code;
  }

  static async open(code: string, options: { create?: boolean } = {}): Promise<RoomSync> {
    const room = new RoomSync(code);
    [room.key, room.topic, room.secret] = await Promise.all([
      roomKey(code),
      roomTopic(code),
      getSecretKey(),
    ]);
    const stored = await idbGet<StoredRoom>(storageKey(code));
    if (stored) {
      room.memberId = stored.memberId;
      for (const rec of Object.values(stored.records)) {
        if (isValidRecord(rec)) room.records.set(rec.k, rec);
      }
      if (Date.now() - lastActivityOf(room.records.values()) > ROOM_TTL) {
        room.records.clear();
        room.memberId = null;
        await idbDelete(storageKey(code));
      }
    }
    room.clock = lastActivityOf(room.records.values());
    if (options.create) room.write("meta", { createdAt: Date.now() } satisfies MetaValue);
    return room;
  }

  /** Starts syncing with the relays and announcing presence. */
  connect() {
    const p = getPool();
    const timeout = window.setTimeout(() => this.markSynced(), SYNC_TIMEOUT);

    const recordsSub = p.subscribe(
      RELAYS,
      { kinds: [RECORD_KIND], "#y": [this.topic] },
      {
        onevent: (event) => this.handleRecordEvent(event),
        oneose: () => {
          clearTimeout(timeout);
          this.markSynced();
          this.heal();
        },
        maxWait: SYNC_TIMEOUT,
      },
    );
    const presenceSub = p.subscribe(
      RELAYS,
      { kinds: [PRESENCE_KIND], "#y": [this.topic] },
      { onevent: (event) => this.handlePresenceEvent(event) },
    );

    const heartbeat = window.setInterval(() => this.sendPresence(), HEARTBEAT_INTERVAL);
    const status = window.setInterval(() => this.checkConnection(), 1000);
    // Online dots fade out on their own, so re-render periodically
    const refresh = window.setInterval(() => this.emit(), 10_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") this.sendPresence();
      else this.flushSave();
    };
    const onLeave = () => {
      this.flushSave();
      this.sendPresence(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onLeave);

    this.cleanup.push(() => {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      clearInterval(status);
      clearInterval(refresh);
      recordsSub.close();
      presenceSub.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onLeave);
    });

    this.sendPresence();
    this.checkConnection();
  }

  close() {
    this.sendPresence(true);
    this.closed = true;
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.listeners.clear();
    this.flushSave();
  }

  subscribe(listener: (view: RoomView) => void) {
    this.listeners.add(listener);
    listener(this.view());
    return () => this.listeners.delete(listener);
  }

  // ---------- derived state ----------

  view(): RoomView {
    const round = this.round();
    const now = Date.now();
    const members: (Member & { joinedAt: number })[] = [];
    for (const rec of this.records.values()) {
      if (!rec.k.startsWith("m:")) continue;
      const m = rec.v as MemberValue;
      if (m.removed) continue;
      const id = rec.k.slice(2);
      members.push({
        id,
        name: m.name,
        vote: m.round === round.id ? m.vote : null,
        online: id === this.memberId || now - (this.presence.get(id) ?? 0) < ONLINE_WINDOW,
        joinedAt: m.joinedAt,
      });
    }
    members.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));

    const own = this.memberId ? this.memberRecord(this.memberId) : undefined;
    const lastActivity = lastActivityOf(this.records.values());
    return {
      code: this.code,
      exists: this.records.size > 0,
      expired: this.records.size > 0 && now - lastActivity > ROOM_TTL,
      synced: this.synced,
      connected: this.connected,
      members: members.map(({ joinedAt: _, ...m }) => m),
      showResults: round.showResults,
      me: own && !own.removed && this.memberId ? { id: this.memberId, name: own.name } : null,
      removedSelf: !!own?.removed,
      lastActivity,
    };
  }

  private round(): RoundValue {
    return (this.records.get("round")?.v as RoundValue | undefined) ?? {
      id: "r0",
      showResults: false,
    };
  }

  private memberRecord(id: string) {
    return this.records.get(`m:${id}`)?.v as MemberValue | undefined;
  }

  /** Active member using this name, case-insensitively, excluding `exceptId`. */
  findMemberByName(name: string, exceptId?: string | null) {
    const wanted = name.trim().toLowerCase();
    return this.view().members.find((m) => m.id !== exceptId && m.name.toLowerCase() === wanted);
  }

  // ---------- actions ----------

  join(name: string, adoptId?: string) {
    const clean = name.trim().slice(0, NAME_MAX_LENGTH);
    const id = adoptId ?? (this.memberId && this.memberRecord(this.memberId) ? this.memberId : randomId());
    const existing = this.memberRecord(id);
    this.memberId = id;
    this.write(`m:${id}`, {
      name: clean,
      vote: existing?.vote ?? null,
      round: existing?.round ?? "",
      removed: false,
      joinedAt: existing?.joinedAt ?? Date.now(),
    } satisfies MemberValue);
    this.sendPresence();
  }

  rename(name: string) {
    this.updateMember(this.memberId, { name: name.trim().slice(0, NAME_MAX_LENGTH) });
  }

  vote(value: Vote | null) {
    this.updateMember(this.memberId, { vote: value, round: this.round().id });
  }

  removeMember(id: string) {
    this.updateMember(id, { removed: true });
  }

  reveal() {
    this.write("round", { id: this.round().id, showResults: true } satisfies RoundValue);
  }

  reset() {
    this.write("round", { id: randomId(), showResults: false } satisfies RoundValue);
  }

  private updateMember(id: string | null, patch: Partial<MemberValue>) {
    if (!id) return;
    const existing = this.memberRecord(id);
    if (!existing) return;
    this.write(`m:${id}`, { ...existing, ...patch });
  }

  // ---------- records ----------

  private write(k: string, v: unknown) {
    // Hybrid clock: always later than anything already seen, so an action
    // taken after seeing a state wins even with skewed device clocks.
    this.clock = Math.max(Date.now(), this.clock + 1);
    const rec: Rec = { k, ts: this.clock, w: this.memberId ?? "anon", v };
    this.records.set(k, rec);
    this.flushSave();
    this.emit();
    void this.publish(rec);
  }

  private merge(rec: Rec) {
    if (!isNewer(rec, this.records.get(rec.k))) return false;
    this.records.set(rec.k, rec);
    this.clock = Math.max(this.clock, rec.ts);
    return true;
  }

  private async handleRecordEvent(event: Event) {
    this.checkConnection();
    const rec = await decrypt<Rec>(this.key, event.content);
    if (!isValidRecord(rec)) return;
    this.relaySeen.set(rec.k, Math.max(this.relaySeen.get(rec.k) ?? 0, rec.ts));
    if (this.merge(rec)) {
      this.scheduleSave();
      this.emit();
    }
  }

  private async handlePresenceEvent(event: Event) {
    const data = await decrypt<{ id: string; bye?: boolean }>(this.key, event.content);
    if (!data || typeof data.id !== "string" || data.id === this.memberId) return;
    if (data.bye) this.presence.delete(data.id);
    else this.presence.set(data.id, Date.now());
    this.emit();
  }

  /** Re-publish anything the relays don't have (e.g. after they pruned it). */
  private heal() {
    for (const rec of this.records.values()) {
      if ((this.relaySeen.get(rec.k) ?? -1) < rec.ts) void this.publish(rec);
    }
  }

  private nextCreatedAt() {
    // Relays keep the newest created_at per record, so never reuse a second
    this.lastCreatedAt = Math.max(Math.floor(Date.now() / 1000), this.lastCreatedAt + 1);
    return this.lastCreatedAt;
  }

  private async publish(rec: Rec) {
    const content = await encrypt(this.key, rec);
    const createdAt = this.nextCreatedAt();
    const event = finalizeEvent(
      {
        kind: RECORD_KIND,
        created_at: createdAt,
        tags: [
          ["d", `${this.topic}:${rec.k}`],
          ["y", this.topic],
          ["expiration", String(createdAt + RELAY_RETENTION)],
        ],
        content,
      },
      this.secret,
    );
    const results = await Promise.allSettled(getPool().publish(RELAYS, event));
    if (results.some((r) => r.status === "fulfilled")) {
      this.relaySeen.set(rec.k, Math.max(this.relaySeen.get(rec.k) ?? 0, rec.ts));
    }
  }

  private async sendPresence(bye = false) {
    if (!this.memberId || (this.closed && !bye)) return;
    const content = await encrypt(this.key, bye ? { id: this.memberId, bye } : { id: this.memberId });
    const event = finalizeEvent(
      {
        kind: PRESENCE_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["y", this.topic]],
        content,
      },
      this.secret,
    );
    getPool().publish(RELAYS, event).forEach((p) => p.catch(() => {}));
  }

  private markSynced() {
    if (this.synced) return;
    this.synced = true;
    this.checkConnection();
    this.emit();
  }

  private checkConnection() {
    const statuses = [...getPool().listConnectionStatus().values()];
    const connected = statuses.some(Boolean);
    if (connected !== this.connected) {
      this.connected = connected;
      if (connected && this.synced) this.heal();
      this.emit();
    }
  }

  private emit() {
    if (this.closed) return;
    const view = this.view();
    this.listeners.forEach((l) => l(view));
  }

  // ---------- persistence ----------

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flushSave(), 200);
  }

  private flushSave() {
    clearTimeout(this.saveTimer);
    if (this.records.size === 0) return;
    const stored: StoredRoom = {
      code: this.code,
      records: Object.fromEntries(this.records),
      memberId: this.memberId,
    };
    void idbSet(storageKey(this.code), stored);
  }
}

/** Creates a room locally and announces it to the relays. */
export async function createRoom(): Promise<string> {
  const code = generateRoomCode();
  const room = await RoomSync.open(code, { create: true });
  room.close();
  return code;
}

export interface RecentRoom {
  code: string;
  lastActivity: number;
  memberCount: number;
  myName: string | null;
}

/** Rooms this browser has visited that haven't expired. Expired ones are purged. */
export async function listRecentRooms(): Promise<RecentRoom[]> {
  const keys = await idbKeys("room:");
  const rooms: RecentRoom[] = [];
  for (const key of keys) {
    const stored = await idbGet<StoredRoom>(key);
    if (!stored) continue;
    const records = Object.values(stored.records ?? {});
    const lastActivity = lastActivityOf(records);
    if (Date.now() - lastActivity > ROOM_TTL) {
      await idbDelete(key);
      continue;
    }
    const members = records.filter(
      (r) => r.k.startsWith("m:") && !(r.v as MemberValue).removed,
    );
    const mine = stored.memberId ? stored.records[`m:${stored.memberId}`] : undefined;
    rooms.push({
      code: stored.code,
      lastActivity,
      memberCount: members.length,
      myName: mine && !(mine.v as MemberValue).removed ? (mine.v as MemberValue).name : null,
    });
  }
  return rooms.sort((a, b) => b.lastActivity - a.lastActivity);
}
