import * as PIXI from "pixi.js";
import TWEEN, { Group } from "@tweenjs/tween.js";
import { Globals } from "./Globals";
import { Scene } from "./Scene";
import { log } from "node:console";

export class SceneManager {


    static instance: SceneManager;

    container!: PIXI.Container;
    scene: Scene | null = null;
    tweenGroup : Group = new Group();

    constructor() {
		if (SceneManager.instance != undefined) {
			console.log("SceneManager already created!");
			return;
		}

		SceneManager.instance = this;
		Globals.SceneManager =  SceneManager.instance;
		this.container = new PIXI.Container();
		this.scene = null;
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
