import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const readSource = (relPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');

describe('JTEC Party full-screen mobile layout guarantees', () => {
  test('Chat tab removes built-in composer emoji picker and preserves independent scroll + fixed composer', () => {
    const src = readSource('src/party/components/PartyRoomChatTab.tsx');
    assert.equal(src.includes('CHAT_QUICK_EMOJIS'), false);
    assert.equal(src.includes('showEmojiPicker'), false);
    assert.equal(src.includes('Toggle emoji picker'), false);
    assert.equal(/\bSmile\b/.test(src), false);

    assert.ok(src.includes('flex-1 min-h-0 overflow-y-auto'));
    assert.ok(src.includes('env(safe-area-inset-bottom'));
    assert.ok(src.includes('PartyService.sendChatMessage'));
  });

  test('Invite tab avoids nested friend list scrollbar and uses full-height scrolling', () => {
    const src = readSource('src/party/components/PartyRoomInviteTab.tsx');
    assert.equal(src.includes('max-h-60 overflow-y-auto'), false);
    assert.ok(src.includes('flex-1 min-h-0 h-full w-full overflow-y-auto'));
    assert.ok(src.includes('QrCodeDisplay'));
  });

  test('Listen, Dashboard, People, and Queue fill viewport cleanly without boxed outer wrappers', () => {
    const listen = readSource('src/party/components/PartyRoomListenTab.tsx');
    const dashboard = readSource('src/party/components/PartyRoomDashboard.tsx');
    const people = readSource('src/party/components/PartyRoomPeopleTab.tsx');
    const queue = readSource('src/party/components/PartyRoomQueueTab.tsx');
    const screen = readSource('src/party/PartyScreen.tsx');

    assert.ok(listen.includes('min(66vw,31dvh)'));
    assert.ok(listen.includes('Room Menu'));
    assert.ok(dashboard.includes('grid-rows-[1.15fr_1fr_1fr]'));
    assert.ok(people.includes('flex-1 min-h-0 h-full w-full'));
    assert.ok(queue.includes('flex-1 min-h-0 overflow-y-auto'));
    assert.ok(queue.includes('Add Music'));

    assert.ok(screen.includes('isInActiveRoom'));
    assert.ok(screen.includes('h-12 flex items-center justify-between'));
    assert.ok(screen.includes('env(safe-area-inset-top'));
  });
});
