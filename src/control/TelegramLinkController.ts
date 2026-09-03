/**
 * D-Fence — the bot side of 6.1.7.
 * Stereotype: <<control>>. Traces: 6.1.6, 6.1.7, 10.2.1, 10.5.3.
 *
 * `NotificationController` already issued a code and could already claim one. What did not exist
 * was the half that hears the resident: nothing read the messages sent to the bot, so a code could
 * be shown on a screen and typed into Telegram and nothing would happen. The HTTP claim route
 * existed, but nobody calls it — the bot does, and the bot was not listening.
 *
 * **Why a poller and not a webhook.** A webhook needs a public URL, and this project has no hosting
 * target yet. `getUpdates` needs nothing. The two are mutually exclusive at Telegram's end, so if a
 * webhook is ever configured, `start()` must stop being called — that is the one coupling here and
 * it is stated rather than discovered.
 *
 * **Every reply says what happened and what to do next** (10.5.3). A resident who mistypes a code
 * gets a sentence explaining that codes last fifteen minutes and where to get another, not silence.
 * Silence is the failure mode of a linking flow: the person cannot tell whether they got it wrong
 * or the system is broken, so they try the same thing again.
 */
import { Uuid } from '../entity/valueTypes';
import { NotificationController, LINK_CODE_TTL_MS } from './NotificationController';

/** The two things this controller needs from the Telegram adapter, and nothing else. */
export interface TelegramInbox {
  getUpdates(offset: number, timeoutSeconds?: number): Promise<
    Array<{ updateId: number; chatId: string; text: string; from: string | null }>
  >;
  send(chatId: string, text: string): Promise<unknown>;
}

/** 6.1.7 — six digits, optionally introduced by Telegram's own `/start` deep link. */
const CODE_PATTERN = /^(?:\/start\s+)?(\d{6})$/;

export interface PollResult {
  seen: number;
  linked: Uuid[];
  refused: number;
}

export class TelegramLinkController {
  constructor(private readonly inbox: TelegramInbox, private readonly notifications: NotificationController) {}

  /**
   * Telegram's cursor. Held in memory, which is honest about what it is: on a restart the poller
   * resumes from whatever Telegram still holds, and a code replayed after a restart is refused
   * anyway because `claimLinkCode` consumed it. The in-memory codes are lost on restart too — a
   * real deployment moves both into Postgres with the rest of the stores.
   */
  private offset = 0;

  private timer: ReturnType<typeof setInterval> | null = null;

  /** One pass. Returns what it did, so the server can log it and a test can assert on it. */
  async poll(now = new Date()): Promise<PollResult> {
    const messages = await this.inbox.getUpdates(this.offset);
    const result: PollResult = { seen: messages.length, linked: [], refused: 0 };

    for (const message of messages) {
      // Advance past every update, including the ones this class does not understand. An offset
      // that only moves on handled messages lets one sticker stall the poller permanently.
      this.offset = Math.max(this.offset, message.updateId + 1);
      if (message.chatId === '') {
        continue;
      }

      const code = CODE_PATTERN.exec(message.text.trim())?.[1];
      if (code === undefined) {
        await this.inbox.send(message.chatId, TelegramLinkController.instructions(message.from));
        continue;
      }

      const accountId = await this.notifications.claimLinkCode(code, message.chatId, now);
      if (accountId === null) {
        result.refused += 1;
        await this.inbox.send(message.chatId, TelegramLinkController.refusal());
        continue;
      }
      result.linked.push(accountId);
      await this.inbox.send(message.chatId, TelegramLinkController.confirmation());
    }
    return result;
  }

  /**
   * 6.1.6 — run the poller beside the ingestion cycle.
   *
   * @param intervalMs how often to ask. Fifteen seconds by default: a resident is watching a screen
   *   with a code on it and waiting, so a minute would feel broken, and Telegram's published limit
   *   is far above four calls a minute.
   */
  start(intervalMs = 15_000): void {
    if (this.timer !== null) {
      return; // two pollers on one bot would each consume half the messages
    }
    this.timer = setInterval(() => {
      void this.poll().catch((error: unknown) => {
        console.error('Telegram link poll failed:', error);
      });
    }, intervalMs);
    // Do not hold the process open on this timer alone: it is a background convenience, and a
    // server that cannot shut down because a poller is pending is a worse bug than a missed link.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private static instructions(from: string | null): string {
    const greeting = from === null ? 'Hello' : `Hello ${from}`;
    return (
      `${greeting} — this is D-Fence, the dengue cluster alert service.\n\n` +
      'To link this chat, open Alert Settings in D-Fence, tap "Link Telegram", and send me the ' +
      'six-digit code it shows you.'
    );
  }

  private static refusal(): string {
    // 10.5.3 — cause and remedy, both. "Invalid code" is the cause with the remedy left out.
    return (
      'That code is not valid, or it has already been used.\n\n' +
      `A code works once and lasts ${Math.round(LINK_CODE_TTL_MS / 60_000)} minutes. ` +
      'Open Alert Settings in D-Fence to get a fresh one.'
    );
  }

  private static confirmation(): string {
    return (
      'This chat is now linked to your D-Fence account.\n\n' +
      'You will get an alert when a saved location falls inside a dengue cluster, when that ' +
      'cluster grows, or when heavy rain is forecast for it. You can turn alerts off per location ' +
      'in Alert Settings at any time.'
    );
  }
}
