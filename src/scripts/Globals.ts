
import { Howl } from 'howler';
import * as PIXI from 'pixi.js';
import { Assets} from 'pixi.js';
import { App } from './App';
import { MyEmitter } from './MyEmitter';
import { isMobile } from 'pixi.js';
import { SceneManager } from './SceneManager';
type globalDataType = {
  resources: { [key: string]: PIXI.Texture }; 
  emitter: MyEmitter | undefined;
  isMobile: boolean;
  SceneManager : SceneManager | undefined,
  // fpsStats : Stats | undefined,
  soundResources: { [key: string]: Howl };

  App: App | undefined,
  isVisible: boolean;
  Balance : number;
  currentBet : number;
  gameStarted : boolean;
};

export const Globals: globalDataType = {
  resources: {},
  emitter: undefined,
  SceneManager : undefined,
  get isMobile() {
    //  return true;
    return isMobile.any;
  },
  // fpsStats: undefined,
  App: undefined,
  soundResources: {},
  isVisible: true,
  Balance : 200000,
  currentBet : 0,
  gameStarted : false,
};

export const formatNumber = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};