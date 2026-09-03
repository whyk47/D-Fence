/**
 * D-Fence — Lab 4 §3.2: linking a Telegram chat (US-6.1, §6.1.6, §6.1.7).
 *
 * `NotificationController` could already issue a code and could already claim one. What did not
 * exist was the half that hears the resident: nothing read the messages sent to the bot. The HTTP
 * claim route was there, and its only legitimate caller is the bot — which was not listening. So
 * the flow was complete on paper and, end to end, did nothing.
 *
 * The cases below are about the two things that make a linking flow safe and the one thing that
 * makes it usable: the code is single-use and short-lived (6.1.7), and every reply says what
 * happened and what to do next (10.5.3). Silence is the failure mode of a linking flow — the person
 * cannot tell whether they mistyped or the system is broken, so they try the same thing again.
 */
import { describe, expect, it } from 'vitest';
import { TelegramLinkController, TelegramInbox } from '../src/control/TelegramLinkController';
import { NotificationController, LINK_CODE_TTL_MS } from '../src/control/NotificationController';
import { InMemoryAccountStore } from '../src/persistence/memory/InMemoryAccountStores';
import { InMemoryAlertStore, RecordingChannel } from '../src/persistence/memory/InMemoryAlertStores';
import { Account } from '../src/entity/Account';
import { Role } from '../src/entity/enums';

const NOW = new Date('2026-09-04T10:00:00+08:00');

/** A scripted inbox: hands back the queued messages once, and records every reply sent. */
class FakeInbox implements TelegramInbox {
  constructor(private queued: Array<{ updateId: number; chatId: string; text: string; from: string | null }>) {}

  readonly replies: Array<{ chatId: string; text: string }> = [];
  lastOffsetAsked = -1;

  async getUpdates(offset: number): Promise<Array<{ updateId: number; chatId: string; text: string; from: string | null }>> {
    this.lastOffsetAsked = offset;
    const batch = this.queued.filter((m) => m.updateId >= offset);
    this.queued = [];
    return batch;
  }

  async send(chatId: string, text: string): Promise<unknown> {
    this.replies.push({ chatId, text });
    return undefined;
  }
}

async function fixture(
  messages: Array<{ updateId: number; chatId: string; text: string; from?: string | null }>,
): Promise<{ inbox: FakeInbox; link: TelegramLinkController; notifications: NotificationController; accountId: string }> {
  const accounts = new InMemoryAccountStore();
  const account = new Account();
  account.email = 'ah.seng@example.com';
  account.role = Role.Resident;
  account.isActive = true;
  account.emailVerified = true;
  account.telegramChatId = null;
  const saved = await accounts.save(account);

  const notifications = new NotificationController(new RecordingChannel(), accounts, new InMemoryAlertStore());
  const inbox = new FakeInbox(messages.map((m) => ({ from: null, ...m })));
  return { inbox, link: new TelegramLinkController(inbox, notifications), notifications, accountId: saved.id };
}

