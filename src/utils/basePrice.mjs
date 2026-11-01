// Shared by the API and spectator screens.
const TOURNAMENT_30_PRICES = { A: 4000, B: 3000, C: 2500, D: 2500, E: 2000 };

export function getTournamentBasePrice(player, tournamentId) {
  if (Number(player?.tournament_id ?? tournamentId) !== 30) return null;
  const category = String(player?.base_category ?? '').trim().toUpperCase();
  return TOURNAMENT_30_PRICES[category] ?? 1000;
}

export function getDisplayBasePrice(player, tournamentId) {
  if (!player) return 0;
  const scopedPrice = getTournamentBasePrice(player, tournamentId);
  if (scopedPrice !== null) return scopedPrice;
  if (Number(player.base_price) > 0) return Number(player.base_price);
  const category = String(player.base_category ?? '').toUpperCase();
  return { A: 1700, B: 3000, C: 5000 }[category] ?? 0;
}

