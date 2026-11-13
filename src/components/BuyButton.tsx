/** Server-rendered form → POST /api/checkout → 303 to Stripe Checkout. No client JS needed. */
export function BuyButton({ product, parkCode, children, variant }: { product: string; parkCode?: string; children: React.ReactNode; variant?: "outline" }) {
  return (
    <form action="/api/checkout" method="post" className="buy-form">
      <input type="hidden" name="product" value={product} />
      {parkCode && <input type="hidden" name="parkCode" value={parkCode} />}
      <button type="submit" className={variant === "outline" ? "btn-outline" : undefined}>{children}</button>
    </form>
  );
}
