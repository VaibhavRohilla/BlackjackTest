import { Globals, loginData } from "../globals";
import { MessageType } from "./messagetypes";
import { LeaderboardEntry } from "./leaderboardservice";

/**
 * Handles communication with the backend WebSocket server with simplified event handling
 */
export class BackendService {
  private static instance: BackendService;
  
  private socket: WebSocket | null = null;
  private serverUrl: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000;
  private isReconnecting: boolean = false;
  private playerId: string | null = null;
  
  // Connection states
  private _isConnected: boolean = false;
  private _connectionPromiseResolve: ((value: {connected: boolean, playerId?: string}) => void) | null = null;
  private _playerDataPromiseResolve: ((value: any) => void) | null = null;
  private _authPromiseResolve: ((value: {
    success: boolean, 
    error?: string, 
    data?: {
      message: string,
      balance?: number,
      user?: {
        username: string,
        chips: number,
        userId: string
      }
    }
  }) => void) | null = null;
  
  // Server URLs to try
  private serverUrls: string[] = [
    "ws://localhost:3001",
    "ws://127.0.0.1:3001"
  ];
  
  private currentUrlIndex: number = 0;
  
  // Single message handler callback - simplified approach
  private messageHandler: ((type: string, data: any) => void) | null = null;
  
  // Array of additional message listeners that can be added and removed dynamically
  private messageListeners: ((type: string, data: any) => void)[] = [];
  
