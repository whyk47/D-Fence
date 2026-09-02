/**
 * D-Fence — the client's single door to the server.
 * Stereotype: <<boundary>>. Traces: 2.3.7, 10.5.3.
 */
export class ApiClient {
  get<T>(_path: string): Promise<T> {
    throw new Error('not implemented');
  }

  post<T>(_path: string, _body: unknown): Promise<T> {
    throw new Error('not implemented');
  }

  /** A 403 sends the user to Not Authorised (11.2.24) — the interface displays, never decides. */
  private onUnauthorised(): void {
    throw new Error('not implemented');
  }
}
