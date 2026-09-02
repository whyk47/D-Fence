/**
 * D-Fence — dependency registry.
 * Traces: 10.6.3 (every control class must be unit-testable).
 *
 * Constructor injection with one place that does the wiring. Not a singleton: a test needs to
 * build a container with fake gateways and fake repositories, and a global would prevent that.
 */
export type Factory<T> = () => T;

export class ServiceContainer {
  private readonly registry = new Map<string, Factory<unknown>>();

  register<T>(token: string, factory: Factory<T>): void {
    this.registry.set(token, factory as Factory<unknown>);
  }

  resolve<T>(token: string): T {
    const factory = this.registry.get(token);
    if (!factory) {
      throw new Error(`nothing registered for '${token}'`);
    }
    return factory() as T;
  }
}
