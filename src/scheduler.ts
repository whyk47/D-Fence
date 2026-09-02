/**
 * D-Fence — scheduler process entry point.
 * A separate process from the web server, not a timer inside it. 10.2.3 requires ingestion to
 * resume automatically after a restart, and 10.1.2/10.1.5 bound response time under load —
 * a 60-second scoring cycle (10.1.3) must not compete for request threads.
 *
 * Five jobs at four intervals: rainfall 5 min, clusters hourly, forecast 6 h, OneMap token 48 h.
 */
import { AppConfigurator } from './config/AppConfigurator';

async function main(): Promise<void> {
  const configurator = new AppConfigurator();
  await configurator.bootstrap();
  // TODO(F1): register the cron schedules from ConfigSet.ingestionIntervals.
}

void main();
