import { DisputeList } from "@/components/dispute-list";

export default function Disputes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Disputes</h1>
        <p className="text-sm text-muted-foreground">Live from the PayPal sandbox. Open one to see your proof and answer it.</p>
      </div>
      <DisputeList />
    </div>
  );
}
