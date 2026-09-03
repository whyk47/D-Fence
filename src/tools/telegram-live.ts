/**
 * D-Fence — one live pass against the real Telegram bot.
 *
 *     npx tsx src/tools/telegram-live.ts          # check the bot and read pending updates
 *     npx tsx src/tools/telegram-live.ts --send   # also send one real alert to TELEGRAM_CHAT_ID
 *
 * Proves 6.1.6 and the inbound half of 6.1.7 against api.telegram.org rather than against a fake.
 * A tool rather than a test: it needs the network and a token, and `--send` puts a message on
 * somebody's phone, which is not something a test suite should do on every run.
 */
import { ConfigLoader } from '../config/ConfigLoader';
import { HttpClient } from '../boundary/gateways/HttpClient';
import { TelegramGateway } from '../boundary/gateways/TelegramGateway';
import { Alert } from '../entity/Alert';
import { AlertTrigger, DeliveryOutcome } from '../entity/enums';

async function main(): Promise<void> {
  const config = ConfigLoader.load();
  const token = config.get('TELEGRAM_BOT_TOKEN');
  const chatId = config.get('TELEGRAM_CHAT_ID');
  if (token === '') {
    console.log('TELEGRAM_BOT_TOKEN is not set — nothing to check (6.1.6).');
    return;
  }

  const gateway = new TelegramGateway(new HttpClient(), token);

  // The inbound half of 6.1.7. Offset 0 asks for everything Telegram still holds; the poller in
  // TelegramLinkController advances past each update so a message is handled exactly once.
  const updates = await gateway.getUpdates(0);
  console.log(`getUpdates: ${updates.length} pending message(s)`);
  for (const update of updates) {
    // The text is echoed deliberately: a link code sent by a resident is what this is looking for.
    console.log(`  #${update.updateId} chat=${update.chatId} from=${update.from ?? '—'} text=${JSON.stringify(update.text)}`);
  }

  if (!process.argv.includes('--send')) {
    console.log('(pass --send to deliver one real alert to TELEGRAM_CHAT_ID)');
    return;
  }
  if (chatId === '') {
    console.log('TELEGRAM_CHAT_ID is not set — nothing to send to.');
    return;
  }

  // 6.1.8 — the alert body residents actually receive, composed by the entity rather than by a
  // string in this file, so what is verified here is what the system sends.
  const body = Alert.compose(AlertTrigger.ClusterGrowth, {
    locationLabel: 'Home',
    locationName: 'Bishan St 12',
    clusterName: 'Bishan St 12 (Blk 117, 122)',
    caseSize: 14,
    dataTimestamp: new Date(),
  });
  const outcome = await gateway.send(chatId, `[D-Fence live check] ${body}`);
  console.log(`send: ${outcome}`);
  if (outcome !== DeliveryOutcome.Sent) {
    process.exitCode = 1;
  }
}

void main();
