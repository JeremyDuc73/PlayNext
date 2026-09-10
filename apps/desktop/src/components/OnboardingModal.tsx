import { useState } from "react";
import { pad2 } from "../lib/format";
import { Button } from "../ui/Button";

type Step = {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  articles: Array<{
    code: string;
    headline: string;
    detail: string;
  }>;
  stamp: string;
};

const STEPS: Step[] = [
  {
    id: "ritual",
    badge: "ARTICLE 01 · RITUEL",
    title: "Le rituel décisionnel",
    subtitle: "DÉCIDER ENSEMBLE, SANS DÉBAT INTERMINABLE SUR DISCORD.",
    articles: [
      {
        code: "01",
        headline: "Sélection secrète",
        detail:
          "Chaque joueur sélectionne confidentiellement 1 à 5 jeux parmi les titres partagés par le groupe.",
      },
      {
        code: "02",
        headline: "Bulletins synchronisés",
        detail:
          "Le groupe vote simultanément sur chaque jeu (Chaud / Pourquoi pas / Pass) sans voir les votes d'autrui.",
      },
      {
        code: "03",
        headline: "Droit de veto souverain",
        detail:
          "Un veto par joueur et par soirée. Si un joueur applique son veto, le jeu est éliminé sans appel.",
      },
      {
        code: "04",
        headline: "Dépouillement immédiat",
        detail:
          "Le titre recueillant le meilleur score est proclamé. En cas d’égalité parfaite, la roulette tranche.",
      },
    ],
    stamp: "CE SOIR, ON DÉCIDE",
  },
  {
    id: "libraries",
    badge: "ARTICLE 02 · BIBLIOTHÈQUES",
    title: "Scan local & souveraineté",
    subtitle: "DÉTECTION DIRECTE EN LOCAL, AUCUN CHEMIN DIVULGUÉ.",
    articles: [
      {
        code: "01",
        headline: "Connecteurs automatiques",
        detail:
          "Détection native des installations et catalogues Steam, Xbox / PC Game Pass, Epic Games et Riot.",
      },
      {
        code: "02",
        headline: "Confidentialité totale",
        detail:
          "Vos chemins de disques ne quittent jamais votre machine. Seuls les identifiants de jeux sont synchronisés.",
      },
      {
        code: "03",
        headline: "Filtrage Steam Family",
        detail:
          "Le partage familial est détecté : seuls les jeux disposant de licences individuelles distinctes sont retenus.",
      },
      {
        code: "04",
        headline: "Filtre solo / groupe",
        detail:
          "Les jeux strictement solo sont écartés des votes de groupe. Vous pouvez aussi masquer un titre pour un groupe précis.",
      },
    ],
    stamp: "DONNÉES LOCALES",
  },
  {
    id: "groups",
    badge: "ARTICLE 03 · CERCLES",
    title: "Groupes & propositions",
    subtitle: "UN CERCLE D’AMIS, UN CATALOGUE COMMUN.",
    articles: [
      {
        code: "01",
        headline: "Invitation en un clic",
        detail:
          "Créez votre groupe et partagez le code d'invitation à 9 caractères ou le lien direct playnext://.",
      },
      {
        code: "02",
        headline: "Catalogue partagé",
        detail:
          "Accédez instantanément à la liste des jeux que tout le cercle possède en commun (possession croisée).",
      },
      {
        code: "03",
        headline: "Propositions Steam",
        detail:
          "Envie d'un nouveau titre ? Proposez-le depuis le Store Steam. Le groupe vote Chaud ou Non avant achat.",
      },
      {
        code: "04",
        headline: "Conversion directe",
        detail:
          "Si le cercle valide la proposition, une soirée directe est créée en un clic avec le jeu verrouillé.",
      },
    ],
    stamp: "CERCLE SOUVERAIN",
  },
  {
    id: "agenda",
    badge: "ARTICLE 04 · AGENDA",
    title: "Soirées & notifications",
    subtitle: "PLANIFIER OU DÉCIDER SUR-LE-CHAMP.",
    articles: [
      {
        code: "01",
        headline: "Soirée instantanée",
        detail:
          "Lancez un rituel sur-le-champ avec les membres présents qui confirment leur présence au lobby.",
      },
      {
        code: "02",
        headline: "Calendrier de groupe",
        detail:
          "Consultez l'agenda du mois (fuseau Europe/Paris) pour retrouver les sessions planifiées et confirmées.",
      },
      {
        code: "03",
        headline: "Temps réel natif",
        detail:
          "Flux d'événements en direct (SSE) : chaque présence et chaque vote déposé s'actualise instantanément.",
      },
      {
        code: "04",
        headline: "Relais Discord",
        detail:
          "Liez votre salon Discord pour annoncer l'ouverture du lobby et publier automatiquement la jaquette gagnante.",
      },
    ],
    stamp: "PROTOCOLE PRÊT",
  },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function OnboardingModal({ isOpen, onClose }: Props) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const step = STEPS[currentStep]!;
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  function go(delta: number) {
    const next = currentStep + delta;
    if (next >= 0 && next < STEPS.length) {
      setCurrentStep(next);
    }
  }

  function handleComplete() {
    setCurrentStep(0);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-deep/85 p-4 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleComplete();
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col border-2 border-paper bg-ink shadow-press"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        {/* En-tête officiel */}
        <header className="flex shrink-0 items-center justify-between border-b border-rule-strong bg-ink-deep px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="pn-stamp inline-flex">{step.badge}</span>
            <span className="pn-data font-data text-xs text-paper">
              {pad2(currentStep + 1)} / {pad2(STEPS.length)}
            </span>
          </div>
          <button
            type="button"
            className="pn-data text-smoke hover:text-paper"
            onClick={handleComplete}
          >
            Fermer ✕
          </button>
        </header>

        {/* Jauge par crans (DA BULLETIN : segments de 6px, gap 3px) */}
        <div className="flex gap-[3px] bg-ink-deep px-6 pb-3 pt-1" aria-hidden>
          {STEPS.map((s, index) => (
            <div
              key={s.id}
              className={
                index <= currentStep
                  ? "h-[4px] flex-1 bg-paper"
                  : "h-[4px] flex-1 bg-rule"
              }
            />
          ))}
        </div>

        {/* Corps de l'article */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 md:p-8">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="onboarding-title" className="pn-display text-3xl sm:text-4xl text-paper">
                {step.title}
              </h2>
              <span className="pn-stamp text-xs">{step.stamp}</span>
            </div>
            <p className="pn-data mt-2 text-smoke">{step.subtitle}</p>
            <span className="pn-accent mt-3 block" />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {step.articles.map((art) => (
              <div
                key={art.code}
                className="border border-rule-strong bg-ink-deep p-4 transition-colors"
              >
                <div className="flex items-center gap-2 border-b border-rule pb-2">
                  <span className="font-data text-xs font-bold text-paper">
                    {art.code} ·
                  </span>
                  <h3 className="font-ui text-xs font-bold uppercase tracking-[0.1em] text-paper">
                    {art.headline}
                  </h3>
                </div>
                <p className="mt-2.5 font-ui text-xs leading-relaxed text-paper-2">
                  {art.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Pied de page et navigation */}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-rule-strong bg-ink-deep px-6 py-4">
          <button
            type="button"
            className="pn-data text-smoke hover:text-paper"
            onClick={handleComplete}
          >
            Passer l’introduction
          </button>

          <div className="flex items-center gap-3">
            {!isFirst ? (
              <Button
                variant="second"
                onClick={() => go(-1)}
              >
                Précédent
              </Button>
            ) : null}

            {isLast ? (
              <Button
                variant="primary"
                onClick={handleComplete}
              >
                Prendre part au rituel
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => go(1)}
              >
                Suivant
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
