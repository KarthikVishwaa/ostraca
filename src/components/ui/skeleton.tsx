import { cn } from "@/lib/utils";

/**
 * Loading placeholder. The shimmer is a gradient sliding across with translateX (transform only, so it runs on the
 * compositor), and it is switched off for people who prefer reduced motion.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-accent/70 after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.6s_ease-in-out_infinite] after:bg-gradient-to-r after:from-transparent after:via-background/60 after:to-transparent motion-reduce:after:animate-none",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
