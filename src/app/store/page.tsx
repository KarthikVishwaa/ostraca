import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PayPalCheckout } from "@/components/paypal-checkout";

const product = {
  name: "Handloom cotton saree",
  seller: "Priya's Looms, Coimbatore (demo seller)",
  price: "120.00",
};

export default function Store() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <Badge variant="outline">Sandbox demo — pay with your sandbox Personal account</Badge>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{product.name}</CardTitle>
          <CardDescription>{product.seller}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-3xl font-semibold">${product.price}</p>
          <PayPalCheckout amount={product.price} description={product.name} />
        </CardContent>
      </Card>
    </div>
  );
}
