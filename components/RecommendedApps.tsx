import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Fuse from 'fuse.js';
import { useTheme } from '@/context/theme/ThemeContext';
import { useWallet } from '@/context/WalletContext';
import { useBrowserMode } from '@/context/BrowserModeContext';
import { useTranslation } from 'react-i18next';
import { uhrpHandler } from '@/utils/uhrpProtocol';

interface App {
  domain: string;
  appName: string;
  appIconImageUrl?: string;
}

interface RecommendedAppsProps {
  setStartingUrl: (url: string) => void;
  includeBookmarks?: { title: string; url: string }[];
  hideHeader?: boolean;
  showOnlyBookmarks?: boolean;
  limitBookmarks?: number; // Limit number of bookmarks to show on homepage
  onRemoveBookmark?: (url: string) => void;
  onRemoveDefaultApp?: (url: string) => void;
  removedDefaultApps?: string[];
  // Homepage customization props
  homepageSettings?: {
    showBookmarks: boolean;
    showRecentApps: boolean;
    showRecommendedApps: boolean;
  };
  onUpdateHomepageSettings?: (settings: Partial<{
    showBookmarks: boolean;
    showRecentApps: boolean;
    showRecommendedApps: boolean;
  }>) => void;
}

/* -------------------------------------------------------------------------- */
/*                            DEFAULT RECOMMENDED                             */
/* -------------------------------------------------------------------------- */

const defaultApps: App[] = [
  {
    domain: 'https://p2pmnee.atx.systems',
    appName: 'P2PMNEE',
    appIconImageUrl: 'https://p2pmnee.atx.systems/p2m.png',
  },
  {
    domain: 'https://metanetstatus.lovable.app',
    appName: 'Metanet Status',
    appIconImageUrl: 'https://metanetstatus.lovable.app/favicon.ico',
  },
  {
    domain: 'https://todo.metanet.app',
    appName: 'My ToDo List',
    appIconImageUrl: 'https://todo.metanet.app/favicon.ico',
  },
  {
    domain: 'https://peerpay.babbage.systems',
    appName: 'PeerPay',
    appIconImageUrl: 'https://peerpay.babbage.systems/favicon.ico',
  },
  {
    domain: 'https://mountaintops.net',
    appName: 'Mountaintops',
    appIconImageUrl: 'https://mountaintops.net/favicon.ico',
  },
  {
    domain: 'https://metanetacademy.com',
    appName: 'Metanet Academy',
    appIconImageUrl: 'https://metanetacademy.com/favicon.ico',
  },
  {
    domain: 'https://coinflip.babbage.systems',
    appName: 'Coinflip Friend',
    appIconImageUrl: 'https://coinflip.babbage.systems/favicon.ico',
  },
];

/* -------------------------------------------------------------------------- */
/*                         RECOMMENDED APPS COMPONENT                         */
/* -------------------------------------------------------------------------- */

