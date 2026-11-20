import express from 'express';
import path from 'node:path';

const root = process.cwd();
const app = express();
app.disable('x-powered-by');

const sites = [
  ['/shop', 'demo-websites/amazin-shop'],
  ['/account-lab', 'demo-websites/account-lab'],
  ['/counting-lab', 'demo-websites/counting-lab'],
  ['/cart-lab', 'demo-websites/cart-lab'],
];
for (const [route, dir] of sites) {
  app.use(route, express.static(path.join(root, dir), { index: 'index.html' }));
}

app.get('/', (req, res) => {
  res.type('html').send(`<h1>BugShield demo sites</h1><ul>${sites.map(([r]) => `<li><a href="${r}">${r}</a></li>`).join('')}</ul>`);
});

const port = Number(process.env.DEMO_PORT || 5173);
app.listen(port, () => console.log(`[demo] sites on http://localhost:${port}`));
