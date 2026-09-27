// Cosmetic prisoner outfits. Purely visual: no outfit changes speed,
// detection, hearts or anything else (no pay-to-win).
export type OutfitId = 'classic' | 'grey' | 'orange' | 'midnight' | 'mint' | 'gold';

export type Outfit = {
  id: OutfitId;
  name: string;
  // Base character model: 'd' = yellow striped jumpsuit,
  // 'g' = grey + red jumpsuit.
  model: 'd' | 'g';
  // Colour multiplied into the model texture (null = original).
  tint: number | null;
  price: number;
};

export const OUTFITS: readonly Outfit[] = [
  { id: 'classic', name: 'Classic', model: 'd', tint: null, price: 0 },
  { id: 'grey', name: 'Grey Stripes', model: 'g', tint: null, price: 0 },
  { id: 'orange', name: 'Hi-Vis Orange', model: 'd', tint: 0xffa25a, price: 120 },
  { id: 'midnight', name: 'Midnight', model: 'g', tint: 0x6f7fc0, price: 180 },
  { id: 'mint', name: 'Mint Condition', model: 'd', tint: 0xa6f0cf, price: 240 },
  { id: 'gold', name: 'Gold Standard', model: 'd', tint: 0xffe07a, price: 400 },
];

export const FREE_OUTFITS: OutfitId[] = OUTFITS.filter((o) => o.price === 0).map((o) => o.id);

export function outfitById(id: string | null | undefined): Outfit | null {
  return OUTFITS.find((o) => o.id === id) ?? null;
}

export function isOutfitId(v: unknown): v is OutfitId {
  return typeof v === 'string' && OUTFITS.some((o) => o.id === v);
}
