import { App } from "./app";
import { MyEmitter } from "./myemitter";
import { SceneManager } from "./scenemanager";
import * as PIXI from 'pixi.js'
import { Howl } from 'howler';
import { isMobile } from 'pixi.js';
import { BackendService } from "./services/backendservice";
import { GameManager } from "./gamemanager";

export interface globalDataType {
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
  Manager : GameManager | undefined;
  gameState:"betting" | "dealing" | "player_turn" | "dealer_turn" | "complete" | undefined;
  lastWin: number;
  activeHand: 'first' | 'second' | null;
  userId: string;
}

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
  balance : 0,
  currentBet : 0,
  gameState: "betting",
  Manager : undefined,
  lastWin: 0,
  activeHand: null,
  userId: ''
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

  export const getSuitPrefix = (suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' | '0'): string => {
        switch (suit) {
            case 'hearts': return 'h';
            case 'diamonds': return 'd';
            case 'clubs': return 'c';
            case 'spades': return 's';
            case '0': return '0';
        }
    }


    export const loginData = {"loginMethod":"google","timestamp":1743010532443,"jwt":"eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwczovL2Jsb2Nrc3BpbmdhbWluZy5jb20iLCJhdWQiOiJodHRwczovL2Jsb2Nrc3BpbmdhbWluZy5jb20iLCJleHAiOjE3NTA3ODY1MzIuNDQzLCJkYXRhIjp7InVzZXJJZCI6IjY3ZTQzYWU0YzdhZmFhNDExOTE5YjM1YSIsImxvZ2luTWV0aG9kIjoiZ29vZ2xlIiwidGltZXN0YW1wIjoxNzQzMDEwNTMyNDQzfX0.gG-btoR7W5927g0cDVTme0qq4D83vQbQrSYF0VmHlY0L28oogbeJGUsdZyUDlPQKIT6PhTJ3ru44THmGkli3BA","userId":"67e43ae4c7afaa411919b35a"};