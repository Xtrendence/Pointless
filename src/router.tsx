import { useEffect, useState } from "preact/hooks";
import Home from "./pages/Home";
import Room from "./pages/Room";
import NotFound from "./pages/NotFound";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function href(path: string) {
  return `${BASE}${path}`;
}

export function navigate(path: string, replace = false) {
  history[replace ? "replaceState" : "pushState"](null, "", href(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function currentPath() {
  const path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname;
  return path.replace(/\/+$/, "") || "/";
}

export function App() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onPop = () => setPath(currentPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (path === "/") return <Home />;
  const match = path.match(/^\/room\/([^/]+)$/);
  if (match) {
    const code = decodeURIComponent(match[1]).toUpperCase();
    return <Room key={code} code={code} />;
  }
  return <NotFound />;
}

/** Anchor that navigates client-side. */
export function Link({ to, ...props }: { to: string } & preact.JSX.HTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      href={href(to)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    />
  );
}
