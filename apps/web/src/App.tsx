import { useCallback, useEffect, useState, type FormEvent } from "react";
import { kg, rupees } from "@kootu/engine";
import type { Order, PriceCardLine } from "@kootu/shared";
import { api, ApiError, type ApartmentPublic, type LotInfo, type Resident, type Roster } from "./api.js";
import { itemName, t, type Lang } from "./i18n.js";

/** Remembered on this phone only. Storage can be unavailable, so every use is guarded. */
const remember = {
  get(key: string): string | null { try { return window.localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string): void { try { window.localStorage.setItem(key, value); } catch { /* not remembered */ } },
};

export function App() {
  const [lang, setLang] = useState<Lang>(remember.get("lang") === "en" ? "en" : "ta");
  const [hash, setHash] = useState(window.location.hash);
  const aptId = new URLSearchParams(window.location.search).get("apt");
  const [apt, setApt] = useState<ApartmentPublic | null>(null);
  const [problem, setProblem] = useState<"notFound" | "error" | null>(null);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; remember.set("lang", lang); }, [lang]);
  useEffect(() => {
    if (!aptId) return;
    api.apartment(aptId).then(setApt).catch((e: unknown) => setProblem(e instanceof ApiError && e.code === "NOT_FOUND" ? "notFound" : "error"));
  }, [aptId]);

  const go = (to: string) => { window.location.hash = to; setHash(to); };

  return (
    <main>
      <header>
        <div>
          <h1>{t(lang, "brand")}</h1>
          {apt && <p>{lang === "ta" ? apt.nameTa ?? apt.name : apt.name}</p>}
        </div>
        <button className="quiet" onClick={() => setLang(lang === "ta" ? "en" : "ta")}>{t(lang, "otherLang")}</button>
      </header>
      {!aptId && <p>{t(lang, "noApartment")}</p>}
      {problem && <p className="bad">{t(lang, problem)}</p>}
      {aptId && !apt && !problem && <p>{t(lang, "loading")}</p>}
      {apt && (hash === "#/captain" ? <CaptainView lang={lang} apt={apt} /> : <ResidentView lang={lang} apt={apt} />)}
      {apt && (
        <footer>
          <button className="quiet" onClick={() => go(hash === "#/captain" ? "" : "#/captain")}>
            {hash === "#/captain" ? t(lang, "back") : t(lang, "captain")}
          </button>
        </footer>
      )}
    </main>
  );
}

function PriceLine({ lang, line, lot }: { lang: Lang; line: PriceCardLine; lot: LotInfo | undefined }) {
  const why = line.reasons[1] ?? line.reasons[0];
  return (
    <section className="card">
      <h3><span>{itemName(lang, line.itemId)}</span><span>{rupees(line.packPricePaise)}</span></h3>
      <p className="sub">{kg(line.packGrams)} {t(lang, "kgPack")}</p>
      <dl>
        <dt>{t(lang, "mill")}</dt><dd>{rupees(line.parts.supplierPaise)}</dd>
        <dt>{t(lang, "transport")}</dt><dd>{rupees(line.parts.transportPackingPaise)}</dd>
        <dt>{t(lang, "margin")}</dt><dd>{rupees(line.parts.marginPaise)}</dd>
        {line.parts.gstPaise > 0 && (<><dt>{t(lang, "gst")}</dt><dd>{rupees(line.parts.gstPaise)}</dd></>)}
      </dl>
      {why && <p className="why">{why[lang]}</p>}
      {lot && (
        <p className="lot">
          {[lot.supplierName, lot.milledAt, `${t(lang, "milled")} ${lot.milledOn}`, lot.harvest ? `${lot.harvest.season} ${lot.harvest.year}` : null].filter(Boolean).join(" · ")}
        </p>
      )}
    </section>
  );
}

