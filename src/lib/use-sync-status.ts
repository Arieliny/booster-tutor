import { useSyncExternalStore } from "react";
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from "./user-sync";

/** Live sync status for the UI. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
}
