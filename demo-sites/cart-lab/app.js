// CartLab — deliberately buggy cart / checkout arithmetic.
const ITEMS = [
  { id: 1, name: 'Notebook', art: '📓', price: 4.5 },
  { id: 2, name: 'Pen set', art: '🖊️', price: 3.25 },
  { id: 3, name: 'Sticky notes', art: '🗒️', price: 2.75 },
  { id: 4, name: 'Desk organizer', art: '🗂️', price: 12.0 },
];
let cart = [];
let couponApplied = false;

function money(n) { return '$' + Number(n).toFixed(2); }

function renderProducts() {
  document.getElementById('products').innerHTML = ITEMS.map((p) => `<article class="item">
    <div class="art">${p.art}</div><h3>${p.name}</h3><div class="price">${money(p.price)}</div>
    <button class="add" data-add="${p.id}">Add to cart</button></article>`).join('');
  document.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => add(Number(b.dataset.add)));
}

function add(id) {
  const line = cart.find((l) => l.id === id);
  if (line) {
    // BUG 1: string concatenation instead of numeric addition.
    line.qty = (line.qty + 1).toString();
  } else {
    const p = ITEMS.find((x) => x.id === id);
    cart.push({ ...p, qty: 1 });
  }
  update();
}

function subtotal() {
  // BUG 2: string qty leads to concatenation in multiplication edge cases.
  return cart.reduce((s, l) => s + l.price * l.qty, 0);
}

function shipping(sub) {
  // BUG 3: shipping is always free, even below the stated $25 threshold.
  return 0;
}

function discount(sub) {
  // BUG 4: 10% discount is applied twice when coupon is active.
  if (!couponApplied) return 0;
  return sub * 0.1 * 2;
}

function tax(sub) {
  // BUG 5: tax is computed on the pre-discount subtotal.
  return sub * 0.08;
}

function update() {
  const sub = subtotal();
  const disc = discount(sub);
  const ship = shipping(sub);
  const total = sub + ship + tax(sub) - disc; // BUG 6: discount subtracted after tax; should be before.
  const count = cart.reduce((s, l) => s + Number(l.qty), 0);
  document.getElementById('count').textContent = String(count);
  document.getElementById('subtotal').textContent = money(sub);
  document.getElementById('shipping').textContent = money(ship);
  document.getElementById('discount').textContent = '-' + money(disc);
  document.getElementById('tax').textContent = money(tax(sub));
  document.getElementById('total').textContent = money(total);
}

document.addEventListener('DOMContentLoaded', () => {
  renderProducts(); update();
  document.getElementById('apply').onclick = () => {
    const code = document.getElementById('coupon').value;
    // BUG 7: coupon check is case-sensitive.
    if (code === 'SAVE10') { couponApplied = true; document.getElementById('couponMsg').textContent = 'Coupon applied.'; }
    else document.getElementById('couponMsg').textContent = 'Invalid code.';
    update();
  };
  document.getElementById('checkout').onclick = () => {
    // BUG 8: checkout alert uses a euro symbol on a dollar store.
    alert('Total charged: €' + document.getElementById('total').textContent);
    // BUG 9: cart is never cleared after a successful order.
  };
  const build = window.BUGSHIELD_BUILD_INFO || {};
  document.title = `CartLab — ${build.commit || 'local'}`;
  if (window.BUGSHIELD_ENDPOINT && window.BUGSHIELD_KEY) {
    const s = document.createElement('script');
    s.src = window.BUGSHIELD_ENDPOINT; s.setAttribute('data-key', window.BUGSHIELD_KEY); s.async = true;
    document.body.appendChild(s);
  }
});
