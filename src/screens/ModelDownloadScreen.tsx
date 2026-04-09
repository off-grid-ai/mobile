import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Card, ModelCard } from '../components';
import { CustomAlert, showAlert, hideAlert, AlertState, initialAlertState } from '../components/CustomAlert';
import { RemoteServerModal } from '../components/RemoteServerModal';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { RECOMMENDED_MODELS, TRENDING_FAMILIES, TYPOGRAPHY, SPACING } from '../constants';
import { useAppStore } from '../stores';
import { useRemoteServerStore } from '../stores/remoteServerStore';
import { hardwareService, modelManager, remoteServerManager } from '../services';
import { discoverLANServers } from '../services/networkDiscovery';
import { ModelFile, DownloadedModel, RemoteServer } from '../types';
import { RootStackParamList } from '../navigation/types';
import { fetchModelFiles, NetworkSection } from './ModelDownloadHelpers';
import logger from '../utils/logger';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'ModelDownload'> };

interface RecommendedCardProps {
  model: typeof RECOMMENDED_MODELS[number];
  recFile: ModelFile;
  index: number;
  progress: { progress: number } | null | undefined;
  downloaded: DownloadedModel | undefined;
  totalRamGB: number;
  isTrending: boolean;
  onDownload: () => void;
  onCancel: () => void;
}

const RecommendedModelCard: React.FC<RecommendedCardProps> = ({ model, recFile, index, progress, downloaded, totalRamGB, isTrending, onDownload, onCancel }) => (
  <ModelCard
    key={model.id}
    testID={`recommended-model-${index}`}
    compact
    model={{ id: model.id, name: model.name, author: model.id.split('/')[0], description: model.description, modelType: model.type, paramCount: model.params, minRamGB: model.minRam }}
    file={recFile}
    downloadedModel={downloaded}
    isDownloaded={!!downloaded}
    isDownloading={!!progress}
    downloadProgress={progress?.progress}
    isCompatible={model.minRam <= totalRamGB && (!model.maxRam || totalRamGB <= model.maxRam)}
    isTrending={isTrending}
    onPress={() => {}}
    onDownload={downloaded ? undefined : onDownload}
    onCancel={progress ? onCancel : undefined}
  />
);

