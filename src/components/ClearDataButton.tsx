import { useRef, useState } from "preact/hooks";
import { clearAllLocalData } from "../lib/idb";
import { href } from "../router";

export function ClearDataButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [clearing, setClearing] = useState(false);

  const confirm = async () => {
    setClearing(true);
    await clearAllLocalData();
    location.href = href("/");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="hover:text-orange transition-colors cursor-pointer"
      >
        Clear local data
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="clear-data-title"
        onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
        className="card m-auto p-0 max-w-md w-[calc(100%-2rem)] text-white backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="p-6 sm:p-8">
          <h2 id="clear-data-title" className="text-xl font-semibold mb-3">
            Clear all local data?
          </h2>
          <p className="text-sm text-grey leading-relaxed mb-6">
            This removes your saved name, your recent rooms and your identity in each room from
            this browser. Rooms themselves stay alive for everyone else, and you can rejoin one
            by entering the same name.
          </p>
          <div className="flex flex-wrap gap-3 justify-end">
            <button type="button" onClick={() => dialogRef.current?.close()} className="btn btn-dark">
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={clearing} className="btn">
              {clearing ? "Clearing..." : "Clear data"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
