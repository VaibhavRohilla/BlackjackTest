import * as PIXI from 'pixi.js';
import { Assets, Sprite } from 'pixi.js';
import { Globals } from './globals';
import { LoaderConfig, fontData, LoaderSoundConfig, staticData } from './loaderconfig';
import FontFaceObserver from 'fontfaceobserver';
import { Howl } from 'howler';
import { log } from 'node:console';
import { SpineSprite } from 'pixi-spine';
import * as TWEEN from '@tweenjs/tween.js';
import { TextLabel } from './textlabel';

export class Loader extends PIXI.Container {
    resources: any;
    apiDataLoaded: boolean = false;
    loaderSprite!: Sprite;
    background!: Sprite;
    progressText: TextLabel = new TextLabel(0,0,0.5,"10 %",25,0xFFFFFF);
    tweenGroup: TWEEN.Group;

    constructor() {
        super();
        this.resources = LoaderConfig;
        Assets.init();
        
        // Create tween group for animations
        this.tweenGroup = new TWEEN.Group();


        
        // Immediately create and show loading screen
        this.createLoadingPage();
    }

    // Update method to be called in the ticker
    update(deltaTime: number): void {
        this.tweenGroup.update();
        this.loaderSprite.rotation += 0.05;
        this.tweenGroup.update();
        requestAnimationFrame(this.update.bind(this));
    }

    async createLoadingPage() {
        // Create progress bar container
        Assets.load(staticData.loading).then((texture) => {
            this.loaderSprite = new Sprite(texture);
            this.loaderSprite.width = 100;
            this.loaderSprite.height = 100;
            this.loaderSprite.anchor.set(0.5);
            this.loaderSprite.allowChildren = true;
            this.loaderSprite.position.set(window.innerWidth / 2, window.innerHeight / 2);
            this.addChild(this.loaderSprite);
            this.addChild(this.progressText);
            this.progressText.position.set(this.loaderSprite.position.x, this.loaderSprite.position.y);
            this.progressText.resolution = 2;
            console.log(this.loaderSprite, "sprite", this.loaderSprite.texture);
            this.update(0);
            new TWEEN.Tween({ progress: 0 }, this.tweenGroup)
                .to({ progress: 99 }, 15000)
                .easing(TWEEN.Easing.Sinusoidal.Out)
                .onUpdate((obj) => {
                    this.progressText.updateLabelText(obj.progress.toFixed(0).toString() + " %")
                })
                .start();
        });
        
        // Force a render update to make sure loading screen appears
        if (Globals.app?.app.renderer) {
            Globals.app.app.renderer.render(Globals.app.app.stage);
        }
    }

    onProgress = (progress: number) => {
    };

    preload() {
        return new Promise(resolve => {
            const keys: string[] = [];
            for (let key in this.resources) {
                Assets.add({alias: key, src: this.resources[key].default});
                keys.push(key);
            }
            
            // Animate progress to 99%
            new TWEEN.Tween({ progress: 0 })
                .to({ progress: 99 }, 2000)
                .easing(TWEEN.Easing.Quadratic.Out)
                .onUpdate((obj) => {
                    this.onProgress(obj.progress);
                })
                .start();

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
                    setTimeout(() => {
                        this.onProgress(100);
                        resolve(0);
                    }, 1000);
                } else {
                    Promise.all(fontArray).then(() => {
                        setTimeout(() => {
                            this.onProgress(100);
                            resolve(0);
                        }, 1000);
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
     
                    setTimeout(() => {
                        this.onProgress(100);
                        this.destroy();
                        onCompleteCallback();
                    }, 1000);
            return;
        }
        
        for (let key in LoaderSoundConfig) {
            const sound = new Howl({
                src: [LoaderSoundConfig[key].default],
            });
            sound.load();
            
            Globals.soundResources[key] = sound;
            
            currentCount++;
            console.log(currentCount, "currentCount", totalCount);
                
            if (currentCount >= totalCount) {
                // Animate to 99% and wait before finishing
              
                        setTimeout(() => {
                            console.log("CALLED");
                            
                            this.onProgress(100);
                            this.destroy();
                            onCompleteCallback();
                        }, 1000);
            }
        }
    }
}