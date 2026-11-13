import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "currentColor",
  "aria-hidden": true,
} as const;

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 5.14v13.72c0 .8.87 1.29 1.55.88l11.2-6.86a1.04 1.04 0 0 0 0-1.76L9.55 4.26A1.04 1.04 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" />
    </svg>
  );
}

export function NextIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 5.2v13.6c0 .8.87 1.28 1.54.87l10-6.8a1.04 1.04 0 0 0 0-1.74l-10-6.8A1.04 1.04 0 0 0 6 5.2ZM17 4h2.5v16H17z" />
    </svg>
  );
}

export function PreviousIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M18 5.2v13.6c0 .8-.87 1.28-1.54.87l-10-6.8a1.04 1.04 0 0 1 0-1.74l10-6.8A1.04 1.04 0 0 1 18 5.2ZM4.5 4H7v16H4.5z" />
    </svg>
  );
}

export function VolumeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9.5v5a1 1 0 0 0 1 1h3.2l3.9 3.4c.66.58 1.65.11 1.65-.77V5.87c0-.88-.99-1.35-1.65-.77L8.2 8.5H5a1 1 0 0 0-1 1Z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MuteIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9.5v5a1 1 0 0 0 1 1h3.2l3.9 3.4c.66.58 1.65.11 1.65-.77V5.87c0-.88-.99-1.35-1.65-.77L8.2 8.5H5a1 1 0 0 0-1 1Z" />
      <path d="m16 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6h4a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2h4V4.5a1 1 0 0 1 1-1Zm-3 6h12l-.8 10.1a2 2 0 0 1-2 1.9H7.8a2 2 0 0 1-2-1.9L5 9.5Z" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10.5 3a7.5 7.5 0 1 1-4.9 13.2l-2.6 2.6a1 1 0 0 1-1.4-1.4l2.6-2.6A7.5 7.5 0 0 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" />
    </svg>
  );
}

export function MusicIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 3.5v10.9a3.1 3.1 0 1 1-2-2.9V7.3L10 9v8.4a3.1 3.1 0 1 1-2-2.9V6.4l12-2.9Z" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z" />
    </svg>
  );
}
