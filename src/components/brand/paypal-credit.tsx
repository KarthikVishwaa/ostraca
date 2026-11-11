import Image from "next/image";
import paypalLogo from "@/assets/paypal.png";

/**
 * The PayPal logo, used ONLY as a small "built with" credit (footer, home page). The file is exactly the
 * one provided: not recolored, cropped, redrawn or animated, and never combined with the Ostraca logo. Do
 * not use it as a site logo, icon, button, in forms or payment areas, in the limitation pack, or in the
 * social images.
 */
export function PayPalCredit({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-md bg-white p-1 ring-1 ring-border ${className ?? ""}`}>
      <Image src={paypalLogo} alt="PayPal" width={size} height={size} loading="lazy" unoptimized />
    </span>
  );
}
