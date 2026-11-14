// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, inject, it } from "vitest";
import { setApiBase } from "./api.js";
import { App } from "./App.js";

/**
 * Screen tests against the real backend (started by test/start-api.ts).
 * Rendered in a simulated browser, not on a real phone.
 */
const url = inject("apiUrl");
const ops = async (method: string, path: string, body: unknown) => {
  const res = await fetch(`${url}/api${path}`, { method, headers: { "content-type": "application/json", "x-ops-key": "test-ops-key" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${await res.text()}`);
};
const quote = (id: string, itemId: string, paise: number) => ({
  id, supplierId: `s-${id}`, supplierName: "Delta Mill", supplierKind: "MILL", itemId, pricePerKgPaise: paise, form: "WRITTEN",
  receivedAt: "2026-12-20T10:00:00+05:30", validUntil: "2026-12-28T10:00:00+05:30", minOrderGrams: 500_000, leadTimeDays: 3,
  rationDeclarationSigned: true, supplyConfirmedAt: "2026-12-20T12:00:00+05:30",
});

beforeAll(async () => {
  setApiBase(url);
  await ops("POST", "/apartments", {
    id: "tower-a", name: "Tower A", nameTa: "டவர் ஏ", flats: 300, routeClusterId: "OMR", maxVehicle: "MINI_TRUCK",
    dropPoint: { kind: "GATE", note: null }, association: "REGISTERED", gateConsentAt: null, captain: { name: "Meena", flat: "A-101" }, cyclesCompleted: 0,
  });
  await ops("PUT", "/cycles/2027-01/clusters/OMR/plan", { supplyRequestedAt: "2026-12-20T10:00:00+05:30", lotLockAt: "2026-12-26T09:00:00+05:30", dropCostPaise: 250_000 });
  await ops("POST", "/quotes", quote("q-rice", "PONNI_RICE_BOILED", 4300));
  await ops("POST", "/quotes", quote("q-dal", "TOOR_DAL", 10_300));
  await ops("POST", "/lots", {
    id: "lot-rice", supplierId: "s-q-rice", quoteId: "q-rice", itemId: "PONNI_RICE_BOILED", variety: "Ponni", harvest: { season: "SAMBA", year: 2026 },
    milledOn: "2026-12-12", milledAt: "Thanjavur", sample: { moistureBp: 1300, brokenBp: 300, sampledAt: "2026-12-20T10:00:00+05:30", retainedUntil: "2027-03-20" }, weightSlipGrams: 2_000_000,
  });
  await ops("POST", "/cycles/2027-01/clusters/OMR/price-card", {
    items: [
      { quoteId: "q-rice", packGrams: 25_000, lotId: "lot-rice", pricing: { itemId: "PONNI_RICE_BOILED", transportPackingPaisePerKg: 300, marginPaisePerKg: 900, prePackedLabelled: true } },
      { quoteId: "q-dal", packGrams: 4_000, lotId: null, pricing: { itemId: "TOOR_DAL", transportPackingPaisePerKg: 300, marginPaisePerKg: 1200, prePackedLabelled: true } },
    ],
  });
  await ops("PUT", "/apartments/tower-a/captain-code", { code: "meena-2027" });
});

afterEach(() => { cleanup(); window.localStorage.clear(); });
const open = (path: string) => { window.history.pushState({}, "", path); render(<App />); };

describe("resident screen", () => {
  it("opens in Tamil and shows the open-book price with where the rice was milled", async () => {
    open("/?apt=tower-a");
    expect(await screen.findByText("பொன்னி புழுங்கல் அரிசி")).toBeTruthy();
    expect(screen.getByText("₹1,375")).toBeTruthy();
    expect(screen.getAllByText("எங்கள் நிலையான லாபம்")).toHaveLength(2);
    expect(screen.getByText(/Thanjavur/)).toBeTruthy();
    expect(screen.getByText("டவர் ஏ")).toBeTruthy();
  });
  it("switches to English", async () => {
    open("/?apt=tower-a");
    fireEvent.click(await screen.findByText("English"));
    expect(await screen.findByText("Ponni boiled rice")).toBeTruthy();
    expect(screen.getByText("GST")).toBeTruthy();
  });
  it("will not let anyone join without ticking the consent box, then takes an order and shows what to pay", async () => {
    open("/?apt=tower-a");
    fireEvent.click(await screen.findByText("English"));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Kavitha" } });
    fireEvent.change(screen.getByLabelText("Flat number"), { target: { value: "B-202" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9800000001" } });
    const join = screen.getByRole("button", { name: "Join" }) as HTMLButtonElement;
    expect(join.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(join.disabled).toBe(false);
    fireEvent.click(join);

    const place = (await screen.findByRole("button", { name: "Place order" })) as HTMLButtonElement;
    expect(place.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Ponni boiled rice +"));
    fireEvent.click(screen.getByLabelText("Toor dal +"));
    expect(screen.getByText("₹1,870.60")).toBeTruthy();
    fireEvent.click(place);

    expect(await screen.findByText("Amount to pay")).toBeTruthy();
    const pay = screen.getByText("Pay by UPI") as HTMLAnchorElement;
    expect(pay.getAttribute("href")).toContain("am=1870.60");
    expect(screen.getByText(/Never hand money to the captain/)).toBeTruthy();
  });
  it("says so plainly when there is no apartment link", () => {
    open("/");
    expect(screen.getByText("உங்கள் குடியிருப்பின் இணைப்பை கேப்டனிடம் கேளுங்கள்.")).toBeTruthy();
  });
});

describe("captain screen", () => {
  it("refuses a wrong code and shows the roster with the right one", async () => {
    open("/?apt=tower-a#/captain");
    fireEvent.click(await screen.findByText("English"));
    fireEvent.change(await screen.findByLabelText("Captain code"), { target: { value: "wrong-code" } });
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(await screen.findByText("Wrong code.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Captain code"), { target: { value: "meena-2027" } });
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    await waitFor(() => expect(screen.getByText("Households paid")).toBeTruthy());
    expect(screen.getByText("B202")).toBeTruthy();
    expect(screen.getByText("Not paid")).toBeTruthy();
  });
});
