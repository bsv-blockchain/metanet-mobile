import { KeyDeriver, LookupResolver, PrivateKey, SHIPBroadcaster, Utils } from '@bsv/sdk';
import { OverlayUMPTokenInteractor, PrivilegedKeyManager, Services, StorageClient, TwilioPhoneInteractor, WABClient, Wallet, WalletAuthenticationManager, WalletPermissionsManager, WalletSigner, WalletStorageManager } from '@bsv/wallet-toolbox-mobile';
import { DEFAULT_CHAIN, DEFAULT_STORAGE_URL, ADMIN_ORIGINATOR, DEFAULT_WAB_URL } from './config';
import { Logger } from './logger';
import { EventManager } from './eventManager';

export class AuthenticationManager {
  authManager!: WalletAuthenticationManager;
  permissionsManager!: WalletPermissionsManager;
  wallet!: Wallet;

  // Authentication properties
  adminOriginator: string = ADMIN_ORIGINATOR;
  selectedStorageUrl: string = DEFAULT_STORAGE_URL;
  selectedNetwork: 'main' | 'test' = DEFAULT_CHAIN;
  selectedWabUrl: string = DEFAULT_WAB_URL;

  recoveryKeySaver!: (key: number[]) => Promise<true>;
  passwordRetriever!: (reason: string, testFn: (passwordCandidate: string) => boolean) => Promise<string>;

  // Key promise resolver/rejecter
  keySaverResolver!: Function;
  keySaverRejecter!: Function;

  // Password retriver handlers
  passwordTestFn!: Function;
  passwordResolver!: Function;
  passwordRejecter!: Function;

  constructor(private eventManager: EventManager) {
    // Register authmanager listeners
    this.eventManager.listen('setAdminOriginator', this);
    this.eventManager.listen('setSelectedStorageUrl', this);
    this.eventManager.listen('setSelectedNetwork', this);
    this.eventManager.listen('setSelectedWabUrl', this);
    this.eventManager.listen('setRecoveryKeySaver', this);
    this.eventManager.listen('setPasswordRetriver', this);
    this.eventManager.listen('initialize', this);
    this.eventManager.listen('loadSnapshot', this);
    this.eventManager.listen('startAuth', this);
    this.eventManager.listen('restartAuth', this);
  }

  setAdminOriginator(origin: string) {
    this.adminOriginator = origin;
    this.checkAndReadyEvent();
    return this.adminOriginator;
  }

  setSelectedStorageUrl(url: string) {
    this.selectedStorageUrl = url;
    this.checkAndReadyEvent();
    return this.selectedStorageUrl;
  }

  setSelectedNetwork(network: 'main' | 'test') {
    this.selectedNetwork = network;
    this.checkAndReadyEvent();
    return this.selectedNetwork;
  }

  setSelectedWabUrl(url: string) {
    this.selectedWabUrl = url;
    this.checkAndReadyEvent();
    return this.selectedWabUrl;
  }

  setRecoveryKeySaver() {
    this.recoveryKeySaver = (key: number[]) => {
      return new Promise((resolve, reject) => {
        const keyAsStr = Utils.toBase64(key)

        // When main thread saves key, resolve
        this.keySaverResolver = resolve;
        // When main thread reject key, reject
        this.keySaverRejecter = reject;

        // TODO:Send key as string to main thread
        // setRecoveryKey(keyAsStr)
        // setOpen(true)
      })
    };

    this.checkAndReadyEvent();

    return true;
  }

  setPasswordRetriver() {
    this.passwordRetriever = (reason: string, testFn: (passwordCandidate: string) => boolean) => {
      return new Promise<string>((resolvePromise: Function, rejectPromise: Function) => {
        // TODO: Send password_reason event to main thread
        // Actions to perform
        // setReason(reason)

        // When main thread test password, call this method
        this.passwordTestFn = testFn;
        // When main thread resolves password, call this resolve method
        this.passwordResolver = resolvePromise;
        // When main thread rejects password, call this reject method
        this.passwordRejecter = rejectPromise;

        // TODO: Send password_retriving event to main thread
        // Actions to perform
        // setOpen(true)
        // manageFocus()
      })
    };

    this.checkAndReadyEvent();
    return true;
  }

  isReady() {
    // Check if all property are defined
    console.log(
      this.adminOriginator,
      this.selectedStorageUrl,
      this.selectedNetwork,
      this.setSelectedWabUrl,
      this.recoveryKeySaver,
      this.passwordRetriever
    )

    if (!this.adminOriginator || !this.selectedStorageUrl || !this.selectedNetwork ||
        !this.setSelectedWabUrl || !this.recoveryKeySaver || !this.passwordRetriever) {
      return false
    }

    return true;
  }