  private constructor() {
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
   * Connect to the WebSocket server
   */
  public async connect(): Promise<{connected: boolean, playerId?: string}> {
    return new Promise((resolve) => {
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
   * Register a message handler that receives all messages from backend
   */
  public setMessageHandler(handler: (type: string, data: any) => void): void {
    this.messageHandler = handler;
  }
  
  /**
   * Handle WebSocket open event
   */
  private handleSocketOpen(): void {
    console.log("WebSocket connection established");
    this._isConnected = true;
    this.reconnectAttempts = 0;

    // Send authentication with correct format
    this.sendMessage({
      type: 'authenticate',
      data: {
        loginData: loginData,
        clientId: this.playerId || 'default'
      }
    });
    
    // Request player ID
    this.sendMessage({
      type: 'REQUEST_PLAYER_ID'
    });
    
    // Resolve connection promise after a small delay
    setTimeout(() => {
      if (this._connectionPromiseResolve) {
        console.log("Resolving connection promise with basic success");
        const resolveFunc = this._connectionPromiseResolve;
        this._connectionPromiseResolve = null;
        resolveFunc({connected: true});
      }
    }, 500);
  }
  
  /**
   * Handle WebSocket message event with simplified processing
   */
  private handleSocketMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      console.log(`Received ${message.type} message with data:`, JSON.stringify(message.data));
  
      if(message.type === MessageType.START_GAME) {
        console.log("Received start game message:", message.data);
        Globals.Manager?.HandleStartGame(message.data);
      }
      if(message.type === MessageType.END_GAME) {
        console.log("Received end game message:", message.data);
        Globals.Manager?.handleGameOutcome(message.data);
      }
      // Handle authentication messages (case insensitive)
      const messageType = message.type.toLowerCase();
      if (messageType === 'auth_success' || messageType === 'auth_success') {
        if (this._authPromiseResolve) {
          const resolveFunc = this._authPromiseResolve;
          this._authPromiseResolve = null;
          resolveFunc({
            success: true, 
            data: message.data
          });
        }
      } else if (messageType === 'auth_error' || messageType === 'auth_error') {
        if (this._authPromiseResolve) {
          const resolveFunc = this._authPromiseResolve;
          this._authPromiseResolve = null;
          resolveFunc({
            success: false, 
            error: message.data?.message || "Authentication failed",
            data: message.data
          });
        }
      }
      
      // Special handling for player ID
      if (message.type === 'PLAYER_ID' && message.playerId) {
        this.playerId = message.playerId;
        console.log(`Received player ID: ${message.playerId}`);
        
        // Request player data after getting player ID
        this.sendMessage({
          type: MessageType.GET_PLAYER_DATA
        });
      }
      
      // Special handling for connection errors
      if (message.type === 'error' || message.type === 'ERROR') {
        console.error(`Server error: ${message.error || (message.data && message.data.message) || "Unknown error"}`);
      }
      
      // Forward all messages to the central handler if registered
      if (this.messageHandler) {
        this.messageHandler(message.type, message.data);
      }
      
      // Call all registered message listeners
      if (this.messageListeners.length > 0) {
        this.messageListeners.forEach(listener => {
          try {
            listener(message.type, message.data);
          } catch (listenerError) {
            console.error("Error in message listener:", listenerError);
          }
        });
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error, event.data);
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleSocketClose(event: CloseEvent): void {
    this._isConnected = false;
    console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
    
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
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error("Maximum reconnection attempts reached");
      this.isReconnecting = false;
    }
  }

  /**
   * Check if connected to the backend
   */
  public isConnectedToBackend(): boolean {
    return this._isConnected && this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /**
   * Send message to the WebSocket server with simplified format
   */
  private sendMessage(message: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Format the message to match backend expectations
      const formattedMessage = {
        type: message.type,
        data: {
          playerId: this.playerId || 'default',
          ...(message.type === 'authenticate' ? { loginData: loginData } : {}),
          ...(message.data || {})
        }
      };
      
      const messageStr = JSON.stringify(formattedMessage);
      console.log("Sending message:", formattedMessage);
      this.socket.send(messageStr);
    } else {
      console.error("Cannot send message, WebSocket is not open");
    }
  }
  
  // --- GAME ACTION METHODS ---
  
  /**
   * Place a bet
   */
  public placeBet(amount: number): void {
    this.sendMessage({
      type: MessageType.PLACE_BET,
      data: { amount }
    });
  }
  
  /**
   * Start the game with a bet amount
   */
  public startGame(betAmount: number): void {
    if (!this.isConnectedToBackend()) {
      console.error("Not connected to backend");
      return;
    }
    
    if (typeof betAmount !== 'number' || betAmount <= 0) {
      console.error("Invalid bet amount:", betAmount);
      return;
    }

    console.log(`Starting game with bet amount: ${betAmount}`);
    this.sendMessage({
      type: MessageType.START_GAME,
      data: {
        amount: betAmount,
        betAmount: betAmount  // Include both formats for compatibility
      }
    });
  }
  
  /**
   * Hit (take another card)
   */
  public hit(hand?: 'first' | 'second'): void {
    console.log(`Requesting hit${hand ? ' for ' + hand + ' hand' : ''}`);
    this.sendMessage({
      type: MessageType.HIT,
      data: hand ? { hand } : undefined
    });
  }
  
  /**
   * Stand (end turn)
   */
  public stand(hand?: 'first' | 'second'): void {
    console.log(`Requesting stand${hand ? ' for ' + hand + ' hand' : ''}`);
    this.sendMessage({
      type: MessageType.STAND,
      data: hand ? { hand } : undefined
    });
  }
  
  /**
   * Double down
   */
  public doubleDown(): void {
    console.log('Requesting double down');
    this.sendMessage({
      type: MessageType.DOUBLE_DOWN
    });
  }
  
  /**
   * Split a pair
   */
  public split(): void {
    console.log('Requesting split');
    this.sendMessage({
      type: MessageType.SPLIT
    });
  }
  
  /**
   * Take or decline insurance
   */
  public insurance(takeInsurance: boolean): void {
    console.log(`${takeInsurance ? 'Accepting' : 'Declining'} insurance`);
    this.sendMessage({
      type: MessageType.INSURANCE,
      data: { takeInsurance }
    });
  }
  
  /**
   * Surrender
   */
  public surrender(): void {
    console.log('Requesting surrender');
    this.sendMessage({
      type: MessageType.SURRENDER
    });
  }
  
  /**
   * Rebet (use same bet as last hand)
   */
  public rebet(): void {
    console.log('Requesting rebet');
    this.sendMessage({
      type: MessageType.REBET
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
        type: MessageType.GET_PLAYER_DATA
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
   * Get the current game state
   */
  public getGameState(): void {
    this.sendMessage({
      type: MessageType.GET_GAME_STATE
    });
  }

  /**
   * Add a message listener that will receive all messages from the backend
   * @param listener The listener function to add
   */
  public addMessageListener(listener: (type: string, data: any) => void): void {
    if (typeof listener !== 'function') {
      console.error("addMessageListener: listener must be a function");
      return;
    }
    // Only add if not already in the list
    if (!this.messageListeners.includes(listener)) {
      this.messageListeners.push(listener);
      console.log(`Added message listener, total listeners: ${this.messageListeners.length}`);
    }
  }
  
  /**
   * Remove a previously added message listener
   * @param listener The listener function to remove
   * @returns True if the listener was found and removed, false otherwise
   */
  public removeMessageListener(listener: (type: string, data: any) => void): boolean {
    const index = this.messageListeners.indexOf(listener);
    if (index !== -1) {
      this.messageListeners.splice(index, 1);
      console.log(`Removed message listener, remaining listeners: ${this.messageListeners.length}`);
      return true;
    }
    return false;
  }

  /**
   * Wait for authentication to complete
   * @returns Promise that resolves with authentication result
   */
  public async waitForAuthentication(): Promise<{
    success: boolean, 
    error?: string, 
    data?: {
      message: string,
      balance?: number,
      user?: {
        username: string,
        chips: number,
        userId: string
      }
    }
  }> {
    return new Promise((resolve) => {
      this._authPromiseResolve = resolve;
    });
  }

  /**
   * Get leaderboard data
   */
  public async getLeaderboard(): Promise<{
    success: boolean;
    data?: {
      entries: {
        externalLeaderboard: {
          current: {
            hourly: {
              users: LeaderboardEntry[];
              myPoints: number;
              myPrize: number;
              myTokenPrize: number | null;
              timestamp: number;
              prizePool: number;
              tokenPrizePool: number | null;
            };
            daily: {
              users: LeaderboardEntry[];
              myPoints: number;
              myPrize: number;
              myTokenPrize: number | null;
              timestamp: number;
              prizePool: number;
              tokenPrizePool: number | null;
            };
            weekly: {
              users: LeaderboardEntry[];
              myPoints: number;
              myPrize: number;
              myTokenPrize: number | null;
              timestamp: number;
              prizePool: number;
              tokenPrizePool: number | null;
            };
          };
          previous: {
            hourly: {
              users: LeaderboardEntry[];
              myPoints: number;
              myPrize: number;
              myTokenPrize: number | null;
              timestamp: number;
              prizePool: number;
              tokenPrizePool: number | null;
            };
            daily: {
              users: LeaderboardEntry[];
              myPoints: number;
              myPrize: number;
              myTokenPrize: number | null;
              timestamp: number;
              prizePool: number;
              tokenPrizePool: number | null;
            };
            weekly: {
              users: LeaderboardEntry[];
              myPoints: number;
              myPrize: number;
              myTokenPrize: number | null;
              timestamp: number;
              prizePool: number;
              tokenPrizePool: number | null;
            };
          };
        };
      };
    };
    error?: string;
  }> {
    return new Promise((resolve) => {
      // Format the message to match backend expectations
      const message = {
        type: MessageType.GET_LEADERBOARD,
        data: {
          playerId: this.playerId || 'default'
        }
      };
      
      console.log('Sending leaderboard request:', JSON.stringify(message, null, 2));
      this.sendMessage(message);

      // Set up a one-time listener for the leaderboard response
      const listener = (type: string, data: any) => {
        if (type === MessageType.LEADERBOARD_DATA) {
          console.log('Received leaderboard data:', JSON.stringify(data, null, 2));
          this.removeMessageListener(listener);
          resolve({
            success: true,
            data: data
          });
        }
      };

      this.addMessageListener(listener);

      // Set timeout for the request
      setTimeout(() => {
        console.error('Leaderboard request timed out');
        this.removeMessageListener(listener);
        resolve({
          success: false,
          error: 'Leaderboard request timed out'
        });
      }, 5000);
    });
  }
} 