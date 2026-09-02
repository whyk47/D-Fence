/**
 * D-Fence — Telegram Bot API adapter.
 * Stereotype: <<boundary>>. Traces: 6.x, 8.2.4, 10.3.4 (token outside the repository).
 */
import { NotificationChannel } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { DeliveryOutcome } from '../../entity/enums';

export class TelegramGateway implements NotificationChannel {
  constructor(private readonly http: HttpClient, private readonly botToken: string) {}

  send(_chatId: string, _text: string): Promise<DeliveryOutcome> {
    // TODO(F7): a failed send returns Failed and is retried by NotificationController.
    // It must never throw into the caller: 10.2.1 keeps the system available when a
    // single external service is down.
    throw new Error('not implemented');
  }
}
