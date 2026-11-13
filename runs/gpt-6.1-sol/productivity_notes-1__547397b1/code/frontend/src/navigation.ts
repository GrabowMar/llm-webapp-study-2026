import { createContext } from "react";

export type Navigate = (href: string, options?: { replace?: boolean; scroll?: boolean }) => void;
export const NavigationContext = createContext<Navigate>(href => window.location.assign(href));
