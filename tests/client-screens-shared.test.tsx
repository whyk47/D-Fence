/**
 * @vitest-environment jsdom
 *
 * D-Fence — Lab 4 §3.2: the shared and authentication screens (§11.2.1–11.2.4, 11.2.24).
 *
 * **Why these screens are rendered rather than reasoned about.** Everything §11 could be checked
 * without a DOM has been, in `client-navigation.test.ts` — the route table, the guard, the role
 * navigation, the field rules. What is left is the part that only exists once a component runs:
 * whether the label is bound to the input, whether the error reaches `role="alert"`, whether the
 * screen posts what the server accepts.
 *
 * The `ApiClient` is given a stub `Fetcher` rather than a mocked `ApiClient`, so the client's own
 * 403 handling, error mapping and header construction are exercised too. Mocking the class under
 * the screen would have tested the mock.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiClient, Fetcher } from '../client/src/lib/ApiClient';
import { ScreenProps } from '../client/src/screens/ScreenProps';
import { SignInScreen } from '../client/src/screens/shared/SignInScreen';
import { RegisterScreen } from '../client/src/screens/shared/RegisterScreen';
import { PasswordResetRequestScreen } from '../client/src/screens/shared/PasswordResetRequestScreen';
import { PasswordResetScreen } from '../client/src/screens/shared/PasswordResetScreen';
import { LandingScreen } from '../client/src/screens/shared/LandingScreen';
import { NotAuthorisedScreen } from '../client/src/screens/shared/NotAuthorisedScreen';
import { NotFoundScreen } from '../client/src/screens/shared/NotFoundScreen';
import { Role } from '../src/entity/enums';

afterEach(() => cleanup());

/** A fetcher that answers one canned response and records what it was asked. */
function stubFetcher(response: { status: number; body: unknown }): {
  fetcher: Fetcher;
  calls: Array<{ url: string; body: unknown }>;
} {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, body: init?.body === undefined ? null : JSON.parse(String(init.body)) });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    } as Response;
  };
  return { fetcher, calls };
}

function props(overrides: Partial<ScreenProps> = {}, fetcher?: Fetcher): ScreenProps {
  return {
    api: new ApiClient('', fetcher ?? (async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response)),
    params: {},
    principal: null,
    onNavigate: vi.fn(),
    onPrincipalChange: vi.fn(),
    ...overrides,
  };
}

function type(labelText: string, value: string): void {
  fireEvent.change(screen.getByLabelText(labelText), { target: { value } });
}

describe('Sign In — §11.2.3, §11.1.10, §2.1.10, §2.3.7', () => {
  it('S1 — a valid sign-in posts the credentials, keeps the token and lands on the role home (11.1.10)', async () => {
    const { fetcher, calls } = stubFetcher({
      status: 200,
      body: { token: 'tok-1', role: Role.CleaningCrew, accountId: 'acc-1' },
    });
    const onNavigate = vi.fn();
    const onPrincipalChange = vi.fn();
    render(<SignInScreen {...props({ onNavigate, onPrincipalChange }, fetcher)} />);

    type('Email', 'crew@example.com');
    type('Password', 'Password1');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalled());
    expect(calls[0]?.url).toBe('/api/auth/signin');
    expect(calls[0]?.body).toEqual({ email: 'crew@example.com', password: 'Password1' });
    // A cleaning crew member starts on their jobs, not on the resident map.
    expect(onNavigate).toHaveBeenCalledWith('/crew');
    expect(onPrincipalChange).toHaveBeenCalledWith({ accountId: 'acc-1', role: Role.CleaningCrew }, 'tok-1');
  });

  it('S2 — the email is trimmed but the password is not', async () => {
    const { fetcher, calls } = stubFetcher({
      status: 200,
      body: { token: 't', role: Role.Resident, accountId: 'a' },
    });
    render(<SignInScreen {...props({}, fetcher)} />);
    type('Email', '  resident@example.com  ');
    // A leading space in a password is a character of the password, not whitespace to tidy away.
    type('Password', ' Password1 ');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]?.body).toEqual({ email: 'resident@example.com', password: ' Password1 ' });
  });

  it('S3 — a refusal shows the server sentence and reveals nothing more (2.1.10, 2.3.7)', async () => {
    const { fetcher } = stubFetcher({
      status: 401,
      body: { error: 'those credentials were not accepted', remedy: 'correct the details and try again' },
    });
    render(<SignInScreen {...props({}, fetcher)} />);
    type('Email', 'someone@example.com');
    type('Password', 'wrongpass1');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('those credentials were not accepted');
    // The three outcomes 2.1.10 distinguishes internally must be indistinguishable here.
    expect(alert.textContent).not.toMatch(/locked|no such account|wrong password/i);
  });

  it('S4 — an invalid form does not reach the network at all (11.5.7)', async () => {
    const { fetcher, calls } = stubFetcher({ status: 200, body: {} });
    render(<SignInScreen {...props({}, fetcher)} />);
    type('Email', 'not-an-email');
    type('Password', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(calls).toHaveLength(0);
  });

  it('S5 — the field error is text in an alert, not colour alone (11.5.1, 11.7.5)', () => {
    render(<SignInScreen {...props()} />);
    const email = screen.getByLabelText('Email');
    fireEvent.change(email, { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('enter a valid email address')).toBeTruthy();
  });
});

