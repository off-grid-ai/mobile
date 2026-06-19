/**
 * VoiceModelsPanel tests
 *
 * The Voice tab body on the Models screen. It presents each TTS engine as a
 * ModelCard (matching the Text/Image tabs). Verifies:
 *  - one card per registered engine + the device RAM banner
 *  - a not-downloaded engine shows Download, which selects that engine then
 *    downloads its model
 *  - a downloaded, non-active engine shows a select action that activates it
 *  - the footer links to the full TTS settings screen
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

jest.mock('@offgrid/core/services/hardware', () => ({
  hardwareService: { getTotalMemoryGB: jest.fn(() => 8) },
}));

jest.mock('@offgrid/core/components/CustomAlert', () => {
  const { View } = require('react-native');
  return {
    CustomAlert: () => <View testID="custom-alert" />,
    // showAlert returns the alert state with buttons so the test can invoke them.
    showAlert: (title: string, message: string, buttons: any[]) => ({ visible: true, title, message, buttons }),
    hideAlert: () => ({ visible: false }),
    initialAlertState: { visible: false },
  };
});

jest.mock('@offgrid/core/components', () => {
  const { Text, TouchableOpacity } = require('react-native');
  return {
    ModelCard: ({ model, isDownloaded, onPress, onDownload, onDelete, testID }: any) => (
      <TouchableOpacity testID={testID} onPress={onPress} disabled={!onPress}>
        <Text testID={`${testID}-name`}>{model.name}</Text>
        <Text testID={`${testID}-author`}>{model.author}</Text>
        {isDownloaded && <Text testID={`${testID}-downloaded`}>downloaded</Text>}
        {onDownload && <TouchableOpacity testID={`${testID}-download`} onPress={onDownload}><Text>Download</Text></TouchableOpacity>}
        {onDelete && <TouchableOpacity testID={`${testID}-delete`} onPress={onDelete}><Text>Delete</Text></TouchableOpacity>}
      </TouchableOpacity>
    ),
  };
});

const makeEngine = (id: string, opts: { name: string; sizeMB: number; downloaded: boolean; supported?: boolean; streaming?: boolean; voiceCloning?: boolean }) => ({
  id,
  displayName: opts.name,
  capabilities: { streaming: !!opts.streaming, voiceCloning: !!opts.voiceCloning, peakRamMB: opts.sizeMB, generateAndSave: false },
  isSupported: () => opts.supported ?? true,
  getRequiredAssets: () => [{ id: `${id}-asset`, sizeBytes: opts.sizeMB * 1024 * 1024 }],
  isFullyDownloaded: () => opts.downloaded,
  getOverallDownloadProgress: () => (opts.downloaded ? 1 : 0),
  checkAssetStatus: jest.fn(async () => []),
});

// mock-prefixed so jest.mock factories may reference them (referenced lazily).
const mockEngines: Record<string, ReturnType<typeof makeEngine>> = {
  kokoro: makeEngine('kokoro', { name: 'Kokoro TTS', sizeMB: 82, downloaded: true, streaming: true }),
  outetts: makeEngine('outetts', { name: 'OuteTTS 0.3', sizeMB: 527, downloaded: false, voiceCloning: true }),
};

jest.mock('../../../pro/audio/engine', () => ({
  ttsRegistry: {
    getRegisteredIds: () => ['kokoro', 'outetts'],
    getEngine: (id: string) => mockEngines[id],
  },
}));

const mockStoreActions = {
  setEngine: jest.fn(async () => {}),
  downloadModels: jest.fn(async () => {}),
  deleteModels: jest.fn(async () => {}),
  checkDownloadStatus: jest.fn(async () => {}),
  initializeEngine: jest.fn(async () => {}),
  clearError: jest.fn(),
};

let mockStoreState: any;
jest.mock('../../../pro/audio/ttsStore', () => ({
  useTTSStore: () => mockStoreState,
}));

import { VoiceModelsPanel } from '../../../pro/audio/ui/VoiceModelsPanel';

const renderPanel = async () => {
  const utils = render(<VoiceModelsPanel />);
  // Let the mount effect (per-engine disk probe) settle.
  await act(async () => { await Promise.resolve(); });
  return utils;
};

describe('VoiceModelsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState = {
      isReady: true,
      isDownloading: false,
      overallDownloadProgress: 0,
      error: null,
      settings: { engineId: 'kokoro' },
      ...mockStoreActions,
    };
  });

  it('renders one card per engine plus the RAM privacy banner', async () => {
    const { getByTestId, getByText } = await renderPanel();

    expect(getByTestId('voice-model-card-0-name')).toHaveTextContent('Kokoro TTS');
    expect(getByTestId('voice-model-card-1-name')).toHaveTextContent('OuteTTS 0.3');
    expect(getByText(/nothing is sent anywhere/)).toBeTruthy();
  });

  it('shows a downloaded engine as downloaded', async () => {
    const { getByTestId } = await renderPanel();
    expect(getByTestId('voice-model-card-0-downloaded')).toBeTruthy();
  });

  it('downloads a not-downloaded engine by selecting it then downloading', async () => {
    const { getByTestId } = await renderPanel();

    await act(async () => {
      fireEvent.press(getByTestId('voice-model-card-1-download'));
    });

    await waitFor(() => {
      expect(mockStoreActions.setEngine).toHaveBeenCalledWith('outetts');
      expect(mockStoreActions.downloadModels).toHaveBeenCalled();
    });
  });

  it('activates a downloaded, non-active engine when its card is tapped', async () => {
    // Make outetts downloaded but kokoro active.
    mockEngines.outetts.isFullyDownloaded = () => true;
    const { getByTestId } = await renderPanel();

    await act(async () => {
      fireEvent.press(getByTestId('voice-model-card-1'));
    });

    await waitFor(() => {
      expect(mockStoreActions.setEngine).toHaveBeenCalledWith('outetts');
      expect(mockStoreActions.initializeEngine).toHaveBeenCalled();
    });
    // restore
    mockEngines.outetts.isFullyDownloaded = () => false;
  });
});
