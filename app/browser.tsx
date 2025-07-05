/* eslint-disable react/no-unstable-nested-components */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo
} from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  LayoutAnimation,
  ScrollView,
  Alert
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaView,
  useSafeAreaInsets
} from 'react-native-safe-area-context';
import {
  WebView,
  WebViewMessageEvent,
  WebViewNavigation
} from 'react-native-webview';
import Modal from 'react-native-modal';
import {
  GestureHandlerRootView,
  Swipeable,
  PanGestureHandler,
  State as GestureState
} from 'react-native-gesture-handler';
import { TabView, SceneMap } from 'react-native-tab-view';
import Fuse from 'fuse.js';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { observer } from 'mobx-react-lite';

import { useTheme } from '@/context/theme/ThemeContext';
import { useWallet } from '@/context/WalletContext';
import { WalletInterface } from '@bsv/sdk';
import { RecommendedApps } from '@/components/RecommendedApps';
import { useLocalStorage } from '@/context/LocalStorageProvider';
import Balance from '@/components/Balance';
import type { Bookmark, HistoryEntry, Tab } from '@/shared/types/browser';
import { HistoryList } from '@/components/HistoryList';
import { isValidUrl } from '@/utils/generalHelpers';
import tabStore from '../stores/TabStore';
import bookmarkStore from '@/stores/BookmarkStore';
import SettingsScreen from './settings';
import IdentityScreen from './identity';
import SecurityScreen from './security';
import TrustScreen from './trust';

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                   */
/* -------------------------------------------------------------------------- */

import NotificationPermissionModal from '@/components/NotificationPermissionModal';
import NotificationSettingsModal from '@/components/NotificationSettingsModal';
import { usePushNotifications } from '@/hooks/usePushNotifications';

import { getPendingUrl, clearPendingUrl } from '@/hooks/useDeepLinking';
import { useWebAppManifest } from '@/hooks/useWebAppManifest';
import * as Notifications from 'expo-notifications';
import UniversalScanner, { ScannerHandle } from '@/components/UniversalScanner';

/* -------------------------------------------------------------------------- */
/*                                   CONSTS                                   */
/* -------------------------------------------------------------------------- */

const kNEW_TAB_URL = 'about:blank';
const kGOOGLE_PREFIX = 'https://www.google.com/search?q=';
const HISTORY_KEY = 'history';

function getInjectableJSMessage(message: any = {}) {
  const messageString = JSON.stringify(message);
  return `
    (function() {
      window.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify(${messageString})
      }));
    })();
  `;
}

