import { cn } from "@/lib/utils";

/**
 * The Ostraca mark: a clay shard with a check. Inline SVG (traced from the brand artwork, check redrawn),
 * so it is crisp at any size, needs no request, and has a fixed width and height (no layout shift).
 */
export function BrandMark({ size = 28, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-4 -1 1453 1453"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <path fill="#ba572d" fillRule="evenodd" d="M1100 84.6c-6.3 1.2-13 4-42.5 18.4l-25.5 12.3-15.2 7A1439 1439 0 0 1 906 168l-15 6-15.5 6a1162 1162 0 0 1-50 17.5A1150 1150 0 0 0 759 220l-10.5 4.2a238 238 0 0 1-35.5 13.2c-6 1.6-25.1 4.8-42 7.1l-32.5 4.4-15.5 2a1312 1312 0 0 1-33.5 4l-18 2c-19.3 2.1-29.6 3.3-44 5.1a835 835 0 0 1-26.5 3c-32 2.8-33.2 3-43.3 8a44 44 0 0 0-18.9 18.2l-9.3 18.8c-26.4 53.8-48.3 74.6-83.2 79a125 125 0 0 0-54.3 19c-30.2 17-81.5 33.4-126 40.4a463 463 0 0 0-29.6 5.1c-17 3.7-25.6 12-30.3 29L98 511l-8 27.5-8 28A845 845 0 0 1 68 613c-6.4 19.3-7.5 29.2-4.5 41.8 1.7 7 2.7 9 10.1 18.2a312 312 0 0 1 23.6 34c17.1 30 27.9 55.1 36.8 86 1.1 4.1 3 10.2 4 13.5s2 6.8 2 7.7.9 4.4 2 7.5 2.2 7.8 2.5 10.3 1.1 5.3 1.6 6.2 1.6 5 2.4 9l2.5 11.3 3 14 4 18 3 13.5 3 14 4 18.3a95 95 0 0 0 4.6 17 72 72 0 0 0 32 46.3l17.1 12.1 20 13.9c28 19 54.7 41.9 67.2 57.9a529 529 0 0 1 31.5 45c19.2 29.6 31.1 40.6 60.2 56 5 2.6 13.3 7.2 18.5 10.2s10.8 6 12.5 6.9l10 5.4c3.8 2.2 9 5 11.5 6.2 5.8 3 16.6 9 20.7 11.4a503 503 0 0 0 61.8 32.4c7.2 3.2 18.6 8.5 25.5 11.8s17.7 8 24 10.7l39.5 17c15.4 6.7 33.2 14.4 39.5 17 10.4 4.3 19.2 8.2 30.5 13.5a2992 2992 0 0 0 49 22c33.4 15.4 45 19 61.1 19 26 0 39.7-11.3 57-47a581 581 0 0 1 23.4-45.4c0-.3 3.5-6.7 7.8-14.3l8.6-15.3 2.9-5.2 7.7-13 9.2-15c2.1-3.1 3.8-6 3.8-6.2s1.7-3.1 3.9-6.3l11.8-17.8a1070 1070 0 0 1 35.5-51.3 215 215 0 0 1 13.9-18l6.1-7.7c2.5-3.3 5.4-7 6.4-8.1l25.4-29.5 17-18.9a3464 3464 0 0 1 106.4-112c45.8-46.2 49-49.7 54.3-58.5 2-3.1 10.7-21.4 13.2-27.5l4.2-9.8c1-2.3 2-4.8 2-5.5s.8-3 1.9-5.2 2-4.4 2-4.9a468 468 0 0 1 14-35.6c1.7-4.1 4.7-10.8 6.6-14.8a86 86 0 0 0 3.4-7.9 1941 1941 0 0 1 35.1-69l7.4-13.3 9-15.5c3.1-5.5 9.3-16.3 14-24s12.6-21.4 18-30.5c14.2-24.3 16.3-27.7 21.6-36.2 22.4-35.4 28.6-59.7 25-97.4-.6-5.5-1.5-16.6-2-24.9-2.5-36-7.7-53.7-20.1-68.5a89 89 0 0 0-19.6-15c-3.9 0-38-22.4-58.3-38.4a333 333 0 0 1-87-105.8l-8.3-15.5a740 740 0 0 1-23.3-48.8c-6-13.6-14.8-38.8-16-46a41 41 0 0 0-48.5-33.9" />
      <path fill="none" stroke="#fbf1e6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="132" d="m476 732 174 173 398-421" />
    </svg>
  );
}

/** Mark + the name set as real text in the site font. Used in the header and footer. */
export function BrandLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold leading-none tracking-tight", className)}>
      <BrandMark size={size} />
      <span>Ostraca</span>
    </span>
  );
}
