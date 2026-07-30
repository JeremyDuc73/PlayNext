type Props = {
  title: string;
  body?: string;
};

export function EmptyHint({ title, body }: Props) {
  return (
    <div className="my-16 border-y border-rule-strong py-10 text-center">
      <p className="pn-display text-2xl text-paper">{title}</p>
      {body ? (
        <p className="mt-3 font-data text-[11px] tracking-[0.14em] text-smoke uppercase">
          {body}
        </p>
      ) : null}
    </div>
  );
}
