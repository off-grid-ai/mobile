import React from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { Card } from '../../components';
import { CustomAlert, hideAlert } from '../../components/CustomAlert';
import { useTheme, useThemedStyles } from '../../theme';
import { createStyles } from './styles';
import { ActiveDownloadCard, CompletedDownloadCard, formatBytes } from './items';
import { useDownloadManager } from './useDownloadManager';

export const DownloadManagerScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const {
    activeItems,
    completedItems,
    alertState,
    setAlertState,
    handleRemoveDownload,
    handleRetryDownload,
    handleDeleteItem,
    handleRepairVision,
    totalStorageUsed,
  } = useDownloadManager();

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="downloaded-models-screen">
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} testID="back-button">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Download Manager</Text>
      </View>

      <FlatList
        data={[{ key: 'content' }]}
        renderItem={() => (
          <View style={styles.content}>
            {/* Active Downloads */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="download" size={18} color={colors.primary} />
                <Text style={styles.sectionTitle}>Active Downloads</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{activeItems.length}</Text>
                </View>
              </View>
              {activeItems.length > 0 ? (
                activeItems.map(item => (
                  <View key={`active-${item.modelId}-${item.fileName}`}>
                    <ActiveDownloadCard item={item} onRemove={handleRemoveDownload} onRetry={handleRetryDownload} />
                  </View>
                ))
              ) : (
                <Card style={styles.emptyCard}>
                  <Icon name="inbox" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No active downloads</Text>
                </Card>
              )}
            </View>

            {/* Completed Downloads */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Icon name="check-circle" size={18} color={colors.success} />
                <Text style={styles.sectionTitle}>Downloaded Models</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{completedItems.length}</Text>
                </View>
              </View>
              {completedItems.length > 0 ? (
                completedItems.map(item => (
                  <View key={`completed-${item.modelId}-${item.fileName}`}>
                    <CompletedDownloadCard item={item} onDelete={handleDeleteItem} onRepairVision={handleRepairVision} />
                  </View>
                ))
              ) : (
                <Card style={styles.emptyCard}>
                  <Icon name="package" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No models downloaded yet</Text>
                  <Text style={styles.emptySubtext}>
                    Go to the Models tab to browse and download models
                  </Text>
                </Card>
              )}
            </View>

            {/* Storage Info */}
            {completedItems.length > 0 && (
              <View style={styles.storageSection}>
                <View style={styles.storageRow}>
                  <Icon name="hard-drive" size={16} color={colors.textMuted} />
                  <Text style={styles.storageText}>
                    Total storage used: {formatBytes(totalStorageUsed)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
        keyExtractor={item => item.key}
        contentContainerStyle={styles.listContent}
      />

      <CustomAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onClose={() => setAlertState(hideAlert())}
      />
    </SafeAreaView>
  );
};
