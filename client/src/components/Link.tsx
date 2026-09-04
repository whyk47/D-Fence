/**
 * D-Fence — an in-application link.
 * Stereotype: <<boundary>>. Traces: 11.3.2, 11.3.8, 11.7.1, 11.7.2.
 *
 * A real `<a href>` so the middle-click, the status bar and the browser's own "copy link address"
 * all work, plus `preventDefault` so navigation goes through the shell. Using a `<button>` styled
 * as a link would lose all three; using a bare `onClick` on a `<div>` would lose the keyboard as
 * well (11.7.1).
 */
import { ScreenProps } from '../screens/ScreenProps';

/** The click handler for an in-app anchor. */
export function link(props: Pick<ScreenProps, 'onNavigate'>, to: string) {
  return (event: { preventDefault: () => void }) => {
    event.preventDefault();
    props.onNavigate(to);
  };
}

export function Link(props: {
  to: string;
  onNavigate: (url: string) => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <a href={props.to} onClick={link({ onNavigate: props.onNavigate }, props.to)}>
      {props.children}
    </a>
  );
}