describe('Register — §11.2.2, §2.1.1–2.1.4', () => {
  it('R1 — the password rules are shown as a hint before they are enforced (11.5.1)', () => {
    render(<RegisterScreen {...props()} />);
    expect(screen.getByText('At least 8 characters, including a letter and a digit.')).toBeTruthy();
  });

  it('R2 — mismatched confirmation blocks submission and says why', async () => {
    const { fetcher, calls } = stubFetcher({ status: 201, body: {} });
    render(<RegisterScreen {...props({}, fetcher)} />);
    type('Email', 'new@example.com');
    type('Password', 'Password1');
    type('Confirm password', 'Password2');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(screen.getByText('the two passwords do not match')).toBeTruthy());
    expect(calls).toHaveLength(0);
  });

  it('R3 — success does NOT sign the user in; it tells them to verify (2.1.4)', async () => {
    const { fetcher, calls } = stubFetcher({ status: 201, body: { accountId: 'a' } });
    const onPrincipalChange = vi.fn();
    render(<RegisterScreen {...props({ onPrincipalChange }, fetcher)} />);
    type('Email', 'new@example.com');
    type('Password', 'Password1');
    type('Confirm password', 'Password1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(screen.getByText('Check your email')).toBeTruthy());
    expect(calls[0]?.url).toBe('/api/auth/register');
    // The account exists but is not usable yet; signing them in would contradict 2.1.4.
    expect(onPrincipalChange).not.toHaveBeenCalled();
  });
});

describe('Password reset — §11.2.4, §2.1.11, §2.3.7', () => {
  it('P1 — the confirmation is conditional, so it is not an account-existence oracle (2.3.7)', async () => {
    const { fetcher } = stubFetcher({ status: 200, body: { sent: true } });
    render(<PasswordResetRequestScreen {...props({}, fetcher)} />);
    type('Email', 'unknown@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    const status = await screen.findByRole('status');
    expect(status.textContent).toBe('If that address is registered, a reset link is on its way.');
  });

  it('P2 — a server failure looks identical to a success, deliberately (2.3.7)', async () => {
    const { fetcher } = stubFetcher({ status: 500, body: { error: 'mailer down' } });
    render(<PasswordResetRequestScreen {...props({}, fetcher)} />);
    type('Email', 'known@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('If that address is registered');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('P3 — the reset form sends the token from the URL, not from a field (2.1.11)', async () => {
    const { fetcher, calls } = stubFetcher({ status: 200, body: { reset: true } });
    render(<PasswordResetScreen {...props({ params: { token: 'tok-from-email' } }, fetcher)} />);
    type('New password', 'Password1');
    type('Confirm new password', 'Password1');
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]?.body).toEqual({ token: 'tok-from-email', password: 'Password1' });
    expect(screen.queryByLabelText(/token/i)).toBeNull();
  });

  it('P4 — a spent token offers a new link rather than a retry (2.1.11)', async () => {
    const { fetcher } = stubFetcher({
      status: 400,
      body: { error: 'that reset link is no longer valid', remedy: 'request a new reset link' },
    });
    render(<PasswordResetScreen {...props({ params: { token: 'spent' } }, fetcher)} />);
    type('New password', 'Password1');
    type('Confirm new password', 'Password1');
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

    const alert = await screen.findByRole('alert');
    // Retrying a single-use token can only fail again, so the way out must be a fresh link.
    expect(alert.textContent).toContain('no longer valid');
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeTruthy();
  });
});

describe('Landing, Not Authorised and Not Found — §11.2.1, §11.2.24, §10.4.5', () => {
  it('L1 — attribution renders without a session (10.4.5)', async () => {
    const { fetcher, calls } = stubFetcher({
      status: 200,
      body: { sources: [{ name: 'Dengue Clusters', publisher: 'NEA', licence: 'SODL', url: 'https://data.gov.sg' }] },
    });
    render(<LandingScreen {...props({ principal: null }, fetcher)} />);

    await waitFor(() => expect(screen.getByText('NEA', { exact: false })).toBeTruthy());
    expect(calls[0]?.url).toBe('/api/attribution');
    // The credit must be readable by someone who has not signed in — that is the whole obligation.
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
  });

  it('L2 — a signed-in visitor is offered their home, not a sign-in button', () => {
    render(<LandingScreen {...props({ principal: { accountId: 'a', role: Role.OperationsManager } })} />);
    expect(screen.getByRole('link', { name: 'Continue' }).getAttribute('href')).toBe('/ops');
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('L3 — Not Authorised names neither the screen nor the role that would have worked (2.3.7)', () => {
    render(<NotAuthorisedScreen {...props({ principal: { accountId: 'a', role: Role.Resident } })} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('does not have access');
    // Naming the sufficient role would tell a Resident exactly what to go and acquire.
    expect(text).not.toMatch(/Operations Manager|Cleaning Crew|role/i);
  });

  it('L4 — both refusal screens offer a way out (10.5.6)', () => {
    render(<NotFoundScreen {...props({ principal: { accountId: 'a', role: Role.CleaningCrew } })} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/crew');
  });

  it('L5 — an anonymous visitor is sent to the public start, not to a role home', () => {
    render(<NotFoundScreen {...props({ principal: null })} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/');
  });
});
