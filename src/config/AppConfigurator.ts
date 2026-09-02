/**
 * D-Fence — the startup class (Fox pp. 341-345, heuristic 3).
 * Traces: 10.2.3, 10.3.4, 10.6.2.
 *
 * Configures the application, builds every object graph, and restores persistent state. It is
 * the only place that knows how the pieces fit together, which is what keeps the rest of the
 * system dependent on interfaces rather than on constructors.
 */
import { ServiceContainer } from './ServiceContainer';
import { ConfigSet } from './ConfigSet';

export class AppConfigurator {
  private readonly container = new ServiceContainer();

  /** Order matters: configuration, then persistence, then gateways, then controllers. */
  async bootstrap(): Promise<void> {
    throw new Error('not implemented');
  }

  registerRepositories(): void {
    throw new Error('not implemented');
  }

  registerGateways(): void {
    throw new Error('not implemented');
  }

  /** Also wires the Observer subscriptions: scoring and alerts subscribe to ingestion events. */
  registerControllers(): void {
    throw new Error('not implemented');
  }

  /** From environment and the configuration table. Secrets never come from the repository (10.3.4). */
  loadConfiguration(): Promise<ConfigSet> {
    throw new Error('not implemented');
  }

  /** 10.2.3: reschedules ingestion so a restart does not stall the live-data claim. */
  restorePersistentState(): Promise<void> {
    throw new Error('not implemented');
  }

  shutdown(): Promise<void> {
    throw new Error('not implemented');
  }
}
