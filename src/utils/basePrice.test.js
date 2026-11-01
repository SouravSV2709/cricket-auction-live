import { getDisplayBasePrice, getTournamentBasePrice } from './basePrice.mjs';

test.each([
  ['A', 4000], ['B', 3000], ['C', 2500], ['D', 2500], ['E', 2000],
  ['', 1000], [null, 1000], [' b ', 3000], ['Uncategory', 1000], ['Rest', 1000],
])('tournament 30 category %s resolves to %s', (category, price) => {
  const player = { tournament_id: '30', base_category: category, base_price: 5000 };
  expect(getTournamentBasePrice(player)).toBe(price);
  expect(getDisplayBasePrice(player)).toBe(price);
  expect(getDisplayBasePrice({ base_category: category }, 30)).toBe(price);
});

test('preserves other tournaments and handles an empty player', () => {
  expect(getTournamentBasePrice({ tournament_id: 31 })).toBeNull();
  expect(getDisplayBasePrice({ tournament_id: 31, base_price: 900 })).toBe(900);
  expect(getDisplayBasePrice({ base_category: 'A' }, 31)).toBe(1700);
  expect(getDisplayBasePrice(null, 30)).toBe(0);
});
