import * as PIXI from 'pixi.js';
import { Assets, Sprite } from 'pixi.js';
import { BackgroundGraphic, BackgroundSprite } from './background';
import { Globals } from './globals';
import { LoaderConfig, fontData, LoaderSoundConfig, staticData } from './loaderconfig';
import FontFaceObserver from 'fontfaceobserver';
import { Howl } from 'howler';
import { log } from 'node:console';
import { SpineSprite } from 'pixi-spine';
import * as TWEEN from '@tweenjs/tween.js';

export class Loader extends PIXI.Container {
    resources: any;
    loaderBarContainer: PIXI.Container;
    apiDataLoaded: boolean = false;
    progressBox!: PIXI.Graphics;
    progressBar!: PIXI.Graphics;
    background!: Sprite;
    tweenGroup: TWEEN.Group;

    constructor() {
        super();
        this.resources = LoaderConfig;
        Assets.init();
        
        // Create tween group for animations
        this.tweenGroup = new TWEEN.Group();
        
        // Create loader container
        this.loaderBarContainer = new PIXI.Container();
        
        // Immediately create and show loading screen
        this.createLoadingPage();
    }

    // Update method to be called in the ticker
    update(deltaTime: number): void {
        this.tweenGroup.update();
    }

    async createLoadingPage() {
        // Create progress bar container
        this.progressBox = new PIXI.Graphics();
        this.progressBar = new PIXI.Graphics();
        
        // Calculate dimensions for a sleek, minimalist progress bar
        const boxData = {
            width: Math.min(window.innerWidth * 0.4, 300),
            height: 4, // Very thin for minimalist look
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        };
        
        // Draw progress box with subtle rounded corners
        this.progressBox.roundRect(
            boxData.x - boxData.width / 2, 
            boxData.y, 
            boxData.width, 
            boxData.height, 
            2 // Subtle rounded corners
        );
        this.progressBox.fill(0x333333);
        this.progressBox.alpha = 0.5;
        
        this.progressBar.roundRect(
            boxData.x - boxData.width / 2, 
            boxData.y, 
            0, 
            boxData.height, 
            2
        );
        this.progressBar.fill(0xFFFFFF);
        this.progressBar.alpha = 0.8;
        
        // Add progress elements to container
        this.loaderBarContainer.addChild(this.progressBox);
        this.loaderBarContainer.addChild(this.progressBar);
        
        // Add container to stage
        this.addChild(this.loaderBarContainer);
        
        // Force a render update to make sure loading screen appears
        if (Globals.app?.app.renderer) {
            Globals.app.app.renderer.render(Globals.app.app.stage);
        }
    }

    onProgress = (progress: number) => {
        // Update progress bar
        const boxData = {
            width: Math.min(window.innerWidth * 0.4, 300),
            height: 4,
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        };
        
        // Clear previous progress
        this.progressBar.clear();
        
        // Draw updated progress
        const value = progress / 100;
        this.progressBar.beginFill(0xFFFFFF, 0.8);
        this.progressBar.drawRoundedRect(
            boxData.x - boxData.width / 2, 
            boxData.y, 
            Math.max(0, boxData.width * value), 
            boxData.height, 
            2
        );
        this.progressBar.endFill();
    };

    preload() {
        return new Promise(resolve => {
            const keys: string[] = [];
            for (let key in this.resources) {
                Assets.add({alias: key, src: this.resources[key].default});
                keys.push(key);
            }
            
            Assets.load(keys, (progress) => {
                // Convert progress from 0-1 to 0-100
                this.onProgress(progress * 100);
            }).then((textures) => {
                Globals.resources = textures;
                
                // Load fonts
                const fontArray: any = [];
                fontData.forEach((fontName: any) => {
                    fontArray.push(new FontFaceObserver(fontName).load());
                });
                
                if (fontArray.length == 0) {
                    resolve(0);
                } else {
                    Promise.all(fontArray).then(() => {
                        resolve(0);
                    });
                }
            });
        });
    }

    preloadSounds(onCompleteCallback: () => void) {
        const totalCount = Object.keys(LoaderSoundConfig).length;
        let currentCount = 0;
        console.log("Preloading Sounds");
        
        if (totalCount == 0) {
            // Show 100% before finishing
            this.onProgress(100);
            
            // Call callback directly without animation since there's an issue
            this.destroy();
            onCompleteCallback();
            return;
        }
        
        for (let key in LoaderSoundConfig) {
            const sound = new Howl({
                src: [LoaderSoundConfig[key].default],
            });
            sound.load();
            
            Globals.soundResources[key] = sound;
            
            currentCount++;
            // Update progress for sounds
            this.onProgress(100 * currentCount / totalCount);
            
            if (currentCount >= totalCount) {
                // Call callback directly without animation since there's an issue
                this.destroy();
                onCompleteCallback();
            }
        }
    }
}