import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { config } from "./appConfig";
import { AnimatedBackgroundSprite, BackgroundGraphic, BackgroundSprite } from "./Background";
import { staticData } from "./LoaderConfig";
import { log } from "node:console";
import { Globals } from "./Globals";

export abstract class Scene {


    private sceneContainer: Container;


    mainContainer: Container;
    // mainBackground: BackgroundGraphic;
    private mainBackground: BackgroundGraphic | BackgroundSprite;


    constructor(isGraphics : boolean) {
        this.sceneContainer = new Container();
        if (isGraphics) {
            this.mainBackground = new BackgroundGraphic(config.logicalWidth, config.logicalHeight, 0x000000);
            
            } 
            else {
                this.mainBackground = new BackgroundSprite(Globals.resources.background, window.innerWidth, window.innerHeight);
                console.log(this.mainBackground);
                
              }
                this.addChildToFullScene(this.mainBackground);
        this.mainContainer = new Container();

        this.resetMainContainer();

        this.sceneContainer.addChild(this.mainContainer);

        // const mask = new Graphics();
        // mask.beginFill(0xffffff);
        // mask.drawRect(0, 0, config.logicalWidth, config.logicalHeight);
        // mask.endFill();
        // this.mainContainer.addChild(mask);
        // this.mainContainer.mask = mask;

    }

    // changeBackgroundSprite(index: number) {
    //     this.fullBackground.updateBackgroundIndex(index);
    // }

    resetMainContainer() {
        this.mainContainer.x = config.minLeftX;
        this.mainContainer.y = config.minTopY;
        this.mainContainer.scale.set(config.minScaleFactor);
    }
    addToScene(obj: any) {
        this.sceneContainer.addChild(obj);

    }
    resize(): void {
        this.resetMainContainer();
        // this.mainBackground.resetBg(window.innerWidth, window.innerHeight);
        this.mainBackground.width =  window.innerWidth;
        this.mainBackground.height =  window.innerHeight;

    }

    initScene(container: Container) {
        container.addChild(this.sceneContainer);
    }
    destroyScene() {
        this.sceneContainer.destroy();
    }

    addChildToFullScene(component: any) {
        this.sceneContainer.addChild(component);

    }
    addChildToIndexFullScene(component: any, index: number) {
        this.sceneContainer.addChildAt(component, index);
    }



    abstract update(dt: number): void;

    abstract recievedMessage(msgType: string, msgParams: any): void;
}