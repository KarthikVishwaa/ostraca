import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading shapes. Each one mirrors the final layout (same grid, same column split, same block heights), so
 * when the real content crossfades in nothing moves.
 */

const sr = (label: string) => ({ role: "status" as const, "aria-label": label });

/** A card with a title line, a description line and a body of the given height. */
function CardBlock({ body, className }: { body: string; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3.5 w-64 max-w-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className={body} />
      </CardContent>
    </Card>
  );
}

/** Sales ledger: stacked cards below md (108px each, like the real cards), a 420px grid from md up. */
export function LedgerSkeleton() {
  return (
    <div {...sr("Loading your sales")}>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[106px] w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="hidden h-[420px] w-full md:block" />
    </div>
  );
}

export function SummaryTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3" {...sr("Loading summary")}>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-[92px]" />
      ))}
    </div>
  );
}

export function NextStepsSkeleton() {
  return (
    <div className="space-y-3" {...sr("Loading next steps")}>
      <Skeleton className="h-[52px]" />
      <Skeleton className="h-[52px]" />
    </div>
  );
}

function HeroSkeleton() {
  return (
    <section className="max-w-3xl space-y-5 pt-2 md:pt-6">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-10 w-full max-w-md sm:h-12" />
      <Skeleton className="h-12 w-full max-w-2xl" />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-12 w-full sm:w-40 md:h-10" />
        <Skeleton className="h-12 w-full sm:w-36 md:h-10" />
      </div>
    </section>
  );
}

function FlowCardsSkeleton() {
  const spans = ["lg:col-span-4", "lg:col-span-8", "lg:col-span-8", "lg:col-span-4"];
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <Skeleton className="h-11 w-full sm:w-32 md:h-9" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
        {spans.map((span, i) => (
          <Skeleton key={i} className={`min-h-[18rem] rounded-xl md:col-span-1 ${span}`} />
        ))}
      </div>
    </div>
  );
}

/** The home explainer: hero, safety strip, then the roadmap stations. */
export function HomeSkeleton() {
  return (
    <div className="space-y-10 md:space-y-14" {...sr("Loading")}>
      <HeroSkeleton />
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="space-y-5">
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-[360px] w-full rounded-xl" />
        <Skeleton className="h-[360px] w-full rounded-xl" />
      </div>
      <FlowCardsSkeleton />
    </div>
  );
}

/** /ledger: heading row, then the ledger card with the summary column beside it. */
export function LedgerPageSkeleton() {
  return (
    <div className="space-y-6 md:space-y-8" {...sr("Loading the ledger")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-[30rem] max-w-full" />
        </div>
        <Skeleton className="h-11 w-full sm:w-40 md:h-9" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <CardBlock body="h-[420px]" className="lg:col-span-2" />
        <div className="space-y-6">
          <CardBlock body="h-[196px]" />
          <CardBlock body="h-[116px]" />
        </div>
      </div>
    </div>
  );
}

export function StoreSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-4" {...sr("Loading the store")}>
      <Skeleton className="h-7 w-80 max-w-full" />
      <div className="grid gap-6 md:grid-cols-5">
        <Skeleton className="h-[420px] rounded-xl md:col-span-3" />
        <Skeleton className="h-[260px] rounded-xl md:col-span-2" />
      </div>
    </div>
  );
}

export function SaleSkeleton() {
  return (
    <div className="space-y-6" {...sr("Loading this sale")}>
      <Skeleton className="h-5 w-32" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CardBlock body="h-[190px]" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-[260px] rounded-xl" />
          <CardBlock body="h-[90px]" />
        </div>
        <div className="space-y-6">
          <CardBlock body="h-[290px]" />
          <CardBlock body="h-[200px]" />
        </div>
      </div>
    </div>
  );
}

export function DisputeListSkeleton() {
  return (
    <div className="space-y-4" {...sr("Loading disputes")}>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-[118px] w-full rounded-xl" />
      ))}
    </div>
  );
}

export function DisputesPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DisputeListSkeleton />
        </div>
        <div className="space-y-6">
          <CardBlock body="h-[170px]" />
          <CardBlock body="h-[220px]" />
        </div>
      </div>
    </div>
  );
}

export function DisputeDetailSkeleton() {
  return (
    <div className="space-y-6" {...sr("Reading the dispute from PayPal")}>
      <Skeleton className="h-5 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CardBlock body="h-[110px]" />
          <CardBlock body="h-[250px]" />
          <CardBlock body="h-[80px]" />
        </div>
        <div className="space-y-6">
          <CardBlock body="h-[90px]" />
          <CardBlock body="h-[120px]" />
          <CardBlock body="h-[200px]" />
        </div>
      </div>
    </div>
  );
}

export function LimitationSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3" {...sr("Reading PayPal's Transaction Search and your proof record")}>
      <div className="grid grid-cols-2 content-start gap-3 lg:order-last">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[112px] rounded-xl" />
        ))}
      </div>
      <div className="space-y-6 lg:col-span-2">
        <CardBlock body="h-[56px]" />
        <CardBlock body="h-[300px]" />
        <CardBlock body="h-[120px]" />
      </div>
    </div>
  );
}

export function LimitationPageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[52px] w-full" />
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>
      <LimitationSkeleton />
    </div>
  );
}

export function PackSkeleton() {
  return (
    <div className="space-y-4" {...sr("Building the pack")}>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ml-auto h-11 w-48 md:h-9" />
      </div>
      <Skeleton className="h-[640px] w-full rounded-lg" />
    </div>
  );
}

export function AuthSkeleton() {
  return (
    <div className="py-6 md:py-12">
      <Skeleton className="mx-auto h-[26rem] w-full max-w-md rounded-xl" />
    </div>
  );
}
