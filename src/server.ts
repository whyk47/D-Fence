/**
 * D-Fence — application server entry point.
 * Boots the configurator, mounts the routes, listens. Nothing else belongs here.
 */
import { AppConfigurator } from './config/AppConfigurator';

async function main(): Promise<void> {
  const configurator = new AppConfigurator();
  await configurator.bootstrap();
  // TODO: mount routes and listen on process.env.PORT.
}

void main();
