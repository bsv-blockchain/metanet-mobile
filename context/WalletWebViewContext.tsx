const F = 'context/WalletWebViewContext'
import 'expo-crypto'
import 'react-native-get-random-values'

import React, { useState, useEffect, createContext, useMemo, useCallback, useContext, useRef } from 'react'
import {
  Wallet,
  WalletPermissionsManager,
  PrivilegedKeyManager,
  WalletStorageManager,
  WalletAuthenticationManager,
  OverlayUMPTokenInteractor,
  WalletSigner,
  Services,
  StorageClient,
  TwilioPhoneInteractor,
  WABClient,
  PermissionRequest
} from '@bsv/wallet-toolbox-mobile'
import { KeyDeriver, PrivateKey, SHIPBroadcaster, LookupResolver } from '@bsv/sdk'
import {
  DEFAULT_SETTINGS,
  WalletSettings,
  WalletSettingsManager
} from '@bsv/wallet-toolbox-mobile/out/src/WalletSettingsManager'
import { toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { DEFAULT_WAB_URL, DEFAULT_STORAGE_URL, DEFAULT_CHAIN, ADMIN_ORIGINATOR } from './config'
import { UserContext } from './UserContext'
import { useBrowserMode } from './BrowserModeContext'
import isImageUrl from '../utils/isImageUrl'
import parseAppManifest from '../utils/parseAppManifest'
import { useLocalStorage } from '@/context/LocalStorageProvider'
import { getApps } from '@/utils/getApps'
import { router } from 'expo-router'
import { logWithTimestamp } from '@/utils/logging'
import WebView from 'react-native-webview'
import { TouchableOpacity, View, Text } from 'react-native'
import webviewSource from '../wallet/dist/index.html';

// -----
// Context Types
// -----

interface ManagerState {
  walletManager?: WalletAuthenticationManager
  permissionsManager?: WalletPermissionsManager
  settingsManager?: WalletSettingsManager
}

type ConfigStatus = 'editing' | 'configured' | 'initial'

export interface WalletContextValue {
  // Managers:
  managers: ManagerState
  updateManagers: (newManagers: ManagerState) => void
  // Settings
  settings: WalletSettings
  updateSettings: (newSettings: WalletSettings) => Promise<void>
  // Logout
  logout: () => void
  adminOriginator: string
  setPasswordRetriever: (
    retriever: (reason: string, test: (passwordCandidate: string) => boolean) => Promise<string>
  ) => void
  setRecoveryKeySaver: (saver: (key: number[]) => Promise<true>) => void
  snapshotLoaded: boolean
  basketRequests: BasketAccessRequest[]
  certificateRequests: CertificateAccessRequest[]
  protocolRequests: ProtocolAccessRequest[]
  spendingRequests: SpendingRequest[]
  advanceBasketQueue: () => void
  advanceCertificateQueue: () => void
  advanceProtocolQueue: () => void
  advanceSpendingQueue: () => void
  recentApps: any[]
  finalizeConfig: (wabConfig: WABConfig) => boolean
  setConfigStatus: (status: ConfigStatus) => void
  configStatus: ConfigStatus
  selectedWabUrl: string
  selectedStorageUrl: string
  selectedMethod: string
  selectedNetwork: 'main' | 'test'
  setWalletBuilt: (current: boolean) => void,
  webviewComingEvent: WebviewComingEventProps | null,
  sendWebViewEvent: (name: string, results?: any) => void
}

export const WalletContext = createContext<WalletContextValue>({
  managers: {},
  updateManagers: () => {},
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  logout: () => {},
  adminOriginator: ADMIN_ORIGINATOR,
  setPasswordRetriever: () => {},
  setRecoveryKeySaver: () => {},
  snapshotLoaded: false,
  basketRequests: [],
  certificateRequests: [],
  protocolRequests: [],
  spendingRequests: [],
  advanceBasketQueue: () => {},
  advanceCertificateQueue: () => {},
  advanceProtocolQueue: () => {},
  advanceSpendingQueue: () => {},
  recentApps: [],
  finalizeConfig: () => false,
  setConfigStatus: () => {},
  configStatus: 'initial',
  selectedWabUrl: '',
  selectedStorageUrl: '',
  selectedMethod: '',
  selectedNetwork: 'main',
  setWalletBuilt: (current: boolean) => {},
  webviewComingEvent: null,
  sendWebViewEvent: (name: string, data?: any) => {}
})

type PermissionType = 'identity' | 'protocol' | 'renewal' | 'basket'

type BasketAccessRequest = {
  requestID: string
  basket?: string
  originator: string
  reason?: string
  renewal?: boolean
}

type CertificateAccessRequest = {
  requestID: string
  certificate?: {
    certType?: string
    fields?: Record<string, any>
    verifier?: string
  }
  originator: string
  reason?: string
  renewal?: boolean
}

type ProtocolAccessRequest = {
  requestID: string
  protocolSecurityLevel: number
  protocolID: string
  counterparty?: string
  originator?: string
  description?: string
  renewal?: boolean
  type?: PermissionType
}

type SpendingRequest = {
  requestID: string
  originator: string
  description?: string
  transactionAmount: number
  totalPastSpending: number
  amountPreviouslyAuthorized: number
  authorizationAmount: number
  renewal?: boolean
  lineItems: any[]
}

export interface WABConfig {
  wabUrl: string
  wabInfo: any
  method: string
  network: 'main' | 'test'
  storageUrl: string
}

interface WalletContextProps {
  children: React.ReactNode
}

interface WebviewComingEventProps {
  name: string
  results: any
}

export const WalletContextProvider: React.FC<WalletContextProps> = ({ children = <></> }) => {
  const [managers, setManagers] = useState<ManagerState>({})
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [adminOriginator, setAdminOriginator] = useState(ADMIN_ORIGINATOR)
  const [recentApps, setRecentApps] = useState<any[]>([])
  const [walletBuilt, setWalletBuilt] = useState<boolean>(false)

  const { getSnap, deleteSnap, getItem, setItem } = useLocalStorage()
  const { setWeb2Mode } = useBrowserMode()

  const {
    isFocused,
    onFocusRequested,
    onFocusRelinquished,
    setBasketAccessModalOpen,
    setCertificateAccessModalOpen,
    setProtocolAccessModalOpen,
    setSpendingAuthorizationModalOpen
  } = useContext(UserContext)

  // Track if we were originally focused
  const [wasOriginallyFocused, setWasOriginallyFocused] = useState(false)

  // Separate request queues for basket and certificate access
  const [basketRequests, setBasketRequests] = useState<BasketAccessRequest[]>([])
  logWithTimestamp(F, 'Basket requests initialized')
  const [certificateRequests, setCertificateRequests] = useState<CertificateAccessRequest[]>([])
  logWithTimestamp(F, 'Certificate requests initialized')
  const [protocolRequests, setProtocolRequests] = useState<ProtocolAccessRequest[]>([])
  logWithTimestamp(F, 'Protocol requests initialized')
  const [spendingRequests, setSpendingRequests] = useState<SpendingRequest[]>([])
  logWithTimestamp(F, 'Spending requests initialized')

  // Pop the first request from the basket queue, close if empty, relinquish focus if needed
  const advanceBasketQueue = () => {
    setBasketRequests(prev => {
      const newQueue = prev.slice(1)
      if (newQueue.length === 0) {
        setBasketAccessModalOpen(false)
        if (!wasOriginallyFocused) {
          onFocusRelinquished()
        }
      }
      return newQueue
    })
    logWithTimestamp(F, 'Advanced basket queue')
  }

  // Pop the first request from the certificate queue, close if empty, relinquish focus if needed
  const advanceCertificateQueue = () => {
    setCertificateRequests(prev => {
      const newQueue = prev.slice(1)
      if (newQueue.length === 0) {
        setCertificateAccessModalOpen(false)
        if (!wasOriginallyFocused) {
          onFocusRelinquished()
        }
      }
      return newQueue
    })
    logWithTimestamp(F, 'Advanced certificate queue')
  }

  // Pop the first request from the protocol queue, close if empty, relinquish focus if needed
  const advanceProtocolQueue = () => {
    setProtocolRequests(prev => {
      const newQueue = prev.slice(1)
      if (newQueue.length === 0) {
        setProtocolAccessModalOpen(false)
        if (!wasOriginallyFocused) {
          onFocusRelinquished()
        }
      }
      return newQueue
    })
    logWithTimestamp(F, 'Advanced protocol queue')
  }

  // Pop the first request from the spending queue, close if empty, relinquish focus if needed
  const advanceSpendingQueue = () => {
    setSpendingRequests(prev => {
      const newQueue = prev.slice(1)
      if (newQueue.length === 0) {
        setSpendingAuthorizationModalOpen(false)
        if (!wasOriginallyFocused) {
          onFocusRelinquished()
        }
      }
      return newQueue
    })
    logWithTimestamp(F, 'Advanced spending queue')
  }

  const updateSettings = useCallback(
    async (newSettings: WalletSettings) => {
      if (!managers.settingsManager) {
        throw new Error('The user must be logged in to update settings!')
      }
      await managers.settingsManager.set(newSettings)
      setSettings(newSettings)
      logWithTimestamp(F, 'Settings updated')
    },
    [managers.settingsManager]
  )

  // ---- Callbacks for password/recovery/etc.
  const [passwordRetriever, setPasswordRetriever] =
    useState<(reason: string, test: (passwordCandidate: string) => boolean) => Promise<string>>()
  logWithTimestamp(F, 'Password retriever initialized')
  const [recoveryKeySaver, setRecoveryKeySaver] = useState<(key: number[]) => Promise<true>>()
  logWithTimestamp(F, 'Recovery key saver initialized')

  // Provide a handler for basket-access requests that enqueues them
  const basketAccessCallback = useCallback(
    (
      incomingRequest: PermissionRequest & {
        requestID: string
        basket?: string
        originator: string
        reason?: string
        renewal?: boolean
      }
    ) => {
      // Enqueue the new request
      if (incomingRequest?.requestID) {
        setBasketRequests(prev => {
          const wasEmpty = prev.length === 0

          // If no requests were queued, handle focusing logic right away
          if (wasEmpty) {
            isFocused().then(currentlyFocused => {
              setWasOriginallyFocused(currentlyFocused)
              if (!currentlyFocused) {
                onFocusRequested()
              }
              setBasketAccessModalOpen(true)
            })
          }

          return [
            ...prev,
            {
              requestID: incomingRequest.requestID,
              basket: incomingRequest.basket,
              originator: incomingRequest.originator,
              reason: incomingRequest.reason,
              renewal: incomingRequest.renewal
            }
          ]
        })
        logWithTimestamp(F, 'Basket access request enqueued')
      }
    },
    [isFocused, onFocusRequested]
  )

  // Provide a handler for certificate-access requests that enqueues them
  const certificateAccessCallback = useCallback(
    (
      incomingRequest: PermissionRequest & {
        requestID: string
        certificate?: {
          certType?: string
          fields?: string[]
          verifier?: string
        }
        originator: string
        reason?: string
        renewal?: boolean
      }
    ) => {
      // Enqueue the new request
      if (incomingRequest?.requestID) {
        setCertificateRequests(prev => {
          const wasEmpty = prev.length === 0

          // If no requests were queued, handle focusing logic right away
          if (wasEmpty) {
            isFocused().then(currentlyFocused => {
              setWasOriginallyFocused(currentlyFocused)
              if (!currentlyFocused) {
                onFocusRequested()
              }
              setCertificateAccessModalOpen(true)
            })
          }

          // Extract certificate data, safely handling potentially undefined values
          const certificate = incomingRequest.certificate as any
          const certType = certificate?.certType || ''
          const fields = certificate?.fields || []

          // Extract field names as an array for the CertificateChip component
          const fieldsArray = fields

          const verifier = certificate?.verifier || ''

          return [
            ...prev,
            {
              requestID: incomingRequest.requestID,
              originator: incomingRequest.originator,
              verifierPublicKey: verifier,
              certificateType: certType,
              fieldsArray,
              description: incomingRequest.reason,
              renewal: incomingRequest.renewal
            }
          ]
        })
        logWithTimestamp(F, 'Certificate access request enqueued')
      }
    },
    [isFocused, onFocusRequested]
  )

  // Provide a handler for protocol permission requests that enqueues them
  const protocolPermissionCallback = useCallback(
    (args: PermissionRequest & { requestID: string }): Promise<void> => {
      const { requestID, counterparty, originator, reason, renewal, protocolID } = args

      if (!requestID || !protocolID) {
        return Promise.resolve()
      }

      const [protocolSecurityLevel, protocolNameString] = protocolID

      // Determine type of permission
      let permissionType: PermissionType = 'protocol'
      if (protocolNameString === 'identity resolution') {
        permissionType = 'identity'
      } else if (renewal) {
        permissionType = 'renewal'
      } else if (protocolNameString.includes('basket')) {
        permissionType = 'basket'
      }

      // Create the new permission request
      const newItem: ProtocolAccessRequest = {
        requestID,
        protocolSecurityLevel,
        protocolID: protocolNameString,
        counterparty,
        originator,
        description: reason,
        renewal,
        type: permissionType
      }

      // Enqueue the new request
      return new Promise<void>(resolve => {
        setProtocolRequests(prev => {
          const wasEmpty = prev.length === 0

          // If no requests were queued, handle focusing logic right away
          if (wasEmpty) {
            isFocused().then(currentlyFocused => {
              setWasOriginallyFocused(currentlyFocused)
              if (!currentlyFocused) {
                onFocusRequested()
              }
              setProtocolAccessModalOpen(true)
            })
          }

          resolve()
          return [...prev, newItem]
        })
        logWithTimestamp(F, 'Protocol permission request enqueued')
      })
    },
    [isFocused, onFocusRequested]
  )

  // Provide a handler for spending authorization requests that enqueues them
  const spendingAuthorizationCallback = useCallback(
    async (args: PermissionRequest & { requestID: string }): Promise<void> => {
      const { requestID, originator, reason, renewal, spending } = args

      if (!requestID || !spending) {
        return Promise.resolve()
      }

      let { satoshis, lineItems } = spending

      if (!lineItems) {
        lineItems = []
      }

      // TODO: support these
      const transactionAmount = 0
      const totalPastSpending = 0
      const amountPreviouslyAuthorized = 0

      // Create the new permission request
      const newItem: SpendingRequest = {
        requestID,
        originator,
        description: reason,
        transactionAmount,
        totalPastSpending,
        amountPreviouslyAuthorized,
        authorizationAmount: satoshis,
        renewal,
        lineItems
      }

      // Enqueue the new request
      return new Promise<void>(resolve => {
        setSpendingRequests(prev => {
          const wasEmpty = prev.length === 0

          // If no requests were queued, handle focusing logic right away
          if (wasEmpty) {
            isFocused().then(currentlyFocused => {
              setWasOriginallyFocused(currentlyFocused)
              if (!currentlyFocused) {
                onFocusRequested()
              }
              setSpendingAuthorizationModalOpen(true)
            })
          }

          resolve()
          return [...prev, newItem]
        })
        logWithTimestamp(F, 'Spending authorization request enqueued')
      })
    },
    [isFocused, onFocusRequested]
  )

  // ---- WAB + network + storage configuration ----
  const [selectedWabUrl, setSelectedWabUrl] = useState<string>(DEFAULT_WAB_URL)
  logWithTimestamp(F, 'Selected WAB URL initialized')
  const [selectedMethod, setSelectedMethod] = useState<string>('')
  logWithTimestamp(F, 'Selected method initialized')
  const [selectedNetwork, setSelectedNetwork] = useState<'main' | 'test'>(DEFAULT_CHAIN) // "test" or "main"
  logWithTimestamp(F, 'Selected network initialized')
  const [selectedStorageUrl, setSelectedStorageUrl] = useState<string>(DEFAULT_STORAGE_URL)
  logWithTimestamp(F, 'Selected storage URL initialized')

  // Flag that indicates configuration is complete. For returning users,
  // if a snapshot exists we auto-mark configComplete.
  const [configStatus, setConfigStatus] = useState<ConfigStatus>('initial')
  logWithTimestamp(F, 'Config status initialized')
  // Used to trigger a re-render after snapshot load completes.
  const [snapshotLoaded, setSnapshotLoaded] = useState<boolean>(false)
  logWithTimestamp(F, 'Snapshot loaded state initialized')

  // Webview handlers
  const shadowWebviewRef = useRef<WebView>(null);
  const [webviewShown, setWebviewShown] = useState<boolean>(false);
  const [webviewLoaded, setWebviewloaded] = useState<boolean>(false);
  const [webviewAuthenticationReady, setWebviewAuthenticationReady] = useState<boolean>(false);
  const [webviewAuthenticationInitialized, setWebviewAuthenticationInitialized] = useState<boolean>(false);
  const [webviewComingEvent, setWebviewComingEvent] = useState<WebviewComingEventProps | null>(null);
  const sendWebViewEvent = useCallback((eventName: string, data?: any) => {
    const script = `
    setTimeout(() => {
      window.eventManager.receive({ name: '${eventName}', params: ${JSON.stringify(data)} });
      true;
    }, 100)
    `;

    console.log(script, webviewLoaded);
    setTimeout(() => {
      shadowWebviewRef.current?.injectJavaScript(script);
    }, 3000);
  }, [webviewLoaded]);

  useEffect(() => {
    console.log('=========Admin originator changed');
    sendWebViewEvent('setAdminOriginator', adminOriginator);
    sendWebViewEvent('setSelectedNetwork', selectedNetwork);
    sendWebViewEvent('setSelectedWabUrl', selectedWabUrl);
    sendWebViewEvent('setSelectedStorageUrl', selectedStorageUrl);
    sendWebViewEvent('setPasswordRetriver');
    sendWebViewEvent('setRecoveryKeySaver');
  }, [
    sendWebViewEvent,
    adminOriginator,
    selectedWabUrl,
    selectedNetwork,
    selectedStorageUrl,
    passwordRetriever,
    recoveryKeySaver
  ]);

  const handleMessage = (nativeEvent: any) => {
    // TODO: This is not a complete implementation.
    // Handle all events received from the Webview
    const eventData = JSON.parse(nativeEvent.nativeEvent.data);
    const returnEventName = eventData.name;
    const returnResults = eventData.results;

    console.log('Received message from WebView:', eventData);

    // Handle partial events within this context
    switch (returnEventName) {
      case 'authenticationReady':
        // Set the authenticationReady flag and initialize the Wallet
        if (!webviewAuthenticationReady && !webviewAuthenticationInitialized) {
          setWebviewAuthenticationReady(true);
          sendWebViewEvent('initialize');
        }
        break;
      case 'initialize.callback':
        if (returnResults) { // successful initialize wallet in webview
          // Set the authenticationInitialized flag
          setWebviewAuthenticationInitialized(true);
          loadWalletSnapshot();
        }
        break;
      case 'loadWalletSnapshot.callback':
        if (returnResults === true) { // successful loadsnapshot in webview
          console.log('Snapshot Wallet loaded');
        } else {
          console.log('Snapshot Wallet loaded failed');
          console.error('Error loading snapshot', returnResults)
          deleteSnap() // Clear invalid snapshot
        }
        break;
    }

    // Send event to children components
    setWebviewComingEvent({ name: returnEventName, results: returnResults });
  }

  // For new users: mark configuration complete when WalletConfig is submitted.
  const finalizeConfig = (wabConfig: WABConfig): boolean => {
    const { wabUrl, wabInfo, method, network, storageUrl } = wabConfig
    try {
      if (!wabUrl) {
        console.error('WAB Server URL is required')
        return false
      }

      if (!wabInfo || !method) {
        console.error('Auth Method selection is required')
        return false
      }

      if (!network) {
        console.error('Network selection is required')
        return false
      }

      if (!storageUrl) {
        console.error('Storage URL is required')
        return false
      }

      setSelectedWabUrl(wabUrl)
      setSelectedMethod(method)
      setSelectedNetwork(network)
      setSelectedStorageUrl(storageUrl)

      // Save the configuration
      toast.success('Configuration applied successfully!')
      setConfigStatus('configured')
      logWithTimestamp(F, 'Configuration finalized successfully')
      return true
    } catch (error: any) {
      console.error('Error applying configuration:', error)
      toast.error('Failed to apply configuration: ' + (error.message || 'Unknown error'))
      logWithTimestamp(F, 'Error applying configuration', error.message)
      return false
    }
  }

  // Build wallet function
  const buildWallet = useCallback(
    async (primaryKey: number[], privilegedKeyManager: PrivilegedKeyManager): Promise<any> => {
      try {
        const newManagers = {} as any
        const chain = selectedNetwork
        const keyDeriver = new KeyDeriver(new PrivateKey(primaryKey))
        const storageManager = new WalletStorageManager(keyDeriver.identityKey)
        const signer = new WalletSigner(chain, keyDeriver, storageManager)
        const services = new Services(chain)
        const wallet = new Wallet(signer, services, undefined, privilegedKeyManager)
        newManagers.settingsManager = wallet.settingsManager

        // Use user-selected storage provider
        const client = new StorageClient(wallet, selectedStorageUrl)
        await client.makeAvailable()
        await storageManager.addWalletStorageProvider(client)

        // Setup permissions with provided callbacks.
        const permissionsManager = new WalletPermissionsManager(wallet, adminOriginator, {
          differentiatePrivilegedOperations: true,
          seekBasketInsertionPermissions: false,
          seekBasketListingPermissions: false,
          seekBasketRemovalPermissions: false,
          seekCertificateAcquisitionPermissions: true,
          seekCertificateDisclosurePermissions: true,
          seekCertificateRelinquishmentPermissions: true,
          seekCertificateListingPermissions: false,
          seekGroupedPermission: true,
          seekPermissionsForIdentityKeyRevelation: false,
          seekPermissionsForIdentityResolution: false,
          seekPermissionsForKeyLinkageRevelation: true,
          seekPermissionsForPublicKeyRevelation: true,
          seekPermissionWhenApplyingActionLabels: false,
          seekPermissionWhenListingActionsByLabel: false,
          seekProtocolPermissionsForEncrypting: false,
          seekProtocolPermissionsForHMAC: false,
          seekProtocolPermissionsForSigning: true,
          seekSpendingPermissions: true,
        })

        if (protocolPermissionCallback) {
          permissionsManager.bindCallback('onProtocolPermissionRequested', protocolPermissionCallback)
        }
        if (basketAccessCallback) {
          permissionsManager.bindCallback('onBasketAccessRequested', basketAccessCallback)
        }
        if (spendingAuthorizationCallback) {
          permissionsManager.bindCallback('onSpendingAuthorizationRequested', spendingAuthorizationCallback)
        }
        if (certificateAccessCallback) {
          permissionsManager.bindCallback('onCertificateAccessRequested', certificateAccessCallback)
        }

        // Store in window for debugging
        ;(window as any).permissionsManager = permissionsManager
        newManagers.permissionsManager = permissionsManager

        setManagers(m => ({ ...m, ...newManagers }))
        logWithTimestamp(F, 'Wallet build completed successfully')

        return permissionsManager
      } catch (error: any) {
        console.error('Error building wallet:', error)
        toast.error('Failed to build wallet: ' + error.message)
        logWithTimestamp(F, 'Error building wallet', error.message)
        return null
      }
    },
    [
      selectedNetwork,
      selectedStorageUrl,
      adminOriginator,
      protocolPermissionCallback,
      basketAccessCallback,
      spendingAuthorizationCallback,
      certificateAccessCallback
    ]
  )

  // Load snapshot function
  const loadWalletSnapshot = useCallback(async () => {
    try {
      const snap = await getSnap();
      console.log('Sending Snapshot...', snap)

      if (snap) {
          sendWebViewEvent('loadSnapshot', snap);
      } else {
        logWithTimestamp(F, 'No snapshot found')
      }
    } catch (error: any) {
      console.log('Sending Snapshot failed...', error);
    }
    },
    []
  );

  const clearWebviewLog = useCallback(() => {
    sendWebViewEvent('clearLog');
  }, []);

  // Watch for wallet authentication after snapshot is loaded
  useEffect(() => {
    ;(async () => {
      logWithTimestamp(F, 'Checking authentication state')
      const snap = await getSnap()
      if (managers?.walletManager?.authenticated && snap) {
        setSnapshotLoaded(true)
        logWithTimestamp(F, 'Authentication confirmed, snapshot loaded')
      }
      logWithTimestamp(F, 'Authentication state check complete')
    })()
  }, [managers?.walletManager?.authenticated])

  // ---- Build the wallet manager once all required inputs are ready.
  // useEffect(() => {
  //   if (
  //     passwordRetriever &&
  //     recoveryKeySaver &&
  //     configStatus !== 'editing' && // either user configured or snapshot exists
  //     !walletBuilt // build only once
  //   ) {
  //     logWithTimestamp(F, 'Starting wallet manager initialization')
  //     try {
  //       // Create network service based on selected network
  //       const networkPreset = selectedNetwork === 'main' ? 'mainnet' : 'testnet'

  //       // Create a LookupResolver instance
  //       const resolver = new LookupResolver({
  //         networkPreset
  //       })

  //       // Create a broadcaster with proper network settings
  //       const broadcaster = new SHIPBroadcaster(['tm_users'], {
  //         networkPreset
  //       })

  //       // Create a WAB Client with proper URL
  //       const wabClient = new WABClient(selectedWabUrl)

  //       // Create a phone interactor
  //       const phoneInteractor = new TwilioPhoneInteractor()

  //       // Create the wallet manager with proper error handling
  //       const walletManager = new WalletAuthenticationManager(
  //         adminOriginator,
  //         buildWallet,
  //         new OverlayUMPTokenInteractor(resolver, broadcaster),
  //         recoveryKeySaver,
  //         passwordRetriever,
  //         // Type assertions needed due to interface mismatch between our WABClient and the expected SDK client
  //         wabClient,
  //         phoneInteractor
  //       )

  //       // Store in window for debugging
  //       ;(window as any).walletManager = walletManager

  //       // Load snapshot if available
  //       logWithTimestamp(F, 'Loading wallet snapshot')
  //       loadWalletSnapshot(walletManager).then(walletManager => {
  //         logWithTimestamp(F, 'Wallet snapshot loaded')
  //         // Set initial managers state to prevent null references
  //         setManagers(m => ({ ...m, walletManager }))
  //         setWalletBuilt(true)
  //         logWithTimestamp(F, 'Wallet manager initialization completed successfully')
  //       })
  //     } catch (err: any) {
  //       console.error('Error initializing wallet manager:', err)
  //       toast.error('Failed to initialize wallet: ' + err.message)
  //       logWithTimestamp(F, 'Error initializing wallet manager', err.message)
  //       // Reset configuration if wallet initialization fails
  //       setConfigStatus('editing')
  //     }
  //     logWithTimestamp(F, 'Wallet manager initialization process complete')
  //   }
  // }, [
  //   passwordRetriever,
  //   recoveryKeySaver,
  //   configStatus,
  //   managers.walletManager,
  //   selectedNetwork,
  //   selectedWabUrl,
  //   buildWallet,
  //   loadWalletSnapshot,
  //   adminOriginator
  // ])

  // When Settings manager becomes available, populate the user's settings
  useEffect(() => {
    logWithTimestamp(F, 'Checking settings manager availability')
    const loadSettings = async () => {
      if (managers.settingsManager) {
        try {
          const userSettings = await managers.settingsManager.get()
          setSettings(userSettings)
          logWithTimestamp(F, 'Settings loaded successfully')
        } catch (e) {
          logWithTimestamp(F, 'Failed to load settings')
          // Unable to load settings, defaults are already loaded.
        }
      }
    }

    loadSettings()
  }, [managers])

  const logout = useCallback(() => {
    // Clear localStorage to prevent auto-login
    logWithTimestamp(F, 'Initiating logout process')
    deleteSnap().then(async () => {
      // Reset manager state
      setManagers({})
      logWithTimestamp(F, 'Managers reset')

      // Reset configuration state
      setConfigStatus('initial')
      setSnapshotLoaded(false)
      setWalletBuilt(false)
      logWithTimestamp(F, 'Configuration and state reset')

      // Clear recent apps (web3-specific data)
      setRecentApps([])

      // Set mode back to web2 when logging out
      setWeb2Mode(true)

      // Clear web3-related data from localStorage to ensure clean state
      try {
        await setItem('browserMode', 'web2')
        await setItem('recentApps', JSON.stringify([])) // Clear recent web3 apps
      } catch (error) {
        console.warn('Failed to clear browser mode from localStorage:', error)
      }

      router.dismissAll()
      router.replace('/')
      logWithTimestamp(F, 'Logout completed, navigating to root')
    })
  }, [deleteSnap, setWeb2Mode, setItem])

  const resolveAppDataFromDomain = async ({ appDomains }: { appDomains: string[] }) => {
    const dataPromises = appDomains.map(async (domain, index) => {
      let appIconImageUrl
      let appName = domain
      try {
        const url = domain.startsWith('http') ? domain : `https://${domain}/favicon.ico`
        logWithTimestamp(F, `Checking image URL for ${domain}`)
        if (await isImageUrl(url)) {
          appIconImageUrl = url
        }
        // Try to parse the app manifest to find the app info
        logWithTimestamp(F, `Fetching manifest for ${domain}`)
        const manifest = await parseAppManifest({ domain })
        if (manifest && typeof manifest.name === 'string') {
          appName = manifest.name
        }
      } catch (e) {
        console.error(e)
        logWithTimestamp(F, `Error resolving app data for ${domain}`, (e as Error).message)
      }

      return { appName, appIconImageUrl, domain }
    })
    return Promise.all(dataPromises)
  }

  useEffect(() => {
    if (typeof managers?.permissionsManager === 'object') {
      logWithTimestamp(F, 'Checking permissions manager for stored apps')
      ;(async () => {
        logWithTimestamp(F, 'Fetching stored apps from AsyncStorage')
        const storedApps = await getItem('recentApps')
        console.log('Retrieved from storage', storedApps)
        logWithTimestamp(F, `Retrieved from storage: ${storedApps}`)
        if (storedApps) {
          setRecentApps(JSON.parse(storedApps))
          logWithTimestamp(F, 'Recent apps set from storage')
        }
        // Parse out the app data from the domains
        logWithTimestamp(F, 'Fetching app domains')
        const appDomains = await getApps({ permissionsManager: managers.permissionsManager!, adminOriginator })
        logWithTimestamp(F, 'App domains fetched, resolving data')
        const parsedAppData = await resolveAppDataFromDomain({ appDomains })
        logWithTimestamp(F, 'App data resolved, sorting')
        parsedAppData.sort((a, b) => a.appName.localeCompare(b.appName))
        setRecentApps(parsedAppData)

        // store for next app load
        logWithTimestamp(F, 'Storing apps in AsyncStorage')
        await setItem('recentApps', JSON.stringify(parsedAppData))
        logWithTimestamp(F, 'Stored apps processing complete')
      })()
    }
    logWithTimestamp(F, 'Permissions manager check complete')
  }, [adminOriginator, managers?.permissionsManager, getItem, setItem])

  const contextValue = useMemo<WalletContextValue>(
    () => ({
      managers,
      updateManagers: setManagers,
      settings,
      updateSettings,
      logout,
      adminOriginator,
      setPasswordRetriever,
      setRecoveryKeySaver,
      snapshotLoaded,
      basketRequests,
      certificateRequests,
      protocolRequests,
      spendingRequests,
      advanceBasketQueue,
      advanceCertificateQueue,
      advanceProtocolQueue,
      advanceSpendingQueue,
      recentApps,
      finalizeConfig,
      setConfigStatus,
      configStatus,
      selectedWabUrl,
      selectedStorageUrl,
      selectedMethod,
      selectedNetwork,
      setWalletBuilt,
      webviewComingEvent,
      sendWebViewEvent
    }),
    [
      managers,
      settings,
      updateSettings,
      logout,
      adminOriginator,
      setPasswordRetriever,
      setRecoveryKeySaver,
      snapshotLoaded,
      basketRequests,
      certificateRequests,
      protocolRequests,
      spendingRequests,
      advanceBasketQueue,
      advanceCertificateQueue,
      advanceProtocolQueue,
      advanceSpendingQueue,
      recentApps,
      finalizeConfig,
      setConfigStatus,
      configStatus,
      selectedWabUrl,
      selectedStorageUrl,
      selectedMethod,
      selectedNetwork,
      setWalletBuilt,
      webviewComingEvent,
      sendWebViewEvent
    ]
  )

  return <WalletContext.Provider value={contextValue}>
    <View
      style={{
        position: 'absolute',
        top: 50,
        left: 0,
        width: webviewShown ? '100%': 0,
        height: webviewShown ? 400: 0,
        zIndex: 100
      }}>
      <WebView
        ref={shadowWebviewRef}
        source={{ html: webviewSource }}
        onMessage={handleMessage}
        webviewDebuggingEnabled={true}
        mixedContentMode='always'
        onLoadEnd={() => setWebviewloaded(true)}
        limitsNavigationsToAppBoundDomains={false}
        javaScriptEnabledAndroid
        javaScriptEnabled
      />
    </View>
    <View style={{
        flexDirection: 'row',
        marginTop: 50,
        marginLeft: 10,
        position: 'absolute',
        zIndex: 100
      }}>
      <TouchableOpacity onPress={() => shadowWebviewRef.current?.reload()} style={{ backgroundColor: 'lightblue', padding: 10 }}>
        <Text>Reload</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setWebviewShown(!webviewShown)} style={{ marginLeft: 10, backgroundColor: 'lightblue', padding: 10 }}>
        <Text>{ webviewShown ? 'Hide' : 'Show' }</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => clearWebviewLog()} style={{ marginLeft: 10, backgroundColor: 'lightblue', padding: 10 }}>
        <Text>Clear</Text>
      </TouchableOpacity>
    </View>
    {children}
  </WalletContext.Provider>
}

export const useWallet = () => useContext(WalletContext)
