import { useEffect, useState } from "react";
import { timeAgo } from "../format";

export default function TimeAgo({
  iso,
  className = "",
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className={className} title={iso ?? "no readings yet"}>
      {timeAgo(iso)}
    </span>
  );
}
