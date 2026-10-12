import { createContext, useContext } from "react";
import type { Me } from "./auth";

export interface AuthState {
  me: Me;
  /** True when the server couldn't be reached and we're running on the cached profile. */
  offline: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

/** The signed-in person. Only valid inside <AuthGate>, which never renders the app signed out. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthGate>");
  return ctx;
}
