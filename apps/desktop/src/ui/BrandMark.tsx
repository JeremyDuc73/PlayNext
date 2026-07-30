export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <div
      className="relative shrink-0 bg-paper"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="absolute bottom-0 right-0 bg-ink-deep"
        style={{
          width: Math.round(size * 0.45),
          height: Math.round(size * 0.45),
        }}
      />
      <span
        className="absolute left-0 top-0 bg-veto"
        style={{ width: 2, height: Math.round(size * 0.35) }}
      />
    </div>
  );
}
