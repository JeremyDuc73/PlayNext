import { create } from "zustand";
import type { DirectEveningDraft } from "../lib/evenings";

export type NavId = "evening" | "calendar" | "group" | "library" | "profile";

export function sanitizeNotificationMessage(message: string): string {
  const clean = message.trim();
  if (
    /duplicate key|failed to fetch|unauthenticated|epic_token_|microsoft_disconnect_|_failed_|_error_|_timeout|_cancelled|invalid_state|^HTTP \d/i.test(
      clean,
    )
  ) {
    return "Action impossible. Réessaie.";
  }
  return clean;
}

export type AppState = {
  nav: NavId;
  setNav: (nav: NavId | ((prev: NavId) => NavId)) => void;

  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;

  openEveningId: string | null;
  setOpenEveningId: (id: string | null) => void;

  directDraft: DirectEveningDraft | null;
  setDirectDraft: (draft: DirectEveningDraft | null) => void;

  /** Convenience action: opens a specific live evening and switches to evening tab */
  openEvening: (eveningId: string) => void;

  /** Convenience action: sets a direct evening draft and switches to evening tab */
  openDirectDraft: (draft: DirectEveningDraft) => void;

  pendingInviteCode: string | null;
  setPendingInviteCode: (code: string | null) => void;

  onboardingOpen: boolean;
  setOnboardingOpen: (open: boolean) => void;
  openOnboarding: () => void;
  closeOnboarding: () => void;

  banner: string | null;
  setBanner: (message: string | null) => void;
  notify: (message: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  nav: "evening",
  setNav: (nav) =>
    set((state) => ({
      nav: typeof nav === "function" ? nav(state.nav) : nav,
    })),

  selectedGroupId: null,
  setSelectedGroupId: (selectedGroupId) => set({ selectedGroupId }),

  openEveningId: null,
  setOpenEveningId: (openEveningId) => set({ openEveningId }),

  directDraft: null,
  setDirectDraft: (directDraft) => set({ directDraft }),

  openEvening: (eveningId) =>
    set({
      openEveningId: eveningId,
      nav: "evening",
    }),

  openDirectDraft: (draft) =>
    set({
      directDraft: draft,
      nav: "evening",
    }),

  pendingInviteCode: null,
  setPendingInviteCode: (pendingInviteCode) => set({ pendingInviteCode }),

  onboardingOpen: false,
  setOnboardingOpen: (onboardingOpen) => set({ onboardingOpen }),
  openOnboarding: () => set({ onboardingOpen: true }),
  closeOnboarding: () => set({ onboardingOpen: false }),

  banner: null,
  setBanner: (banner) => set({ banner }),
  notify: (message) => set({ banner: sanitizeNotificationMessage(message) }),
}));
