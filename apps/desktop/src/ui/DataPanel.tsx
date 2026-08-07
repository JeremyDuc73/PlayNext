import { Button } from "./Button";

export function DataPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-deep/80 p-6">
      <section
        className="w-full max-w-2xl border-2 border-paper bg-ink p-6 shadow-press"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-panel-title"
      >
        <header className="mb-6 flex items-start justify-between gap-4 border-b border-rule-strong pb-4">
          <div>
            <p className="pn-data mb-2">Confidentialité</p>
            <h2 id="data-panel-title" className="pn-display text-3xl">
              Mes données
            </h2>
          </div>
          <button
            type="button"
            className="pn-data text-smoke hover:text-paper"
            onClick={onClose}
          >
            Fermer
          </button>
        </header>

        <div className="grid gap-5 text-sm text-paper-2">
          <div className="border-b border-rule pb-4">
            <h3 className="mb-2 font-ui font-bold uppercase tracking-[0.12em] text-paper">
              Synchronisé
            </h3>
            <p>
              Identifiants des jeux, launcher, possession, installation et
              masquages nécessaires au fonctionnement des groupes.
            </p>
          </div>
          <div className="border-b border-rule pb-4">
            <h3 className="mb-2 font-ui font-bold uppercase tracking-[0.12em] text-paper">
              Jamais envoyé
            </h3>
            <p>
              Chemins locaux, exécutables, fichiers et nom du compte Windows.
            </p>
          </div>
          <div>
            <h3 className="mb-2 font-ui font-bold uppercase tracking-[0.12em] text-paper">
              Contrôle
            </h3>
            <p>
              Vous pouvez masquer un jeu de votre bibliothèque sans supprimer
              son installation ni vos données de launcher.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-rule-strong pt-4">
          <Button variant="second" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </section>
    </div>
  );
}
