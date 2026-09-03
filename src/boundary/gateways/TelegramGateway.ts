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
}