/* -------------------------------------------------------------------------- */
/*                                 COMPONENTS                                 */
/* -------------------------------------------------------------------------- */
function StarDrawer({
  BookmarksScene,
  HistoryScene,
  colors,
  styles,
  index,
  setIndex
}: {
  BookmarksScene: React.ComponentType;
  HistoryScene: React.ComponentType;
  colors: any;
  styles: any;
  index: number;
  setIndex: (index: number) => void;
}) {
  const routes = useMemo(
    () => [
      { key: 'bookmarks', title: 'Bookmarks' },
      { key: 'history', title: 'History' }
    ],
    []
  );
  const renderScene = useMemo(
    () =>
      SceneMap({
        bookmarks: BookmarksScene,
        history: HistoryScene
      }),
    [BookmarksScene, HistoryScene]
  );
  return (
    <View style={{ flex: 1 }}>
      <TabView
        navigationState={{ index, routes }}
        onIndexChange={setIndex}
        renderScene={renderScene}
        lazy={false}
        renderTabBar={props => (
          <View style={styles.starTabBar}>
            {props.navigationState.routes.map((r, i) => (
              <TouchableOpacity
                key={r.key}
                style={[
                  styles.starTab,
                  i === index && { borderBottomColor: colors.primary }
                ]}
                onPress={() => setIndex(i)}
              >
                <Text
                  style={[
                    styles.starTabLabel,
                    {
                      color: i === index ? colors.primary : colors.textSecondary
                    }
                  ]}
                >
                  {r.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  BROWSER                                   */
/* -------------------------------------------------------------------------- */

function Browser() {
  /* --------------------------- theme / basic hooks -------------------------- */
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  /* ----------------------------- wallet context ----------------------------- */
  const { managers } = useWallet();
  const [wallet, setWallet] = useState<WalletInterface | undefined>();
  useEffect(() => {
    if (managers?.walletManager?.authenticated)
      setWallet(managers.walletManager);
  }, [managers]);

  /* ---------------------------- storage helpers ----------------------------- */
  const { getItem, setItem } = useLocalStorage();

  /* -------------------------------- history -------------------------------- */
  const loadHistory = useCallback(async (): Promise<HistoryEntry[]> => {
    const raw = await getItem(HISTORY_KEY);
    const data = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return data.map(h => ({
      ...h,
      url: isValidUrl(h.url) ? h.url : kNEW_TAB_URL
    }));
  }, [getItem]);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    loadHistory().then(setHistory);
  }, [loadHistory]);

  const saveHistory = useCallback(
    async (list: HistoryEntry[]) => {
      setHistory(list);
      await setItem(HISTORY_KEY, JSON.stringify(list));
    },
    [setItem]
  );

  const pushHistory = useCallback(
    async (entry: HistoryEntry) => {
      if (
        history.length &&
        history[0].url.replace(/\/$/, '') === entry.url.replace(/\/$/, '')
      )
        return;
      const next = [entry, ...history].slice(0, 500);
      await saveHistory(next);
    },
    [history, saveHistory]
  );

  const removeHistoryItem = useCallback(
    async (url: string) => {
      const next = history.filter(h => h.url !== url);
      await saveHistory(next);
    },
    [history, saveHistory]
  );

  const clearHistory = useCallback(async () => {
    await saveHistory([]);
  }, [saveHistory]);

  /* -------------------------------- bookmarks ------------------------------- */
  const addBookmark = useCallback((title: string, url: string) => {
    // Only add bookmarks for valid URLs that aren't the new tab page
    if (
      url &&
      url !== kNEW_TAB_URL &&
      isValidUrl(url) &&
      !url.includes('about:blank')
    ) {
      bookmarkStore.addBookmark(title, url);
    }
  }, []);

  const removeBookmark = useCallback((url: string) => {
    bookmarkStore.removeBookmark(url);
  }, []);

  /* ---------------------------------- tabs --------------------------------- */
  const activeTab = tabStore.activeTab!;

  /* -------------------------- ui / animation state -------------------------- */
  const addressEditing = useRef(false);
  const [addressText, setAddressText] = useState(kNEW_TAB_URL);
  const [addressFocused, setAddressFocused] = useState(false);
  const [addressBarHeight, setAddressBarHeight] = useState(0);

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [infoDrawerRoute, setInfoDrawerRoute] = useState<
    'root' | 'identity' | 'settings' | 'security' | 'trust' | 'notifications'
  >('root');
  const drawerAnim = useRef(new Animated.Value(0)).current;

  const [showTabsView, setShowTabsView] = useState(false);
  const [showStarDrawer, setShowStarDrawer] = useState(false);
  const [starTabIndex, setStarTabIndex] = useState(0);
  const starDrawerAnim = useRef(new Animated.Value(0)).current;

  const addressInputRef = useRef<TextInput>(null);
  const [consoleLogs, setConsoleLogs] = useState<any[]>([]);
  const { manifest, fetchManifest, getStartUrl, shouldRedirectToStartUrl } =
    useWebAppManifest();
  const [showBalance, setShowBalance] = useState(false);

  // Balance handling - only delay on first open
  useEffect(() => {
    if (showInfoDrawer && infoDrawerRoute === 'root') {
      const t = setTimeout(() => setShowBalance(true), 260); // shorter delay
      return () => clearTimeout(t);
    } else {
      setShowBalance(false);
    }
  }, [showInfoDrawer, infoDrawerRoute]);

  /* ------------------------- push notifications ----------------------------- */
  const {
    requestNotificationPermission,
    createPushSubscription,
    unsubscribe,
    getPermission,
    getSubscription
  } = usePushNotifications();

  const [showNotificationPermissionModal, setShowNotificationPermissionModal] =
    useState(false);
  const [showNotificationSettingsModal, setShowNotificationSettingsModal] =
    useState(false);
  const [notificationRequestOrigin, setNotificationRequestOrigin] =
    useState('');
  const [notificationRequestResolver, setNotificationRequestResolver] =
    useState<((granted: boolean) => void) | null>(null);

  /* ------------------------------ keyboard hook ----------------------------- */
  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, event => {
      setKeyboardVisible(true);
      const height = event.endCoordinates.height;
      setKeyboardHeight(height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      if (addressInputRef.current) {
      }
      addressInputRef.current?.blur();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Deep linking useEffect
  useEffect(() => {
    const checkPendingUrl = async () => {
      try {
        const pendingUrl = await getPendingUrl();
        if (pendingUrl) {
          console.log('Loading pending URL from deep link:', pendingUrl);
          updateActiveTab({ url: pendingUrl });
          setAddressText(pendingUrl);
          await clearPendingUrl();
        }
      } catch (error) {
        console.error('Error checking pending URL:', error);
      }
    };

    checkPendingUrl();
    const timer = setTimeout(checkPendingUrl, 500);
    return () => clearTimeout(timer);
  }, []);

  // Manifest checking useEffect
  useEffect(() => {
    let isCancelled = false;

    const handleManifest = async () => {
      if (
        activeTab.url === kNEW_TAB_URL ||
        !activeTab.url.startsWith('http') ||
        activeTab.isLoading
      ) {
        return;
      }

      if (isCancelled) return;

      // console.log('Checking manifest for:', activeTab.url);

      try {
        const manifestData = await fetchManifest(activeTab.url);

        if (isCancelled) return;

        if (manifestData) {
          // console.log('Found manifest for', activeTab.url, manifestData);

          if (manifestData.babbage?.protocolPermissions) {
            // console.log('Found Babbage protocol permissions:', manifestData.babbage.protocolPermissions);
          }

          const url = new URL(activeTab.url);
          if (
            shouldRedirectToStartUrl(manifestData, activeTab.url) &&
            url.pathname === '/'
          ) {
            const startUrl = getStartUrl(manifestData, activeTab.url);
            // console.log('Redirecting to start_url:', startUrl);
            updateActiveTab({ url: startUrl });
            setAddressText(startUrl);
          }
        }
      } catch (error) {
        console.error('Error in manifest handling:', error);
      }
    };

    const timeoutId = setTimeout(() => {
      if (
        !activeTab.isLoading &&
        activeTab.url !== kNEW_TAB_URL &&
        activeTab.url.startsWith('http')
      ) {
        handleManifest();
      }
    }, 1000);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activeTab.url, activeTab.isLoading]);

  /* -------------------------------------------------------------------------- */
  /*                                 UTILITIES                                  */
  /* -------------------------------------------------------------------------- */
  const domainForUrl = useCallback((u: string): string => {
    try {
      if (u === kNEW_TAB_URL) return '';
      const { hostname } = new URL(u);
      return hostname;
    } catch {
      return u;
    }
  }, []);
  /* -------------------------------------------------------------------------- */
  /*                              ADDRESS HANDLING                              */
  /* -------------------------------------------------------------------------- */

  const updateActiveTab = useCallback((patch: Partial<Tab>) => {
    const newUrl = patch.url;
    if (newUrl && !isValidUrl(newUrl) && newUrl !== kNEW_TAB_URL) {
      patch.url = kNEW_TAB_URL;
    }
    tabStore.updateTab(tabStore.activeTabId, patch);
  }, []);

  const onAddressSubmit = useCallback(() => {
    let entry = addressText.trim();
    const isProbablyUrl =
      /^([a-z]+:\/\/|www\.|([A-Za-z0-9\-]+\.)+[A-Za-z]{2,})(\/|$)/i.test(entry);

    if (entry === '') entry = kNEW_TAB_URL;
    else if (!isProbablyUrl) entry = kGOOGLE_PREFIX + encodeURIComponent(entry);
    else if (!/^[a-z]+:\/\//i.test(entry)) entry = 'https://' + entry;

    if (!isValidUrl(entry)) {
      entry = kNEW_TAB_URL;
    }

    updateActiveTab({ url: entry });
    addressEditing.current = false;
  }, [addressText, updateActiveTab]);

  /* -------------------------------------------------------------------------- */
  /*                               TAB NAVIGATION                               */
  /* -------------------------------------------------------------------------- */
  const navBack = useCallback(() => {
    if (activeTab.canGoBack) {
      tabStore.goBack(activeTab.id);
    }
  }, [activeTab.canGoBack, activeTab.id]);

  const navFwd = useCallback(() => {
    if (activeTab.canGoForward) {
      tabStore.goForward(activeTab.id);
    }
  }, [activeTab.canGoForward, activeTab.id]);

  const navReloadOrStop = useCallback(
    () =>
      activeTab.isLoading
        ? activeTab.webviewRef.current?.stopLoading()
        : activeTab.webviewRef.current?.reload(),
    [activeTab.isLoading, activeTab.webviewRef]
  );

  function closeTab(id: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    tabStore.closeTab(id);
  }

  useEffect(() => {
    if (tabStore.tabs.length === 0) {
      tabStore.newTab();
    }
  }, []);
  useEffect(() => {
    if (activeTab && !addressEditing.current) {
      setAddressText(activeTab.url);
    }
  }, [activeTab.id, activeTab.url]);

  const dismissKeyboard = useCallback(() => {
    addressInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const responderProps =
    addressFocused && keyboardVisible
      ? {
          onStartShouldSetResponder: () => true,
          onResponderRelease: dismissKeyboard
        }
      : {};

  /* -------------------------------------------------------------------------- */
  /*                           NOTIFICATION HANDLERS                            */
  /* -------------------------------------------------------------------------- */

  const handleNotificationPermissionRequest = async (
    origin: string
  ): Promise<'granted' | 'denied' | 'default'> => {
    return new Promise(resolve => {
      setNotificationRequestOrigin(origin);
      setNotificationRequestResolver(() => (granted: boolean) => {
        resolve(granted ? 'granted' : 'denied');
      });
      setShowNotificationPermissionModal(true);
    });
  };

  const handleNotificationPermissionResponse = (granted: boolean) => {
    if (notificationRequestResolver) {
      notificationRequestResolver(granted);
      setNotificationRequestResolver(null);
    }
    setShowNotificationPermissionModal(false);
    setNotificationRequestOrigin('');
  };

  /* -------------------------------------------------------------------------- */
  /*                           WEBVIEW MESSAGE HANDLER                          */
  /* -------------------------------------------------------------------------- */

  // === 1. Injected JS ============================================
  const injectedJavaScript = `
  // Push Notification API polyfill
  (function() {
    // Check if Notification API already exists
    if ('Notification' in window) {
      return;
    }

    // Polyfill Notification constructor
    window.Notification = function(title, options = {}) {
      this.title = title;
      this.body = options.body || '';
      this.icon = options.icon || '';
      this.tag = options.tag || '';
      this.data = options.data || null;
      
      // Send notification to native
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'SHOW_NOTIFICATION',
        title: this.title,
        body: this.body,
        icon: this.icon,
        tag: this.tag,
        data: this.data
      }));
      
      return this;
    };

    // Static methods
    window.Notification.requestPermission = function(callback) {
      return new Promise((resolve) => {
        window.ReactNativeWebView?.postMessage(JSON.stringify({
          type: 'REQUEST_NOTIFICATION_PERMISSION',
          callback: true
        }));
        
        // Listen for response
        const handler = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'NOTIFICATION_PERMISSION_RESPONSE') {
              window.removeEventListener('message', handler);
              const permission = data.permission;
              if (callback) callback(permission);
              resolve(permission);
            }
          } catch (e) {}
        };
        window.addEventListener('message', handler);
      });
    };

    window.Notification.permission = 'default';

    // ServiceWorker registration polyfill for push
    if (!('serviceWorker' in navigator)) {
      navigator.serviceWorker = {
        register: function() {
          return Promise.resolve({
            pushManager: {
              subscribe: function(options) {
                return new Promise((resolve) => {
                  window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'PUSH_SUBSCRIBE',
                    options: options
                  }));
                  
                  const handler = (event) => {
                    try {
                      const data = JSON.parse(event.data);
                      if (data.type === 'PUSH_SUBSCRIPTION_RESPONSE') {
                        window.removeEventListener('message', handler);
                        resolve(data.subscription);
                      }
                    } catch (e) {}
                  };
                  window.addEventListener('message', handler);
                });
              },
              getSubscription: function() {
                return new Promise((resolve) => {
                  window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'GET_PUSH_SUBSCRIPTION'
                  }));
                  
                  const handler = (event) => {
                    try {
                      const data = JSON.parse(event.data);
                      if (data.type === 'PUSH_SUBSCRIPTION_RESPONSE') {
                        window.removeEventListener('message', handler);
                        resolve(data.subscription);
                      }
                    } catch (e) {}
                  };
                  window.addEventListener('message', handler);
                });
              }
            }
          });
        }
      };
    }

    // Console logging
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;
    const originalDebug = console.debug;

    console.log = function(...args) {
      originalLog.apply(console, args);
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'CONSOLE',
        method: 'log',
        args: args
      }));
    };

    console.warn = function(...args) {
      originalWarn.apply(console, args);
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'CONSOLE',
        method: 'warn',
        args: args
      }));
    };

    console.error = function(...args) {
      originalError.apply(console, args);
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'CONSOLE',
        method: 'error',
        args: args
      }));
    };

    console.info = function(...args) {
      originalInfo.apply(console, args);
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'CONSOLE',
        method: 'info',
        args: args
      }));
    };

    console.debug = function(...args) {
      originalDebug.apply(console, args);
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'CONSOLE',
        method: 'debug',
        args: args
      }));
    };
  })();
  true;
`;

  // === 2. RN ⇄ WebView message bridge ========================================
  const [showScanner, setShowScanner] = useState(false);
  const [scannedData, setScannedData] = useState<string | null>(null);
  const scannerRef = useRef<ScannerHandle>(null);

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      const sendResponseToWebView = (id: string, result: any) => {
        const message = {
          type: 'CWI',
          id,
          isInvocation: false,
          result,
          status: 'ok'
        };

        activeTab.webviewRef.current?.injectJavaScript(
          getInjectableJSMessage(message)
        );
      };

      let msg;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch (error) {
        console.error('Failed to parse WebView message:', error);
        return;
      }

      // Handle console logs from WebView
      if (msg.type === 'CONSOLE') {
        const logPrefix = '[WebView]';
        switch (msg.method) {
          case 'log':
            console.log(logPrefix, ...msg.args);
            break;
          case 'warn':
            console.warn(logPrefix, ...msg.args);
            break;
          case 'error':
            console.error(logPrefix, ...msg.args);
            break;
          case 'info':
            console.info(logPrefix, ...msg.args);
            break;
          case 'debug':
            console.debug(logPrefix, ...msg.args);
            break;
        }
        return;
      }

      if (msg.type === 'SCAN_REQUEST') {
        console.log(
          '📡 Received scan request from WebView with reason:',
          msg.reason
        );
        setShowScanner(true);
        return;
      }

      // Handle notification permission request
      if (msg.type === 'REQUEST_NOTIFICATION_PERMISSION') {
        const permission = await handleNotificationPermissionRequest(
          activeTab.url
        );

        activeTab.webviewRef.current?.injectJavaScript(`
            window.Notification.permission = '${permission}';
            window.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify({
                type: 'NOTIFICATION_PERMISSION_RESPONSE',
                permission: '${permission}'
              })
            }));
          `);
        return;
      }

      // Handle push subscription for remote notifications
      if (msg.type === 'PUSH_SUBSCRIBE') {
        try {
          const subscription = await createPushSubscription(
            activeTab.url,
            msg.options?.applicationServerKey
          );

          activeTab.webviewRef.current?.injectJavaScript(`
              window.dispatchEvent(new MessageEvent('message', {
                data: JSON.stringify({
                  type: 'PUSH_SUBSCRIPTION_RESPONSE',
                  subscription: ${JSON.stringify(subscription)}
                })
              }));
            `);
        } catch (error) {
          console.error('Error creating push subscription:', error);
          activeTab.webviewRef.current?.injectJavaScript(`
              window.dispatchEvent(new MessageEvent('message', {
                data: JSON.stringify({
                  type: 'PUSH_SUBSCRIPTION_RESPONSE',
                  subscription: null,
                  error: '${error}'
                })
              }));
            `);
        }
        return;
      }

      // Handle get existing push subscription
      if (msg.type === 'GET_PUSH_SUBSCRIPTION') {
        const subscription = getSubscription(activeTab.url);

        activeTab.webviewRef.current?.injectJavaScript(`
            window.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify({
                type: 'PUSH_SUBSCRIPTION_RESPONSE',
                subscription: ${JSON.stringify(subscription)}
              })
            }));
          `);
        return;
      }

      // Handle immediate local notifications
      if (msg.type === 'SHOW_NOTIFICATION') {
        try {
          const permission = getPermission(activeTab.url);
          if (permission === 'granted') {
            // Show notification immediately
            await Notifications.scheduleNotificationAsync({
              content: {
                title: msg.title || 'Website Notification',
                body: msg.body || '',
                data: {
                  origin: activeTab.url,
                  type: 'website',
                  url: activeTab.url,
                  icon: msg.icon,
                  tag: msg.tag,
                  ...msg.data
                },
                sound: true
              },
              trigger: null
            });
          }
        } catch (error) {
          console.error('Error showing notification:', error);
        }
        return;
      }

      // Handleing of wallet before api call.
      if (msg.call && !wallet) {
        // console.log('Wallet not ready, ignoring call:', msg.call);
        return;
      }

      // Handle wallet API calls
      const origin = activeTab.url.replace(/^https?:\/\//, '').split('/')[0];
      let response: any;

      try {
        switch (msg.call) {
          case 'getPublicKey':
          case 'revealCounterpartyKeyLinkage':
          case 'revealSpecificKeyLinkage':
          case 'encrypt':
          case 'decrypt':
          case 'createHmac':
          case 'verifyHmac':
          case 'createSignature':
          case 'verifySignature':
          case 'createAction':
          case 'signAction':
          case 'abortAction':
          case 'listActions':
          case 'internalizeAction':
          case 'listOutputs':
          case 'relinquishOutput':
          case 'acquireCertificate':
          case 'listCertificates':
          case 'proveCertificate':
          case 'relinquishCertificate':
          case 'discoverByIdentityKey':
          case 'isAuthenticated':
          case 'waitForAuthentication':
          case 'getHeight':
          case 'getHeaderForHeight':
          case 'discoverByAttributes':
          case 'getNetwork':
          case 'getVersion':
            response = await (wallet as any)[msg.call](
              typeof msg.args !== 'undefined' ? msg.args : {},
              origin
            );
            break;
          default:
            throw new Error('Unsupported method.');
        }
        sendResponseToWebView(msg.id, response);
      } catch (error) {
        console.error('Error processing wallet API call:', msg.call, error);
      }
    },
    [
      activeTab.url,
      activeTab.webviewRef,
      wallet,
      createPushSubscription,
      getSubscription,
      getPermission,
      handleNotificationPermissionRequest
    ]
  );

  useEffect(() => {
    if (scannedData && activeTab?.webviewRef?.current) {
      activeTab.webviewRef.current.injectJavaScript(`
        window.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'SCAN_RESULT',
            result: ${JSON.stringify(scannedData)}
          })
        }));
        true;
      `);
      setScannedData(null); // Clear after sending
      setShowScanner(false); // Ensure scanner is unmounted
    }
  }, [scannedData, activeTab]);

  /* -------------------------------------------------------------------------- */
  /*                      NAV STATE CHANGE → HISTORY TRACKING                   */
  /* -------------------------------------------------------------------------- */
  const handleNavStateChange = (navState: WebViewNavigation) => {
    // Ignore favicon requests for about:blank
    if (
      navState.url?.includes('favicon.ico') &&
      activeTab.url === kNEW_TAB_URL
    ) {
      return;
    }

    // Make sure we're updating the correct tab's navigation state
    tabStore.handleNavigationStateChange(activeTab.id, navState);

    if (!addressEditing.current) setAddressText(navState.url);

    if (!navState.loading && navState.url !== kNEW_TAB_URL) {
      pushHistory({
        title: navState.title || navState.url,
        url: navState.url,
        timestamp: Date.now()
      }).catch(() => {});
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                          SHARE / HOMESCREEN SHORTCUT                       */
  /* -------------------------------------------------------------------------- */
  const shareCurrent = useCallback(async () => {
    try {
      await Share.share({ message: activeTab.url });
    } catch (err) {
      console.warn('Share cancelled/failed', err);
    }
  }, [activeTab.url]);
  const addToHomeScreen = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
      } else {
        await Linking.openURL('prefs:root=Safari');
      }
    } catch (e) {
      console.warn('Add to homescreen failed', e);
    }
  }, []);

  /* -------------------------------------------------------------------------- */
  /*                           STAR (BOOKMARK+HISTORY)                          */
  /* -------------------------------------------------------------------------- */
  // const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isDrawerAnimating, setIsDrawerAnimating] = useState(false);
  const windowHeight = Dimensions.get('window').height;
  const drawerFullHeight = windowHeight * 0.75;
  const translateY = useRef(new Animated.Value(drawerFullHeight)).current;

  const closeStarDrawer = useCallback(() => {
    const runCloseDrawer = () => {
      Keyboard.dismiss();
      setIsDrawerAnimating(true);

      Animated.spring(translateY, {
        toValue: drawerFullHeight,
        useNativeDriver: true,
        tension: 100,
        friction: 8
      }).start();

      setTimeout(() => {
        setShowStarDrawer(false);
        setIsDrawerAnimating(false);
      }, 300);
    };
    if (isDrawerAnimating) {
      translateY.stopAnimation(() => {
        runCloseDrawer();
      });
      return;
    }
    runCloseDrawer();
  }, [isDrawerAnimating, drawerFullHeight, translateY]);

  const onPanGestureEvent = useRef(
    Animated.event([{ nativeEvent: { translationY: translateY } }], {
      useNativeDriver: true
    })
  ).current;

  const onPanHandlerStateChange = useCallback(
    (event: any) => {
      if (event.nativeEvent.oldState === GestureState.ACTIVE) {
        if (isDrawerAnimating) return;
        setIsDrawerAnimating(true);

        const { translationY, velocityY } = event.nativeEvent;

        const shouldClose =
          translationY > drawerFullHeight / 3 || velocityY > 800;
        const targetValue = shouldClose ? drawerFullHeight : 0;

        Animated.spring(translateY, {
          toValue: targetValue,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
          velocity: velocityY / 500
        }).start();

        if (shouldClose) {
          Keyboard.dismiss();
          setTimeout(() => {
            setShowStarDrawer(false);
            setIsDrawerAnimating(false);
          }, 150);
        } else {
          setIsDrawerAnimating(false);
        }
      }
    },
    [drawerFullHeight, translateY, isDrawerAnimating]
  );

  useEffect(() => {
    if (showStarDrawer) {
      setIsDrawerAnimating(true);
      translateY.setValue(drawerFullHeight);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8
      }).start(() => {
        setIsDrawerAnimating(false);
      });
    }
  }, [showStarDrawer]);

  const toggleStarDrawer = useCallback(
    (open: boolean) => {
      setShowStarDrawer(open);
      Animated.timing(starDrawerAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true
      }).start();
    },
    [starDrawerAnim]
  );

  // State for clear confirm modal (move this above scene components)

  const handleSetStartingUrl = useCallback(
    (url: string) => {
      updateActiveTab({ url });
      toggleStarDrawer(false);
    },
    [updateActiveTab]
  );

  const BookmarksScene = useMemo(() => {
    return () => (
      <RecommendedApps
        includeBookmarks={bookmarkStore.bookmarks.filter(bookmark => {
          // Filter out invalid URLs to prevent favicon errors
          return (
            bookmark.url &&
            bookmark.url !== kNEW_TAB_URL &&
            isValidUrl(bookmark.url) &&
            !bookmark.url.includes('about:blank')
          );
        })}
        setStartingUrl={handleSetStartingUrl}
      />
    );
  }, [bookmarkStore.bookmarks, handleSetStartingUrl]);

  const HistoryScene = React.useCallback(() => {
    return (
      <HistoryList
        history={history}
        onSelect={u => {
          updateActiveTab({ url: u });
          toggleStarDrawer(false);
        }}
        onDelete={removeHistoryItem}
        onClear={() => showClearConfirm()}
      />
    );
  }, [history, updateActiveTab, toggleStarDrawer, removeHistoryItem]);

  /* ---------------------------- clear history modal ------------------------- */
  const showClearConfirm = useCallback(() => {
    Alert.alert('Clear browsing history?', 'This action cannot be undone.', [
      {
        text: 'Cancel',
        style: 'cancel'
      },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => clearHistory()
      }
    ]);
  }, [clearHistory]);

  /* -------------------------------------------------------------------------- */
  /*                         ADDRESS BAR AUTOCOMPLETE                           */
  /* -------------------------------------------------------------------------- */

  const fuseRef = useRef(
    new Fuse<HistoryEntry | Bookmark>([], {
      keys: ['title', 'url'],
      threshold: 0.4
    })
  );
  useEffect(() => {
    fuseRef.current.setCollection([...history, ...bookmarkStore.bookmarks]);
  }, [history, bookmarkStore.bookmarks]);
  const [addressSuggestions, setAddressSuggestions] = useState<
    (HistoryEntry | Bookmark)[]
  >([]);

  const onChangeAddressText = useCallback((txt: string) => {
    setAddressText(txt);
    if (txt.trim().length === 0) {
      setAddressSuggestions([]);
      return;
    }
    const results = fuseRef.current
      .search(txt)
      .slice(0, 10) // Get more results initially
      .map(r => r.item);

    // Remove duplicates based on URL
    const uniqueResults = results
      .filter(
        (item, index, self) => index === self.findIndex(t => t.url === item.url)
      )
      .slice(0, 5); // Then limit to 5 unique results

    setAddressSuggestions(uniqueResults);
  }, []);

  /* -------------------------------------------------------------------------- */
  /*                              INFO DRAWER NAV                               */
  /* -------------------------------------------------------------------------- */
  const toggleInfoDrawer = useCallback(
    (open: boolean, route: typeof infoDrawerRoute = 'root') => {
      setInfoDrawerRoute(route);
      setShowInfoDrawer(open);
    },
    []
  );

  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: showInfoDrawer ? 1 : 0,
      duration: 260,
      useNativeDriver: true
    }).start();
  }, [showInfoDrawer, drawerAnim]);

  const drawerHeight =
    infoDrawerRoute === 'root'
      ? Dimensions.get('window').height * 0.75
      : Dimensions.get('window').height * 0.9;

  /* -------------------------------------------------------------------------- */
  /*                               DRAWER HANDLERS                              */
  /* -------------------------------------------------------------------------- */

  const drawerHandlers = useMemo(
    () => ({
      identity: () => setInfoDrawerRoute('identity'),
      security: () => setInfoDrawerRoute('security'),
      trust: () => setInfoDrawerRoute('trust'),
      settings: () => setInfoDrawerRoute('settings'),
      addBookmark: () => {
        // Only add bookmark if URL is valid and not new tab page
        if (
          activeTab.url &&
          activeTab.url !== kNEW_TAB_URL &&
          isValidUrl(activeTab.url) &&
          !activeTab.url.includes('about:blank')
        ) {
          addBookmark(activeTab.title || 'Untitled', activeTab.url);
          toggleInfoDrawer(false);
        }
      },
      addToHomeScreen: async () => {
        await addToHomeScreen();
        toggleInfoDrawer(false);
      },
      backToHomepage: () => {
        updateActiveTab({ url: kNEW_TAB_URL });
        setAddressText(kNEW_TAB_URL);
        toggleInfoDrawer(false);
      }
    }),
    [
      activeTab.url,
      activeTab.title,
      addBookmark,
      toggleInfoDrawer,
      updateActiveTab,
      setAddressText,
      addToHomeScreen
    ]
  );

  /* -------------------------------------------------------------------------- */
  /*                                  RENDER                                    */
  /* -------------------------------------------------------------------------- */

  const showAddressBar = !keyboardVisible || addressFocused;
  const showBottomBar = !(keyboardVisible && addressFocused);

  const starDrawerAnimatedStyle = useMemo(
    () => [
      styles.starDrawer,
      {
        backgroundColor: colors.background,
        height: drawerFullHeight,
        top: windowHeight - drawerFullHeight,
        transform: [{ translateY }]
      }
    ],
    [
      styles.starDrawer,
      colors.background,
      drawerFullHeight,
      windowHeight,
      translateY
    ]
  );

  const addressDisplay = addressFocused
    ? addressText
    : domainForUrl(addressText);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          addressFocused
            ? Platform.OS === 'ios'
              ? 'padding'
              : 'height'
            : undefined
        }
      >
        <SafeAreaView
          style={[
            styles.container,
            {
              backgroundColor: colors.inputBackground,
              paddingBottom:
                addressFocused && keyboardVisible ? 0 : insets.bottom
            }
          ]}
        >
          <StatusBar style={isDark ? 'light' : 'dark'} />

          {activeTab.url === kNEW_TAB_URL ? (
            <RecommendedApps
              includeBookmarks={bookmarkStore.bookmarks.filter(bookmark => {
                return (
                  bookmark.url &&
                  bookmark.url !== kNEW_TAB_URL &&
                  isValidUrl(bookmark.url) &&
                  !bookmark.url.includes('about:blank')
                );
              })}
              setStartingUrl={url => updateActiveTab({ url })}
            />
          ) : (
            <View style={{ flex: 1 }} {...responderProps}>
              <WebView
                ref={activeTab.webviewRef}
                source={{ uri: activeTab.url }}
                originWhitelist={[
                  'https://*',
                  'http://*',
                  'http://192.168.1.207:8000'
                ]}
                onMessage={handleMessage}
                injectedJavaScript={
                  injectedJavaScript +
                  `
                  window.scanCodeWithCamera = async (reason) => {
                    return new Promise((resolve) => {
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCAN_REQUEST', reason }));
                      const handler = (event) => {
                        try {
                          const data = JSON.parse(event.data);
                          if (data.type === 'SCAN_RESULT') {
                            window.removeEventListener('message', handler);
                            resolve(data.result || '');
                          }
                        } catch (e) {}
                      };
                      window.addEventListener('message', handler);
                    });
                  };
                  true;
                `
                }
                onNavigationStateChange={handleNavStateChange}
                onError={(syntheticEvent: any) => {
                  const { nativeEvent } = syntheticEvent;
                  if (
                    nativeEvent.url?.includes('favicon.ico') &&
                    activeTab.url === kNEW_TAB_URL
                  )
                    return;
                  console.warn('WebView error:', nativeEvent);
                }}
                onHttpError={(syntheticEvent: any) => {
                  const { nativeEvent } = syntheticEvent;
                  if (
                    nativeEvent.url?.includes('favicon.ico') &&
                    activeTab.url === kNEW_TAB_URL
                  )
                    return;
                  console.warn('WebView HTTP error:', nativeEvent);
                }}
                javaScriptEnabled
                domStorageEnabled
                allowsBackForwardNavigationGestures
                containerStyle={{ backgroundColor: colors.background }}
                style={{ flex: 1 }}
              />
              {showScanner && (
                <UniversalScanner
                  ref={scannerRef}
                  scannedData={scannedData}
                  setScannedData={setScannedData}
                  showScanner={showScanner}
                  onDismiss={() => setShowScanner(false)}
                />
              )}
            </View>
          )}
          <View
            onLayout={e => setAddressBarHeight(e.nativeEvent.layout.height)}
            style={[
              styles.addressBar,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.inputBorder,
                paddingTop: addressFocused && keyboardVisible ? 8 : 12,
                paddingBottom: addressFocused && keyboardVisible ? 0 : 12,
                zIndex: 10,
                elevation: 10
              }
            ]}
          >
            {!addressFocused && (
              <TouchableOpacity
                onPress={() => toggleInfoDrawer(true)}
                style={styles.addressBarIcon}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={22}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}

            {!addressFocused &&
              !activeTab.isLoading &&
              activeTab.url.startsWith('https') && (
                <Ionicons
                  name="lock-closed"
                  size={16}
                  color={colors.textSecondary}
                  style={styles.padlock}
                />
              )}

            <TextInput
              ref={addressInputRef}
              editable
              value={addressDisplay === 'new-tab-page' ? '' : addressDisplay}
              onChangeText={onChangeAddressText}
              onFocus={() => {
                addressEditing.current = true;
                setAddressFocused(true);
                // Set the text to empty if it's the new tab URL
                if (activeTab.url === kNEW_TAB_URL) {
                  setAddressText('');
                }
                setTimeout(() => {
                  const textToSelect =
                    activeTab.url === kNEW_TAB_URL ? '' : addressText;
                  addressInputRef.current?.setNativeProps({
                    selection: { start: 0, end: textToSelect.length }
                  });
                }, 0);
              }}
              onBlur={() => {
                addressEditing.current = false;
                setAddressFocused(false);
                setAddressSuggestions([]);
                // Reset to the actual URL when losing focus
                if (!addressEditing.current) {
                  setAddressText(activeTab.url);
                }
              }}
              onSubmitEditing={onAddressSubmit}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              style={[
                styles.addressInput,
                {
                  flex: 1,
                  backgroundColor: colors.background,
                  color: colors.textPrimary,
                  textAlign: addressFocused ? 'left' : 'center'
                }
              ]}
              placeholder="Search or enter site name"
              placeholderTextColor={colors.textSecondary}
            />

            <TouchableOpacity
              onPress={
                addressFocused ? () => setAddressText('') : navReloadOrStop
              }
              style={styles.addressBarIcon}
            >
              <Ionicons
                name={
                  addressFocused || activeTab.isLoading
                    ? 'close-circle'
                    : 'refresh'
                }
                size={22}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
          {addressFocused && addressSuggestions.length > 0 && (
            <View
              style={[
                styles.suggestionBox,
                { backgroundColor: colors.paperBackground }
              ]}
            >
              {addressSuggestions.map(
                (entry: HistoryEntry | Bookmark, i: number) => (
                  <TouchableOpacity
                    key={`suggestion-${i}-${entry.url}`}
                    onPress={() => {
                      // Dismiss keyboard and hide suggestions first
                      addressInputRef.current?.blur();
                      Keyboard.dismiss();
                      setAddressFocused(false);
                      setAddressSuggestions([]);

                      // Then load the page
                      setAddressText(entry.url);
                      updateActiveTab({ url: entry.url });
                      addressEditing.current = false;
                    }}
                    style={styles.suggestionItem}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.suggestionTitle,
                        { color: colors.textPrimary }
                      ]}
                    >
                      {entry.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.suggestionUrl,
                        { color: colors.textSecondary }
                      ]}
                    >
                      {entry.url}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          )}

          {showTabsView && (
            <TabsView
              onDismiss={() => setShowTabsView(false)}
              setAddressText={setAddressText}
              colors={colors}
            />
          )}

          {(showStarDrawer || isDrawerAnimating) && (
            <View style={StyleSheet.absoluteFill}>
              <Pressable style={styles.backdrop} onPress={closeStarDrawer} />
              <Animated.View style={starDrawerAnimatedStyle}>
                <PanGestureHandler
                  onGestureEvent={onPanGestureEvent}
                  onHandlerStateChange={onPanHandlerStateChange}
                  activeOffsetY={10}
                  failOffsetX={[-20, 20]}
                >
                  <Animated.View style={styles.drawerHandleArea}>
                    <View style={styles.handleBar} />
                  </Animated.View>
                </PanGestureHandler>
                <View style={{ flex: 1 }}>
                  <StarDrawer
                    BookmarksScene={BookmarksScene}
                    HistoryScene={HistoryScene}
                    colors={colors}
                    styles={styles}
                    index={starTabIndex}
                    setIndex={setStarTabIndex}
                  />
                </View>
              </Animated.View>
            </View>
          )}
          {showBottomBar && (
            <BottomToolbar
              activeTab={activeTab}
              colors={colors}
              styles={styles}
              navBack={navBack}
              navFwd={navFwd}
              shareCurrent={shareCurrent}
              toggleStarDrawer={toggleStarDrawer}
              setShowTabsView={setShowTabsView}
            />
          )}

          <Modal
            isVisible={showInfoDrawer}
            onBackdropPress={() => toggleInfoDrawer(false)}
            swipeDirection="down"
            onSwipeComplete={() => toggleInfoDrawer(false)}
            style={{ margin: 0, justifyContent: 'flex-end' }}
          >
            <Animated.View
              style={[
                styles.infoDrawer,
                {
                  backgroundColor: colors.background,
                  height: drawerHeight,
                  transform: [
                    {
                      translateY: drawerAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [drawerHeight, 0]
                      })
                    }
                  ]
                }
              ]}
            >
              {infoDrawerRoute === 'root' && (
                <ScrollView
                  contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                >
                  <Pressable
                    style={styles.drawerHandle}
                    onPress={() => toggleInfoDrawer(false)}
                  >
                    <View style={styles.handleBar} />
                  </Pressable>
                  {showBalance && <Balance />}
                  <DrawerItem
                    label="Identity"
                    icon="person-circle-outline"
                    onPress={drawerHandlers.identity}
                  />
                  <DrawerItem
                    label="Security"
                    icon="lock-closed-outline"
                    onPress={drawerHandlers.security}
                  />
                  <DrawerItem
                    label="Trust Network"
                    icon="shield-checkmark-outline"
                    onPress={drawerHandlers.trust}
                  />
                  <DrawerItem
                    label="Settings"
                    icon="settings-outline"
                    onPress={drawerHandlers.settings}
                  />
                  <DrawerItem
                    label="Notifications"
                    icon="notifications-outline"
                    onPress={() => setInfoDrawerRoute('notifications')}
                  />
                  <View style={styles.divider} />
                  <DrawerItem
                    label="Add Bookmark"
                    icon="star-outline"
                    onPress={drawerHandlers.addBookmark}
                  />
                  <DrawerItem
                    label="Add to Device Homescreen"
                    icon="home-outline"
                    onPress={drawerHandlers.addToHomeScreen}
                  />
                  <DrawerItem
                    label="Back to Homepage"
                    icon="apps-outline"
                    onPress={drawerHandlers.backToHomepage}
                  />
                </ScrollView>
              )}

              {infoDrawerRoute !== 'root' && (
                <SubDrawerView
                  route={infoDrawerRoute}
                  onBack={() => setInfoDrawerRoute('root')}
                />
              )}
            </Animated.View>
          </Modal>
          {/* Add these notification modals */}
          <NotificationPermissionModal
            visible={showNotificationPermissionModal}
            origin={notificationRequestOrigin}
            onDismiss={() => setShowNotificationPermissionModal(false)}
            onResponse={handleNotificationPermissionResponse}
          />

          <NotificationSettingsModal
            visible={showNotificationSettingsModal}
            onDismiss={() => setShowNotificationSettingsModal(false)}
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

