import { useEffect, useState } from "react";
import {
  disconnectEpic,
  disconnectMicrosoft,
  exchangeEpicCode,
  fetchEpicStatus,
  fetchMicrosoftStatus,
  startMicrosoftLink,
} from "../lib/api";
import {
  openExternalUrl,
  startMicrosoftLoginNative,
} from "../lib/desktop-auth";
import { startEpicLoginNative } from "../lib/epic";
import type { User } from "../lib/api";
import { Button } from "../ui/Button";
import { SquareAvatar } from "../ui/SquareAvatar";

type Props = {
  user: User;
  isDesktop: boolean;
  microsoftLinkedSignal: number;
  epicLinkedSignal: number;
  onConnectionChanged: (provider: "microsoft" | "epic") => void;
  onBanner: (message: string) => void;
};

export function ProfilePanel({
  user,
  isDesktop,
  microsoftLinkedSignal,
  epicLinkedSignal,
  onConnectionChanged,
  onBanner,
}: Props) {
  const [microsoftConfigured, setMicrosoftConfigured] = useState(false);
  const [microsoftLinked, setMicrosoftLinked] = useState(false);
  const [epicLinked, setEpicLinked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchMicrosoftStatus(),
      fetchEpicStatus(),
    ])
      .then(([microsoft, epic]) => {
        if (cancelled) return;
        setMicrosoftConfigured(microsoft.configured);
        setMicrosoftLinked(microsoft.linked);
        setEpicLinked(epic.linked);
      })
      .catch(() => {
        if (cancelled) return;
        setMicrosoftConfigured(false);
        setMicrosoftLinked(false);
        setEpicLinked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [microsoftLinkedSignal, epicLinkedSignal]);

  async function linkMicrosoft() {
    setBusy("microsoft-link");
    try {
      const url = await startMicrosoftLink(isDesktop ? "desktop" : "web");
      if (isDesktop) {
        const payload = await startMicrosoftLoginNative(url);
        if (payload.kind !== "microsoft") {
          throw new Error("microsoft_callback_invalid");
        }
        if (payload.error) throw new Error(payload.error);
        setMicrosoftLinked(true);
        onConnectionChanged("microsoft");
        onBanner("Compte Microsoft / Xbox lié.");
      } else {
        await openExternalUrl(url);
        onBanner("Connexion Microsoft ouverte.");
      }
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Connexion impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function linkEpic() {
    if (!isDesktop) {
      onBanner("La liaison Epic nécessite l’application Windows.");
      return;
    }
    setBusy("epic-link");
    try {
      const code = await startEpicLoginNative();
      await exchangeEpicCode(code);
      setEpicLinked(true);
      onConnectionChanged("epic");
      onBanner("Compte Epic lié.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Connexion impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function unlinkMicrosoft() {
    setBusy("microsoft-unlink");
    try {
      await disconnectMicrosoft();
      setMicrosoftLinked(false);
      onConnectionChanged("microsoft");
      onBanner("Compte Microsoft / Xbox déconnecté.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Déconnexion impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function unlinkEpic() {
    setBusy("epic-unlink");
    try {
      await disconnectEpic();
      setEpicLinked(false);
      onConnectionChanged("epic");
      onBanner("Compte Epic déconnecté.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Déconnexion impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="grid max-w-4xl gap-6">
      <header className="border-b border-rule-strong pb-5">
        <p className="pn-data mb-2">Compte</p>
        <div className="flex items-center gap-4">
          <SquareAvatar name={user.displayName} avatarUrl={user.avatarUrl} />
          <div>
            <h2 className="pn-display text-4xl">Profil</h2>
            <p className="pn-data mt-2">{user.displayName}</p>
          </div>
        </div>
        <span className="pn-accent mt-4" />
      </header>

      <section className="border border-rule-strong">
        <div className="border-b border-rule-strong p-4">
          <p className="pn-data">Comptes de jeux</p>
          <h3 className="pn-display mt-2 text-2xl">Bibliothèques liées</h3>
        </div>
        <div className="divide-y divide-rule-strong">
          <ConnectionRow
            name="Microsoft / Xbox"
            description="Historique PC et jeux installés."
            linked={microsoftLinked}
            action={
              microsoftLinked
                ? unlinkMicrosoft
                : microsoftConfigured
                  ? linkMicrosoft
                  : undefined
            }
            actionLabel={microsoftLinked ? "Déconnecter" : "Lier"}
            busy={busy === "microsoft-link" || busy === "microsoft-unlink"}
            unavailable={!microsoftConfigured && !microsoftLinked}
          />
          <ConnectionRow
            name="Epic Games"
            description="Jeux possédés et installés."
            linked={epicLinked}
            action={epicLinked ? unlinkEpic : linkEpic}
            actionLabel={epicLinked ? "Déconnecter" : "Lier"}
            busy={busy === "epic-link" || busy === "epic-unlink"}
            unavailable={!isDesktop && !epicLinked}
          />
        </div>
      </section>

      <section className="border border-rule-strong p-4">
        <p className="pn-data mb-2">Données</p>
        <h3 className="pn-display text-2xl">Ce que PlayNext conserve</h3>
        <p className="mt-3 max-w-2xl text-sm text-paper-2">
          Les identifiants de jeux, leur launcher, leur état d’installation et
          vos réglages de masquage. Les chemins locaux et les fichiers de votre
          PC ne sont jamais synchronisés.
        </p>
      </section>
    </section>
  );
}

function ConnectionRow({
  name,
  description,
  linked,
  action,
  actionLabel,
  busy,
  unavailable,
}: {
  name: string;
  description: string;
  linked: boolean;
  action?: () => Promise<void>;
  actionLabel: string;
  busy: boolean;
  unavailable: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div>
        <p className="font-ui font-bold uppercase tracking-[0.08em]">{name}</p>
        <p className="pn-data mt-1">{linked ? "Lié" : description}</p>
      </div>
      {action && !unavailable ? (
        <Button
          variant={linked ? "ghost" : "second"}
          disabled={busy}
          onClick={() => void action()}
        >
          {busy ? "…" : actionLabel}
        </Button>
      ) : (
        <span className="pn-data">Non configuré</span>
      )}
    </div>
  );
}
