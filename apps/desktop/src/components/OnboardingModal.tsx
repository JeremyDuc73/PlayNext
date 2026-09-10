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
    badge: "ÉTAPE 01 · COMMENT ÇA MARCHE",
    title: "Savoir enfin à quoi jouer",
    subtitle: "FINIE LA GALÈRE DU CHOIX, SANS DÉBAT INTERMINABLE SUR DISCORD.",
    articles: [
      {
        code: "01",
        headline: "Ta shortlist secrète",
        detail:
          "Chacun pioche discrètement 1 à 5 jeux parmi les titres que vous avez tous en commun.",
      },
      {
        code: "02",
        headline: "Vote en direct",
        detail:
          "Tout le monde vote en même temps (Chaud / Pourquoi pas / Pass) sans voir ce que votent les autres.",
      },
      {
        code: "03",
        headline: "Le joker veto",
        detail:
          "Un jeu te sort par les yeux ? Pose ton veto : le titre est dégagé direct pour la soirée, sans négociation.",
      },
      {
        code: "04",
        headline: "Le grand gagnant",
        detail:
          "Le jeu qui met tout le monde d'accord l'emporte direct. Et en cas d’égalité parfaite, la roulette tranche !",
      },
    ],
    stamp: "CE SOIR, ON JOUE",
  },
  {
    id: "libraries",
    badge: "ÉTAPE 02 · TES JEUX",
    title: "Toutes tes bibliothèques réunies",
    subtitle: "STEAM, XBOX, EPIC ET RIOT CONNECTÉS EN 2 SECONDES.",
    articles: [
      {
        code: "01",
        headline: "Zéro prise de tête",
        detail:
          "L'application détecte directement les jeux installés sur ton PC sans aucune configuration manuelle.",
      },
      {
        code: "02",
        headline: "100% privé",
        detail:
          "Tes fichiers et dossiers personnels ne quittent jamais ton PC. Seuls les noms de tes jeux sont partagés.",
      },
      {
        code: "03",
        headline: "Steam Family intelligent",
        detail:
          "Le partage familial est bien géré : pas de faux espoir sur un jeu si vous ne pouvez pas y jouer ensemble.",
      },
      {
        code: "04",
        headline: "Que du multi",
        detail:
          "Les jeux purement solo sont écartés d'office pour ne pas polluer les soirées entre potes.",
      },
    ],
    stamp: "SYNCHRO FACILE",
  },
  {
    id: "groups",
    badge: "ÉTAPE 03 · TON GROUPE",
    title: "Ton cercle de potes",
    subtitle: "UN CODE RAPIDE, ET TOUTE L'ÉQUIPE EST LÀ.",
    articles: [
      {
        code: "01",
        headline: "Invite ta bande",
        detail:
          "Partage un simple code à 9 lettres ou un lien direct pour que tes potes rejoignent ton groupe en un clic.",
      },
      {
        code: "02",
        headline: "Vos jeux en commun",
        detail:
          "Découvre instantanément la liste exacte des jeux que tout le monde possède déjà pour jouer ensemble.",
      },
      {
        code: "03",
        headline: "Envie d'un nouveau jeu ?",
        detail:
          "Propose un jeu Steam au groupe. Tout le monde vote Chaud ou Non avant de passer à la caisse.",
      },
      {
        code: "04",
        headline: "Du vote à la partie",
        detail:
          "Si tout le monde est chaud, la soirée est créée automatiquement avec le jeu déjà verrouillé.",
      },
    ],
    stamp: "ENTRE POTES",
  },
  {
    id: "agenda",
    badge: "ÉTAPE 04 · LES SOIRÉES",
    title: "Organiser vos soirées",
    subtitle: "POUR CE SOIR OU POUR LE WEEK-END PROCHAIN.",
    articles: [
      {
        code: "01",
        headline: "Partie improvisée",
        detail:
          "Envie de jouer là maintenant ? Lancez le lobby, chacun confirme qu'il est devant son écran et c'est parti.",
      },
      {
        code: "02",
        headline: "Calendrier du groupe",
        detail:
          "Planifiez vos prochaines sessions à l'avance pour être sûrs de bloquer la date ensemble.",
      },
      {
        code: "03",
        headline: "En direct live",
        detail:
          "Tout est synchronisé en temps réel : dès qu'un pote clique sur prêt ou dépose son vote, ça bouge sous tes yeux.",
      },
      {
        code: "04",
        headline: "Notifs sur Discord",
        detail:
          "Connecte ton salon Discord : le bot annonce le début des votes et affiche fièrement la jaquette gagnante !",
      },
    ],
    stamp: "PRÊT À JOUER",
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
            Passer
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
                C'est parti, on joue !
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
