import { useEffect, useState } from "preact/hooks";

const OTHERS: (number | string)[] = [3, 5, 13, "?"];
const PICKED = 8;
const SLOT_WIDTH = 64; // px between card origins; cards are 80px wide so they overlap
const SHUFFLE_EVERY = 3200;

/**
 * Decorative hand of cards on the home page. Every few seconds the orange card
 * lifts out of the hand, slides to a new slot and settles back in while the
 * other cards shift over to make room.
 */
export function ShufflingHand() {
  const [pickedSlot, setPickedSlot] = useState(2);
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: number[] = [];
    const interval = window.setInterval(() => {
      // Lift first, then move across, then settle
      setLifted(true);
      timers.push(
        window.setTimeout(() => {
          setPickedSlot((current) => {
            const next = Math.floor(Math.random() * OTHERS.length);
            return next >= current ? next + 1 : next; // any slot but the current one
          });
        }, 250),
        window.setTimeout(() => setLifted(false), 1000),
      );
    }, SHUFFLE_EVERY);
    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, []);

  const order = [...OTHERS];
  order.splice(pickedSlot, 0, PICKED);
  const middle = (order.length - 1) / 2;

  return (
    <div
      aria-hidden="true"
      className="hidden sm:block relative mt-12 h-36"
      style={{ width: `${SLOT_WIDTH * (order.length - 1) + 80}px` }}
    >
      {/* Stable DOM order (only each card's slot changes) so moves always animate */}
      {[PICKED, ...OTHERS].map((value) => {
        const slot = order.indexOf(value);
        const isPicked = value === PICKED;
        const offset = slot - middle;
        const lift = isPicked ? (lifted ? -52 : -24) : Math.abs(offset) * 6;
        return (
          <div
            key={value}
            className={`absolute bottom-0 transition-[left,transform] duration-700 ease-in-out ${isPicked ? "z-10" : ""}`}
            style={{
              left: `${slot * SLOT_WIDTH}px`,
              transform: `rotate(${offset * 6}deg) translateY(${lift}px) scale(${isPicked && lifted ? 1.06 : 1})`,
            }}
          >
            <div
              className={`animate-card-float w-20 h-28 rounded-2xl border-2 flex items-center justify-center font-bold text-2xl shadow-xl ${isPicked ? "bg-orange border-orange shadow-orange/30" : "bg-ink-2 border-line"}`}
              // Negative, staggered delays: already mid-float on load
              style={{ animationDelay: `${-OTHERS.indexOf(value) * 0.6}s` }}
            >
              {value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