function ResidentView({ lang, apt }: { lang: Lang; apt: ApartmentPublic }) {
  const key = `resident:${apt.id}`;
  const [resident, setResident] = useState<Resident | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [upiVpa, setUpiVpa] = useState<string | null>(null);
  const card = apt.card;

  const refresh = useCallback(async (residentId: string) => {
    const me = await api.me(residentId);
    setResident(me.resident);
    setOrder(me.orders.find((o) => o.cycleId === card?.cycleId) ?? null);
  }, [card?.cycleId]);

  useEffect(() => {
    const saved = remember.get(key);
    if (saved) refresh(saved).catch(() => undefined);
    api.config().then((c) => setUpiVpa(c.upiVpa)).catch(() => undefined);
  }, [key, refresh]);

  if (!card) return <p>{t(lang, "noCard")}</p>;
  return (
    <>
      <h2>{t(lang, "thisMonth")}</h2>
      {card.lines.map((line) => (
        <PriceLine key={`${line.itemId}-${line.packGrams}`} lang={lang} line={line} lot={apt.lots.find((l) => l.id === line.lotId)} />
      ))}
      {!resident && <JoinForm lang={lang} aptId={apt.id} onJoined={(r) => { remember.set(key, r.id); setResident(r); }} />}
      {resident && !order && <OrderForm lang={lang} lines={card.lines} cycleId={card.cycleId} residentId={resident.id} onOrdered={setOrder} />}
      {resident && order && <PayPanel lang={lang} order={order} upiVpa={upiVpa} />}
    </>
  );
}

function JoinForm({ lang, aptId, onJoined }: { lang: Lang; aptId: string; onJoined: (r: Resident) => void }) {
  const [name, setName] = useState("");
  const [flat, setFlat] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [failed, setFailed] = useState(false);
  const ready = name.trim() !== "" && flat.trim() !== "" && /^\+?\d{10,13}$/.test(phone) && agreed;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    api.join(aptId, { name: name.trim(), flat: flat.trim(), phone, iConfirmIWantToJoin: true }).then(onJoined).catch(() => setFailed(true));
  };
  return (
    <form onSubmit={submit}>
      <h2>{t(lang, "joinTitle")}</h2>
      <label htmlFor="name">{t(lang, "name")}</label>
      <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="flat">{t(lang, "flat")}</label>
      <input id="flat" type="text" value={flat} onChange={(e) => setFlat(e.target.value)} />
      <label htmlFor="phone">{t(lang, "phone")}</label>
      <input id="phone" type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))} />
      <label className="check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>{t(lang, "consent")}</span>
      </label>
      <p className="note">{t(lang, "dataNote")}</p>
      {failed && <p className="bad">{t(lang, "error")}</p>}
      <button className="wide" type="submit" disabled={!ready}>{t(lang, "join")}</button>
    </form>
  );
}

function OrderForm({ lang, lines, cycleId, residentId, onOrdered }: { lang: Lang; lines: PriceCardLine[]; cycleId: string; residentId: string; onOrdered: (o: Order) => void }) {
  const [packs, setPacks] = useState<number[]>(lines.map(() => 0));
  const [failed, setFailed] = useState(false);
  const total = lines.reduce((sum, l, i) => sum + l.packPricePaise * (packs[i] ?? 0), 0);
  const change = (i: number, by: number) => setPacks((p) => p.map((n, j) => (j === i ? Math.max(0, Math.min(4, n + by)) : n)));
  const submit = () => {
    const chosen = lines.flatMap((l, i) => ((packs[i] ?? 0) > 0 ? [{ itemId: l.itemId, packGrams: l.packGrams, packs: packs[i] ?? 0 }] : []));
    api.order({ cycleId, residentId, lines: chosen }).then(onOrdered).catch(() => setFailed(true));
  };
  return (
    <section>
      <h2>{t(lang, "yourOrder")}</h2>
      <div className="card">
        {lines.map((l, i) => (
          <div className="row" key={`${l.itemId}-${l.packGrams}`}>
            <span>{itemName(lang, l.itemId)}, {kg(l.packGrams)} {t(lang, "kgPack")}</span>
            <span className="stepper">
              <button type="button" aria-label={`${itemName(lang, l.itemId)} −`} onClick={() => change(i, -1)}>−</button>
              <output>{packs[i]}</output>
              <button type="button" aria-label={`${itemName(lang, l.itemId)} +`} onClick={() => change(i, 1)}>+</button>
            </span>
          </div>
        ))}
        <div className="row total"><span>{t(lang, "total")}</span><span>{rupees(total)}</span></div>
      </div>
      {failed && <p className="bad">{t(lang, "error")}</p>}
      <button className="wide" type="button" disabled={total === 0} onClick={submit}>{t(lang, "placeOrder")}</button>
      <p className="note">{t(lang, "skipNote")}</p>
    </section>
  );
}

