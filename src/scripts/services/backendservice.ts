import { Globals } from "../globals";
import { MessageType } from "./messagetypes";

/**
 * Handles communication with the backend WebSocket server
 */
export class BackendService {
  private static instance: BackendService;
  
  private socket: WebSocket | null = null;
  private serverUrl: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000;
  private isReconnecting: boolean = false;
  private lastSentAction: string = '';
  private playerId: string | null = null;
  
  // Connection states
  private _isConnected: boolean = false;
  private _connectionPromiseResolve: ((value: {connected: boolean, playerId?: string}) => void) | null = null;
  private _playerDataPromiseResolve: ((value: any) => void) | null = null;
  
  // Backend server URLs to try
  private serverUrls: string[] = [
    "ws://localhost:3001",
    "ws://127.0.0.1:3001"
  ];
  
  private currentUrlIndex: number = 0;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 3;

  // Callback handlers
  private onConnectionStatusChanged: ((status: { connected: boolean }) => void) | null = null;
  private onPlayerDataUpdated: ((data: any) => void) | null = null;
  private onGameStateUpdated: ((state: any) => void) | null = null;
  private onActionResult: ((result: any) => void) | null = null;
  private onServerError: ((error: { message: string, code: string }) => void) | null = null;
  private onReconnected: (() => void) | null = null;
  
  private constructor() {
    // Try to get the server URL from environment or use default
    // this.serverUrl = process.env.BACKEND_WS_URL || 'ws://localhost:3000';
    this.serverUrl = 'ws://localhost:3001';
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): BackendService {
    if (!BackendService.instance) {
      BackendService.instance = new BackendService();
    }
    return BackendService.instance;
  }
  
  /**
   * Get the current server URL
   */
  public getServerUrl(): string {
    return this.serverUrls[this.currentUrlIndex];
  }
  
  /**
   * Connect to the WebSocket server
   * @returns Promise that resolves with connection status and player ID
   */
  public async connect(): Promise<{connected: boolean, playerId?: string}> {
    return new Promise((resolve) => {
      // Store the promise resolve function to call when connection completes
      this._connectionPromiseResolve = resolve;
      
      console.log(`Connecting to WebSocket server at ${this.serverUrl}`);
      
      // Close existing connection if any
        if (this.socket) {
          this.socket.close();
          this.socket = null;
        }
        
      try {
        // Create new WebSocket connection
        this.socket = new WebSocket(this.serverUrl);
        
        // Set up event handlers
        this.socket.onopen = this.handleSocketOpen.bind(this);
        this.socket.onmessage = this.handleSocketMessage.bind(this);
        this.socket.onclose = this.handleSocketClose.bind(this);
        this.socket.onerror = this.handleSocketError.bind(this);
        
        // Set up connection timeout
        setTimeout(() => {
          if (!this._isConnected && this._connectionPromiseResolve) {
            console.error("WebSocket connection timed out");
            const resolveFunc = this._connectionPromiseResolve;
            this._connectionPromiseResolve = null;
            resolveFunc({connected: false});
          }
        }, 10000);
      } catch (error) {
        console.error("Error creating WebSocket connection:", error);
        if (this._connectionPromiseResolve) {
          const resolveFunc = this._connectionPromiseResolve;
          this._connectionPromiseResolve = null;
          resolveFunc({connected: false});
        }
      }
    });
  }
  
  /**
   * Get player data including balance
   * @returns Promise that resolves with player data
   */
  public async getPlayerData(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.isConnectedToBackend()) {
        reject(new Error("Not connected to backend"));
        return;
      }
      
      this._playerDataPromiseResolve = resolve;
      
      // Request player data from server
      this.sendMessage({
        type: 'GET_PLAYER_DATA',
        playerId: this.playerId || 'default'
      });
      
