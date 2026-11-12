/** ₹1,375 or ₹495.60. Indian digit grouping, done by hand so output never depends on the machine. */
export function rupees(paise: number): string {
  const whole = Math.trunc(paise / 100);
  const rest = Math.abs(paise % 100);
  const digits = String(Math.abs(whole));
  const last3 = digits.slice(-3);
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const grouped = head ? `${head},${last3}` : last3;
  return `${paise < 0 ? "-" : ""}₹${grouped}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}

export function kg(grams: number): string {
  return String(grams / 1000);
}

export function percent(bp: number): string {
  return (bp / 100).toFixed(1).replace(/\.0$/, "");
}

/** Hours from a to b. Pure: parses the given instants, never reads the clock. */
export function hoursBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 3_600_000;
}

/** "A-101", "a 101" and "A101" are the same flat. */
export function normaliseFlat(flat: string): string {
  return flat.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
