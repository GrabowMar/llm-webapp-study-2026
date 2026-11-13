export default function DropIndicator({ visible }: { visible: boolean }) {
  if (!visible) return <div className="h-0.5" />;
  return (
    <div className="relative h-0.5">
      <div className="absolute inset-x-0 top-0 h-0.5 rounded bg-blue-500" />
      <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-blue-500" />
    </div>
  );
}
