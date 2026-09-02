/**
 * D-Fence — HTTP surface.
 * Stereotype: <<boundary>>. Traces: 10.3.2 (HTTPS), 10.6.4 (correlation id on every error).
 */
import { RouteHandler } from './RouteHandler';

export class ExpressApp {
  private readonly handlers: RouteHandler[] = [];

  mount(_handler: RouteHandler): void {
    throw new Error('not implemented');
  }

  listen(_port: number): void {
    throw new Error('not implemented');
  }
}