export default observer(Browser);

/* -------------------------------------------------------------------------- */
/*                               SUB-COMPONENTS                               */
/* -------------------------------------------------------------------------- */

const TabsViewBase = ({
  onDismiss,
  setAddressText,
  colors
}: {
  onDismiss: () => void;
  setAddressText: (text: string) => void;
  colors: any;
}) => {
  // Use the imported tabStore directly
  const screen = Dimensions.get('window');
  const ITEM_W = screen.width * 0.42;
  const ITEM_H = screen.height * 0.28;
  const insets = useSafeAreaInsets();

  // Animation for new tab button
  const newTabScale = useRef(new Animated.Value(1)).current;

  const handleNewTabPress = useCallback(() => {
    // Scale animation
    Animated.sequence([
      Animated.timing(newTabScale, {
        toValue: 0.85,
        duration: 100,
        useNativeDriver: true
      }),
      Animated.timing(newTabScale, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true
      })
    ]).start(() => {
      // Create new tab and dismiss view after animation
      tabStore.newTab();
      // Reset address text to new tab URL
      setAddressText(kNEW_TAB_URL);
      onDismiss();
    });
  }, [newTabScale, onDismiss, setAddressText]);

  const renderItem = ({ item }: { item: Tab }) => {
    const renderRightActions = (
      progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>
    ) => {
      const trans: Animated.AnimatedInterpolation<number> = dragX.interpolate({
        inputRange: [-101, 0],
        outputRange: [0, 1],
        extrapolate: 'clamp'
      });
      return <Animated.View style={[styles.swipeDelete]}></Animated.View>;
    };
    const renderLeftActions = (
      progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>
    ) => {
      const trans: Animated.AnimatedInterpolation<number> = dragX.interpolate({
        inputRange: [0, 101],
        outputRange: [1, 0],
        extrapolate: 'clamp'
      });
      return <Animated.View style={[styles.swipeDelete]}></Animated.View>;
    };

    return (
      <Swipeable
        renderRightActions={renderRightActions}
        renderLeftActions={renderLeftActions}
        onSwipeableRightOpen={() => tabStore.closeTab(item.id)}
        onSwipeableLeftOpen={() => tabStore.closeTab(item.id)}
        friction={2}
        rightThreshold={40}
        leftThreshold={40}
      >
        <Pressable
          style={[
            styles.tabPreview,
            {
              width: ITEM_W,
              height: ITEM_H,
              borderColor:
                item.id === tabStore.activeTabId
                  ? '#007AFF'
                  : colors.inputBorder,
              borderWidth:
                item.id === tabStore.activeTabId ? 3 : StyleSheet.hairlineWidth,
              backgroundColor: colors.background
            }
          ]}
          onPress={() => {
            tabStore.setActiveTab(item.id);
            onDismiss();
          }}
        >
          <TouchableOpacity
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 10
            }}
            onPress={e => {
              e.stopPropagation(); // Prevent tab selection when closing
              tabStore.closeTab(item.id);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>
              ✕
            </Text>
          </TouchableOpacity>

          <View style={{ flex: 1, overflow: 'hidden' }}>
            {item.url === kNEW_TAB_URL ? (
              <View style={styles.tabPreviewEmpty}>
                <Text style={{ fontSize: 16, color: colors.textSecondary }}>
                  New Tab
                </Text>
              </View>
            ) : (
              <WebView
                source={{ uri: item.url }}
                style={{ flex: 1 }}
                scrollEnabled={false}
                pointerEvents="none"
              />
            )}
            <View
              style={[
                styles.tabTitleBar,
                { backgroundColor: colors.paperBackground }
              ]}
            >
              <Text
                numberOfLines={1}
                style={{ flex: 1, color: colors.textPrimary, fontSize: 12 }}
              >
                {item.title}
              </Text>
            </View>
          </View>
        </Pressable>
      </Swipeable>
    );
  };

  return (
    <View style={styles.tabsViewContainer}>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      <FlatList
        data={tabStore.tabs.slice()}
        renderItem={renderItem}
        keyExtractor={t => String(t.id)}
        numColumns={2}
        contentContainerStyle={{
          padding: 12,
          paddingTop: 32, // Add this to move the tabs lower
          paddingBottom: 100 + insets.bottom
        }}
      />

      <View
        style={[styles.tabsViewFooter, { paddingBottom: insets.bottom + 10 }]}
      >
        <Animated.View style={{ transform: [{ scale: newTabScale }] }}>
          <TouchableOpacity
            style={styles.newTabBtn}
            onPress={handleNewTabPress}
            activeOpacity={0.7}
          >
            <Text style={styles.newTabIcon}>＋</Text>
          </TouchableOpacity>
        </Animated.View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.doneButton} onPress={onDismiss}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const TabsView = observer(TabsViewBase);

