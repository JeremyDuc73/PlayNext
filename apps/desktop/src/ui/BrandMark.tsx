export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/playnext.svg"
      alt="PlayNext"
      className="block shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
