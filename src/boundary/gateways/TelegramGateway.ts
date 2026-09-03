/**
 * D-Fence — Telegram Bot API adapter.
 * Stereotype: <<boundary>>. Traces: 6.x, 8.2.4, 10.3.4 (token outside the repository).
 */
import { NotificationChannel } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { DeliveryOutcome } from '../../entity/enums';

export class TelegramGateway implements NotificationChannel {
  constructor(
    private readonly http: HttpClient,
    private readonly botToken: string,
    private readonly baseUrl = 'https://api.telegram.org',
  ) {}

  /**
   * 6.1.6. `POST /bot<token>/sendMessage`.
   *
   * **Never throws.** A failed send returns `Failed` and is retried by `NotificationController`
   * under 6.1.11; 10.2.1 requires the system to stay available when one external service is down,
   * and an undeliverable alert must not take an ingestion cycle with it. That is why every failure
   * mode here — a network error, a 4xx, a body that says `ok: false` — converges on one return
   * value rather than on three different exceptions.
   */
  async send(chatId: string, text: string): Promise<DeliveryOutcome> {
    if (this.botToken === '') {
      // No token configured. Suppressed rather than Failed: nothing was attempted, and 6.1.10's
      // log has to distinguish "we could not send" from "we had nowhere to send it".
      return DeliveryOutcome.Suppressed;
    }
    try {
      const res = await this.http.post(
        `${this.baseUrl}/bot${this.botToken}/sendMessage`,
        { chat_id: chatId, text, disable_notification: false },
        { attempts: 1 }, // retries belong to 6.1.11's five-minute schedule, not to the HTTP client
      );
      if (!res.ok) {
        return DeliveryOutcome.Failed;
      }
      const body = (await res.json()) as { ok?: boolean };
      return body.ok === true ? DeliveryOutcome.Sent : DeliveryOutcome.Failed;
    } catch {
      return DeliveryOutcome.Failed;
    }
  }

  /**
   * 6.1.7's inbound half: the messages residents send to the bot.
   *
   * `getUpdates` long-polls, which is the right shape for a deployment with no public URL — a
   * webhook would need one, and this project has no hosting target yet. The two are mutually
   * exclusive at Telegram's end, so if a webhook is ever set this must stop being called.
   *
   * Like `send`, it never throws: the link poller runs on a timer beside the ingestion cycle, and
   * a Telegram outage must not take that process down (10.2.1).
   *
   * @param offset the update id to resume from — Telegram deletes everything below it, which is
   *   what makes an update processed exactly once across a restart rather than replayed.
   */
  async getUpdates(offset: number, timeoutSeconds = 0): Promise<TelegramMessage[]> {
    if (this.botToken === '') {
      return [];
    }
    try {
      const res = await this.http.getJson<RawUpdatesResponse>(
        `${this.baseUrl}/bot${this.botToken}/getUpdates?offset=${offset}&timeout=${timeoutSeconds}&allowed_updates=%5B%22message%22%5D`,
        // A little longer than the long-poll itself, or the client aborts the call it asked for.
        { attempts: 1, timeoutMs: (timeoutSeconds + 20) * 1000 },
      );
      if (res.ok !== true) {
        return [];
      }
      return (res.result ?? []).flatMap((update) => {
        const chatId = update.message?.chat?.id;
        const text = update.message?.text;
        if (chatId === undefined || text === undefined) {
          // A sticker, a photograph, a chat-member event. Its update id is still returned so the
          // offset advances past it; otherwise one unhandled message stalls the poller forever.
          return update.update_id === undefined
            ? []
            : [{ updateId: update.update_id, chatId: String(chatId ?? ''), text: '', from: null }];
        }
        return [
          {
            updateId: update.update_id ?? 0,
            chatId: String(chatId),
            text,
            from: update.message?.from?.first_name ?? null,
          },
        ];
      });
    } catch {
      return [];
    }
  }
}

/** One inbound message, reduced to what 6.1.7 needs: who said what, and from which chat. */
export interface TelegramMessage {
  updateId: number;
  chatId: string;
  text: string;
  /** For the reply's greeting only. Never stored: 10.3.x, and we do not need it. */
  from: string | null;
}

interface RawUpdatesResponse {
  ok?: boolean;
  result?: Array<{
    update_id?: number;
    message?: {
      text?: string;
      chat?: { id?: number };
      from?: { first_name?: string };
    };
  }>;
}