export const RecommendedApps = ({
  setStartingUrl,
  includeBookmarks = [],
  hideHeader = false,
  showOnlyBookmarks = false,
  limitBookmarks,
  onRemoveBookmark,
  onRemoveDefaultApp,
  removedDefaultApps = [],
  homepageSettings,
  onUpdateHomepageSettings,
}: RecommendedAppsProps) => {
  const { colors } = useTheme();
  const { recentApps } = useWallet();
  const { isWeb2Mode } = useBrowserMode();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [isDesktopView, setIsDesktopView] = useState(false);
  
  // Context menu state
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [selectedApp, setSelectedApp] = useState<App | null>(null);

  /* -------------------------- navigation handler -------------------------- */
  const handleAppNavigation = useCallback(async (url: string) => {
    console.log('🔗 [RecommendedApps] Navigation requested:', url);
    console.log('🔗 [RecommendedApps] isUHRPUrl check:', uhrpHandler.isUHRPUrl(url));
    
    // Check if this is a UHRP URL
    if (uhrpHandler.isUHRPUrl(url)) {
      console.log('🔗 [RecommendedApps] UHRP URL detected, resolving directly:', url);
      try {
        // Resolve UHRP URL directly and navigate to resolved content
        console.log('🔗 [RecommendedApps] About to call uhrpHandler.resolveUHRPUrl...');
        const resolvedContent = await uhrpHandler.resolveUHRPUrl(url);
        console.log('🔗 [RecommendedApps] resolveUHRPUrl returned:', {
          resolvedUrl: resolvedContent.resolvedUrl,
          shouldUseDataUrl: resolvedContent.shouldUseDataUrl,
          hasDataUrl: !!resolvedContent.dataUrl,
          mimeType: resolvedContent.mimeType
        });
        
        if (resolvedContent.shouldUseDataUrl && resolvedContent.dataUrl) {
          // Use data URL to bypass octet-stream content-type
          console.log('🔗 [RecommendedApps] Using data URL to bypass octet-stream');
          setStartingUrl(resolvedContent.dataUrl);
        } else if (resolvedContent.resolvedUrl) {
          // Navigate to the resolved URL, but keep the original UHRP URL in the address bar
          console.log('🔗 [RecommendedApps] Using HTTP URL:', resolvedContent.resolvedUrl);
          setStartingUrl(resolvedContent.resolvedUrl);
        }
      } catch (error) {
        console.error('🔗 [RecommendedApps] UHRP resolution failed:', error);
        // Fallback: show error by navigating to a data URL with error content
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>UHRP Error</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                  text-align: center; 
                  padding: 50px 20px; 
                  background: #f5f5f5;
                  color: #333;
                }
                .container { 
                  max-width: 400px; 
                  margin: 0 auto; 
                  background: white; 
                  padding: 30px; 
                  border-radius: 10px; 
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                h2 { color: #e74c3c; margin-bottom: 20px; }
                .url { background: #f8f9fa; padding: 10px; border-radius: 5px; word-break: break-all; margin: 20px 0; }
                button { 
                  background: #007AFF; 
                  color: white; 
                  border: none; 
                  padding: 12px 24px; 
                  border-radius: 6px; 
                  font-size: 16px; 
                  cursor: pointer;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h2>Failed to load UHRP content</h2>
                <div class="url">${url}</div>
                <p>Error: ${(error as any)?.message || 'Unknown error occurred while resolving UHRP URL'}</p>
                <button onclick="window.location.href='about:blank'">Go to Homepage</button>
              </div>
            </body>
          </html>
        `;
        setStartingUrl(`data:text/html,${encodeURIComponent(errorHtml)}`);
      }
    } else {
      // Normal HTTP/HTTPS URL, use regular navigation
      console.log('🔗 [RecommendedApps] Regular URL, using setStartingUrl:', url);
      setStartingUrl(url);
    }
  }, [setStartingUrl]);

  /* -------------------------- helper functions -------------------------- */
  const isBookmark = useCallback((app: App) => {
    // Check if it's in the actual bookmarks list
    return includeBookmarks.some(bookmark => bookmark.url === app.domain);
  }, [includeBookmarks]);

  const isDefaultApp = useCallback((app: App) => {
    // Check if it's one of the default apps
    return defaultApps.some(defaultApp => defaultApp.domain === app.domain);
  }, []);

  const handleLongPress = useCallback((app: App) => {
    // Allow removal of bookmarks OR default apps
    if ((isBookmark(app) || isDefaultApp(app)) && (onRemoveBookmark || onRemoveDefaultApp)) {
      setSelectedApp(app);
      setContextMenuVisible(true);
    }
  }, [isBookmark, isDefaultApp, onRemoveBookmark, onRemoveDefaultApp]);

  const handleDeleteBookmark = useCallback(() => {
    if (selectedApp) {
      if (isBookmark(selectedApp) && onRemoveBookmark) {
        onRemoveBookmark(selectedApp.domain);
      } else if (isDefaultApp(selectedApp) && onRemoveDefaultApp) {
        onRemoveDefaultApp(selectedApp.domain);
      }
    }
    setContextMenuVisible(false);
    setSelectedApp(null);
  }, [selectedApp, isBookmark, isDefaultApp, onRemoveBookmark, onRemoveDefaultApp]);

  const closeContextMenu = useCallback(() => {
    setContextMenuVisible(false);
    setSelectedApp(null);
  }, []);

  /* -------------------------- prepare separate data sources -------------------------- */
  const filteredDefaultApps = useMemo(() => {
    if (showOnlyBookmarks) return [];
    // Use homepage settings to determine if recommended apps should be shown
    if (homepageSettings && !homepageSettings.showRecommendedApps) return [];
    // In web2 mode, don't show any default web3 apps
    if (isWeb2Mode) return [];
    return defaultApps.filter(app => !removedDefaultApps.includes(app.domain));
  }, [removedDefaultApps, showOnlyBookmarks, homepageSettings, isWeb2Mode]);

  const processedRecentApps = useMemo(() => {
    if (showOnlyBookmarks) return [];
    // Use homepage settings to determine if recent apps should be shown
    if (homepageSettings && !homepageSettings.showRecentApps) return [];
    // In web2 mode, don't show recent web3 apps
    if (isWeb2Mode) return [];
    return recentApps.map(a => ({ ...a, appIconImageUrl: a.appIconImageUrl }));
  }, [recentApps, showOnlyBookmarks, homepageSettings, isWeb2Mode]);

  const processedBookmarks = useMemo(() => {
    const bookmarks = includeBookmarks.map(bm => ({
      domain: bm.url,
      appName: bm.title || bm.url,
      appIconImageUrl: `${bm.url.replace(/\/$/, '')}/favicon.ico`,
    }));
    
    // If we're not showing only bookmarks and we have a limit, slice the array
    if (!showOnlyBookmarks && limitBookmarks) {
      return bookmarks.slice(0, limitBookmarks);
    }
    
    return bookmarks;
  }, [includeBookmarks, showOnlyBookmarks, limitBookmarks]);

  // Combined for search functionality
  const allApps = useMemo(() => {
    const sources = [...filteredDefaultApps, ...processedRecentApps, ...processedBookmarks];
    return sources.reduce<App[]>((acc, cur) => {
      if (!acc.find(a => a.domain === cur.domain)) acc.push(cur);
      return acc;
    }, []);
  }, [filteredDefaultApps, processedRecentApps, processedBookmarks]);

  /* ---------------------------- fuzzy searching ---------------------------- */
  const fuse = useMemo(() => {
    return new Fuse(allApps, {
      keys: ['appName', 'domain'],
      threshold: 0.4,
      includeScore: true,
    });
  }, [allApps]);

  const visibleApps = useMemo(() => {
    if (!searchQuery.trim()) return null; // Return null when not searching
    return fuse.search(searchQuery).map(r => r.item);
  }, [allApps, fuse, searchQuery]);

  const searchResults = visibleApps;

  /* ------------------------------- render functions ---------------------------------- */
  const renderAppItem = ({ item }: { item: App }) => (
    <TouchableOpacity
      style={componentStyles.appItem}
      onPress={() => handleAppNavigation(item.domain)}
      onLongPress={() => handleLongPress(item)}
      delayLongPress={800}
    >
      {item.appIconImageUrl ? (
        <Image
          source={{ uri: item.appIconImageUrl }}
          style={componentStyles.appIcon}
          defaultSource={{ uri: item.domain + '/favicon.ico' }}
        />
      ) : (
        <View
          style={[
            componentStyles.placeholderIcon,
            { backgroundColor: colors.primary },
          ]}
        >
          <Text style={{ color: colors.background, fontSize: 16 }}>
            {item.appName.charAt(0)}
          </Text>
        </View>
      )}
      <Text style={[componentStyles.appTitle, { color: colors.textPrimary }]}>
        {item.appName}
      </Text>
    </TouchableOpacity>
  );

  const renderSection = (title: string, data: App[], key: string) => {
    if (data.length === 0) return null;
    
    return (
      <View key={key} style={componentStyles.section}>
        <Text style={[componentStyles.sectionTitle, { color: colors.textPrimary }]}>
          {title}
        </Text>
        <FlatList
          data={data}
          renderItem={renderAppItem}
          keyExtractor={item => `${key}-${item.domain}`}
          numColumns={3}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        />
      </View>
    );
  };

  return (
    <View style={[componentStyles.container, { backgroundColor: colors.paperBackground }]}>
      {showOnlyBookmarks && (
        <View style={componentStyles.searchContainer}>
          <TextInput
            style={[
              componentStyles.searchInput,
              {
                color: colors.textPrimary,
                backgroundColor: colors.inputBackground || colors.background,
                borderColor: colors.inputBorder,
              },
            ]}
            placeholder={t('search_bookmarks')}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {searchResults ? (
          // Show search results
          <View style={componentStyles.section}>
            <Text style={[componentStyles.sectionTitle, { color: colors.textPrimary }]}>
              {t('search_results')} ({searchResults.length})
            </Text>
            <FlatList
              data={searchResults}
              renderItem={renderAppItem}
              keyExtractor={item => `search-${item.domain}`}
              numColumns={3}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
            />
          </View>
        ) : (
          // Show separated sections
          <>
            {showOnlyBookmarks ? (
              // Only show bookmarks without section title (tab already shows "Bookmarks")
              <View style={componentStyles.section}>
                <FlatList
                  data={processedBookmarks}
                  renderItem={renderAppItem}
                  keyExtractor={item => `bookmarks-${item.domain}`}
                  numColumns={3}
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={false}
                />
              </View>
            ) : (
              // Show all sections based on homepage settings
              <>
                {(homepageSettings?.showBookmarks !== false) && renderSection(
                  limitBookmarks ? t('recent_bookmarks') : t('bookmarks'), 
                  processedBookmarks, 
                  'bookmarks'
                )}
                {(homepageSettings?.showRecentApps !== false) && renderSection(t('recent'), processedRecentApps, 'recent')}
                {(homepageSettings?.showRecommendedApps !== false) && renderSection(t('recommended'), filteredDefaultApps, 'default')}
                
                {/* Web2 mode message */}
                {/* {isWeb2Mode && (
                  <View style={[componentStyles.section, { paddingVertical: 20 }]}>
                    <View style={[componentStyles.web2Message, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                      <Ionicons name="rocket-outline" size={24} color={colors.primary} style={{ marginBottom: 8 }} />
                      <Text style={[componentStyles.web2MessageTitle, { color: colors.textPrimary }]}>
                        {t('unlock_web3_features')}
                      </Text>
                      <Text style={[componentStyles.web2MessageText, { color: colors.textSecondary }]}>
                        {t('get_web3_identity_to_access_apps')}
                      </Text>
                    </View>
                  </View>
                )} */}
              </>
            )}
          </>
        )}

        {/* Customize Homepage Button at the bottom */}
        {!showOnlyBookmarks && onUpdateHomepageSettings && (
          <View style={componentStyles.customizeSection}>
            <TouchableOpacity 
              onPress={() => setShowCustomizeModal(true)}
              style={[componentStyles.customizeButtonBottom, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
            >
              <Ionicons name="options-outline" size={20} color={colors.textSecondary} />
              <Text style={[componentStyles.customizeButtonText, { color: colors.textSecondary }]}>
                {t('customize_homepage')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Customize Homepage Modal */}
      {showCustomizeModal && homepageSettings && onUpdateHomepageSettings && (
        <Modal
          transparent
          visible={showCustomizeModal}
          onRequestClose={() => setShowCustomizeModal(false)}
          animationType="fade"
        >
          <Pressable 
            style={componentStyles.contextMenuBackdrop}
            onPress={() => setShowCustomizeModal(false)}
          >
            <View style={[componentStyles.customizeModal, { backgroundColor: colors.background }]}>
              <View style={[componentStyles.contextMenuHeader, { borderBottomColor: colors.inputBorder }]}>
                <Text style={[componentStyles.contextMenuTitle, { color: colors.textPrimary }]}>
                  {t('customize_homepage')}
                </Text>
                <Text style={[componentStyles.contextMenuUrl, { color: colors.textSecondary }]}>
                  {t('customize_homepage_description')}
                </Text>
              </View>
              
              <View style={componentStyles.customizeOptions}>
                <TouchableOpacity 
                  style={componentStyles.customizeOption}
                  onPress={() => onUpdateHomepageSettings({ showBookmarks: !homepageSettings.showBookmarks })}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name={homepageSettings.showBookmarks ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={homepageSettings.showBookmarks ? colors.primary : colors.textSecondary} 
                  />
                  <Text style={[componentStyles.customizeOptionText, { color: colors.textPrimary }]}>
                    {t('recent_bookmarks')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={componentStyles.customizeOption}
                  onPress={() => onUpdateHomepageSettings({ showRecentApps: !homepageSettings.showRecentApps })}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name={homepageSettings.showRecentApps ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={homepageSettings.showRecentApps ? colors.primary : colors.textSecondary} 
                  />
                  <Text style={[componentStyles.customizeOptionText, { color: colors.textPrimary }]}>
                    {t('recent')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={componentStyles.customizeOption}
                  onPress={() => onUpdateHomepageSettings({ showRecommendedApps: !homepageSettings.showRecommendedApps })}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name={homepageSettings.showRecommendedApps ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={homepageSettings.showRecommendedApps ? colors.primary : colors.textSecondary} 
                  />
                  <Text style={[componentStyles.customizeOptionText, { color: colors.textPrimary }]}>
                    {t('recommended')}
                  </Text>
                </TouchableOpacity>
              </View>
              
              <View style={componentStyles.customizeActions}>
                <TouchableOpacity 
                  style={[componentStyles.customizeActionButton, { backgroundColor: colors.inputBackground }]}
                  onPress={() => {
                    if (onUpdateHomepageSettings) {
                      onUpdateHomepageSettings({
                        showBookmarks: true,
                        showRecentApps: true,
                        showRecommendedApps: true,
                      });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
                  <Text style={[componentStyles.customizeActionText, { color: colors.textSecondary }]}>
                    {t('reset')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[componentStyles.customizeActionButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShowCustomizeModal(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="checkmark-outline" size={18} color={colors.background} />
                  <Text style={[componentStyles.customizeActionText, { color: colors.background }]}>
                    {t('done')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Context Menu Modal */}
      {selectedApp && (
        <Modal
          transparent
          visible={contextMenuVisible}
          onRequestClose={closeContextMenu}
          animationType="fade"
        >
          <Pressable 
            style={componentStyles.contextMenuBackdrop}
            onPress={closeContextMenu}
          >
            <View style={[componentStyles.contextMenu, { backgroundColor: colors.background }]}>
              <View style={[componentStyles.contextMenuHeader, { borderBottomColor: colors.inputBorder }]}>
                <Text style={[componentStyles.contextMenuTitle, { color: colors.textPrimary }]}>
                  {selectedApp.appName}
                </Text>
                <Text style={[componentStyles.contextMenuUrl, { color: colors.textSecondary }]}>
                  {selectedApp.domain}
                </Text>
              </View>
              
              <TouchableOpacity 
                style={[componentStyles.contextMenuItem, { borderBottomColor: colors.inputBorder }]}
                onPress={handleDeleteBookmark}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={22} color="#FF3B30" style={componentStyles.contextMenuIcon} />
                <Text style={[componentStyles.contextMenuText, { color: '#FF3B30' }]}>
                  {selectedApp && isBookmark(selectedApp) ? t('delete_bookmark') : t('hide_app')}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[componentStyles.contextMenuItem, { borderBottomWidth: 0 }]}
                onPress={closeContextMenu}
                activeOpacity={0.7}
              >
                <Ionicons name="close-outline" size={22} color={colors.textSecondary} style={componentStyles.contextMenuIcon} />
                <Text style={[componentStyles.contextMenuText, { color: colors.textSecondary }]}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/*                                    CSS                                     */
/* -------------------------------------------------------------------------- */

const componentStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 8,
    borderRadius: 12,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  customizeButton: {
    padding: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  searchContainer: { marginBottom: 16 },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  appItem: {
    alignItems: 'center',
    marginBottom: 16,
    width: '30%',
    marginHorizontal: '1.5%',
  },
  appIcon: {
    width: 50,
    height: 50,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  placeholderIcon: {
    width: 50,
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  appTitle: {
    fontSize: 12,
    textAlign: 'center',
    flexWrap: 'wrap',
    lineHeight: 16,
  },
  // Context Menu Styles
  contextMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    borderRadius: 12,
    minWidth: 250,
    maxWidth: 300,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  contextMenuHeader: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contextMenuTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  contextMenuUrl: {
    fontSize: 12,
    opacity: 0.7,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contextMenuIcon: {
    marginRight: 12,
  },
  contextMenuText: {
    fontSize: 16,
    flex: 1,
  },
  // Customize Modal Styles
  customizeModal: {
    borderRadius: 12,
    minWidth: 300,
    maxWidth: 350,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  customizeOptions: {
    paddingVertical: 8,
  },
  customizeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  customizeOptionText: {
    fontSize: 16,
    marginLeft: 12,
    flex: 1,
  },
  customizeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  customizeActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  customizeActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  customizeSection: {
    marginTop: 32,
    marginBottom: 16,
  },
  customizeButtonBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  customizeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  bookmarkLimitControls: {
    flexDirection: 'row',
    gap: 8,
  },
  limitButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