const DrawerItem = React.memo(
  ({
    label,
    icon,
    onPress
  }: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  }) => {
    const { colors } = useTheme();
    return (
      <TouchableOpacity
        style={styles.drawerItem}
        onPress={onPress}
        activeOpacity={0.6}
        delayPressIn={0}
      >
        <Ionicons
          name={icon}
          size={22}
          color={colors.textSecondary}
          style={styles.drawerIcon}
        />
        <Text style={[styles.drawerLabel, { color: colors.textPrimary }]}>
          {label}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
    );
  }
);

const SubDrawerView = React.memo(
  ({
    route,
    onBack,
    onOpenNotificationSettings
  }: {
    route: 'identity' | 'settings' | 'security' | 'trust' | 'notifications';
    onBack: () => void;
    onOpenNotificationSettings?: () => void;
  }) => {
    const { colors } = useTheme();

    const screens = useMemo(
      () => ({
        identity: <IdentityScreen />,
        settings: <SettingsScreen />,
        security: <SecurityScreen />,
        trust: <TrustScreen />
      }),
      []
    );

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.subDrawerHeader}>
          <TouchableOpacity
            onPress={onBack}
            activeOpacity={0.6}
            delayPressIn={0}
          >
            <Text style={[styles.backBtn, { color: colors.primary }]}>
              ‹ Back
            </Text>
          </TouchableOpacity>
          <Text style={[styles.subDrawerTitle, { color: colors.textPrimary }]}>
            {route[0].toUpperCase() + route.slice(1)}
          </Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.subDrawerContent}>
          {route === 'notifications' ? (
            <View>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 16,
                  marginBottom: 20
                }}
              >
                Manage notifications from websites and apps.
              </Text>
              <TouchableOpacity
                style={[
                  styles.drawerItem,
                  { backgroundColor: colors.inputBackground, borderRadius: 8 }
                ]}
                onPress={onOpenNotificationSettings}
              >
                <Ionicons
                  name="notifications-outline"
                  size={22}
                  color={colors.textSecondary}
                  style={styles.drawerIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.drawerLabel, { color: colors.textPrimary }]}
                  >
                    Notification Settings
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                    Manage website permissions
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          ) : (
            screens[route]
          )}
        </View>
      </View>
    );
  }
);

