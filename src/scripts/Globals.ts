import { Deck } from "./deck";
import { App } from "./app";
import { MyEmitter } from "./myemitter";
import { SceneManager } from "./scenemanager";
import * as PIXI from 'pixi.js'
import { Howl } from 'howler';
import { isMobile } from 'pixi.js';
import { BackendService } from "./services/backendservice";

type globalDataType = {
  resources: { [key: string]: PIXI.Texture }; 
  emitter: MyEmitter | undefined;
  isMobile: boolean;
  sceneManager : SceneManager | undefined,
  // fpsStats : Stats | undefined,
  soundResources: { [key: string]: Howl };

  app: App | undefined,
  backendService: BackendService | undefined,
  isVisible: boolean;
  balance : number;
  currentBet : number;
  deck : Deck | undefined;
  gameStarted?: boolean;
  popupManager?: any;
  isOnline: boolean;
  lastAction: string | null;
};

export const Globals: globalDataType = {
  resources: {},
  emitter: undefined,
  sceneManager : undefined,
  get isMobile() {
    //  return true;
    return isMobile.any;
  },
  // fpsStats: undefined,
  app: undefined,
  backendService: undefined,
  soundResources: {},
  isVisible: true,
  balance : 200000,
  currentBet : 0,
  deck : undefined,
  gameStarted: false,
  popupManager: undefined,
  isOnline: true,
  lastAction: null
};

export const formatNumber = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
  /**
   * Format a bet amount for display (e.g. 1000 -> 1k)
   * @param amount - The bet amount to format
   * @returns Formatted bet amount as a string
   */
  export const formatBetAmount = (amount: number): string => {
    if (amount >= 1000) {
      return (amount / 1000).toFixed(2).replace(/\.?0+$/, '') + 'k';
    }
    return amount.toString();
  }

  export const getSuitPrefix = (suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'): string => {
        switch (suit) {
            case 'hearts': return 'h';
            case 'diamonds': return 'd';
            case 'clubs': return 'c';
            case 'spades': return 's';
        }
    }