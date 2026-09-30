import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { useRoom } from "../hooks/useRoom";
import { useConfetti } from "../hooks/useConfetti";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { NAME_MAX_LENGTH, VOTE_VALUES, type Member, type Vote } from "../lib/room";
import { getSavedName } from "../lib/profile";
import { Link } from "../router";
import { Footer, FooterLinks, Logo, Backdrop } from "../components/Layout";
import { NameEditor } from "../components/NameEditor";

// What the non-numeric cards mean, shown as a tooltip
const VOTE_MEANINGS: Partial<Record<Vote, string>> = {
  "?": "Not sure",
  "☕": "I need a break",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.trim().slice(0, 2);
  return letters.toUpperCase();
}

// One row in the team roster, with a remove button on hover
function MemberRow({
  member,
  isCurrentUser,
  isRevealed,
  onRemove,
}: {
  member: Member;
  isCurrentUser: boolean;
  isRevealed: boolean;
  onRemove: (id: string) => void;
}) {
  const hasVoted = member.vote !== null;

  const voteStatus = hasVoted
    ? isRevealed
      ? `voted ${member.vote}`
      : "has voted"
    : "hasn't voted yet";

  return (
    <div
      role="article"
      aria-label={`${member.name}${isCurrentUser ? " (you)" : ""}, ${voteStatus}${member.online ? "" : ", away"}`}
      className={`
      group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 border transition-colors
      ${isCurrentUser ? "border-orange bg-orange/10 shadow-lg shadow-orange/10" : "border-transparent hover:bg-ink-3"}
    `}
    >
      {/* Avatar with online indicator */}
      <div aria-hidden="true" className="relative shrink-0">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${isCurrentUser ? "bg-orange text-white" : "bg-ink-3 text-off-white"}`}
        >
          {initials(member.name)}
        </div>
        <span
          title={member.online ? "Online" : "Away"}
          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-ink-2 ${member.online ? "bg-emerald-400" : "bg-line"}`}
        />
      </div>

      {/* Name and status */}
      <div className="min-w-0 flex-1" aria-hidden="true">
        <div className="text-sm font-medium truncate">{member.name}</div>
        <div className="text-xs text-grey">
          {isCurrentUser && <span className="text-orange">you · </span>}
          {hasVoted ? (isRevealed ? "voted" : "ready") : "thinking…"}
        </div>
      </div>

      {/* Remove button - appears on hover */}
      {!isCurrentUser && (
        <button
          onClick={() => onRemove(member.id)}
          aria-label={`Remove ${member.name} from room`}
          className="w-7 h-7 shrink-0 rounded-full text-grey hover:text-white hover:bg-orange flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          title="Remove member"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}

      {/* Vote chip: face-down until revealed */}
      <div
        aria-hidden="true"
        className={`
        w-9 h-12 shrink-0 rounded-lg flex items-center justify-center font-bold text-base
        ${
          hasVoted
            ? isRevealed
              ? "bg-orange text-white animate-bounce-once"
              : "bg-off-white text-ink"
            : "border-2 border-dashed border-line text-transparent"
        }
      `}
      >
        {hasVoted ? (isRevealed ? member.vote : "✓") : ""}
      </div>
    </div>
  );
}

function CenteredPage({ children }: { children: ComponentChildren }) {
  return (
    <main className="relative min-h-screen overflow-hidden flex flex-col">
      <Backdrop />
      <header className="relative z-10 container mx-auto px-4 pt-6">
        <Logo />
      </header>
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="text-center px-4 w-full max-w-sm py-12">{children}</div>
      </div>
      <Footer />
    </main>
  );
}

type JoinProblem = { message: string; takenBy?: Member } | null;

export default function Room({ code }: { code: string }) {
  const { view, join, rename, vote, reveal, reset, removeMember } = useRoom(code);
  const { fireConfetti } = useConfetti();

  const [name, setName] = useState("");
  const [savedName, setSavedNameState] = useState<string | null>(null);
  const [joinProblem, setJoinProblem] = useState<JoinProblem>(null);
  const [selectedValue, setSelectedValue] = useState<Vote | null>(null);
  const [copied, setCopied] = useState(false);
  const previousShowResults = useRef<boolean | null>(null);
  const autoJoinTried = useRef(false);
  const [announcement, setAnnouncement] = useState<string>("");
  const votingGroupRef = useRef<HTMLUListElement>(null);
  const [revealCountdown, setRevealCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  const members = view?.members || [];
  const currentMember = view?.me ?? null;
  const myVote = members.find((m) => m.id === currentMember?.id)?.vote;
  const votedCount = members.filter((m) => m.vote !== null).length;

  useEffect(() => {
    document.title = `Room ${code} | Pointless`;
    getSavedName().then((saved) => {
      setSavedNameState(saved);
      setName(saved);
    });
  }, [code]);

  // Join automatically with the remembered name, unless it clashes or we were removed
  useEffect(() => {
    if (!view || savedName === null || autoJoinTried.current) return;
    if (view.me || view.expired) return;
    if (!view.exists || !view.synced) return;
    autoJoinTried.current = true;
    if (view.removedSelf) {
      setJoinProblem({ message: "You were removed from this room. Join again?" });
      return;
    }
    if (!savedName) return;
    const result = join(savedName);
    if (!result.success) {
      setJoinProblem({ message: result.error, takenBy: "takenBy" in result ? result.takenBy : undefined });
    }
  }, [view, savedName, join]);

  // Focus management for voting buttons
  const getVotingButton = useCallback((index: number) => {
    return votingGroupRef.current?.children[index]?.querySelector(
      "button",
    ) as HTMLButtonElement | null;
  }, []);

  // Sync selected value with room state
  useEffect(() => {
    if (myVote !== undefined) setSelectedValue(myVote);
  }, [myVote]);

  // Check for consensus and fire confetti
  useEffect(() => {
    if (!view?.me) return;

    // Don't celebrate a reveal that happened before we opened the page
    if (previousShowResults.current === null) {
      previousShowResults.current = view.showResults;
      return;
    }

    const votes = view.members.map((m) => m.vote).filter((v): v is Vote => v !== null);
    const hasConsensus = votes.length >= 2 && votes.every((v) => v === votes[0]);

    if (view.showResults && !previousShowResults.current) {
      if (hasConsensus) {
        fireConfetti();
        setAnnouncement(
          `Consensus reached! Everyone voted ${votes[0]}. ${votes.length} members voted.`,
        );
      } else {
        const numeric = votes.filter((v): v is number => typeof v === "number");
        setAnnouncement(
          `Votes revealed. ${votes.length} members voted.${numeric.length ? ` The average is ${(numeric.reduce((a, b) => a + b, 0) / numeric.length).toFixed(1)}` : ""}`,
        );
      }
    } else if (!view.showResults && previousShowResults.current) {
      setAnnouncement("Voting round reset. Please submit your votes.");
    }
    previousShowResults.current = view.showResults;
  }, [view, fireConfetti]);

  // Countdown timer effect
  useEffect(() => {
    if (revealCountdown === null) return;

    if (revealCountdown === 0) {
      reveal();
      setRevealCountdown(null);
      countdownTimerRef.current = null;
      setAnnouncement("Revealing votes now");
      return;
    }

    // Announce countdown for screen readers
    if (revealCountdown < 3) {
      setAnnouncement(`${revealCountdown}`);
    }

    countdownTimerRef.current = window.setTimeout(() => {
      setRevealCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => {
      if (countdownTimerRef.current !== null) {
        clearTimeout(countdownTimerRef.current);
      }
    };
  }, [revealCountdown, reveal]);

  // Clean up countdown when votes are revealed by someone else
  useEffect(() => {
    if (view?.showResults && revealCountdown !== null) {
      setRevealCountdown(null);
      if (countdownTimerRef.current !== null) {
        clearTimeout(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    }
  }, [view?.showResults, revealCountdown]);

  const handleJoin = (e: Event, adoptId?: string) => {
    e.preventDefault();
    if (!name.trim()) return;
    setJoinProblem(null);
    const result = join(name.trim(), adoptId);
    if (!result.success) {
      setJoinProblem({ message: result.error, takenBy: "takenBy" in result ? result.takenBy : undefined });
      return;
    }
    setSavedNameState(name.trim());
  };

  const handleVote = (value: Vote) => {
    // Toggle against the room's current vote, not a possibly stale local selection
    const current = myVote === undefined ? selectedValue : myVote;
    const newValue = current === value ? null : value;
    setSelectedValue(newValue);
    vote(newValue);
    setAnnouncement(newValue === null ? "Vote removed" : `Voted ${newValue}`);
  };

  const handleCopyUrl = async () => {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startRevealCountdown = () => {
    setRevealCountdown(3);
    setAnnouncement("Revealing votes in 3 seconds");
  };

  const cancelRevealCountdown = () => {
    setRevealCountdown(null);
    if (countdownTimerRef.current !== null) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setAnnouncement("Countdown cancelled");
  };

  // Keyboard shortcuts - must be called before any early returns
  useKeyboardShortcuts({
    onVote: (value) => currentMember && handleVote(value),
    onReveal: () => currentMember && reveal(),
    onReset: () => currentMember && reset(),
    canReveal: votedCount > 0,
    showResults: view?.showResults || false,
  });

  // Loading state
  if (!view || (!view.exists && !view.synced)) {
    return (
      <CenteredPage>
        <div
          aria-hidden="true"
          className="mx-auto mb-6 w-10 h-10 rounded-full border-4 border-line border-t-orange animate-spin"
        />
        <p className="text-grey" role="status">
          Looking for room <span className="font-mono font-bold text-white">{code}</span>…
        </p>
      </CenteredPage>
    );
  }

  // Error state
  if (!view.exists || view.expired) {
    return (
      <CenteredPage>
        <h2 className="text-3xl font-medium mb-4">Room Not Found</h2>
        <p className="text-grey mb-8">
          {view.expired
            ? "This room expired after 24 hours of inactivity."
            : view.connected
              ? "No room exists with this code. Rooms expire after 24 hours of inactivity."
              : "Couldn't reach any relay to look this room up. Check your connection and try again."}
        </p>
        <Link to="/" className="btn">
          Go Home
        </Link>
      </CenteredPage>
    );
  }

  // Join form if not a member
  if (!currentMember) {
    const waitingForAutoJoin = savedName && !joinProblem && !autoJoinTried.current;
    return (
      <CenteredPage>
        <h2 className="text-3xl font-medium mb-2">Join Room</h2>
        <p className="text-grey mb-8">
          Room code: <span className="font-mono font-bold text-white tracking-widest">{code}</span>
        </p>

        {waitingForAutoJoin ? (
          <p className="text-grey" role="status">
            Joining as <span className="text-white font-semibold">{savedName}</span>…
          </p>
        ) : (
          <form onSubmit={(e) => handleJoin(e)} className="space-y-4 text-left">
            <label htmlFor="member-name" className="block text-sm text-grey">
              Your name <span className="text-grey/70">(remembered for next time)</span>
            </label>
            <input
              id="member-name"
              name="firstName"
              type="text"
              value={name}
              onInput={(e) => {
                setName((e.target as HTMLInputElement).value);
                setJoinProblem(null);
              }}
              placeholder="Enter your name"
              className="field"
              autoFocus
              maxLength={NAME_MAX_LENGTH}
              autoComplete="nickname"
              required
            />

            {joinProblem && (
              <div role="alert" className="text-sm">
                <p className="text-orange">{joinProblem.message}</p>
                {joinProblem.takenBy && (
                  <p className="text-grey mt-1">
                    Is {joinProblem.takenBy.name} you from another device or browser? You can pick
                    up where you left off, or choose another name.
                  </p>
                )}
              </div>
            )}

            {joinProblem?.takenBy ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={(e) => handleJoin(e, joinProblem.takenBy!.id)}
                  className="btn w-full"
                >
                  Rejoin as {joinProblem.takenBy.name}
                </button>
              </div>
            ) : (
              <button type="submit" disabled={!name.trim()} className="btn w-full">
                Join Room
              </button>
            )}
          </form>
        )}
      </CenteredPage>
    );
  }

  // Main room view
  const showResults = view.showResults;

  // Calculate statistics
  const numericVotes = members
    .map((m) => m.vote)
    .filter((v): v is number => typeof v === "number" && v !== 0);

  const average =
    numericVotes.length > 0 ? numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length : 0;

  const castVotes = members.map((m) => m.vote).filter((v): v is Vote => v !== null);
  const consensus =
    castVotes.length >= 2 && castVotes.every((v) => v === castVotes[0]) ? castVotes[0] : null;

  // Group voters by value, numbers first
  const breakdown = [...new Set(castVotes)]
    .map((value) => ({ value, voters: members.filter((m) => m.vote === value).map((m) => m.name) }))
    .sort((a, b) => {
      const aNum = typeof a.value === "number" ? a.value : Infinity;
      const bNum = typeof b.value === "number" ? b.value : Infinity;
      return aNum - bNum;
    });
  const maxCount = Math.max(1, ...breakdown.map((b) => b.voters.length));

  return (
    <>
      {/* Skip links */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-orange focus:text-white focus:px-4 focus:py-2 focus:rounded-lg"
      >
        Skip to main content
      </a>
      <a
        href="#voting"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-48 focus:z-50 focus:bg-orange focus:text-white focus:px-4 focus:py-2 focus:rounded-lg"
      >
        Skip to voting
      </a>

      <main id="main-content" className="min-h-screen flex flex-col pb-32">
        {/* Live region for screen reader announcements */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>

        {/* Top bar */}
        <header className="border-b border-line">
          <div className="container mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
            <Logo small />
            <NameEditor name={currentMember.name} onSave={rename} onSaved={setSavedNameState} />
          </div>
        </header>
        {!view.connected && view.synced && (
          <p role="alert" className="text-xs text-orange text-center mt-3">
            Reconnecting...
          </p>
        )}

        <div className="container mx-auto px-4 py-6 flex-1 grid gap-6 lg:grid-cols-[340px_1fr] items-start">
          {/* Team roster */}
          <aside aria-label="Team members" className="card p-4 order-2 lg:order-none lg:sticky lg:top-6">
            <div className="flex items-center justify-between gap-3 px-2 pt-1 pb-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-grey">Room</p>
                <p className="font-mono font-bold text-xl tracking-widest">{code}</p>
              </div>
              <button
                onClick={handleCopyUrl}
                aria-label={copied ? "Room URL copied to clipboard" : "Copy room URL to clipboard"}
                className="btn btn-sm"
              >
                {copied ? "Copied!" : "Copy URL"}
              </button>
            </div>
            <div className="border-t border-line pt-3">
              <h2 className="px-2 mb-2 text-xs uppercase tracking-wide text-grey flex justify-between">
                <span>Team</span>
                <span>
                  {members.length} member{members.length === 1 ? "" : "s"}
                </span>
              </h2>
              <div
                role="list"
                aria-label={`${members.length} team members, ${votedCount} have voted`}
                className="flex flex-col gap-1"
              >
                {members.map((member) => (
                  <div key={member.id} role="listitem">
                    <MemberRow
                      member={member}
                      isCurrentUser={member.id === currentMember.id}
                      isRevealed={showResults}
                      onRemove={removeMember}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-line mt-3 pt-3 px-2 text-xs text-grey">
              <FooterLinks />
            </div>
          </aside>

          {/* Round status, actions and results */}
          <section aria-label="Current round" className="card relative overflow-hidden p-6 sm:p-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 w-72 h-72 rounded-full border-2 border-orange/20"
            />
            <p className="text-orange font-semibold tracking-wide uppercase text-xs mb-3">
              {showResults ? "Results" : revealCountdown !== null ? "Revealing" : "Round in progress"}
            </p>

            <h1 className="text-3xl sm:text-5xl font-medium leading-tight mb-3">
              {revealCountdown !== null ? (
                <>
                  Revealing in{" "}
                  <span className="text-orange tabular-nums">{revealCountdown}</span>
                </>
              ) : !showResults ? (
                <>
                  <span className="text-orange">{votedCount}</span> of {members.length} voted
                </>
              ) : consensus !== null ? (
                <>
                  Everyone agrees on <span className="text-orange">{consensus}</span>
                </>
              ) : numericVotes.length > 0 ? (
                <>
                  Average <span className="text-orange">{average.toFixed(1)}</span>
                </>
              ) : (
                "Votes are in"
              )}
            </h1>
            <p className="text-grey mb-6 max-w-lg">
              {showResults
                ? `${castVotes.length} of ${members.length} voted. Reset to start the next ticket.`
                : "Pick a card below. Votes stay hidden until someone reveals them."}
            </p>

            {!showResults && (
              <div
                aria-hidden="true"
                className="h-1.5 rounded-full bg-ink-3 overflow-hidden mb-8 max-w-lg"
              >
                <div
                  className="h-full bg-orange rounded-full transition-all duration-500"
                  style={{ width: `${members.length ? (votedCount / members.length) * 100 : 0}%` }}
                />
              </div>
            )}

            {/* Actions */}
            <div role="group" aria-label="Voting actions" className="flex flex-wrap gap-3 mb-2">
              {revealCountdown !== null ? (
                <button onClick={cancelRevealCountdown} className="btn btn-outline">
                  Cancel
                </button>
              ) : (
                <>
                  <button
                    onClick={reveal}
                    disabled={showResults || votedCount === 0}
                    aria-disabled={showResults || votedCount === 0}
                    className="btn"
                  >
                    Reveal Votes ({votedCount}/{members.length})
                  </button>
                  <button
                    onClick={startRevealCountdown}
                    disabled={showResults || votedCount === 0}
                    aria-disabled={showResults || votedCount === 0}
                    className="btn btn-dark"
                  >
                    Reveal in 3s
                  </button>
                  <button onClick={reset} className="btn btn-outline">
                    Reset
                  </button>
                </>
              )}
            </div>

            {/* Vote breakdown */}
            {showResults && breakdown.length > 0 && (
              <section aria-label="Voting statistics" className="mt-8 pt-6 border-t border-line">
                <h2 className="text-xs uppercase tracking-wide text-grey mb-4">Vote Distribution</h2>
                <ul className="flex flex-col gap-3">
                  {breakdown.map(({ value, voters }) => (
                    <li key={value} className="flex items-center gap-4">
                      <span className="w-12 h-12 shrink-0 rounded-xl bg-ink-3 flex items-center justify-center font-bold text-lg">
                        {value}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <div
                            className={`h-2.5 rounded-full transition-all duration-500 ${voters.length === maxCount ? "bg-orange" : "bg-off-white/30"}`}
                            style={{ width: `${Math.max((voters.length / maxCount) * 100, 6)}%` }}
                          />
                          <span className="text-sm font-semibold shrink-0">{voters.length}</span>
                        </div>
                        <p className="text-xs text-grey truncate">{voters.join(", ")}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Keyboard shortcuts hint */}
            <div className="mt-10 text-xs text-grey flex items-center gap-4 flex-wrap">
              <span>
                <kbd className="px-2 py-1 bg-ink-3 border border-line rounded-md">1-9</kbd> Vote
              </span>
              <span>
                <kbd className="px-2 py-1 bg-ink-3 border border-line rounded-md">V</kbd> Reveal
              </span>
              <span>
                <kbd className="px-2 py-1 bg-ink-3 border border-line rounded-md">R</kbd> Reset
              </span>
            </div>
          </section>
        </div>

      </main>

      {/* Your hand of cards, docked to the bottom */}
      <section
        id="voting"
        aria-labelledby="voting-label"
        className="fixed bottom-0 inset-x-0 z-30 border-t border-line bg-ink/85 backdrop-blur-md"
      >
        <div className="container mx-auto px-4 flex items-center gap-4">
          <h3
            id="voting-label"
            className="sr-only md:not-sr-only text-xs uppercase tracking-wide text-grey shrink-0"
          >
            Your vote
          </h3>
          <ul
            ref={votingGroupRef}
            role="radiogroup"
            aria-labelledby="voting-label"
            aria-required="false"
            aria-disabled={showResults}
            className="flex-1 flex gap-2 overflow-x-auto md:overflow-visible md:justify-center list-none px-0 pt-5 pb-3 m-0"
          >
            {VOTE_VALUES.map((value, index) => {
              const isSelected = selectedValue === value;
              const shouldHaveTabIndex = isSelected || (selectedValue === null && index === 0);
              const meaning = VOTE_MEANINGS[value];

              return (
                <li key={value} role="none" className="list-none relative group shrink-0">
                  <button
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={meaning ? `Vote ${value} (${meaning})` : `Vote ${value}`}
                    onClick={() => handleVote(value)}
                    disabled={showResults}
                    tabIndex={shouldHaveTabIndex ? 0 : -1}
                    onKeyDown={(e) => {
                      // Arrow navigation
                      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                        e.preventDefault();
                        const nextIndex = (index + 1) % VOTE_VALUES.length;
                        getVotingButton(nextIndex)?.focus();
                      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                        e.preventDefault();
                        const prevIndex = (index - 1 + VOTE_VALUES.length) % VOTE_VALUES.length;
                        getVotingButton(prevIndex)?.focus();
                      } else if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        handleVote(value);
                      } else if (e.key === "Home") {
                        e.preventDefault();
                        getVotingButton(0)?.focus();
                      } else if (e.key === "End") {
                        e.preventDefault();
                        getVotingButton(VOTE_VALUES.length - 1)?.focus();
                      }
                    }}
                    className={`
                      w-12 h-16 sm:w-14 sm:h-20 rounded-xl font-bold text-lg sm:text-xl transition-all
                      border-2
                      focus:outline-none focus-visible:ring-4 focus-visible:ring-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ink
                      ${
                        isSelected
                          ? "bg-orange text-white -translate-y-3 shadow-xl shadow-orange/30 border-orange"
                          : "bg-ink-2 text-white hover:bg-ink-3 border-line hover:border-off-white"
                      }
                      ${showResults ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:-translate-y-2"}
                    `}
                  >
                    {value}
                  </button>
                  {meaning && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-4 z-20 whitespace-nowrap rounded-[10px] bg-off-white text-ink text-xs font-semibold px-3 py-1.5 shadow-lg opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 group-has-[:focus-visible]:opacity-100 group-has-[:focus-visible]:translate-y-0 after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-[6px] after:border-transparent after:border-t-off-white"
                    >
                      {meaning}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}
