/**
 * ProDetailScreen Tests
 */

import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useAppStore } from '../../../src/stores/appStore';

const PAY_URL = 'https://offgridmobileai.co/pay';
const mockActivateProByEmail = jest.fn();
const mockResetProIdentityForTesting = jest.fn();

jest.mock('../../../src/services/proLicenseService', () => ({
  activateProByEmail: (...args: unknown[]) => mockActivateProByEmail(...args),
  resetProIdentityForTesting: (...args: unknown[]) => mockResetProIdentityForTesting(...args),
  PRO_PAY_PAGE_URL: 'https://offgridmobileai.co/pay',
}));

import { ProDetailScreen } from '../../../src/screens/ProDetailScreen';

describe('ProDetailScreen', () => {
  let alertSpy: jest.SpyInstance;
  let linkingSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState({ hasRegisteredPro: false });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    linkingSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  });

  afterEach(() => {
    alertSpy.mockRestore();
    linkingSpy.mockRestore();
  });

  it('renders the Get Pro call-to-action when the user is not Pro', () => {
    const { queryAllByText } = render(<ProDetailScreen />);
    expect(queryAllByText('Get Pro').length).toBeGreaterThan(0);
  });

  it('Get Pro opens the web pay page directly without a modal', () => {
    const { getAllByText, queryByText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    expect(linkingSpy).toHaveBeenCalledWith(PAY_URL);
    // No in-app email step for paying.
    expect(queryByText('Verify membership')).toBeNull();
  });

  it('"Already a member? Verify with email" opens the verify modal', () => {
    const { getByText } = render(<ProDetailScreen />);
    fireEvent.press(getByText('Already a member? Verify with email'));
    expect(getByText('Verify membership')).toBeTruthy();
    expect(getByText('Enter the email tied to your Pro membership.')).toBeTruthy();
  });

  it('verifies the membership and shows the success card', async () => {
    mockActivateProByEmail.mockResolvedValueOnce(true);
    const { getByText, getByTestId, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getByText('Already a member? Verify with email'));
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'buyer@example.com');
    fireEvent.press(getByTestId('unlock-cta'));
    await waitFor(() => expect(mockActivateProByEmail).toHaveBeenCalledWith('buyer@example.com'));
    await waitFor(() => expect(getByText('Pro activated')).toBeTruthy());
  });

  it('lets the user dismiss the success card with Got it', async () => {
    mockActivateProByEmail.mockResolvedValueOnce(true);
    const { getByText, getByTestId, queryByText, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getByText('Already a member? Verify with email'));
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'buyer@example.com');
    fireEvent.press(getByTestId('unlock-cta'));
    await waitFor(() => expect(getByText('Pro activated')).toBeTruthy());
    fireEvent.press(getByText('Got it'));
    await waitFor(() => expect(queryByText('Pro activated')).toBeNull());
  });

  it('shows an inline error when no membership is found for that email', async () => {
    mockActivateProByEmail.mockResolvedValueOnce(false);
    const { getByText, getByTestId, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getByText('Already a member? Verify with email'));
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'nope@example.com');
    fireEvent.press(getByTestId('unlock-cta'));
    await waitFor(() => expect(getByText(/No Pro membership found/)).toBeTruthy());
  });

  it('keeps the verify button disabled until text is entered', async () => {
    const { getByText, getByTestId, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getByText('Already a member? Verify with email'));
    // Empty input: the disabled button ignores the press, no verify call.
    fireEvent.press(getByTestId('unlock-cta'));
    expect(mockActivateProByEmail).not.toHaveBeenCalled();
    // Once text is entered the button is enabled and verifies.
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'buyer@example.com');
    fireEvent.press(getByTestId('unlock-cta'));
    await waitFor(() => expect(mockActivateProByEmail).toHaveBeenCalled());
  });

  it('treats whitespace-only input as empty so the button stays disabled', () => {
    const { getByText, getByTestId, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getByText('Already a member? Verify with email'));
    fireEvent.changeText(getByPlaceholderText('you@example.com'), '   ');
    fireEvent.press(getByTestId('unlock-cta'));
    expect(mockActivateProByEmail).not.toHaveBeenCalled();
  });

  it('strips surrounding whitespace before verifying', async () => {
    mockActivateProByEmail.mockResolvedValueOnce(true);
    const { getByText, getByTestId, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getByText('Already a member? Verify with email'));
    fireEvent.changeText(getByPlaceholderText('you@example.com'), '  buyer@example.com  ');
    fireEvent.press(getByTestId('unlock-cta'));
    await waitFor(() => expect(mockActivateProByEmail).toHaveBeenCalledWith('buyer@example.com'));
  });

  it('"Not a member yet? Get Pro" in the modal opens the pay page', () => {
    const { getByText } = render(<ProDetailScreen />);
    fireEvent.press(getByText('Already a member? Verify with email'));
    fireEvent.press(getByText('Not a member yet? Get Pro'));
    expect(linkingSpy).toHaveBeenCalledWith(PAY_URL);
  });

  it('renders the Pro Active state when the user already owns Pro', () => {
    useAppStore.setState({ hasRegisteredPro: true });
    const { getByText } = render(<ProDetailScreen />);
    expect(getByText('Pro Active')).toBeTruthy();
    expect(getByText('Pro is active on this account.')).toBeTruthy();
  });

  it('runs the reset and confirms when the Pro user taps Reset Pro identity', async () => {
    useAppStore.setState({ hasRegisteredPro: true });
    mockResetProIdentityForTesting.mockResolvedValueOnce(undefined);
    const { getByText } = render(<ProDetailScreen />);
    fireEvent.press(getByText('Reset Pro identity'));
    await waitFor(() => expect(mockResetProIdentityForTesting).toHaveBeenCalledTimes(1));
    expect(alertSpy).toHaveBeenCalledWith('Reset done', expect.any(String));
  });
});
