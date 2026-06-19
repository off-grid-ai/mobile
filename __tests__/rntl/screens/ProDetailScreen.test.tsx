/**
 * ProDetailScreen Tests
 */

import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useAppStore } from '../../../src/stores/appStore';

const mockActivateProByEmail = jest.fn();
const mockGetWebPurchaseUrl = jest.fn((..._args: unknown[]) => 'https://pay.rev.cat/token/buyer%40example.com?email=buyer%40example.com');
const mockResetProIdentityForTesting = jest.fn();

jest.mock('../../../src/services/proLicenseService', () => ({
  activateProByEmail: (...args: unknown[]) => mockActivateProByEmail(...args),
  getWebPurchaseUrl: (...args: unknown[]) => mockGetWebPurchaseUrl(...args),
  resetProIdentityForTesting: (...args: unknown[]) => mockResetProIdentityForTesting(...args),
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

  it('opens web checkout with the entered email', async () => {
    const { getAllByText, getByText, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'buyer@example.com');
    fireEvent.press(getByText('Continue to payment'));
    await waitFor(() => expect(mockGetWebPurchaseUrl).toHaveBeenCalledWith('buyer@example.com'));
    expect(linkingSpy).toHaveBeenCalledWith('https://pay.rev.cat/token/buyer%40example.com?email=buyer%40example.com');
  });

  it('shows inline success state on a successful verify', async () => {
    mockActivateProByEmail.mockResolvedValueOnce(true);
    const { getAllByText, getByText, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'buyer@example.com');
    // Switch to verify mode first
    fireEvent.press(getByText('Already paid? Verify email instead'));
    fireEvent.press(getByText('Verify and unlock'));
    await waitFor(() => expect(mockActivateProByEmail).toHaveBeenCalledWith('buyer@example.com'));
    await waitFor(() => expect(getByText('Pro activated')).toBeTruthy());
  });

  it('shows inline error when no purchase is found for that email', async () => {
    mockActivateProByEmail.mockResolvedValueOnce(false);
    const { getAllByText, getByText, getByPlaceholderText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'nope@example.com');
    fireEvent.press(getByText('Already paid? Verify email instead'));
    fireEvent.press(getByText('Verify and unlock'));
    await waitFor(() => expect(getByText(/No Pro purchase found/)).toBeTruthy());
  });

  it('shows inline error when email is empty on checkout', async () => {
    const { getAllByText, getByText } = render(<ProDetailScreen />);
    fireEvent.press(getAllByText('Get Pro')[0]);
    fireEvent.press(getByText('Continue to payment'));
    await waitFor(() => expect(getByText('Enter your email first.')).toBeTruthy());
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
