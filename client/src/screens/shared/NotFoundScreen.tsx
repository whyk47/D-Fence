/**
 * D-Fence — Not Found screen (REQUIREMENTS.md 11.2.24).
 * Stereotype: <<boundary>>. Traces: 11.2.24, 2.3.7, 10.5.6.
 *
 * Distinct from Not Authorised in wording but not in what it reveals. The guard answers Not Found
 * for an unknown URL *before* it considers the role, so an anonymous visitor cannot map the private
 * routes by comparing which addresses say "not authorised" and which say "not found".
 */
import { link } from '../../components/Link';
import { homeFor } from '../../app/RouteGuard';
import { ScreenProps } from '../ScreenProps';

export function NotFoundScreen(props: ScreenProps): JSX.Element {
  const home = props.principal === null ? '/' : homeFor(props.principal.role);
  return (
    <section data-screen="NotFound" data-requirement="11.2.24">
      <h1>Not found</h1>
      <p>That address does not exist.</p>
      <a href={home} onClick={link(props, home)}>
        Back to {props.principal === null ? 'the start' : 'your home screen'}
      </a>
    </section>
  );
}
