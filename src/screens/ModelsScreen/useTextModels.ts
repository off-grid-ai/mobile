import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Keyboard, BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { showAlert, AlertState } from '../../components/CustomAlert';
import { RECOMMENDED_MODELS, TRENDING_FAMILIES, MODEL_ORGS } from '../../constants';
import { useAppStore } from '../../stores';
import { huggingFaceService, modelManager, hardwareService, activeModelService } from '../../services';
import { ModelInfo, ModelFile, DownloadedModel } from '../../types';
import { FilterDimension, FilterState, ModelTypeFilter, CredibilityFilter, SizeFilter, SortOption } from './types';
import { initialFilterState, SIZE_OPTIONS, VISION_PIPELINE_TAG, CODE_FALLBACK_QUERY } from './constants';
import { getModelType } from './utils';
import logger from '../../utils/logger';

const PARAM_COUNT_REGEX = /\b(\d+[.]\d+|\d+)\s?[Bb]\b/;

function parseParamCount(model: ModelInfo): number | null {
  const match = PARAM_COUNT_REGEX.exec(model.name) ?? PARAM_COUNT_REGEX.exec(model.id);
  return match ? Number.parseFloat(match[1]) : null;
}

// Score how well a model fits a device: ideal is ~40% of RAM, penalty above 75% (too slow)
function bestFitScore(model: ModelInfo, ramGB: number): number {
  const minRam = model.minRamGB ?? (model.paramCount ?? 0) * 0.75;
  const ratio = minRam / ramGB;
  const penalty = ratio > 0.75 ? (ratio - 0.75) * 4 : 0;
  return Math.abs(ratio - 0.4) + penalty;
}

function applySort<T extends ModelInfo>(models: T[], sort: SortOption, ramGB = 0): T[] {
  if (sort === 'recommended') return models;
  return [...models].sort((a, b) => {
    if (sort === 'bestfit') return bestFitScore(a, ramGB) - bestFitScore(b, ramGB);
    if (sort === 'size') return (a.paramCount ?? parseParamCount(a) ?? 0) - (b.paramCount ?? parseParamCount(b) ?? 0);
    if (sort === 'downloads') return (b.downloads ?? 0) - (a.downloads ?? 0);
    const da = a.lastModified ? new Date(a.lastModified).getTime() : 0;
    const db = b.lastModified ? new Date(b.lastModified).getTime() : 0;
    return db - da;
  });
}

function matchesOrgFilter(model: ModelInfo, orgs: string[]): boolean {
  if (orgs.length === 0) return true;
  return orgs.some(orgKey => {
    if (model.author === orgKey) return true;
    const orgLabel = MODEL_ORGS.find(o => o.key === orgKey)?.label || orgKey;
    return model.id.toLowerCase().includes(orgLabel.toLowerCase()) ||
      model.name.toLowerCase().includes(orgLabel.toLowerCase());
  });
}

function mapCuratedModel(m: typeof RECOMMENDED_MODELS[number], details: Record<string, ModelInfo>): ModelInfo {
  const fetched = details[m.id];
  const curatedFields = { modelType: m.type, paramCount: m.params, minRamGB: m.minRam };
  if (fetched) return { ...fetched, name: m.name, description: m.description, ...curatedFields };
  return { id: m.id, name: m.name, author: m.id.split('/')[0], description: m.description, downloads: -1, likes: 0, tags: [], lastModified: '', files: [], ...curatedFields };
}

async function fetchRecommendedModelDetails(): Promise<Record<string, ModelInfo>> {
  const details: Record<string, ModelInfo> = {};
  await Promise.allSettled(RECOMMENDED_MODELS.map(async (m) => {
    try { details[m.id] = await huggingFaceService.getModelDetails(m.id); }
    catch (e) { logger.warn(`[ModelsScreen] Failed to fetch details for ${m.id}:`, e); }
  }));
  return details;
}

