"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

function PayButton({ total }: { total: number }) {
  return (
    <Button asChild>
      <a href="#pay" id="pay-link">
        Pay {total} EUR
      </a>
    </Button>
  )
}

export function CheckoutPageClient() {
  const [total] = useState(42)
  return (
    <section id="checkout">
      <h2>Checkout</h2>
      {total > 0 && (
        <PayButton
          total={total}
        />
      )}
      <Button id="plain-button" onClick={() => alert("don't")}>Cancel</Button>
    </section>
  )
}
