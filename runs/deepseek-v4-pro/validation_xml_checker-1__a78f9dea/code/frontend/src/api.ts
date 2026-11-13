import { useEffect, useState } from "react";

export interface ValidationResult {
  valid: boolean;
  error: string | null;
  line: number | null;
  column: number | null;
  root_element: string | null;
}

export interface SavedValidation {
  id: number;
  xml_preview: string;
  valid: boolean;
  error: string | null;
  line: number | null;
  column: number | null;
  root_element: string | null;
  created_at: string;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

const TOKEN_KEY = "xml_checker_token";
const USER_KEY = "xml_checker_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function saveSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) {
    clearSession();
    throw new ApiError(401, "unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "request failed");
  }
  return data as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const api = {
  register: (username: string, password: string) =>
    request<{ username: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  validate: (xml: string) =>
    request<ValidationResult>("/validate/xml", {
      method: "POST",
      body: JSON.stringify({ xml }),
    }),
  save: (xml: string) =>
    request<SavedValidation>("/validations", {
      method: "POST",
      body: JSON.stringify({ xml }),
    }),
  list: (params: { valid?: string; page?: number; page_size?: number }) => {
    const q = new URLSearchParams();
    if (params.valid) q.set("valid", params.valid);
    q.set("page", String(params.page ?? 1));
    q.set("page_size", String(params.page_size ?? 10));
    return request<Page<SavedValidation>>(`/validations?${q.toString()}`);
  },
  remove: (id: number) =>
    request<{ deleted: boolean }>(`/validations/${id}`, { method: "DELETE" }),
};
