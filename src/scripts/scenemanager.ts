import * as PIXI from "pixi.js";
import TWEEN, { Group } from "@tweenjs/tween.js";
import { Globals } from "./globals";
import { Scene } from "./scene";

export class SceneManager {

    private static _instance: SceneManager;

    public static get instance(): SceneManager {
        if (!SceneManager._instance) {
            SceneManager._instance = new SceneManager();
        }
        return SceneManager._instance;
    }

    container!: PIXI.Container;
    scene: Scene | null = null;
    tweenGroup : Group = new Group();

    constructor() {
        SceneManager._instance = this;
        Globals.sceneManager = SceneManager.instance;
        
        this.tweenGroup = new Group();
        
        this.container = new PIXI.Container();
    }

    start(scene: Scene) {
        if (this.scene) {
            this.scene.destroyScene();
            this.scene = null;
        }

        this.scene = scene;
        this.scene.initScene(this.container);
    }

    update(dt: number) {
        const currentTime = performance.now(); // Use current time
        this.tweenGroup.update(currentTime); // Pass current time to update tweens

        if (this.scene && this.scene.update) {
			this.scene.update(dt);
		}

		// Globals.stats.update();
		// Globals.fpsStats.update();

		// Globals.stats.begin();

		// // monitored code goes here

		// Globals.stats.end();
    }

	resize() {
		if (this.scene) {
			this.scene.resize();
		}
	}

	recievedMessage(msgType: string, msgParams: any) {
		if (this.scene && this.scene.recievedMessage) {
			this.scene.recievedMessage(msgType, msgParams);
		}
	}
}