      // Set timeout for player data request
      setTimeout(() => {
        if (this._playerDataPromiseResolve) {
          console.error("Player data request timed out");
          const resolveFunc = this._playerDataPromiseResolve;
          this._playerDataPromiseResolve = null;
          // Resolve with default data on timeout
          resolveFunc({balance: 1000});
        }
      }, 5000);
    });
  }
  
  /**
   * Handle WebSocket open event
   */
  private handleSocketOpen(): void {
    console.log("WebSocket connection established");
    this._isConnected = true;
    this.reconnectAttempts = 0;
    // Request player ID - using the expected format
    this.sendMessage({
      type: 'REQUEST_PLAYER_ID'
    });
    
    // If we already have a connection promise waiting, resolve it with basic success
    // The full player ID will come later in the handlePlayerIdMessage
    if (this._connectionPromiseResolve) {
            setTimeout(() => {
        if (this._connectionPromiseResolve) {
          console.log("Resolving connection promise with basic success");
          const resolveFunc = this._connectionPromiseResolve;
          this._connectionPromiseResolve = null;
          resolveFunc({connected: true});
        }
      }, 500);
    }
  }
  
  /**
   * Handle WebSocket message event
   */
  private handleSocketMessage(event: MessageEvent): void {
    try {
        const message = JSON.parse(event.data);
        console.log("Recived " + message.type + " message with data: " + JSON.stringify(message.data));

        
        // Handle error messages first - error format seems to be different
        if (message.type === "error") {
            // This handles the specific format from the error: {"type":"error","data":{"message":"Invalid message format"},"error":"Invalid message format"}
            this.handleErrorMessage({
                error: message.error || (message.data && message.data.message) || "Unknown error",
                code: message.code || (message.data && message.data.code) || "ERROR"
            });
            return;
        }
        
        // Handle different message types
        switch (message.type) {
            case 'PLAYER_ID':
                this.handlePlayerIdMessage(message);
                break;
                
            case 'PLAYER_DATA':
                this.handlePlayerDataMessage(message);
                break;
                
            case MessageType.START_GAME:
                Globals.Manager?.HandleStartGame(message.data);
                break;

            case MessageType.CARD_DEALT:
                Globals.Manager?.recveiveBackendMessages(message.type, message.data);
                break;

            case MessageType.HAND_UPDATED:
                // Handle card dealt message
                if (message.data && Globals.Manager) {
                    const cardData = message.data;
                    Globals.Manager.recveiveBackendMessages(message.type, cardData);
                }
                break;
            case MessageType.GAME_OUTCOME:
              Globals.Manager?.recveiveBackendMessages(message.type, message.data);
                break;

            case MessageType.DOUBLE_DOWN:
                Globals.Manager?.recveiveBackendMessages(message.type, message.data);
                break;
                
            case 'ERROR':
                this.handleErrorMessage(message);
                break;
                
            default:
                // Forward message data to appropriate callback if exists
                if (message.data && this.onGameStateUpdated) {
                    this.onGameStateUpdated(message.data);
                }
                break;
        }
        
      } catch (error) {
        console.error("Error parsing WebSocket message:", error, event.data);
        
        if (this.onServerError) {
            this.onServerError({
                message: `Invalid message format: ${typeof event.data === 'string' ? event.data.substring(0, 100) : 'Unknown'}...`,
                code: "PARSE_ERROR"
            });
        }
    }
  }
  
  /**
   * Handle player ID message
   */
  private handlePlayerIdMessage(message: any): void {
    if (message.playerId) {
      console.log(`Received player ID: ${message.playerId}`);
      this.playerId = message.playerId;
      
      // Resolve the connection promise with connected status and player ID
      if (this._connectionPromiseResolve) {
        const resolveFunc = this._connectionPromiseResolve;
        this._connectionPromiseResolve = null;
        resolveFunc({connected: true, playerId: message.playerId});
      }
      
      // Request player data after getting player ID
      this.sendMessage({
        type: MessageType.GET_PLAYER_DATA
      });
    }
  }
  
  /**
   * Handle player data message
   */
  private handlePlayerDataMessage(message: any): void {
    if (message.data) {
      
      // Resolve the player data promise
      if (this._playerDataPromiseResolve) {
        const resolveFunc = this._playerDataPromiseResolve;
        this._playerDataPromiseResolve = null;
        resolveFunc(message.data);
      }
      
      // Emit player data event
      if (this.onPlayerDataUpdated) {
        this.onPlayerDataUpdated(message.data);
      }
    }
  }
 
  
  /**
   * Handle action result message
   */
  private handleActionResultMessage(message: any): void {
    // Emit action result event
    if (this.onActionResult) {
      this.onActionResult({
        action: this.lastSentAction,
        success: message.success,
        message: message.message,
        data: message.data
      });
    }
  }
  
  /**
   * Handle error message
   */
  private handleErrorMessage(message: any): void {
    const errorMessage = message.error || 
                         (message.data && message.data.message) || 
                         "Unknown server error";
    
    const errorCode = message.code || 
                     (message.data && message.data.code) || 
                     "ERROR";
    
    console.error(`Server error (${errorCode}):`, errorMessage);
    
    // Emit error event
    if (this.onServerError) {
      this.onServerError({
        message: errorMessage,
        code: errorCode
      });
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleSocketClose(event: CloseEvent): void {
    this._isConnected = false;
    console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
    
    // Notify listeners of disconnection
    if (this.onConnectionStatusChanged) {
      this.onConnectionStatusChanged({ connected: false });
    }
    
    // Attempt to reconnect if not deliberately closed
    if (!this.isReconnecting && event.code !== 1000) {
      this.attemptReconnect();
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleSocketError(event: Event): void {
    console.error("WebSocket error:", event);
    
    // If we have a connection promise waiting, resolve it with failure
    if (this._connectionPromiseResolve) {
      const resolveFunc = this._connectionPromiseResolve;
      this._connectionPromiseResolve = null;
      resolveFunc({connected: false});
    }
  }

  /**
   * Attempt to reconnect to the WebSocket server
   */
  private attemptReconnect(): void {
    if (this.isReconnecting) return;
    
    this.isReconnecting = true;
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.isReconnecting = false;
        this.connect().then(result => {
          // Notify of successful reconnection
          if (result.connected && this.onReconnected) {
            this.onReconnected();
          }
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error("Maximum reconnection attempts reached");
      this.isReconnecting = false;
    }
  }

  /**
   * Check if connected to the backend
   * @returns Whether connected to the backend
   */
  public isConnectedToBackend(): boolean {
    return this._isConnected && this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /**
   * Setter methods for callbacks
   */
  public setConnectionStatusCallback(callback: (status: { connected: boolean }) => void): void {
    this.onConnectionStatusChanged = callback;
  }

  public setPlayerDataCallback(callback: (data: any) => void): void {
    this.onPlayerDataUpdated = callback;
  }

  public setGameStateCallback(callback: (state: any) => void): void {
    this.onGameStateUpdated = callback;
  }

  public setActionResultCallback(callback: (result: any) => void): void {
    this.onActionResult = callback;
  }

  public setServerErrorCallback(callback: (error: { message: string, code: string }) => void): void {
    this.onServerError = callback;
  }

  public setReconnectedCallback(callback: () => void): void {
    this.onReconnected = callback;
  }

  /**
   * Remove callback methods
   */
  public removeConnectionStatusCallback(): void {
    this.onConnectionStatusChanged = null;
  }

  public removePlayerDataCallback(): void {
    this.onPlayerDataUpdated = null;
  }

  public removeGameStateCallback(): void {
    this.onGameStateUpdated = null;
  }

  public removeActionResultCallback(): void {
    this.onActionResult = null;
  }

  public removeServerErrorCallback(): void {
    this.onServerError = null;
  }

  public removeReconnectedCallback(): void {
    this.onReconnected = null;
  }

  /**
   * Send message to the WebSocket server
   * @param message Message to send
   */
  private sendMessage(message: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Format the message to match backend expectations from GameSession.ts
        const formattedMessage = {
            type: message.type,
            // Make sure we always include a data object with the format expected by GameSession.handleAction
            data: {
                playerId: this.playerId || 'default',
                ...(message.action ? { action: message.action } : {}),
                // Extract all other properties except type and explicitly handled ones
                ...Object.keys(message)
                    .filter(key => key !== 'type' && key !== 'playerId' && key !== 'data')
                    .reduce((acc, key) => ({ ...acc, [key]: message[key] }), {}),
                // If there's a nested data object, spread it as well
                ...(message.data || {})
            }
        };
        
        const messageStr = JSON.stringify(formattedMessage);
        console.log("Sending message:", formattedMessage);
        this.socket.send(messageStr);
        
        // Track last sent action for action_result event handling
        if (message.action) {
            this.lastSentAction = message.action;
        } else if (message.type) {
            this.lastSentAction = message.type.toString();
        }
    } else {
        console.error("Cannot send message, WebSocket is not open");
    }
  }
  
  /**
   * Get new game from server
   */
  public getNewGame(): void {
    console.log('Getting new game from server');
    this.sendMessage({
      type: MessageType.CREATE_SESSION // Kept for backward compatibility
    });
  }
  
  /**
   * Get the current game state
   */
  public getGameState(): void {
    this.sendMessage({
        type: MessageType.GET_GAME_STATE
    });
  }
  
  /**
   * Place a bet
   * @param amount Bet amount
   */
  public placeBet(amount: number): void {
    this.sendMessage({
        type: MessageType.PLACE_BET,
        data: { 
            amount: amount 
        }
    });
  }
  
  /**
   * Deal cards to start the game
   */
  public dealCards(): void {
    console.log('Backend service: dealing cards');
    this.sendMessage({
        type: MessageType.DEAL_CARDS
    });
  }
  
  /**
   * Hit (take another card)
   * @param hand Optional hand identifier for split hands ('first' or 'second')
   */
  public hit(hand?: 'first' | 'second'): void {
    console.log(`Backend service: requesting hit${hand ? ' for ' + hand + ' hand' : ''}`);
    this.sendMessage({
        type: MessageType.HIT,
        data: hand ? { hand } : undefined
    });
  }
  
  /**
   * Stand (end turn)
   * @param hand Optional hand identifier for split hands ('first' or 'second')
   */
  public stand(hand?: 'first' | 'second'): void {
    console.log(`Backend service: requesting stand${hand ? ' for ' + hand + ' hand' : ''}`);
    this.sendMessage({
        type: MessageType.STAND,
        data: hand ? { hand } : undefined
    });
  }
  
  /**
   * Double down
   */
  public doubleDown(): void {
    console.log('Backend service: requesting double down');
    this.sendMessage({
        type: MessageType.DOUBLE_DOWN
    });
  }
  
  /**
   * Split a pair
   */
  public split(): void {
    console.log('Backend service: requesting split');
    this.sendMessage({
        type: MessageType.SPLIT
    });
  }
  
  /**
   * Take or decline insurance
   * @param takeInsurance Whether to take insurance
   */
  public insurance(takeInsurance: boolean): void {
    console.log(`Backend service: ${takeInsurance ? 'accepting' : 'declining'} insurance`);
    this.sendMessage({
        type: MessageType.INSURANCE,
        data: { 
            takeInsurance: takeInsurance 
        }
    });
  }
  
  /**
   * Surrender
   */
  public surrender(): void {
    console.log('Backend service: requesting surrender');
    this.sendMessage({
        type: MessageType.SURRENDER
    });
  }
  
  /**
   * Rebet (use same bet as last hand)
   */
  public rebet(): void {
    console.log('Backend service: requesting rebet');
    this.sendMessage({
        type: MessageType.REBET
    });
  }
  
  /**
   * Clear bet
   */
  public clearBet(): void {
    console.log('Backend service: clearing bet');
    this.sendMessage({
        type: MessageType.CLEAR_BET
    });
  }
  
  /**
   * Return to betting phase
   */
  public returnToBettingPhase(): void {
    console.log('Backend service: returning to betting phase');
    this.sendMessage({
        type: MessageType.RETURN_TO_BETTING
    });
  }

  /**
   * Start the game with a bet amount
   * @param betAmount The amount to bet
   */
  public startGame(betAmount: number): void {
    if (!this.isConnectedToBackend()) {
      console.error("Not connected to backend");
      return;
    }

    this.sendMessage({
      type: MessageType.START_GAME,
      data: { amount: betAmount }
    });
  }

  /**
   * Handle player actions
   * @param action The action to perform (hit, stand, etc.)
   * @param hand Optional hand identifier for split hands ('first' or 'second')
   */
  public handlePlayerAction(action: 'hit' | 'stand' | 'double_down' | 'split' | 'surrender', hand?: 'first' | 'second'): void {
    if (!this.isConnectedToBackend()) {
      console.error("Not connected to backend");
      return;
    }

    switch (action) {
      case 'hit':
        this.hit(hand);
        break;
      case 'stand':
        this.stand(hand);
        break;
      case 'double_down':
        this.doubleDown();
        break;
      case 'split':
        this.split();
        break;
      case 'surrender':
        this.surrender();
        break;
      default:
        console.error("Invalid action");
    }
  }
} 