export default function Message({
  kind,
  text,
}: {
  kind: "ok" | "error";
  text: string;
}) {
  if (!text) return null;
  return (
    <p
      className={
        kind === "ok"
          ? "rounded-md bg-green-50 p-3 text-sm text-green-800"
          : "rounded-md bg-red-50 p-3 text-sm text-red-800"
      }
    >
      {text}
    </p>
  );
}