/* -------------------------------------------------------------------------- */
/*                              BOTTOM TOOLBAR                               */
/* -------------------------------------------------------------------------- */

const BottomToolbar = React.memo(
  ({
    activeTab,
    colors,
    styles,
    navBack,
    navFwd,
    shareCurrent,
    toggleStarDrawer,
    setShowTabsView
  }: {
    activeTab: Tab;
    colors: any;
    styles: any;
    navBack: () => void;
    navFwd: () => void;
    shareCurrent: () => void;
    toggleStarDrawer: (open: boolean) => void;
    setShowTabsView: (show: boolean) => void;
  }) => {
    const handleStarPress = useCallback(
      () => toggleStarDrawer(true),
      [toggleStarDrawer]
    );
    const handleTabsPress = useCallback(
      () => setShowTabsView(true),
      [setShowTabsView]
    );

    return (
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.inputBackground,
            paddingBottom: 0
          }
        ]}
      >
        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={navBack}
          disabled={!activeTab.canGoBack || activeTab.url === kNEW_TAB_URL}
          activeOpacity={0.6}
          delayPressIn={0}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={
              activeTab.canGoBack && activeTab.url !== kNEW_TAB_URL
                ? colors.textPrimary
                : '#cccccc'
            }
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={navFwd}
          disabled={!activeTab.canGoForward || activeTab.url === kNEW_TAB_URL}
          activeOpacity={0.6}
          delayPressIn={0}
        >
          <Ionicons
            name="arrow-forward"
            size={24}
            color={
              activeTab.canGoForward && activeTab.url !== kNEW_TAB_URL
                ? colors.textPrimary
                : '#cccccc'
            }
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={shareCurrent}
          disabled={activeTab.url === kNEW_TAB_URL}
          activeOpacity={0.6}
          delayPressIn={0}
        >
          <Ionicons
            name="share-outline"
            size={24}
            color={
              activeTab.url === kNEW_TAB_URL
                ? colors.textSecondary
                : colors.textPrimary
            }
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={handleStarPress}
          activeOpacity={0.6}
          delayPressIn={0}
        >
          <Ionicons name="star-outline" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={handleTabsPress}
          activeOpacity={0.6}
          delayPressIn={0}
        >
          <Ionicons name="copy-outline" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    );
  }
);

