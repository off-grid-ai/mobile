import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemedStyles } from '../theme';
import { QUANTIZATION_INFO, CREDIBILITY_LABELS } from '../constants';
import { ModelFile, DownloadedModel, ModelCredibility } from '../types';
import { createStyles } from './ModelCard.styles';
import {
  CompactModelCardContent,
  StandardModelCardContent,
  ModelInfoBadges,
  ModelCardActions,
} from './ModelCardContent';

interface ModelCardProps {
  model: {
    id: string;
    name: string;
    author: string;
    description?: string;
    downloads?: number;
    likes?: number;
    credibility?: ModelCredibility;
    files?: ModelFile[];
    modelType?: 'text' | 'vision' | 'code';
    paramCount?: number;
    minRamGB?: number;
  };
  file?: ModelFile;
  downloadedModel?: DownloadedModel;
  isDownloaded?: boolean;
  isDownloading?: boolean;
  downloadProgress?: number;
  downloadBytes?: { downloaded: number; total: number };
  isActive?: boolean;
  isCompatible?: boolean;
  incompatibleReason?: string;
  testID?: string;
  onPress?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onSelect?: () => void;
  onRepairVision?: () => void;
  onCancel?: () => void;
  compact?: boolean;
}

function resolveQuantInfo(file?: ModelFile, downloadedModel?: DownloadedModel) {
  const quant = file?.quantization ?? downloadedModel?.quantization;
  return quant ? (QUANTIZATION_INFO[quant] ?? null) : null;
}

function resolveFileSize(file?: ModelFile, downloadedModel?: DownloadedModel) {
  const main = file?.size ?? downloadedModel?.fileSize ?? 0;
  const mmProj = file?.mmProjFile?.size ?? downloadedModel?.mmProjFileSize ?? 0;
  return main + mmProj;
}

function resolveCredibility(
  model: { credibility?: ModelCredibility },
  downloadedModel?: DownloadedModel,
) {
  return model.credibility ?? downloadedModel?.credibility;
}

const DownloadProgressSection: React.FC<{
  progress: number;
  bytes?: { downloaded: number; total: number };
}> = ({ progress, bytes }) => {
  const styles = useThemedStyles(createStyles);
  return (
  <View style={styles.progressSection}>
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
    </View>
    {bytes && bytes.total > 0 && (
      <Text style={styles.progressBytesText}>
        {formatBytes(bytes.downloaded)} / {formatBytes(bytes.total)}
      </Text>
    )}
  </View>
  );
};

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  file,
  downloadedModel,
  isDownloaded,
  isDownloading,
  downloadProgress = 0,
  downloadBytes,
  isActive,
  isCompatible = true,
  incompatibleReason,
  testID,
  onPress,
  onDownload,
  onDelete,
  onSelect,
  onRepairVision,
  onCancel,
  compact,
}) => {
  const styles = useThemedStyles(createStyles);

  const quantInfo = resolveQuantInfo(file, downloadedModel);
  const fileSize = resolveFileSize(file, downloadedModel);
  const isVisionModel = !!(file?.mmProjFile || downloadedModel?.isVisionModel);

  const sizeRange = React.useMemo(() => {
    if (fileSize > 0 || !model.files || model.files.length === 0) return null;
    const sizes = model.files.map(f => f.size).filter(s => s > 0);
    if (sizes.length === 0) return null;
    return {
      min: Math.min(...sizes),
      max: Math.max(...sizes),
      count: model.files.length,
    };
  }, [model.files, fileSize]);

  const credibility = resolveCredibility(model, downloadedModel);
  const credibilityInfo = credibility ? CREDIBILITY_LABELS[credibility.source] : null;
  const quantization = file?.quantization ?? downloadedModel?.quantization;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        compact && styles.cardCompact,
        isActive && styles.cardActive,
        !isCompatible && styles.cardIncompatible,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
      testID={testID}
    >
<View style={styles.cardRow}>
        <View style={styles.cardContent}>
          {compact ? (
            <CompactModelCardContent
              model={model}
              credibility={credibility}
              credibilityInfo={credibilityInfo}
            />
          ) : (
            <StandardModelCardContent
              model={model}
              credibility={credibility}
              credibilityInfo={credibilityInfo}
              isActive={isActive}
            />
          )}

          <ModelInfoBadges
            fileSize={fileSize}
            sizeRange={sizeRange}
            quantInfo={quantInfo}
            quantization={quantization}
            isVisionModel={isVisionModel}
            isCompatible={isCompatible}
            incompatibleReason={incompatibleReason}
          />

          {!compact && model.downloads !== undefined && model.downloads > 0 && (
            <View style={styles.statsRow}>
              <Text style={styles.statsText}>
                {formatNumber(model.downloads)} downloads
              </Text>
              {model.likes !== undefined && model.likes > 0 && (
                <Text style={styles.statsText}>{formatNumber(model.likes)} likes</Text>
              )}
            </View>
          )}

          {isDownloading && (
            <DownloadProgressSection progress={downloadProgress} bytes={downloadBytes} />
          )}
        </View>

        <ModelCardActions
          isDownloaded={isDownloaded}
          isDownloading={isDownloading}
          isActive={isActive}
          isCompatible={isCompatible}
          incompatibleReason={incompatibleReason}
          testID={testID}
          onDownload={onDownload}
          onSelect={onSelect}
          onDelete={onDelete}
          onRepairVision={onRepairVision}
          onCancel={onCancel}
        />
      </View>
    </TouchableOpacity>
  );
};

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
