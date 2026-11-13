import type { AnchorHTMLAttributes, ReactNode } from "react";

export function navigate(to: string): void {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new Event("navigation"));
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

export default function Link({ to, children, ...rest }: LinkProps & { children: ReactNode }) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(event) => {
        event.preventDefault();
        rest.onClick?.(event);
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
