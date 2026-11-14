import type { Order, PriceCard } from "@kootu/shared";

let base: string = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? "";
/** Native builds and tests point the app at an absolute server address. */
export const setApiBase = (url: string) => { base = url; };

export interface LotInfo {
  id: string; itemId: string; variety: string; harvest: { season: string; year: number } | null;
  milledOn: string; milledAt: string; supplierName: string | null;
}
export interface ApartmentPublic { id: string; name: string; nameTa: string | null; captainName: string | null; card: PriceCard | null; lots: LotInfo[] }
export interface Resident { id: string; apartmentId: string; flat: string; name: string }
export interface Roster {
  cycleId: string; paidHouseholds: number;
  orders: Array<{ flat: string; residentName: string; lines: Order["lines"]; paymentState: Order["payment"]["state"] }>;
  ledger: Array<{ id: string; cycleId: string; amountPaise: number; note: string }>;
}

export class ApiError extends Error {
  constructor(public code: string) { super(code); }
}

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? "ERROR");
  return data as T;
}

export const api = {
  config: () => call<{ upiVpa: string | null; payeeName: string }>("GET", "/config"),
  apartment: (id: string) => call<ApartmentPublic>("GET", `/apartments/${encodeURIComponent(id)}/public`),
  join: (aptId: string, body: { name: string; flat: string; phone: string; iConfirmIWantToJoin: true }) =>
    call<Resident>("POST", `/apartments/${encodeURIComponent(aptId)}/residents`, body),
  me: (residentId: string) => call<{ resident: Resident; orders: Order[] }>("GET", `/residents/${residentId}`),
  order: (body: { cycleId: string; residentId: string; lines: Order["lines"] }) => call<Order>("POST", "/orders", body),
  roster: (aptId: string, cycleId: string, code: string) =>
    call<Roster>("GET", `/apartments/${encodeURIComponent(aptId)}/roster?cycleId=${cycleId}`, undefined, { "x-captain-code": code }),
};
