import { type GroupSummary, roleLabel } from "../../lib/groups";
import { pad2 } from "../../lib/format";
import { Button } from "../../ui/Button";

export type GroupSidebarProps = {
  groups: GroupSummary[];
  selectedId: string | null;
  onSelectGroup: (id: string) => void;
  sharedCount: number;
  loading: boolean;
  busy: boolean;
  composer: "idle" | "create" | "join";
  onToggleComposer: (mode: "create" | "join") => void;
  newName: string;
  onNewNameChange: (v: string) => void;
  joinCode: string;
  onJoinCodeChange: (v: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onCancelComposer: () => void;
  showActions?: boolean;
};

export function GroupSidebar({
  groups,
  selectedId,
  onSelectGroup,
  sharedCount,
  loading,
  busy,
  composer,
  onToggleComposer,
  newName,
  onNewNameChange,
  joinCode,
  onJoinCodeChange,
  onCreate,
  onJoin,
  onCancelComposer,
  showActions = true,
}: GroupSidebarProps) {
  return (
    <aside className="flex flex-col border-b border-rule-strong lg:border-b-0 lg:border-r">
      <div className="flex h-14 items-center justify-between border-b border-rule-strong px-4">
        <p className="pn-data">Groupes</p>
        {showActions ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center border border-paper-2 font-data text-sm leading-none text-paper hover:border-paper hover:bg-ink-raise"
              aria-label="Créer un groupe"
              onClick={() => onToggleComposer("create")}
            >
              +
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center border border-paper-2 px-2.5 font-data text-[11px] font-medium uppercase tracking-[0.14em] text-paper hover:border-paper hover:bg-ink-raise"
              onClick={() => onToggleComposer("join")}
            >
              Code
            </button>
          </div>
        ) : null}
      </div>

      {showActions && composer !== "idle" ? (
        <div className="grid gap-2 border-b border-rule-strong p-3">
          <input
            className="border border-rule-strong bg-ink-deep px-3 py-2 font-data text-[11px] tracking-[0.1em] uppercase outline-none focus:border-paper"
            placeholder={composer === "create" ? "Nom" : "Code"}
            value={composer === "create" ? newName : joinCode}
            autoFocus
            onChange={(e) =>
              composer === "create"
                ? onNewNameChange(e.target.value)
                : onJoinCodeChange(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter")
                void (composer === "create" ? onCreate() : onJoin());
              if (e.key === "Escape") onCancelComposer();
            }}
          />
          <Button
            variant="primary"
            disabled={
              busy ||
              !(composer === "create" ? newName.trim() : joinCode.trim())
            }
            onClick={() =>
              void (composer === "create" ? onCreate() : onJoin())
            }
          >
            {composer === "create" ? "Créer" : "Rejoindre"}
          </Button>
        </div>
      ) : null}

      {loading ? (
        <p className="p-4 pn-data">Chargement…</p>
      ) : groups.length === 0 ? (
        <p className="p-4 pn-data">Pas encore de groupe</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {groups.map((group) => (
            <li key={group.id} data-channel>
              <button
                type="button"
                className={
                  selectedId === group.id
                    ? "pn-edge-active w-full cursor-pointer bg-ink-raise px-4 py-3.5 text-left"
                    : "w-full cursor-pointer px-4 py-3.5 text-left hover:bg-ink-raise"
                }
                onClick={() => onSelectGroup(group.id)}
              >
                <strong className="block font-ui text-sm font-bold uppercase tracking-[0.08em]">
                  {group.name}
                </strong>
                <span className="pn-data mt-1 block">
                  {pad2(group.memberCount ?? 0)} joueurs
                  {group.myRole ? ` · ${roleLabel(group.myRole)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto border-t border-rule-strong p-4">
        <p className="pn-data mb-2">Jeux en commun</p>
        <p className="pn-display text-2xl">{pad2(sharedCount)}</p>
      </div>
    </aside>
  );
}