export const ModelDownloadScreen: React.FC<Props> = ({ navigation }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [recommendedModels, setRecommendedModels] = useState<typeof RECOMMENDED_MODELS>([]);
  const [modelFiles, setModelFiles] = useState<Record<string, ModelFile[]>>({});
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const [connectingServerId, setConnectingServerId] = useState<string | null>(null);
  const [connectedServerId, setConnectedServerId] = useState<string | null>(null);
  const [reachableServerIds, setReachableServerIds] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(true);
  const [showServerModal, setShowServerModal] = useState(false);
  const healthCheckInFlight = useRef(false);
  const cancelledKeys = useRef<Set<string>>(new Set());
  const lastProgressUpdate = useRef<Record<string, number>>({});

  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [downloadIds, setDownloadIds] = useState<Record<string, number>>({});

  const { deviceInfo, setDeviceInfo, setModelRecommendation, downloadProgress, setDownloadProgress, addDownloadedModel, downloadedModels } = useAppStore();
  const servers = useRemoteServerStore((s) => s.servers);
  const discoveredModels = useRemoteServerStore((s) => s.discoveredModels);

  // Init hardware + model recommendations
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await hardwareService.getDeviceInfo();
        if (cancelled) return;
        setDeviceInfo(info);
        const rec = hardwareService.getModelRecommendation();
        if (cancelled) return;
        setModelRecommendation(rec);
        const ram = hardwareService.getTotalMemoryGB();
        const compat = RECOMMENDED_MODELS.filter((m) => m.minRam <= ram && (!m.maxRam || ram <= m.maxRam));
        if (cancelled) return;
        setRecommendedModels(compat);
        const files = await fetchModelFiles(compat);
        if (!cancelled) setModelFiles(files);
      } catch (error) {
        logger.error('Error initializing:', error);
        if (!cancelled) setAlertState(showAlert('Error', 'Failed to initialize. Please try again.'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Health-check persisted servers — only show reachable ones
  const refreshServerHealth = useCallback(async (): Promise<Set<string>> => {
    if (healthCheckInFlight.current) return new Set<string>();
    healthCheckInFlight.current = true;
    setIsCheckingNetwork(true);
    const store = useRemoteServerStore.getState();
    const reachable = new Set<string>();
    await Promise.all(
      store.servers.map(async (server) => {
        try {
          const result = await store.testConnection(server.id);
          if (result.success) reachable.add(server.id);
        } catch { /* offline */ }
      }),
    );
    setReachableServerIds(reachable);
    setIsCheckingNetwork(false);
    healthCheckInFlight.current = false;
    return reachable;
  }, []);

  useEffect(() => { refreshServerHealth(); }, [servers.length, refreshServerHealth]);

  // Scan network handler
  const handleScanNetwork = useCallback(async () => {
    setIsScanning(true);
    try {
      const discovered = await discoverLANServers();
      const store = useRemoteServerStore.getState();
      const existing = new Set(store.servers.map(s => s.endpoint.replace(/\/$/, '')));
      for (const d of discovered) {
        if (existing.has(d.endpoint.replace(/\/$/, ''))) continue;
        await remoteServerManager.addServer({ name: d.name, endpoint: d.endpoint, providerType: 'openai-compatible' });
      }
      const reachable = await refreshServerHealth();
      // Only alert if there are truly no reachable servers after the scan
      if (reachable.size === 0) {
        setAlertState(showAlert('No Servers Found', 'Make sure you\'re on the same WiFi network as your server and that it\'s running.'));
      }
    } catch (e) {
      logger.warn('[ModelDownload] Scan failed:', (e as Error).message);
      setAlertState(showAlert('Scan Failed', 'Could not scan your network. Make sure you are connected to WiFi.'));
    } finally {
      setIsScanning(false);
    }
  }, [refreshServerHealth]);

  const handleCancelDownload = async (key: string) => {
    cancelledKeys.current.add(key);
    const downloadId = downloadIds[key];
    if (downloadId != null) {
      try { await modelManager.cancelBackgroundDownload(downloadId); } catch { /* ignore */ }
    }
    setDownloadProgress(key, null);
    setDownloadIds(prev => { const { [key]: _r, ...rest } = prev; return rest; });
  };

  const handleDownload = async (modelId: string, file: ModelFile) => {
    const key = `${modelId}/${file.name}`;
    cancelledKeys.current.delete(key);
    setDownloadProgress(key, { progress: 0, bytesDownloaded: 0, totalBytes: file.size || 0 });
    const onError = (error: Error) => { setDownloadProgress(key, null); setAlertState(showAlert('Download Failed', error.message)); };
    try {
      const info = await modelManager.downloadModelBackground(modelId, file, (p) => {
        if (cancelledKeys.current.has(key)) return;
        const now = Date.now();
        if (now - (lastProgressUpdate.current[key] ?? 0) < 500) return;
        lastProgressUpdate.current[key] = now;
        setDownloadProgress(key, p);
      });
      // If the user cancelled before downloadModelBackground resolved, kill it now
      if (cancelledKeys.current.has(key)) {
        try { await modelManager.cancelBackgroundDownload(info.downloadId); } catch { /* ignore */ }
        return;
      }
      setDownloadIds(prev => ({ ...prev, [key]: info.downloadId }));
      modelManager.watchDownload(info.downloadId, (model: DownloadedModel) => {
        if (cancelledKeys.current.has(key)) return;
        setDownloadProgress(key, null);
        setDownloadIds(prev => { const { [key]: _r, ...rest } = prev; return rest; });
        addDownloadedModel(model);
      }, onError);
    } catch (error) { onError(error as Error); }
  };

  const handleConnectServer = async (server: RemoteServer) => {
    setConnectingServerId(server.id);
    try {
      const result = await remoteServerManager.testConnection(server.id);
      if (!result.success) {
        setAlertState(showAlert('Connection Failed', result.error || 'Could not connect to server.'));
        return;
      }
      setConnectedServerId(server.id);
      const models = discoveredModels[server.id] || result.models || [];
      if (models.length === 0) {
        setAlertState(showAlert('Connected — No Models Found', `${server.name} is reachable but has no models loaded. Start a model in Ollama/LM Studio, then reconnect.`));
        return;
      }
      const textModel = models.find(m => !m.capabilities.supportsVision) || models[0];
      if (textModel) await remoteServerManager.setActiveRemoteTextModel(server.id, textModel.id);
      setAlertState(showAlert('Connected!', `${server.name} is ready with ${models.length} model${models.length === 1 ? '' : 's'}. You can start chatting now.`,
        [{ text: 'Continue', onPress: () => { setAlertState(hideAlert()); navigation.replace('Main'); } }]));
    } catch (e) { setAlertState(showAlert('Connection Failed', (e as Error).message)); }
    finally { setConnectingServerId(null); }
  };

  const handleServerSaved = useCallback(() => {
    setShowServerModal(false);
    refreshServerHealth();
  }, [refreshServerHealth]);

  const totalRamGB = hardwareService.getTotalMemoryGB();

  // One best-fit trending model per family (ideal ≈ 40% of RAM, penalise > 75%)
  const trendingModelIds = React.useMemo(() => {
    const score = (m: (typeof RECOMMENDED_MODELS)[number]) => {
      const ratio = m.minRam / totalRamGB;
      const penalty = ratio > 0.75 ? (ratio - 0.75) * 4 : 0;
      return Math.abs(ratio - 0.4) + penalty;
    };
    const ids = new Set<string>();
    for (const familyIds of Object.values(TRENDING_FAMILIES)) {
      const best = RECOMMENDED_MODELS
        .filter(m => familyIds.includes(m.id) && m.minRam <= totalRamGB && (!m.maxRam || totalRamGB <= m.maxRam))
        .sort((a, b) => score(a) - score(b))[0];
      if (best) ids.add(best.id);
    }
    return ids;
  }, [totalRamGB]);

  const liveServers = servers.filter((s) => reachableServerIds.has(s.id));

  if (isLoading) return (
    <SafeAreaView style={styles.container}>
      <View testID="model-download-loading" style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Analyzing your device...</Text>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View testID="model-download-screen" style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Set Up Your AI</Text>
            <Text style={styles.subtitle}>
              Connect to a model server on your network, or download one to run directly on your device.
            </Text>
          </View>

          <NetworkSection
            servers={liveServers}
            discoveredModels={discoveredModels}
            connectingServerId={connectingServerId}
            connectedServerId={connectedServerId}
            isCheckingNetwork={isCheckingNetwork}
            isScanning={isScanning}
            onConnectServer={handleConnectServer}
            onScanNetwork={handleScanNetwork}
            onAddManually={() => setShowServerModal(true)}
            colors={colors}
          />

          <Text style={styles.sectionTitle}>Download to Your Device</Text>

          <Card style={styles.deviceCard}>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceLabel}>Your Device</Text>
              <Text style={styles.deviceValue}>{deviceInfo?.deviceModel}</Text>
            </View>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceLabel}>Available Memory</Text>
              <Text style={styles.deviceValue}>{hardwareService.formatBytes(deviceInfo?.availableMemory || 0)}</Text>
            </View>
          </Card>

          {recommendedModels.filter((model) => modelFiles[model.id]?.length).map((model, index) => {
            const recFile = modelFiles[model.id][0];
            const key = `${model.id}/${recFile.name}`;
            return (
              <RecommendedModelCard
                key={model.id}
                model={model}
                recFile={recFile}
                index={index}
                progress={downloadProgress[key]}
                downloaded={downloadedModels.find(d => d.id === `${model.id}/${recFile.name}`)}
                totalRamGB={totalRamGB}
                isTrending={trendingModelIds.has(model.id)}
                onDownload={() => handleDownload(model.id, recFile)}
                onCancel={() => handleCancelDownload(key)}
              />
            );
          })}

          {recommendedModels.length === 0 && (
            <Card style={styles.warningCard}>
              <Text style={styles.warningTitle}>Limited Compatibility</Text>
              <Text style={styles.warningText}>Your device has limited memory. You can still browse and download smaller models from the model browser.</Text>
            </Card>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button title="Skip for Now" variant="ghost" onPress={() => navigation.replace('Main')} testID="model-download-skip" />
        </View>

        <CustomAlert visible={alertState.visible} title={alertState.title} message={alertState.message} buttons={alertState.buttons} onClose={() => setAlertState(hideAlert())} />
        <RemoteServerModal visible={showServerModal} onClose={() => setShowServerModal(false)} onSave={handleServerSaved} />
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const, gap: 16 },
  loadingText: { ...TYPOGRAPHY.body, color: colors.textSecondary, textAlign: 'center' as const },
  scrollView: { flex: 1 },
  content: { padding: 16, paddingBottom: 100 },
  header: { marginBottom: SPACING.xl },
  title: { ...TYPOGRAPHY.h2, color: colors.text, marginBottom: 8 },
  subtitle: { ...TYPOGRAPHY.body, color: colors.textSecondary, lineHeight: 24 },
  sectionTitle: { ...TYPOGRAPHY.h2, color: colors.text, marginBottom: SPACING.lg },
  deviceCard: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginBottom: SPACING.xl },
  deviceInfo: { flex: 1 },
  deviceLabel: { ...TYPOGRAPHY.meta, color: colors.textMuted, marginBottom: 4 },
  deviceValue: { ...TYPOGRAPHY.body, color: colors.text },
  warningCard: { backgroundColor: `${colors.warning}20`, borderWidth: 1, borderColor: colors.warning },
  warningTitle: { ...TYPOGRAPHY.h3, color: colors.warning, marginBottom: 8 },
  warningText: { ...TYPOGRAPHY.bodySmall, color: colors.textSecondary, lineHeight: 20 },
  footer: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
});
