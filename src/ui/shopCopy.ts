// Copy for the outfit shop (review D-9): what a cell's price line says,
// whether it reads as affordable, and the confirm / not-enough dialogs.

export type PriceLine = { text: string; affordable: boolean };

export function outfitStateLine(
  price: number,
  coins: number,
  owned: boolean,
  equipped: boolean,
): PriceLine {
  if (equipped) return { text: 'WEARING', affordable: true };
  if (owned) return { text: 'TAP TO WEAR', affordable: true };
  if (coins >= price) return { text: `${price} coins`, affordable: true };
  return { text: `${price} · need ${price - coins} more`, affordable: false };
}

export function buyConfirmCopy(name: string, price: number, coins: number) {
  return {
    title: `Buy ${name}?`,
    body: `${price} coins · you have ${coins}. Outfits are cosmetic only.`,
  };
}

export function notEnoughCoinsBody(price: number, coins: number): string {
  return (
    `You have ${coins} coins - ${Math.max(0, price - coins)} more needed. ` +
    'Earn coins by clearing stages (more stars pay more) and by going the distance in Endless and Daily runs.'
  );
}
