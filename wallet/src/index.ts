import { EventManager } from './eventManager';
import { AuthenticationManager } from './authenticationManager';
import { Logger } from './logger';

Logger.log('Start Application');
const eventManager = new EventManager();
new AuthenticationManager(eventManager);
(window as any).eventManager = eventManager;
