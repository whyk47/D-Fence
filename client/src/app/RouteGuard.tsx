/**
 * D-Fence — client-side role gate.
 * Traces: 11.1.8, 2.3.6.
 *
 * Convenience only. The server decides: 2.3.6 requires every access rule enforced server-side
 * independently of any interface control, so removing this file must change what a user SEES
 * and never what a user CAN REACH.
 */
import { Role } from '../../../src/entity/enums';

export function RouteGuard(_props: { require: Role; children: JSX.Element }): JSX.Element {
  throw new Error('not implemented');
}
