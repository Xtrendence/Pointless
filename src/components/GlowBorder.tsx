import type { ComponentChildren } from "preact";

/**
 * Overlays a slow orange streak that travels clockwise around its child's
 * 2px border, from the top-left corner back to it. `radius` must match the
 * child's border radius; `duration` is seconds per lap; `intensity` scales opacity.
 */
export function GlowBorder({
  children,
  className = "",
  radius = 10,
  duration = 7,
  intensity = 1,
}: {
  children: ComponentChildren;
  className?: string;
  radius?: number;
  duration?: number;
  intensity?: number;
}) {
  // The rect traces the middle of the child's border
  const rect = {
    x: 1,
    y: 1,
    rx: radius - 1,
    pathLength: 100,
    fill: "none",
    className: "glow-border-path",
    stroke: "var(--color-orange)",
  };
  const style = {
    width: "calc(100% - 2px)",
    height: "calc(100% - 2px)",
    animationDuration: `${duration}s`,
  };
  return (
    <div className={`relative ${className}`}>
      {children}
      <svg aria-hidden="true" className="glow-border pointer-events-none absolute inset-0 w-full h-full overflow-visible">
        {/* Blurred copy for a faint glow, then the crisp streak on top */}
        <rect {...rect} stroke-width="3" opacity={0.35 * intensity} style={{ ...style, filter: "blur(4px)" }} />
        <rect {...rect} stroke-width="2" stroke-linecap="round" opacity={0.6 * intensity} style={style} />
      </svg>
    </div>
  );
}
