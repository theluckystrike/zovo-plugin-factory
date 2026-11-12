/* Sample for the JavaScript and TypeScript Playground (TOOLCHK3, wave18). Loaded only when "Try a sample" is clicked. */
export const SAMPLE = {
  name: 'orders.ts',
  lang: 'ts',
  data: `// A small TypeScript sample. Press Run (Ctrl+Enter) after you change something.
interface Order { id: number; item: string; qty: number; price: number }

const orders: Order[] = [
  { id: 1, item: 'keyboard', qty: 2, price: 49.5 },
  { id: 2, item: 'mouse', qty: 1, price: 19 },
  { id: 3, item: 'monitor', qty: 1, price: 189 },
];

const total = orders.reduce((sum, o) => sum + o.qty * o.price, 0);
const names = orders.map(o => o.item.toUpperCase());
names.join(', ');

enum Size { Small, Medium, Large }
Size.Large;

for (let i = 0; i < 4; i++) {
  i * i;
}

const byItem = new Map(orders.map(o => [o.item, o.qty]));
console.log('orders:', orders.length, 'total:', total.toFixed(2));

const later = new Promise<string>(resolve => setTimeout(() => resolve('done'), 300));
await later;

const cheapest = orders.find(o => o.price < 10);
cheapest.item;
`,
};
