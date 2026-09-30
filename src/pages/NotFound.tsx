import { useEffect } from "preact/hooks";
import { Link } from "../router";
import { Backdrop, Footer, Logo } from "../components/Layout";

export default function NotFound() {
  useEffect(() => {
    document.title = "404 - Not Found | Pointless";
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden flex flex-col">
      <Backdrop />
      <header className="relative z-10 container mx-auto px-4 pt-6">
        <Logo />
      </header>
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="text-center px-4">
          <h1 className="text-4xl md:text-5xl font-medium mb-4">Not Found</h1>
          <p className="text-lg text-grey mb-8 max-w-md mx-auto">
            The page you're looking for doesn't exist.
          </p>
          <Link to="/" className="btn text-lg">
            Back to Home
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
