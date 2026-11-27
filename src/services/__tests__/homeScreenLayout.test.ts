import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const readSource = (relPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');

describe('HomeScreen promotional card & layout guarantees', () => {
  test('restores the promotional card with Bring Your Vibe Offline, JTEC Cloud button above Import Music button', () => {
    const src = readSource('src/screens/HomeScreen.tsx');
    const returnIdx = src.indexOf('  return (');
    assert.ok(returnIdx > 0, 'HomeScreen should have a return block');
    const jsx = src.slice(returnIdx);

    assert.ok(jsx.includes('Bring Your Vibe'), 'Promotional card heading should be present');
    assert.ok(jsx.includes('Offline'), 'Offline gradient text should be present');
    assert.ok(jsx.includes('JTEC Cloud'), 'JTEC Cloud button should be present');
    assert.ok(jsx.includes('Import Music'), 'Import Music button should be present');

    const promoStart = jsx.indexOf('Bring Your Vibe');
    const promoEnd = jsx.indexOf('Quick Playlists');
    const promoCardJsx = jsx.slice(promoStart, promoEnd);

    const cloudBtnIdx = promoCardJsx.indexOf('JTEC Cloud');
    const importBtnIdx = promoCardJsx.indexOf('Import Music');
    assert.ok(cloudBtnIdx >= 0, 'JTEC Cloud button should be in promo card');
    assert.ok(importBtnIdx >= 0, 'Import Music button should be in promo card');
    assert.ok(cloudBtnIdx < importBtnIdx, 'JTEC Cloud button should appear above Import Music button');
  });

  test('preserves Quick Playlists, Recently Played, Recently Added, and Favorites in clean order', () => {
    const src = readSource('src/screens/HomeScreen.tsx');
    const returnIdx = src.indexOf('  return (');
    const jsx = src.slice(returnIdx);

    const promoIdx = jsx.indexOf('Bring Your Vibe');
    const playlistsIdx = jsx.indexOf('Quick Playlists');
    const recentPlayedIdx = jsx.indexOf('Recently Played');
    const recentAddedIdx = jsx.indexOf('Recently Added');
    const favoritesIdx = jsx.indexOf('Favorites');

    assert.ok(promoIdx > 0, 'Promotional card should be present');
    assert.ok(playlistsIdx > promoIdx, 'Quick Playlists should follow promotional card');
    assert.ok(recentPlayedIdx > playlistsIdx, 'Recently Played should follow Quick Playlists');
    assert.ok(recentAddedIdx > recentPlayedIdx, 'Recently Added should follow Recently Played');
    assert.ok(favoritesIdx > recentAddedIdx, 'Favorites should follow Recently Added');
  });

  test('preserves HomeScreenProps interface compatibility with App.tsx', () => {
    const src = readSource('src/screens/HomeScreen.tsx');
    const app = readSource('src/App.tsx');

    assert.ok(app.includes('<HomeScreen'));
    for (const prop of [
      'onPlaySong',
      'onOpenImport',
      'onOpenPlaylists',
      'onSelectPlaylist',
      'onOpenSongOptions',
      'onToggleFavorite',
      'onOpenCloud',
    ]) {
      assert.ok(src.includes(prop), `HomeScreenProps should declare ${prop}`);
    }
  });
});