/* -------------------------------------------------------------------------- */
/*                                    CSS                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  container: { flex: 1 },
  addressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12
  },
  addressInput: {
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'ios' ? 6 : 2,
    borderRadius: 6,
    fontSize: 15
  },
  addressBarIcon: { paddingHorizontal: 6 },
  padlock: { marginRight: 4 },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  toolbarButton: { padding: 6 },
  toolbarIcon: { fontSize: 20 },

  /* suggestions */
  suggestionBox: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingBottom: 8
  },
  suggestionItem: { paddingVertical: 8, paddingHorizontal: 16 },
  suggestionTitle: { fontSize: 14 },
  suggestionUrl: { fontSize: 11 },

  /* star drawer */
  starDrawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
    zIndex: 20,
    elevation: 12
  },

  starTabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  starTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent'
  },
  starTabLabel: { fontSize: 15, fontWeight: '600' },
  drawerHandleArea: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },

  /* tabs view */
  tabsViewContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 100
  },
  tabPreview: {
    margin: '4%',
    borderRadius: 10,
    overflow: 'visible'
  },
  tabPreviewEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  tabTitleBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  tabsViewFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  newTabBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4c4c4c',
    justifyContent: 'center',
    alignItems: 'center'
  },
  newTabIcon: { fontSize: 32, color: '#fff', lineHeight: 32 },
  doneButton: {
    position: 'absolute',
    right: 20,
    bottom: 56
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600'
  },

  /* info drawer */
  infoDrawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 10
  },
  drawerHandle: { alignItems: 'center', padding: 10 },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#999'
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24
  },
  drawerIcon: {
    marginRight: 16
  },
  drawerLabel: {
    flex: 1,
    fontSize: 17
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ccc',
    marginVertical: 8,
    marginHorizontal: 24
  },

  /* sub-drawer */
  subDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12
  },
  backBtn: { fontSize: 17 },
  subDrawerTitle: { flex: 1, textAlign: 'center', fontSize: 17 },
  subDrawerContent: { flex: 1, padding: 16 },

  /* swipe delete */
  swipeDelete: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    marginVertical: 10,
    borderRadius: 10
  },
  swipeDeleteText: { color: '#fff', fontSize: 24 },

  /* confirm modal */
  confirmBox: {
    borderRadius: 12,
    padding: 24,
    width: '85%',
    alignSelf: 'center'
  },
  confirmTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16 },
  confirmButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
  confirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 6,
    marginLeft: 12
  },

  /* modal */
  modal: { justifyContent: 'center', alignItems: 'center' },

  /* backdrop */
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 20
  }
});
