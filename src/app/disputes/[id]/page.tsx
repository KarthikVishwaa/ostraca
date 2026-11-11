import { Suspense } from "react";
import { DisputeDetail } from "@/components/dispute-detail";
import { DisputeDetailSkeleton } from "@/components/skeletons";

async function Dispute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DisputeDetail id={id} />;
}

// `params` is runtime data in Next 16, so it is read inside Suspense.
export default function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<DisputeDetailSkeleton />}>
      <Dispute params={params} />
    </Suspense>
  );
}
