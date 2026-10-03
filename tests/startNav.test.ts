import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startScreenBack } from '../src/util/startNav';

test('start screen back: mirrors the BACK buttons, home lets the system handle it', () => {
  assert.equal(startScreenBack('home'), null);
  assert.equal(startScreenBack('outfits'), 'profile');
  assert.equal(startScreenBack('profile'), 'continue');
  assert.equal(startScreenBack('continue'), 'home');
  assert.equal(startScreenBack('name'), 'home');
  assert.equal(startScreenBack('tutorialPrompt'), 'home');
});
