import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { Terminal } from "./components/Terminal";

interface SavedSession {
  id: string;
  shell: string;
  cwd: string;
}

function App() {
  const [session, setSession] = useState<{ id: string; cwd?: string } | null>(null);

  useEffect(() => {
    invoke<SavedSession[]>("get_saved_sessions")
      .then((saved) => {
        if (saved.length > 0) {
          setSession({ id: saved[0].id, cwd: saved[0].cwd });
        } else {
          setSession({ id: "default" });
        }
      })
      .catch(() => {
        setSession({ id: "default" });
      });
  }, []);

  // Wait for saved sessions check before rendering terminal
  if (!session) return null;

  return (
    <div style={{ width: "100%", height: "100%", background: "#000" }}>
      <Terminal sessionId={session.id} cwd={session.cwd} />
    </div>
  );
}

export default App;
