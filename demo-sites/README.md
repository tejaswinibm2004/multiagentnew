# Extra demo websites

Three additional static client sites for BugShield demonstrations. Each has its own `render.yaml`, build script and `version.json`. Push each folder as its own GitHub repo and connect it from **Websites → Connect website** in the dashboard.

| Site | Focus | Example report to type in the widget |
|------|-------|--------------------------------------|
| `account-lab` | Login / auth issues | "Any password logs you in, and the error message says Welcome! on failure." |
| `counting-lab` | Counting / aggregation errors | "Order count shows 16 when there are 7 orders; revenue has an extra $1." |
| `cart-lab` | Cart / money issues | "Adding the same item twice makes the quantity 11, and the total uses a euro sign." |

## Bug inventory (local answer keys — gitignore these in your own forks)

### account-lab
1. Password field renders as `type="text"` (visible password).
2. Any non-empty password is accepted — no credential check.
3. Email comparison is case-sensitive (`Demo@AccountLab.test` vs `demo@...`).
4. Failed login shows a success message ("Welcome! You are now signed in.").
5. Session token stored in plain `localStorage`.
6. Failed-attempt counter never resets after a successful login.

### counting-lab
1. `countOrders` accumulator starts at 1.
2. `for (i <= length)` off-by-one loop.
3. Revenue `reduce` starts at 1.
4. Average divides by `length - 1`.
5. Conversion percentage multiplied by 100 twice.
6. Pagination uses `Math.floor` instead of `Math.ceil`, hiding the last page.

### cart-lab
1. Quantity uses string concatenation (`'1' + 1` → `'11'`).
2. SAVE10 discount applied twice.
3. Shipping always free even below the $25 threshold.
4. Tax computed on pre-discount subtotal.
5. Discount subtracted after tax.
6. Coupon check is case-sensitive.
7. Checkout alert uses `€` instead of `$`.
8. Cart never cleared after placing an order.

## Why these are useful for viva

- `account-lab` bugs hit **auth/login/session** paths → deterministic sensitive-area gate → `AWAITING_APPROVAL` even at moderate risk.
- `cart-lab` bugs put **money identifiers in the diff** → human gate with the documented conservative false-positive story.
- `counting-lab` bugs are low-risk logic errors → demonstrate **zero-click auto-deploy** for non-critical fixes.
