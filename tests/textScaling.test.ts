import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Review D-7: OS large text must not break the fixed-size HUD. Every
// HUD file takes Text from src/ui/Text (capped / fixed scaling), never
// straight from react-native, and the fixed-size control labels use the
// non-scaling variant.
const HUD = path.join(process.cwd(), 'src/components/HUD');

test('HUD text comes from ui/Text, not react-native', () => {
  for (const f of fs.readdirSync(HUD).filter((n) => n.endsWith('.tsx'))) {
    const src = fs.readFileSync(path.join(HUD, f), 'utf8');
    const rn = src.match(/import \{([^}]*)\} from 'react-native';/);
    if (rn) assert.ok(!/\bText\b/.test(rn[1]), `${f} imports Text from react-native`);
    if (src.includes('<Text')) assert.match(src, /from '\.\.\/\.\.\/ui\/Text'/, `${f} renders Text without ui/Text`);
  }
});

test('fixed-size control labels never scale', () => {
  for (const f of ['ActionButtons.tsx', 'PickupBag.tsx', 'RunButton.tsx', 'NameKeyboard.tsx']) {
    const src = fs.readFileSync(path.join(HUD, f), 'utf8');
    assert.match(src, /import \{ FixedText as Text \} from '\.\.\/\.\.\/ui\/Text';/, f);
  }
  const ui = fs.readFileSync(path.join(process.cwd(), 'src/ui/Text.tsx'), 'utf8');
  assert.match(ui, /allowFontScaling=\{false\}/);
  assert.match(ui, /maxFontSizeMultiplier=\{READ_FONT_SCALE_MAX\}/);
});
