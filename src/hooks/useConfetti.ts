import { useCallback, useEffect } from "preact/hooks";

// Brand palette: orange accent with off-white and black
const BRAND = ["#FF4306", "#FF6B3D", "#FF9A76", "#F2F2F2", "#FFFFFF"];
const FESTIVE = ["#FF4306", "#FFC2A8", "#F2F2F2", "#9A9DA7", "#FF6B3D"];
const ACCENT = ["#FF4306", "#FF6B3D", "#F2F2F2"];

// Module-level cache so the bundle is only fetched once
let cachedConfetti: ((options: object) => void) | null = null;

async function loadConfetti() {
  if (!cachedConfetti) {
    cachedConfetti = (await import("canvas-confetti")).default;
  }
  return cachedConfetti;
}

export function useConfetti() {
  // Preload during browser idle time so confetti is ready when needed
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => {
        loadConfetti();
      });
    } else {
      setTimeout(() => {
        loadConfetti();
      }, 2000);
    }
  }, []);

  const fireConfetti = useCallback(async () => {
    const confetti = await loadConfetti();

    // First burst - left side
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.1, y: 0.6 },
      colors: BRAND,
    });

    // Second burst - right side
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.9, y: 0.6 },
      colors: BRAND,
    });

    // Third burst - center with delay
    setTimeout(() => {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { x: 0.5, y: 0.5 },
        colors: FESTIVE,
      });
    }, 150);

    // Extra celebration bursts
    setTimeout(() => {
      confetti({
        particleCount: 50,
        spread: 120,
        origin: { x: 0.3, y: 0.7 },
        colors: ACCENT,
      });
      confetti({
        particleCount: 50,
        spread: 120,
        origin: { x: 0.7, y: 0.7 },
        colors: ACCENT,
      });
    }, 300);
  }, []);

  return { fireConfetti };
}
