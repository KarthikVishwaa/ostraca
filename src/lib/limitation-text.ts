/** Wording shared by the page, the print view and the downloaded file. No server imports, so client code can use it. */

export const SIMULATED_BANNER =
  "SIMULATED: PayPal sandbox cannot place real account limitations. This shows how Ostraca would prepare your response.";

export const NOT_SENT =
  "Ostraca does not send this to PayPal. Download or print it and submit it yourself through PayPal's own channels.";

export const NO_PROMISE =
  "This pack describes records only. It does not lift, remove or guarantee anything. PayPal alone decides what happens to an account.";

/** A generic notice in the style of a payment provider. No logo, no brand wording, and invented for this simulation. */
export const SAMPLE_NOTICE = {
  title: "Your account has a temporary limitation",
  body: [
    "We are reviewing recent activity on your account and have limited some features while we do.",
    "To help us review it, we may ask you to show that your recent sales are genuine. Records such as order details, proof of shipment or delivery, and invoices can help.",
    "Review times vary. We will contact you when we have made a decision.",
  ],
};

export const NOTE_STORAGE_KEY = "ostraca.limitation.note";
