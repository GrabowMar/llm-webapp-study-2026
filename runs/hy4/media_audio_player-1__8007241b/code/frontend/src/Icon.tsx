import type { ReactNode } from "react";

interface IconProps {
  name:
    | "play"
    | "pause"
    | "prev"
    | "next"
    | "volume"
    | "mute"
    | "search"
    | "trash"
    | "plus"
    | "logout"
    | "music"
    | "close";
  className?: string;
}

const paths: Record<IconProps["name"], ReactNode> = {
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M6 5h4v14H6zm8 0h4v14h-4z" />,
  prev: <path d="M6 6h2v12H6zm3.5 6L18 6v12z" />,
  next: <path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" />,
  volume: (
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />
  ),
  mute: (
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3l2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" />
  ),
  search: (
    <path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5-5-5zm-5 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
  ),
  trash: (
    <path d="M6 7h12l-1 13H7L6 7zm3-3h6l1 2H8l1-2zM4 6h16v2H4z" />
  ),
  plus: <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />,
  logout: (
    <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3zm4.5 4.5L13 9l3 3H8v2h8l-3 3 1.5 1.5L20 13l-5.5-5.5z" />
  ),
  music: (
    <path d="M12 3v10.6A4 4 0 1 0 14 17V7h5V3h-7z" />
  ),
  close: (
    <path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" />
  ),
};

export default function Icon({ name, className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
