import { useState } from "react";
import { Button } from "../../ui/Button";

type Props = {
  isOpen: boolean;
  groupName: string;
  code: string | null;
  link: string | null;
  busy?: boolean;
  onClose: () => void;
  onGenerateNew?: () => void;
};

export function InviteModal({
  isOpen,
  groupName,
  code,
  link,
  busy = false,
  onClose,
  onGenerateNew,
}: Props) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  async function handleCopyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Ignore
    }
  }

  async function handleCopyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-deep/85 p-4 sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full max-w-lg border-2 border-paper bg-ink p-6 shadow-press"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-rule-strong pb-4">
          <div>
            <span className="pn-stamp mb-2 inline-flex">INVITATION</span>
            <h2 id="invite-modal-title" className="pn-display text-3xl">
              Inviter un ami
            </h2>
            <p className="pn-data mt-1 text-smoke">Groupe · {groupName}</p>
          </div>
          <button
            type="button"
            className="pn-data text-smoke hover:text-paper"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
          >
            Fermer ✕
          </button>
        </div>

        <div className="grid gap-6">
          {/* 1. Code d'invitation */}
          <div>
            <label className="pn-data mb-2 block text-paper">
              1. Code d’accès (recommandé dans l’application)
            </label>
            <div className="flex items-center gap-2 border border-rule-strong bg-ink-deep p-2">
              <span className="flex-1 px-2 font-data text-xl font-bold tracking-[0.2em] text-paper select-all">
                {code ?? "…"}
              </span>
              <Button
                variant={copiedCode ? "primary" : "second"}
                disabled={!code || busy}
                onClick={() => void handleCopyCode()}
              >
                {copiedCode ? "Copié ✓" : "Copier le code"}
              </Button>
            </div>
            <p className="pn-data mt-1.5 text-smoke">
              Dans l’app, ton ami clique sur « Code » en haut à gauche et colle ce code.
            </p>
          </div>

          {/* 2. Lien direct */}
          <div>
            <label className="pn-data mb-2 block text-paper">
              2. Lien direct (Discord, messages)
            </label>
            <div className="flex items-center gap-2 border border-rule-strong bg-ink-deep p-2">
              <input
                readOnly
                value={link ?? ""}
                className="min-w-0 flex-1 bg-transparent px-2 font-data text-xs text-smoke outline-none select-all"
              />
              <Button
                variant={copiedLink ? "primary" : "second"}
                disabled={!link || busy}
                onClick={() => void handleCopyLink()}
              >
                {copiedLink ? "Copié ✓" : "Copier le lien"}
              </Button>
            </div>
            <p className="pn-data mt-1.5 text-smoke">
              Ouvre directement l’application PlayNext et affiche l’invitation.
            </p>
          </div>

          <div className="border-t border-rule pt-3 text-xs text-smoke font-data">
            Valable 14 jours · Utilisations illimitées.
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule-strong pt-4">
          {onGenerateNew ? (
            <button
              type="button"
              className="pn-data text-smoke hover:text-paper"
              disabled={busy}
              onClick={onGenerateNew}
            >
              Générer un autre code
            </button>
          ) : (
            <div />
          )}
          <Button variant="primary" onClick={onClose}>
            Terminé
          </Button>
        </div>
      </div>
    </div>
  );
}
