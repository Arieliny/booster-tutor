import App from "./App";
import { AuthGate } from "./components/AuthGate";

/** Booster Tutor: invite-only, so nothing renders until we know who's here. */
export function BoosterTutor() {
  return (
    <AuthGate>
      <App />
    </AuthGate>
  );
}