function PayPanel({ lang, order, upiVpa }: { lang: Lang; order: Order; upiVpa: string | null }) {
  const ref = order.id.slice(0, 8).toUpperCase();
  const amount = (order.payment.amountPaise / 100).toFixed(2);
  const link = upiVpa ? `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent("Kootu Maligai")}&am=${amount}&cu=INR&tn=${ref}` : null;
  const state = order.payment.state;
  return (
    <section>
      <h2>{t(lang, "yourOrder")}</h2>
      <div className="card">
        {order.lines.map((l) => (
          <div className="row" key={`${l.itemId}-${l.packGrams}`}><span>{itemName(lang, l.itemId)}, {kg(l.packGrams)} {t(lang, "kgPack")}</span><span>× {l.packs}</span></div>
        ))}
      </div>
      {state === "SETTLED" ? (
        <p className="why">{t(lang, "paid")}</p>
      ) : (
        <div className="card">
          <p className="sub">{t(lang, "pay")}</p>
          <p className="big">{rupees(order.payment.amountPaise)}</p>
          <p className="sub">{t(lang, "ref")}: <strong>{ref}</strong></p>
          {state === "FAILED" && <p className="bad">{t(lang, "failed")}</p>}
          {link && <a className="wide" href={link}>{t(lang, "payUpi")}</a>}
          <p className="note">{t(lang, "payWait")}</p>
        </div>
      )}
    </section>
  );
}

function CaptainView({ lang, apt }: { lang: Lang; apt: ApartmentPublic }) {
  const [code, setCode] = useState("");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [wrong, setWrong] = useState(false);
  if (!apt.card) return <p>{t(lang, "noCard")}</p>;
  const cycleId = apt.card.cycleId;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    api.roster(apt.id, cycleId, code).then((r) => { setRoster(r); setWrong(false); }).catch(() => setWrong(true));
  };
  if (!roster) {
    return (
      <form onSubmit={submit}>
        <h2>{t(lang, "captain")}</h2>
        <label htmlFor="code">{t(lang, "captainCode")}</label>
        <input id="code" type="password" value={code} onChange={(e) => setCode(e.target.value)} />
        {wrong && <p className="bad">{t(lang, "wrongCode")}</p>}
        <button className="wide" type="submit" disabled={code.length < 6}>{t(lang, "show")}</button>
      </form>
    );
  }
  return (
    <section>
      <h2>{t(lang, "paidHouseholds")}</h2>
      <p className="big">{roster.paidHouseholds}</p>
      <p className="note">{t(lang, "minNote")}</p>
      <div className="card">
        {roster.orders.length === 0 && <p className="note">{t(lang, "noOrders")}</p>}
        {roster.orders.map((o) => (
          <div className="row" key={o.flat}>
            <span><strong>{o.flat}</strong> {o.residentName}<br /><span className="note">{o.lines.map((l) => `${itemName(lang, l.itemId)} ${kg(l.packGrams)} kg × ${l.packs}`).join(", ")}</span></span>
            <span className={o.paymentState === "SETTLED" ? "" : "bad"}>{t(lang, o.paymentState === "SETTLED" ? "statusPaid" : "statusUnpaid")}</span>
          </div>
        ))}
      </div>
      {roster.ledger.length > 0 && (
        <>
          <h2>{t(lang, "commission")}</h2>
          <div className="card">
            {roster.ledger.map((e) => (<div className="row" key={e.id}><span>{e.cycleId}</span><span>{rupees(e.amountPaise)}</span></div>))}
          </div>
        </>
      )}
    </section>
  );
}
