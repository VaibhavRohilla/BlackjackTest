import { Application } from "pixi.js";
import { calculateScaleFactor } from "./appconfig";
import { SceneManager } from "./scenemanager";
import { MyEmitter } from "./myemitter";
import { Globals } from "./globals";
import { Loader } from "./loader";
import { MainScene } from "./mainscene";
import { BackendService } from "./services/backendservice";
import * as TWEEN from '@tweenjs/tween.js';

export class App {
	app: Application = new Application();
	backendService: BackendService = BackendService.getInstance();
	private connectionAttempts: number = 0;
	private maxConnectionAttempts: number = 3;
	private connectionRetryDelay: number = 2000; // ms

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

	private async initializeGame(): Promise<void> {
		// Initialize game systems
		Globals.emitter = new MyEmitter();
		new SceneManager();
		Globals.app = this; // Store reference to App in Globals
		Globals.backendService = this.backendService; // Store reference to BackendService in Globals

		// Setup stage
		this.app.stage.addChild(SceneManager.instance.container);
		this.app.ticker.add((dt) => {
			// Update scene
			SceneManager.instance!.update(dt.deltaTime);
			
		});

		// Initialize loader
		const loader = new Loader();
		this.app.stage.addChild(loader);
		
		// Force a render to ensure the loading screen is displayed
		this.app.renderer.render(this.app.stage);
		
		// Start loading assets after a short delay to ensure loading screen is visible
		setTimeout(async () => {
			try {
				// Show connecting message
				this.showStatusMessage("Connecting to server...");
				
				// Try to connect using WebSocket directly
				console.log("Attempting WebSocket connection...");
				const connectionResult = await this.backendService.connect();
				
				if (!connectionResult.connected) {
					// If connection fails, show error but continue loading
					this.showStatusMessage("Failed to connect to server. Running in limited mode.", true);
					console.error("WebSocket connection failed. Continuing without backend functionality.");
					
					// Use default balance when offline
					Globals.balance = 1000;
				} else {
					this.showStatusMessage("Connected to server", 2000, true);
					
					// Wait for player balance to be retrieved
					console.log("Waiting for player balance...");
					this.showStatusMessage("Retrieving player data...");
					
					try {
						// Request player data including balance
						const playerData = await this.backendService.getPlayerData();
						
						if (playerData && playerData.balance !== undefined) {
							console.log(`Player balance received: ${playerData.balance}`);
							Globals.balance = playerData.balance;
						} else {
							console.warn("Player balance not received, using default value");
							Globals.balance = 1000;
						}
						
						this.showStatusMessage("Player data retrieved", 1000, true);
					} catch (error) {
						console.error("Error retrieving player data:", error);
						this.showStatusMessage("Error retrieving player data, using default values", true);
						Globals.balance = 1000;
					}
				}
				
				// Show loading message
				this.showStatusMessage("Loading assets...");
				
				// Load assets
				await loader.preload();
				await new Promise<void>((resolve) => {
					loader.preloadSounds(() => {
						console.log("Asset preload complete");
						resolve();
					});
				});
				
				// Start the main scene
				SceneManager.instance!.start(new MainScene());
				window.dispatchEvent(new Event('resize'));
				
			} catch (error) {
				console.error("Error during game initialization:", error);
				this.showStatusMessage("Error initializing game. Please refresh the page.", true);
			}
		}, 100);

		// Setup visibility change handler
		this.setupVisibilityHandler();
	}
	
	/**
	 * Show a status message to the user
	 * @param message The message to display
	 * @param isErrorOrDuration Either a boolean indicating if this is an error message, or a number for duration
	 * @param successOrDuration Either a boolean indicating if this is a success message, or a number for duration
	 */
	private showStatusMessage(message: string, isErrorOrDuration: boolean | number = 0, successOrDuration: boolean | number = false): void {
		let duration: number = 0;
		let success: boolean = false;
		
		// Handle overloaded parameters
		if (typeof isErrorOrDuration === 'boolean') {
			// isErrorOrDuration is a boolean (isError)
			success = !isErrorOrDuration; // If isError is true, success is false
			duration = typeof successOrDuration === 'number' ? successOrDuration : 0;
		} else {
			// isErrorOrDuration is a number (duration)
			duration = isErrorOrDuration;
			success = typeof successOrDuration === 'boolean' ? successOrDuration : false;
		}
		
		if (Globals.emitter) {
			Globals.emitter.Call("show_notification", {
				message: message,
				duration: duration,
				color: success ? 0x00AA00 : (!success ? 0xAA0000 : 0xFFFFFF)
			});
		}
	}

	private setupVisibilityHandler(): void {
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') {
				console.log('Document became visible - checking connection');
				
				// // Check if we need to reconnect
				// if (!this.backendService.isConnectedToBackend()) {
				// 	this.reconnectToBackend();
				// } else {
				// 	// Just get current game state to refresh UI
				// 	this.backendService.getGameState();
				// }
			}
		});
	}
	
	private async reconnectToBackend(): Promise<void> {
		console.log('Attempting to reconnect to backend...');
		this.showStatusMessage("Reconnecting to server...");
		
		try {
			const connected = await this.backendService.connect();
			
			if (connected) {
				console.log('Successfully reconnected to backend');
				this.showStatusMessage("Reconnected to server", 2000, true);
				
				// Get current game state
				this.backendService.getGameState();
			} else {
				console.error('Failed to reconnect to backend');
				this.showStatusMessage("Failed to reconnect to server", true);
			}
		} catch (error) {
			console.error('Error reconnecting to backend:', error);
			this.showStatusMessage("Error reconnecting to server", true);
		}
	}
}
