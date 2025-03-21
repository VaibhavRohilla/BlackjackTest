import { Application } from "pixi.js";
import { calculateScaleFactor } from "./appconfig";
import { SceneManager } from "./scenemanager";
import { MyEmitter } from "./myemitter";
import { Globals } from "./globals";
import { Loader } from "./loader";
import { MainScene } from "./mainscene";
import * as TWEEN from '@tweenjs/tween.js';

export class App {
	app: Application = new Application();

	constructor() {
		(async () => {
			// Create a new application
			await this.app.init({
				backgroundColor: 0x191c28,
				resolution: window.devicePixelRatio || 1,
				autoDensity: true,
				antialias: true,
				width: window.innerWidth,
				height: window.innerHeight,
			});

			this.setupCanvas();
			this.initializeGame();
		})();
	}

	private setupCanvas(): void {
		const canvas = this.app.canvas;
		
		// Prevent default behaviors
		canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
		canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
		canvas.addEventListener('contextmenu', (e) => e.preventDefault());

		// Add canvas to body
		document.body.appendChild(canvas);

		// Setup resize handler
		this.setupResizeHandler();
	}

	private setupResizeHandler(): void {
		const resizeHandler = () => {
			const width = window.innerWidth;
			const height = window.innerHeight;

			// Update scale factor
			calculateScaleFactor();
			
			// Update renderer
			this.app.renderer.resolution = window.devicePixelRatio || 1;
			this.app.renderer.resize(width, height);
			
			// Ensure canvas is properly sized and positioned
			const canvas = this.app.canvas;
			canvas.style.position = 'absolute';
			canvas.style.top = '50%';
			canvas.style.left = '50%';
			canvas.style.transform = 'translate(-50%, -50%)';
			
			// Update scene
			SceneManager.instance?.resize();
		};

		window.addEventListener('resize', resizeHandler);
		window.addEventListener('orientationchange', resizeHandler);
		resizeHandler(); // Initial call
	}

	private initializeGame(): void {
		// Initialize game systems
		Globals.emitter = new MyEmitter();
		new SceneManager();
		Globals.app = this; // Store reference to App in Globals

		// Setup stage
		this.app.stage.addChild(SceneManager.instance.container);
		this.app.ticker.add((dt) => {
			// Update scene
			SceneManager.instance!.update(dt.deltaTime);
			
			// Update TWEEN animations
			TWEEN.update();
		});

		// Initialize loader
			const loader = new Loader();
			this.app.stage.addChild(loader);
		
		// Force a render to ensure the loading screen is displayed
		this.app.renderer.render(this.app.stage);
		
		// Start loading assets after a short delay to ensure loading screen is visible
		setTimeout(() => {
			loader.preload().then(() => {
				loader.preloadSounds(() => {
					console.log("Preload Done");
					SceneManager.instance!.start(new MainScene());
					window.dispatchEvent(new Event('resize'));
				});
			});
		}, 100);

		// Setup visibility change handler
		this.setupVisibilityHandler();
	}

	private setupVisibilityHandler(): void {
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) {
				Globals.emitter?.Call("pause");
			} else {
				Globals.emitter?.Call("resume");
			}
		});
	}
}
