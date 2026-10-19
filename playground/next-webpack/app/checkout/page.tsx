import { CheckoutPageClient } from "./page.client"

function OrderSummary() {
  return (
    <aside id="summary">
      <p id="summary-text">Server-rendered summary</p>
    </aside>
  )
}

export default function CheckoutPage() {
  return (
    <main id="checkout-main">
      <h1 id="server-heading">Checkout (server)</h1>
      <OrderSummary />
      <CheckoutPageClient />
    </main>
  )
}
