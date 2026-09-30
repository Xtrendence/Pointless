import { Link } from "../router";
import { ClearDataButton } from "./ClearDataButton";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 font-semibold tracking-tight" aria-label="Pointless home">
      <span
        aria-hidden="true"
        className={`${small ? "w-7 h-7 text-sm" : "w-9 h-9 text-base"} rounded-[10px] bg-orange flex items-center justify-center font-bold`}
      >
        P
      </span>
      <span className={small ? "text-lg" : "text-xl"}>Pointless</span>
    </Link>
  );
}

/** Soft orange arcs in the background. */
export function Backdrop() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute -right-48 -top-40 w-[720px] h-[720px] opacity-60"
      viewBox="0 0 720 720"
      fill="none"
    >
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FF4306" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#FF4306" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="360" cy="360" r="360" fill="url(#glow)" />
      <circle cx="360" cy="360" r="250" stroke="#FF4306" stroke-opacity="0.5" stroke-width="2" />
      <circle cx="360" cy="360" r="180" stroke="#FF4306" stroke-opacity="0.3" stroke-width="2" />
      <circle cx="360" cy="360" r="110" stroke="#FF4306" stroke-opacity="0.18" stroke-width="2" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="relative z-10 mt-auto border-t border-line">
      <div className="container mx-auto px-4 py-6 flex flex-wrap gap-2 items-center justify-between text-xs text-grey">
        <span>Pointless · ticket estimation</span>
        <div className="flex items-center gap-4">
          <ClearDataButton />
          <a
            href="https://github.com/Xtrendence/Pointless"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-orange transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
