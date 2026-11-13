import { useCallback } from "react";
import { ApiError } from "./api";

const ERROR_MESSAGES: Record<string, string> = {
  "Invalid username or password": "Invalid username or password.",
};

export function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    return ERROR_MESSAGES[err.message] ?? err.message;
  }
  return "Something went wrong. Please try again.";
}

export function useApiMessage() {
  return useCallback(messageFor, []);
}
