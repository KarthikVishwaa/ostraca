import { Suspense } from "react";
import { SaleDetail } from "@/components/sale-detail";
import { SaleSkeleton } from "@/components/skeletons";

async function Sale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SaleDetail id={id} />;
}

// `params` is runtime data in Next 16, so it is read inside Suspense.
export default function SalePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<SaleSkeleton />}>
      <Sale params={params} />
    </Suspense>
  );
}
