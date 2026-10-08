import type { Label, ModelResults, Stats, Ticket, TicketList } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

export const api = {
  health: () => request<{ database: string; model: string; modelVersion: string | null }>("/api/health"),
  createTicket: (body: { project: string; title: string; body: string }) =>
    request<{ ticket: Ticket; classificationError: string | null }>("/api/tickets", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listTickets: (query: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    return request<TicketList>(`/api/tickets?${params.toString()}`);
  },
  getTicket: (id: string) => request<Ticket>(`/api/tickets/${id}`),
  updateTicket: (id: string, body: { processStatus?: string; note?: string }) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  reviewTicket: (id: string, body: { action: "confirm" | "correct"; label?: Label; note?: string }) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}/review`, { method: "POST", body: JSON.stringify(body) }),
  retryTicket: (id: string) =>
    request<{ ticket: Ticket; classificationError: string | null }>(`/api/tickets/${id}/retry-classification`, {
      method: "POST",
    }),
  stats: (query: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return request<Stats>(`/api/stats?${params.toString()}`);
  },
  modelResults: () => request<ModelResults>("/api/model-results"),
};
