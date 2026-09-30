import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { useRoom } from "../hooks/useRoom";
import { useConfetti } from "../hooks/useConfetti";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { NAME_MAX_LENGTH, VOTE_VALUES, type Member, type Vote } from "../lib/room";
import { getSavedName } from "../lib/profile";
import { Link } from "../router";
import { Footer, Logo, Backdrop } from "../components/Layout";
import { NameEditor } from "../components/NameEditor";

// What the non-numeric cards mean, shown as a tooltip
const VOTE_MEANINGS: Partial<Record<Vote, string>> = {
  "?": "Not sure",
  "☕": "I need a break",
};

// Member card component with remove button
function MemberCard({
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
  const displayValue = isRevealed ? (member.vote ?? "-") : hasVoted ? "?" : "-";

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
      group relative card p-4 text-center transition-all duration-200 hover:border-grey/60
      ${isCurrentUser ? "border-orange! shadow-lg shadow-orange/15" : ""}
      ${isRevealed && hasVoted ? "bg-ink-3" : ""}
    `}
    >
      {/* Remove button - appears on hover */}
      {!isCurrentUser && (
        <button
          onClick={() => onRemove(member.id)}
          aria-label={`Remove ${member.name} from room`}
          className="absolute -top-2 -right-2 w-6 h-6 bg-off-white hover:bg-orange hover:text-white rounded-full text-ink text-sm flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 shadow-lg focus:outline-none focus:ring-2 focus:ring-orange"
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

      {/* Online indicator */}
      <span
        aria-hidden="true"
        title={member.online ? "Online" : "Away"}
        className={`absolute top-3 left-3 w-2 h-2 rounded-full ${member.online ? "bg-emerald-400" : "bg-line"}`}
      />

      {/* Vote display */}
      <div
        aria-hidden="true"
        className={`
        text-3xl font-bold mb-2 h-10 flex items-center justify-center
        ${hasVoted ? (isRevealed ? "text-orange" : "text-white") : "text-white/25"}
        ${isRevealed && hasVoted ? "animate-bounce-once" : ""}
      `}
      >
        {displayValue}
      </div>

      {/* Name */}
      <div className="text-sm text-off-white truncate font-medium">{member.name}</div>
      {/* Always rendered so every card is the same height */}
      <div
        aria-hidden={!isCurrentUser}
        className={`text-xs mt-0.5 ${isCurrentUser ? "text-orange" : "invisible"}`}
      >
        you
      </div>

      {/* Vote indicator */}
      <div
        aria-hidden="true"
        className={`
        mt-2 h-1 rounded-full transition-all duration-300
        ${hasVoted ? "bg-orange" : "bg-white/10"}
      `}
      />
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
    const newValue = selectedValue === value ? null : value;
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

      <main id="main-content" className="min-h-screen flex flex-col">
        <div className="container mx-auto px-4 py-4 flex-1 flex flex-col">
          {/* Live region for screen reader announcements */}
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {announcement}
          </div>

          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-line">
            <Logo small />
            <div className="flex items-center gap-3">
              <p className="text-sm text-grey">
                Room:{" "}
                <span className="font-mono font-bold text-white tracking-widest">{code}</span>
              </p>
              <button
                onClick={handleCopyUrl}
                aria-label={copied ? "Room URL copied to clipboard" : "Copy room URL to clipboard"}
                className="btn btn-sm"
              >
                {copied ? "Copied!" : "Copy URL"}
              </button>
            </div>
            <NameEditor name={currentMember.name} onSave={rename} onSaved={setSavedNameState} />
          </header>
          {view.synced && !view.connected && (
            <p role="alert" className="text-xs text-orange text-center -mt-3 mb-3">
              Reconnecting...
            </p>
          )}

          {/* Main content wrapper - centered vertically */}
          <div className="flex-1 flex flex-col justify-center">
            {/* Team members */}
            <section aria-label="Team members">
              <h2 className="sr-only">Team members and their votes</h2>
              <div
                role="list"
                aria-label={`${members.length} team members, ${votedCount} have voted`}
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8"
              >
                {members.map((member) => (
                  <div key={member.id} role="listitem">
                    <MemberCard
                      member={member}
                      isCurrentUser={member.id === currentMember.id}
                      isRevealed={showResults}
                      onRemove={removeMember}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Voting cards */}
            <section id="voting" aria-labelledby="voting-label" className="mb-8">
              <h3 id="voting-label" className="text-sm font-medium text-grey mb-3 text-center">
                Your vote:
              </h3>
              <ul
                ref={votingGroupRef}
                role="radiogroup"
                aria-labelledby="voting-label"
                aria-required="false"
                aria-disabled={showResults}
                className="flex flex-wrap gap-3 justify-center list-none p-0 m-0"
              >
                {VOTE_VALUES.map((value, index) => {
                  const isSelected = selectedValue === value;
                  const shouldHaveTabIndex = isSelected || (selectedValue === null && index === 0);
                  const meaning = VOTE_MEANINGS[value];

                  return (
                    <li key={value} role="none" className="list-none relative group">
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
                            const prevIndex =
                              (index - 1 + VOTE_VALUES.length) % VOTE_VALUES.length;
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
                      w-16 h-24 sm:w-20 sm:h-28 rounded-2xl font-bold text-2xl sm:text-3xl transition-all
                      border-2
                      focus:outline-none focus-visible:ring-4 focus-visible:ring-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ink
                      ${
                        isSelected
                          ? "bg-orange text-white -translate-y-1.5 shadow-xl shadow-orange/30 border-orange"
                          : "bg-ink-2 text-white hover:bg-ink-3 border-line hover:border-off-white"
                      }
                      ${showResults ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:-translate-y-1"}
                    `}
                      >
                        {value}
                      </button>
                      {meaning && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-20 whitespace-nowrap rounded-[10px] bg-off-white text-ink text-xs font-semibold px-3 py-1.5 shadow-lg opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 group-has-[:focus-visible]:opacity-100 group-has-[:focus-visible]:translate-y-0 after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-[6px] after:border-transparent after:border-t-off-white"
                        >
                          {meaning}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Actions */}
            <div
              role="group"
              aria-label="Voting actions"
              className="flex flex-wrap justify-center gap-3 mb-6"
            >
              {revealCountdown !== null ? (
                <>
                  <button disabled className="btn opacity-100! cursor-default!">
                    <span>Revealing in</span>
                    <span className="text-2xl font-bold tabular-nums leading-none">
                      {revealCountdown}
                    </span>
                  </button>
                  <button onClick={cancelRevealCountdown} className="btn btn-outline">
                    Cancel
                  </button>
                </>
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
                    className="btn"
                  >
                    Reveal in 3s
                  </button>
                  <button onClick={reset} className="btn btn-outline">
                    Reset
                  </button>
                </>
              )}
            </div>

            {/* Statistics */}
            {showResults && members.length > 0 && (
              <section aria-label="Voting statistics" className="card p-6 mb-4 max-w-3xl w-full mx-auto">
                {/* Average */}
                {numericVotes.length > 0 && (
                  <div className="text-center">
                    <p className="text-grey">
                      Average:{" "}
                      <span className="font-bold text-orange text-3xl ml-1">{average.toFixed(1)}</span>
                    </p>
                  </div>
                )}

                {/* Vote distribution bar chart */}
                {(() => {
                  // Count votes by value
                  const voteCounts = new Map<string | number, number>();
                  members.forEach((m) => {
                    if (m.vote !== null) {
                      const count = voteCounts.get(m.vote) || 0;
                      voteCounts.set(m.vote, count + 1);
                    }
                  });

                  // Don't show if less than 3 voters or everyone voted the same
                  const totalVoters = Array.from(voteCounts.values()).reduce((a, b) => a + b, 0);
                  if (voteCounts.size === 0 || totalVoters < 3 || voteCounts.size === 1)
                    return null;

                  const maxCount = Math.max(...voteCounts.values());
                  const sortedVotes = Array.from(voteCounts.entries()).sort((a, b) => {
                    // Sort by value (numbers first, then strings)
                    const aNum = typeof a[0] === "number" ? a[0] : Infinity;
                    const bNum = typeof b[0] === "number" ? b[0] : Infinity;
                    return aNum - bNum;
                  });

                  return (
                    <div className="space-y-2 mt-6">
                      <h4 className="text-xs font-medium text-grey text-center mb-4">
                        Vote Distribution
                      </h4>
                      <div className="flex items-end justify-center gap-3 px-4">
                        {sortedVotes.map(([value, count]) => {
                          const heightPx = (count / maxCount) * 120; // Max height 120px
                          return (
                            <div
                              key={value}
                              className="flex flex-col items-center gap-1.5 min-w-[48px]"
                            >
                              <span className="text-xs font-semibold text-grey mb-1">{count}</span>
                              <div
                                className={`w-12 rounded-t-[10px] transition-all duration-500 ${count === maxCount ? "bg-orange" : "bg-off-white/25"}`}
                                style={{
                                  height: `${Math.max(heightPx, 12)}px`,
                                }}
                              />
                              <span className="text-base font-bold text-white mt-1">{value}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </section>
            )}

            {/* Keyboard shortcuts hint */}
            <div className="text-center mt-6 text-xs text-grey">
              <div className="inline-flex items-center gap-4 flex-wrap justify-center">
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
            </div>
          </div>
        </div>
        <Footer />
      </main>
    </>
  );
}