function computeFilteredResults(
  searchResults: ModelInfo[],
  filterState: FilterState,
  ramGB: number,
): ModelInfo[] {
  const filtered = searchResults.filter(model => {
    if (filterState.source !== 'all' && model.credibility?.source !== filterState.source) return false;
    if (filterState.type !== 'all' && getModelType(model) !== filterState.type) return false;
    if (!matchesOrgFilter(model, filterState.orgs)) return false;
    if (filterState.size !== 'all') {
      const params = parseParamCount(model);
      if (params !== null) {
        const sizeOpt = SIZE_OPTIONS.find(s => s.key === filterState.size);
        if (sizeOpt && (params < sizeOpt.min || params >= sizeOpt.max)) return false;
      }
    }
    const filesWithSize = (model.files || []).filter(f => f.size > 0);
    if (filesWithSize.length > 0 && !filesWithSize.some(f => f.size / (1024 ** 3) < ramGB * 0.6)) return false;
    return true;
  });
  return filtered.map(model => {
    const type = getModelType(model);
    const params = parseParamCount(model);
    return { ...model, modelType: type === 'image-gen' ? undefined : type as 'text' | 'vision' | 'code', paramCount: params ?? undefined };
  });
}

export function useTextModels(setAlertState: (s: AlertState) => void) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [modelFiles, setModelFiles] = useState<ModelFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>(initialFilterState);
  const [textFiltersVisible, setTextFiltersVisible] = useState(false);
  const [recommendedModelDetails, setRecommendedModelDetails] = useState<Record<string, ModelInfo>>({});

  const { downloadedModels, setDownloadedModels, downloadProgress, setDownloadProgress, addDownloadedModel, removeDownloadedModel, activeModelId } = useAppStore();
  const [downloadIds, setDownloadIds] = useState<Record<string, number>>({});
  const lastProgressUpdate = useRef<Record<string, number>>({});

  const loadDownloadedModels = async () => {
    const models = await modelManager.getDownloadedModels();
    setDownloadedModels(models);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadDownloadedModels(); }, []);

  useEffect(() => {
    let cancelled = false;
    fetchRecommendedModelDetails().then(d => { if (!cancelled) setRecommendedModelDetails(d); });
    return () => { cancelled = true; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (selectedModel) { setSelectedModel(null); setModelFiles([]); return true; }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [selectedModel])
  );

  const runSearch = async () => {
    const hasQuery = searchQuery.trim().length > 0;
    const hasTypeFilter = filterState.type !== 'all';
    const hasOrgFilter = filterState.orgs.length > 0;
    const hasSizeFilter = filterState.size !== 'all';
    if (!hasQuery && !hasTypeFilter && !hasOrgFilter && !hasSizeFilter) {
      setHasSearched(false); setSearchResults([]); return;
    }
    let pipelineTag: string | undefined;
    let effectiveQuery = searchQuery.trim();
    if (filterState.type === 'vision') pipelineTag = VISION_PIPELINE_TAG;
    else if (filterState.type === 'code' && !effectiveQuery) effectiveQuery = CODE_FALLBACK_QUERY;
    setIsLoading(true); setHasSearched(true);
    try {
      const results = await huggingFaceService.searchModels(effectiveQuery, { limit: 30, pipelineTag });
      setSearchResults(results);
    } catch {
      setAlertState(showAlert('Search Error', 'Failed to search models. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    Keyboard.dismiss();
    setFilterState(prev => ({ ...prev, expandedDimension: null }));
    await runSearch();
  };

  useEffect(() => {
    if (!searchQuery.trim()) { setHasSearched(false); setSearchResults([]); return; }
    const timer = setTimeout(() => { runSearch(); }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Auto-search when searchable filters change (type/size/org) even with empty query
  // Uses runSearch directly to avoid collapsing the expanded filter dimension
  useEffect(() => {
    if (filterState.type === 'all' && filterState.size === 'all' && filterState.orgs.length === 0) return;
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState.type, filterState.size, filterState.orgs.length]);

  const handleSelectModel = async (model: ModelInfo) => {
    setSelectedModel(model); setIsLoadingFiles(true);
    try {
      const files = await huggingFaceService.getModelFiles(model.id);
      setModelFiles(files);
    } catch {
      setAlertState(showAlert('Error', 'Failed to load model files.'));
      setModelFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleRepairMmProj = async (model: ModelInfo, file: ModelFile) => {
    const downloadKey = `${model.id}/${file.name}-mmproj`;
    const clearRepairState = () => { setDownloadProgress(downloadKey, null); setDownloadIds(prev => { const { [downloadKey]: _r, ...rest } = prev; return rest; }); };
    setDownloadProgress(downloadKey, { progress: 0, bytesDownloaded: 0, totalBytes: file.mmProjFile?.size || 0 });
    try {
      await modelManager.repairMmProj(model.id, file, {
        onProgress: (p) => setDownloadProgress(downloadKey, p),
        onDownloadIdReady: (id) => setDownloadIds(prev => ({ ...prev, [downloadKey]: id })),
      });
      clearRepairState();
      await loadDownloadedModels();
      setAlertState(showAlert('Vision Repaired', `Vision file restored for ${model.name}. Reload the model to enable vision.`));
    } catch (e) { clearRepairState(); setAlertState(showAlert('Repair Failed', (e as Error).message)); }
  };

  const handleDownload = async (model: ModelInfo, file: ModelFile) => {
    const downloadKey = `${model.id}/${file.name}`;
    const totalBytes = (file.size || 0) + (file.mmProjFile?.size || 0);
    setDownloadProgress(downloadKey, { progress: 0, bytesDownloaded: 0, totalBytes });
    const onProgress = (p: { progress: number; bytesDownloaded: number; totalBytes: number }) => {
      const now = Date.now();
      if (now - (lastProgressUpdate.current[downloadKey] ?? 0) < 500) return;
      lastProgressUpdate.current[downloadKey] = now;
      setDownloadProgress(downloadKey, p);
    };
    const onComplete = (dm: DownloadedModel) => {
      setDownloadProgress(downloadKey, null);
      setDownloadIds(prev => { const { [downloadKey]: _r, ...rest } = prev; return rest; });
      addDownloadedModel(dm);
      setAlertState(showAlert('Success', `${model.name} downloaded successfully!`));
    };
    const onError = (err: Error) => {
      setDownloadProgress(downloadKey, null);
      setDownloadIds(prev => { const { [downloadKey]: _r, ...rest } = prev; return rest; });
      setAlertState(showAlert('Download Failed', err.message));
    };
    try {
      const info = await modelManager.downloadModelBackground(model.id, file, onProgress);
      setDownloadIds(prev => ({ ...prev, [downloadKey]: info.downloadId }));
      modelManager.watchDownload(info.downloadId, onComplete, onError);
    } catch (e) { onError(e as Error); }
  };

  const handleCancelDownload = async (downloadKey: string) => {
    const downloadId = downloadIds[downloadKey];
    if (downloadId == null) return;
    try {
      await modelManager.cancelBackgroundDownload(downloadId);
    } catch { /* ignore cancel errors */ }
    setDownloadProgress(downloadKey, null);
    setDownloadIds(prev => { const { [downloadKey]: _r, ...rest } = prev; return rest; });
  };

  const handleDeleteModel = async (modelId: string) => {
    const model = downloadedModels.find(m => m.id === modelId);
    if (!model) return;
    if (activeModelId === model.id) await activeModelService.unloadTextModel().catch(() => {});
    await modelManager.deleteModel(model.id);
    removeDownloadedModel(model.id);
  };
  const isModelDownloaded = (modelId: string, fileName: string) =>
    downloadedModels.some(m => m.id === `${modelId}/${fileName}`);

  const getDownloadedModel = (modelId: string, fileName: string): DownloadedModel | undefined =>
    downloadedModels.find(m => m.id === `${modelId}/${fileName}`);

  // Filter actions
  const clearFilters = useCallback(() => setFilterState(initialFilterState), []);
  const toggleFilterDimension = useCallback((dim: FilterDimension) => {
    setFilterState(prev => ({ ...prev, expandedDimension: prev.expandedDimension === dim ? null : dim }));
  }, []);
  const toggleOrg = useCallback((orgKey: string) => {
    setFilterState(prev => ({
      ...prev,
      orgs: prev.orgs.includes(orgKey) ? prev.orgs.filter(o => o !== orgKey) : [...prev.orgs, orgKey],
    }));
  }, []);
  const setTypeFilter = useCallback((type: ModelTypeFilter) =>
    setFilterState(prev => ({ ...prev, type, expandedDimension: null })), []);
  const setSourceFilter = useCallback((source: CredibilityFilter) =>
    setFilterState(prev => ({ ...prev, source, expandedDimension: null })), []);
  const setSizeFilter = useCallback((size: SizeFilter) =>
    setFilterState(prev => ({ ...prev, size, expandedDimension: null })), []);
  const setQuantFilter = useCallback((quant: string) =>
    setFilterState(prev => ({ ...prev, quant, expandedDimension: null })), []);
  const setSortOption = useCallback((sort: SortOption) =>
    setFilterState(prev => ({ ...prev, sort, expandedDimension: null })), []);

  // Computed
  const ramGB = hardwareService.getTotalMemoryGB();
  const deviceRecommendation = useMemo(() => hardwareService.getModelRecommendation(), []);
  const hasActiveFilters = filterState.orgs.length > 0 || filterState.type !== 'all' ||
    filterState.source !== 'all' || filterState.size !== 'all' || filterState.quant !== 'all' ||
    filterState.sort !== 'recommended';

  const filteredResults = useMemo(
    () => applySort(computeFilteredResults(searchResults, filterState, ramGB), filterState.sort, ramGB),
    [searchResults, filterState, ramGB],
  );

  const recommendedAsModelInfo = useMemo((): ModelInfo[] => {
    const maxParams = deviceRecommendation.maxParameters;
    const models = RECOMMENDED_MODELS
      .filter(m => m.params <= maxParams && (!m.maxRam || ramGB <= m.maxRam))
      .filter(m => {
        if (filterState.type !== 'all' && m.type !== filterState.type) return false;
        if (filterState.orgs.length > 0 && !filterState.orgs.includes(m.org)) return false;
        if (filterState.size !== 'all') {
          const sizeOpt = SIZE_OPTIONS.find(s => s.key === filterState.size);
          if (sizeOpt && (m.params < sizeOpt.min || m.params >= sizeOpt.max)) return false;
        }
        return true;
      })
      .map(m => mapCuratedModel(m, recommendedModelDetails));
    return applySort(models, filterState.sort, ramGB);
  }, [deviceRecommendation.maxParameters, filterState.type, filterState.orgs, filterState.size, filterState.sort, recommendedModelDetails, ramGB]);

  const trendingAsModelInfo = useMemo((): ModelInfo[] => {
    const maxParams = deviceRecommendation.maxParameters;
    // Pick the best-fit per family using the same bestFitScore used for "for you" recommendations
    return Object.values(TRENDING_FAMILIES)
      .map(ids => RECOMMENDED_MODELS
        .filter(m => ids.includes(m.id) && m.params <= maxParams && (!m.maxRam || ramGB <= m.maxRam))
        .map(m => mapCuratedModel(m, recommendedModelDetails))
        .sort((a, b) => bestFitScore(a, ramGB) - bestFitScore(b, ramGB))[0])
      .filter((m): m is ModelInfo => Boolean(m));
  }, [deviceRecommendation.maxParameters, recommendedModelDetails, ramGB]);

  return {
    searchQuery, setSearchQuery,
    isLoading, isRefreshing, setIsRefreshing,
    hasSearched,
    selectedModel, setSelectedModel,
    modelFiles, setModelFiles,
    isLoadingFiles,
    filterState, setFilterState,
    textFiltersVisible, setTextFiltersVisible,
    downloadedModels, downloadProgress,
    hasActiveFilters, ramGB, deviceRecommendation,
    filteredResults, recommendedAsModelInfo, trendingAsModelInfo,
    handleSearch, handleSelectModel, handleDownload, handleRepairMmProj, handleCancelDownload, handleDeleteModel, loadDownloadedModels,
    clearFilters, toggleFilterDimension, toggleOrg,
    setTypeFilter, setSourceFilter, setSizeFilter, setQuantFilter, setSortOption,
    isModelDownloaded, getDownloadedModel,
    downloadIds,
  };
}
