import { Button } from "./Button";

type Props = {
  title: string;
  children: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-deep/80 p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-lg border-2 border-paper bg-ink p-6 shadow-press"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-rule-strong pb-4">
          <div>
            <span className="pn-stamp mb-3 inline-flex">CONFIRMATION</span>
            <h2 id="confirm-dialog-title" className="pn-display text-3xl">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="pn-data text-smoke hover:text-paper"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fermer"
          >
            Fermer
          </button>
        </div>
        <p className="mb-6 text-sm text-paper-2">{children}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="second" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <Button variant="veto" onClick={onConfirm} disabled={busy}>
            {busy ? "Suppression…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
