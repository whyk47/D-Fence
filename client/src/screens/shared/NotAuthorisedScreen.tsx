/**
 * D-Fence — Not Authorised screen (REQUIREMENTS.md 11.2.24).
 * Stereotype: <<boundary>>. Traces: 11.2.24, 2.3.7, 10.5.6.
 *
 * Says nothing about what was refused, which role would have sufficed, or whether the thing exists.
 * 2.3.7 makes that a rule on the server; repeating it here matters because this screen is where a
 * helpful sentence is most tempting to write.
 *
 * What it does give is a way out (10.5.6). A refusal with no next step is a dead end, and the user
 * did not choose to be here.
 */
import { link } from '../../components/Link';
import { homeFor } from '../../app/RouteGuard';
import { ScreenProps } from '../ScreenProps';

export function NotAuthorisedScreen(props: ScreenProps): JSX.Element {
  const home = props.principal === null ? '/' : homeFor(props.principal.role);
  return (
    <section data-screen="NotAuthorised" data-requirement="11.2.24">
      <h1>Not authorised</h1>
      <p>Your account does not have access to that screen.</p>
      <a href={home} onClick={link(props, home)}>
        Back to {props.principal === null ? 'the start' : 'your home screen'}
      </a>
    </section>
  );
}
