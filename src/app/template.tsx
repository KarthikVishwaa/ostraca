"use client";

import { PageTransition } from "@/components/motion/page-transition";

// A template remounts on every navigation, so this plays on each route change.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
