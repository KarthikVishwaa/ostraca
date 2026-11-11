/**
 * Map a free-text carrier to PayPal's carrier enum for Orders v2 /track. Only carriers we are sure about
 * are mapped; anything else is sent as OTHER with its name, which PayPal accepts.
 */
const KNOWN = new Set(["DHL", "FEDEX", "UPS", "USPS", "INDIA_POST"]);

export function toPayPalCarrier(raw: string): { carrier: string; carrierNameOther?: string } {
  const key = raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (KNOWN.has(key)) return { carrier: key };
  return { carrier: "OTHER", carrierNameOther: raw.trim().slice(0, 64) };
}