  checkAndReadyEvent() {
    if (this.isReady()) {
      this.eventManager.send('authenticationReady');
    }
  }

  initialize() {
    if (this.isReady()) {
      // Create network service based on selected network
      const networkPreset = this.selectedNetwork === 'main' ? 'mainnet' : 'testnet';

      // Create a LookupResolver instance
      const resolver = new LookupResolver({
        networkPreset
      });

      // Create a broadcaster with proper network settings
      const broadcaster = new SHIPBroadcaster(['tm_users'], {
        networkPreset
      });

      // Create a WAB Client with proper URL
      const wabClient = new WABClient(this.selectedWabUrl)

      // Create a phone interactor
      const phoneInteractor = new TwilioPhoneInteractor()

      this.authManager = new WalletAuthenticationManager(
        this.adminOriginator,
        (primaryKey: number[], privilegedKeyManager: PrivilegedKeyManager) => this.buildWallet(primaryKey, privilegedKeyManager),
        new OverlayUMPTokenInteractor(resolver, broadcaster),
        this.recoveryKeySaver,
        this.passwordRetriever,
        // Type assertions needed due to interface mismatch between our WABClient and the expected SDK client
        wabClient,
        phoneInteractor
      )

      console.log(this.authManager);

      // Load snapshot
      return true;
    } else {
      Logger.log('Missing authentication properties')
      return false;
    }
  }

  async buildWallet(primaryKey: number[], privilegedKeyManager: PrivilegedKeyManager): Promise<any> {
    try {
      // const newManagers = {} as any;
      const chain = this.selectedNetwork;
      const keyDeriver = new KeyDeriver(new PrivateKey(primaryKey))
      const storageManager = new WalletStorageManager(keyDeriver.identityKey)
      const signer = new WalletSigner(chain, keyDeriver, storageManager)
      const services = new Services(chain)
      this.wallet = new Wallet(signer, services, undefined, privilegedKeyManager)

      // Use user-selected storage provider
      const client = new StorageClient(this.wallet, this.selectedStorageUrl)
      await client.makeAvailable()
      await storageManager.addWalletStorageProvider(client)

      // TODO: Setup permissions with provided callbacks.
      // this.permissionsManager = new WalletPermissionsManager(this.wallet, this.adminOriginator, {
      //   seekProtocolPermissionsForEncrypting: false,
      //   seekProtocolPermissionsForHMAC: false,
      //   seekPermissionsForPublicKeyRevelation: false,
      //   seekPermissionsForIdentityKeyRevelation: false,
      //   seekPermissionsForIdentityResolution: false
      // })

      // if (protocolPermissionCallback) {
      //   permissionsManager.bindCallback('onProtocolPermissionRequested', protocolPermissionCallback)
      // }
      // if (basketAccessCallback) {
      //   permissionsManager.bindCallback('onBasketAccessRequested', basketAccessCallback)
      // }
      // if (spendingAuthorizationCallback) {
      //   permissionsManager.bindCallback('onSpendingAuthorizationRequested', spendingAuthorizationCallback)
      // }
      // if (certificateAccessCallback) {
      //   permissionsManager.bindCallback('onCertificateAccessRequested', certificateAccessCallback)
      // }

      // Store in window for debugging
      // ;(window as any).permissionsManager = permissionsManager
      // newManagers.permissionsManager = permissionsManager

      // setManagers(m => ({ ...m, ...newManagers }))
      // logWithTimestamp(F, 'Wallet build completed successfully')

      // return this.permissionsManager;
    } catch (error: any) {
      Logger.log('Error building wallet:', error)
      return null
    }
  }

  async loadSnapshot(snap: number[]) {
    console.log('snap', snap, typeof snap);

    try {
      await this.authManager.loadSnapshot(snap)
      await this.authManager.waitForAuthentication({});
      return true;
    } catch (error: any) {
      Logger.log('Wallet snapshot load failed:', error);
      return error;
    }
  }

  async startAuth(phoneNumber: string) {
    try {
      return await this.authManager.startAuth({ phoneNumber })
    } catch(err) {
      return false;
    }
  }

  async restartAuth(phoneNumber: string) {
    return this.startAuth(phoneNumber);
  }

  async completeAuth({ phoneNumber, otp}: { phoneNumber: string, otp: string }) {
    try {
      return await this.authManager.completeAuth({ phoneNumber, otp })
    } catch(err) {
      return false;
    }
  }
}
