import { useEffect, useState } from "preact/hooks";
import { navigate, Link } from "../router";
import { createRoom, isValidRoomCode, NAME_MAX_LENGTH, listRecentRooms, type RecentRoom } from "../lib/room";
import { getSavedName, setSavedName } from "../lib/profile";
import { NameEditor } from "../components/NameEditor";
import { Footer, Logo, Backdrop } from "../components/Layout";
import { ShufflingHand } from "../components/ShufflingHand";
import { GlowBorder } from "../components/GlowBorder";

function timeAgo(ts: number) {
  const minutes = Math.round((Date.now() - ts) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export default function Home() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [recent, setRecent] = useState<RecentRoom[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const needsName = name === "";
  const hasName = !!name || !!nameDraft.trim();

  useEffect(() => {
    document.title = "Pointless - Ticket Estimation";
    listRecentRooms().then(setRecent);
    getSavedName().then(setName);
  }, []);

  // A name is required before creating or joining; the first one typed here is remembered
  const ensureName = async () => {
    if (name) return true;
    const clean = nameDraft.trim();
    if (!clean) {
      setError("Enter your name first");
      return false;
    }
    await setSavedName(clean);
    setName(clean);
    return true;
  };

  const handleCreateRoom = async () => {
    if (!(await ensureName())) return;
    setIsCreating(true);
    setError(null);
    try {
      const code = await createRoom();
      navigate(`/room/${code}`);
    } catch {
      setError("Failed to create room");
      setIsCreating(false);
    }
  };

  const handleJoin = async (e: Event) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!isValidRoomCode(code)) {
      setError("Room codes are 6 letters or numbers");
      return;
    }
    if (!(await ensureName())) return;
    navigate(`/room/${code}`);
  };

  return (
    <main className="relative min-h-screen overflow-hidden flex flex-col">
      <Backdrop />
      <header className="relative z-10 container mx-auto px-4 pt-6 flex items-center justify-between">
        <Logo />
        {name && <NameEditor name={name} onSaved={setName} />}
      </header>

      <div className="relative z-10 flex-1 flex items-center">
        <div className="container mx-auto px-4 py-12 lg:py-20 grid gap-12 lg:grid-cols-[1fr_440px] items-center">
          {/* Pitch */}
          <div>
            <p className="text-orange font-semibold tracking-wide uppercase text-sm mb-4">
              Ticket estimation
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-[65px] font-medium leading-[1.15] mb-6">
              Estimate tickets together, <span className="text-orange">in real time.</span>
            </h1>
            <p className="text-lg sm:text-[21px] leading-relaxed text-off-white/80 max-w-xl">
              {/* First a, r, t, i and s are in full white */}
              Coll<span className="text-white">a</span>bo<span className="text-white">r</span>a<span className="text-white">t</span><span className="text-white">i</span>ve e<span className="text-white">s</span>timation with the Fibonacci sequence.
              Create a room and invite your team.
            </p>

            {/* Decorative hand of cards */}
            <ShufflingHand />
          </div>

          {/* Start panel */}
          <div className="card p-6 sm:p-8 shadow-2xl shadow-black/40">
            <h2 className="text-xl font-semibold mb-6">
              {name ? `Welcome back, ${name}` : "Get started"}
            </h2>

            {needsName && (
              <div className="mb-5">
                <label htmlFor="home-name" className="block text-sm text-grey mb-2">
                  First, what's your name?{" "}
                  <span className="text-grey/70">(remembered for every room)</span>
                </label>
                <input
                  id="home-name"
                  value={nameDraft}
                  onInput={(e) => {
                    setNameDraft((e.target as HTMLInputElement).value);
                    setError(null);
                  }}
                  placeholder="Enter your name"
                  maxLength={NAME_MAX_LENGTH}
                  autoComplete="nickname"
                  autoFocus
                  className="field"
                />
              </div>
            )}

            <button
              onClick={handleCreateRoom}
              disabled={isCreating || !hasName}
              className="btn text-lg w-full"
            >
              {isCreating ? "Creating..." : "Create a Room"}
              <span aria-hidden="true" className="animate-arrow-nudge">
                →
              </span>
            </button>

            <div className="flex items-center gap-3 my-5 text-xs uppercase tracking-wide text-grey">
              <span className="flex-1 h-px bg-line" />
              or join one
              <span className="flex-1 h-px bg-line" />
            </div>

            <form onSubmit={handleJoin} className="flex gap-2">
              <label htmlFor="room-code" className="sr-only">
                Room code
              </label>
              <GlowBorder className="flex-1 min-w-0">
                <input
                  id="room-code"
                  value={joinCode}
                  onInput={(e) => setJoinCode((e.target as HTMLInputElement).value.toUpperCase())}
                  placeholder="Room code"
                  maxLength={6}
                  autoComplete="off"
                  className="field font-mono uppercase tracking-widest"
                />
              </GlowBorder>
              <button type="submit" className="btn btn-outline shrink-0" disabled={!joinCode.trim() || !hasName}>
                Join
              </button>
            </form>

            {error && (
              <p role="alert" className="mt-4 text-sm text-orange">
                {error}
              </p>
            )}

            {recent.length > 0 && (
              <section className="mt-8 pt-6 border-t border-line" aria-labelledby="recent-heading">
                <h3 id="recent-heading" className="text-xs uppercase tracking-wide text-grey mb-3">
                  Your recent rooms
                </h3>
                <ul className="flex flex-col gap-1 -mx-3">
                  {recent.slice(0, 5).map((room) => (
                    <li key={room.code}>
                      <Link
                        to={`/room/${room.code}`}
                        className="group flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink-3 transition-colors"
                      >
                        <div>
                          <div className="font-mono font-bold tracking-widest">{room.code}</div>
                          <div className="text-xs text-grey mt-0.5">
                            {room.memberCount} member{room.memberCount === 1 ? "" : "s"} · active{" "}
                            {timeAgo(room.lastActivity)}
                            {room.myName ? ` · as ${room.myName}` : ""}
                          </div>
                        </div>
                        <span
                          aria-hidden="true"
                          className="text-orange text-lg transition-transform group-hover:translate-x-1"
                        >
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="mt-6 text-xs text-grey">Rooms expire after 24 hours of inactivity</p>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