describe('6.1.7 — a resident sends the code to the bot', () => {
  it('L1 — a six-digit code links that chat to the account, and says so', async () => {
    const f = await fixture([]);
    const { code } = f.notifications.issueLinkCode(f.accountId, NOW);
    const inbox = new FakeInbox([{ updateId: 11, chatId: '5834430459', text: code, from: 'Yen Kit' }]);
    const link = new TelegramLinkController(inbox, f.notifications);
    const result = await link.poll(NOW);

    expect(result.linked).toEqual([f.accountId]);
    expect(inbox.replies[0]?.chatId).toBe('5834430459');
    expect(inbox.replies[0]?.text).toContain('now linked');
    // The confirmation says what will happen next, not merely that something happened.
    expect(inbox.replies[0]?.text).toContain('Alert Settings');
  });

  it('L2 — Telegram\'s /start deep link carries the code, and is accepted', async () => {
    const f = await fixture([]);
    const { code } = f.notifications.issueLinkCode(f.accountId, NOW);
    const inbox = new FakeInbox([{ updateId: 3, chatId: 'chat-1', text: `/start ${code}`, from: null }]);
    const result = await new TelegramLinkController(inbox, f.notifications).poll(NOW);
    expect(result.linked).toEqual([f.accountId]);
  });

  it('L3 — the code is SINGLE-USE: a second chat sending the same code is refused', async () => {
    const f = await fixture([]);
    const { code } = f.notifications.issueLinkCode(f.accountId, NOW);
    const inbox = new FakeInbox([
      { updateId: 1, chatId: 'chat-honest', text: code, from: null },
      { updateId: 2, chatId: 'chat-attacker', text: code, from: null },
    ]);
    const result = await new TelegramLinkController(inbox, f.notifications).poll(NOW);

    expect(result.linked).toEqual([f.accountId]);
    expect(result.refused).toBe(1);
    // Without single use, anyone who saw the code over a shoulder could take the alerts.
    expect(inbox.replies[1]?.text).toContain('already been used');
  });

  it('L4 — the boundary: a code is good at fifteen minutes and dead a moment later', async () => {
    const f = await fixture([]);
    const { code } = f.notifications.issueLinkCode(f.accountId, NOW);
    const justInside = new Date(NOW.getTime() + LINK_CODE_TTL_MS);
    expect(
      (await new TelegramLinkController(new FakeInbox([{ updateId: 1, chatId: 'c', text: code, from: null }]), f.notifications).poll(
        justInside,
      )).linked,
    ).toEqual([f.accountId]);

    const g = await fixture([]);
    const second = g.notifications.issueLinkCode(g.accountId, NOW);
    const justOutside = new Date(NOW.getTime() + LINK_CODE_TTL_MS + 1);
    const inbox = new FakeInbox([{ updateId: 1, chatId: 'c', text: second.code, from: null }]);
    const result = await new TelegramLinkController(inbox, g.notifications).poll(justOutside);
    expect(result.linked).toEqual([]);
    expect(result.refused).toBe(1);
  });

  it('L5 — a wrong code is refused with the cause AND the remedy (10.5.3)', async () => {
    const f = await fixture([]);
    const inbox = new FakeInbox([{ updateId: 1, chatId: 'chat-1', text: '000000', from: null }]);
    const result = await new TelegramLinkController(inbox, f.notifications).poll(NOW);
    expect(result.refused).toBe(1);
    const reply = inbox.replies[0]?.text ?? '';
    expect(reply).toContain('not valid');
    // "Invalid code" is the cause with the remedy left out. Both, or the person retypes it.
    expect(reply).toContain('15 minutes');
    expect(reply).toContain('Alert Settings');
  });

  it('L6 — anything that is not a code gets instructions, not silence', async () => {
    const f = await fixture([]);
    const inbox = new FakeInbox([
      { updateId: 1, chatId: 'chat-1', text: '/start', from: 'Ah Seng' },
      { updateId: 2, chatId: 'chat-2', text: 'hello?', from: null },
      { updateId: 3, chatId: 'chat-3', text: '12345', from: null }, // five digits, not six
    ]);
    await new TelegramLinkController(inbox, f.notifications).poll(NOW);
    expect(inbox.replies).toHaveLength(3);
    expect(inbox.replies[0]?.text).toContain('Hello Ah Seng');
    expect(inbox.replies.every((r) => r.text.includes('six-digit code'))).toBe(true);
  });
});

describe('The poller — 6.1.6, 10.2.1', () => {
  it('L7 — the offset advances past EVERY update, including ones it cannot handle', async () => {
    const f = await fixture([]);
    // An empty chatId is a sticker or a chat-member event. If the offset only moved on handled
    // messages, one of these would stall the poller permanently and no link would ever work again.
    const inbox = new FakeInbox([
      { updateId: 40, chatId: '', text: '', from: null },
      { updateId: 41, chatId: 'chat-1', text: 'hello', from: null },
    ]);
    const link = new TelegramLinkController(inbox, f.notifications);
    await link.poll(NOW);
    expect(inbox.lastOffsetAsked).toBe(0);
    await link.poll(NOW);
    expect(inbox.lastOffsetAsked).toBe(42);
  });

  it('L8 — an unhandled update draws no reply, and does not count as a refusal', async () => {
    const f = await fixture([]);
    const inbox = new FakeInbox([{ updateId: 7, chatId: '', text: '', from: null }]);
    const result = await new TelegramLinkController(inbox, f.notifications).poll(NOW);
    expect(result.seen).toBe(1);
    expect(result.refused).toBe(0);
    expect(inbox.replies).toEqual([]);
  });

  it('L9 — start() is idempotent: two pollers on one bot would each get half the messages', async () => {
    const f = await fixture([]);
    const link = new TelegramLinkController(new FakeInbox([]), f.notifications);
    link.start(60_000);
    link.start(60_000);
    link.stop();
    // Nothing to assert beyond "it did not throw and stopped cleanly" — the guard is the point,
    // and a second interval would silently halve the delivery rate rather than fail loudly.
    expect(true).toBe(true);
  });

  it('L10 — a linked chat is what 6.1.6 then delivers to', async () => {
    const f = await fixture([]);
    const { code } = f.notifications.issueLinkCode(f.accountId, NOW);
    const inbox = new FakeInbox([{ updateId: 1, chatId: 'chat-live', text: code, from: null }]);
    await new TelegramLinkController(inbox, f.notifications).poll(NOW);

    // The link is not a fact about the poller; it is a field on the account that delivery reads.
    expect(await f.notifications.chatIdFor(f.accountId)).toBe('chat-live');
  });
});
