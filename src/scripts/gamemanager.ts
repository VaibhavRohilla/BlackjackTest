import { Easing } from "@tweenjs/tween.js";
import { Tween } from "@tweenjs/tween.js";
import { Container, Sprite, Text } from "pixi.js";
import { config } from "./appconfig";
import { BlackjackDealer } from "./blackjackdealer";
import { CenterChip } from "./centerchip";
import { Deck } from "./deck";
import { GameButtonContainer, GameButtonType } from "./gamebuttons";
import { Globals, formatBetAmount } from "./globals";
import { PopupManager, Z_INDEX } from "./popupmanager";
import { Result, GameOutcome } from "./result";
import { Table, Chips } from "./table";
import { UiContainer } from "./uicontainer";
import { ShopPopup } from "./shoppopup";
import { TextLabel } from "./textlabel";
import { Card, Hand } from "./hand";
import { CardMessage } from "../../blackjack-backend/src/models/Message";
import { log } from "node:console";

/**
 * Convert a server suit value to a valid Card suit type
 */
function convertToCardSuit(suit: string): "hearts" | "diamonds" | "clubs" | "spades" {
    switch (suit.toLowerCase()) {
        case "hearts":
            return "hearts";
        case "diamonds":
            return "diamonds";
        case "clubs":
            return "clubs";
        case "spades":
            return "spades";
        default:
            console.warn(`Unknown suit type: ${suit}, defaulting to hearts`);
            return "hearts";
    }
}

export class GameManager extends Container {
      /** Last bet amount for rebet functionality */
      lastBetAmount: number = 0;
      gameState: 'betting' | 'playing' | 'gameEnd' = 'betting';

    blackjackDealer: BlackjackDealer = new BlackjackDealer();
    deck: Deck = new Deck();
    table: Table = new Table();
    chipsZone: CenterChip = new CenterChip();
    tableText: Sprite = new Sprite();
    uiContainer: UiContainer = new UiContainer();
    result: Result = new Result();
    popupManager: PopupManager = new PopupManager();
    gameButtonsContainer: GameButtonContainer = new GameButtonContainer();

    /** Flag to track if special conditions were detected */
    private _specialConditionsDetected: boolean = false;
    
    /** Flag to track if the game is connected to the backend */
    private _isConnectedToBackend: boolean = false;

    unlockShopCallback: () => void = () => {};
    cancelShopCallBack: () => void = () => {};
    shopPopup: ShopPopup = new ShopPopup(this.unlockShopCallback, this.cancelShopCallBack);
  
    /** Connection status indicator */
    private _connectionIndicator: Container = new Container();
    private _connectionStatusIcon: Sprite = new Sprite();
    private _connectionStatusText: TextLabel = new TextLabel(0, 0, 0.5, "", 12);

    // Add a debounce property to prevent rapid clicking issues
    private _clearClickDebounce: boolean = false;
    private _pendingClearOperation: boolean = false;

    // Add a debounce property for bet clicking
    private _betClickDebounce: boolean = false;

    constructor() {
        super();
        
        // Initialize callbacks first
        this.unlockShopCallback = () => {
            console.log("Unlock shop callback triggered - unlocking premium chips");
            if (this.table) {
                this.table.unlockPremiumChips();
                // Close the shop popup after unlocking
                this.shopPopup.close();
            } else {
                console.error("Table is not initialized when trying to unlock premium chips");
            }
        };
        
        this.cancelShopCallBack = () => {
            console.log("Cancel shop callback triggered - closing shop");
            if (this.shopPopup) {
                this.shopPopup.close();
            } else {
                console.error("Shop popup is not initialized when trying to close it");
            }
        };
        
        // Now initialize components
        this.initializeComponents();
        
        // Create and set up shop popup with the callbacks
        this.shopPopup = new ShopPopup(this.unlockShopCallback, this.cancelShopCallBack);
        
        // Add to scene after all components are initialized
        this.addToScene();
        
        // Setup backend event listeners
        this.setupBackendListeners();
    }

    /**
     * Initialize all components in the proper order
     */
    initializeComponents() {
        Globals.popupManager = this.popupManager;
        
        // Initialize connection indicators properly
        this._connectionIndicator = new Container();
        this._connectionStatusIcon = new Sprite();
        this._connectionStatusText = new TextLabel(0, 0, 0.5, "", 12);
        
        // Add the connection indicator elements to the UI
        this._connectionIndicator.addChild(this._connectionStatusIcon);
        this._connectionIndicator.addChild(this._connectionStatusText);
        this._connectionStatusText.position.set(20, 0);
        this.uiContainer.addChild(this._connectionIndicator);
        
        // Update connection indicator based on current status
        this.updateConnectionIndicator(this._isConnectedToBackend);
        
        // Set up the shop button callback on the table
        this.table.setShopButtonCallback(() => {
            console.log("Shop button clicked - opening shop popup");
            if (this.shopPopup) {
                this.shopPopup.open();
            } else {
                console.error("Shop popup is not initialized when trying to open it");
            }
        });
        
        // Add hasPlayerHit method to BlackjackDealer
        if (!this.blackjackDealer.hasPlayerHit) {
            this.blackjackDealer.hasPlayerHit = function() {
                // If player has more than 2 cards, they've hit
                return this.playerHand.cards.length > 2;
            };
        }
        
        // Set up game end callback
        this.blackjackDealer.setGameEndCallback((outcome, playerValue, dealerValue) => {
            this.handleGameEnd(outcome, playerValue, dealerValue);
        });
        
        // Check if backend is available
        this._isConnectedToBackend = Globals.backendService?.isConnectedToBackend() || false;
        Globals.isOnline = this._isConnectedToBackend;
    }

    addToScene(): void {
      // Add components with proper z-index
      this.table.zIndex = Z_INDEX.TABLE;
      this.addChild(this.table);
      
      this.chipsZone.zIndex = Z_INDEX.CHIPS;
      this.addChild(this.chipsZone);
      
      this.tableText.zIndex = Z_INDEX.TABLE;
      this.addChild(this.tableText);
      
      this.uiContainer.zIndex = Z_INDEX.BUTTONS +5;
      this.addChild(this.uiContainer);
      
        this.blackjackDealer.cardContainer.zIndex = Z_INDEX.CARDS;
        this.addChild(this.blackjackDealer.cardContainer);
      
      this.table.chipsContainer.zIndex = Z_INDEX.CHIPS+1;
      this.addChild(this.table.chipsContainer);
      
      // Add popup manager with its predefined z-index
        this.addChild(this.popupManager);
      
      // Add shop popup with its predefined z-index
      this.shopPopup.zIndex = Z_INDEX.SHOP;
      this.addChild(this.shopPopup);
      
      // Add game buttons last with highest z-index
      this.gameButtonsContainer.zIndex = Z_INDEX.BUTTONS;
      this.addChild(this.gameButtonsContainer);
      
      // Enable sortable children for all containers that need it
      this.enableSortableChildren();
    }
      
  /**
   * Enable sortable children for all containers that need z-index sorting
   */
  private enableSortableChildren(): void {
    // Get access to the scene container through a child
    if (this.table.parent) {
      this.table.parent.sortableChildren = true;
    }
    
    // Also enable for other containers
    this.blackjackDealer.cardContainer.sortableChildren = true;
    this.table.sortableChildren = true;
    this.gameButtonsContainer.sortableChildren = true;
  }
    resize() {
        this.table.resize();
        this.tableText.scale.set(1*config.scaleFactor);
        this.tableText.position.set(window.innerWidth/2, this.tableText.height*1.5);
        this.chipsZone.resize();
        this.gameButtonsContainer.resize();
        this.uiContainer.resize(this.table);
        this.blackjackDealer.resize();
        this.popupManager.resize();
        // this.shopPopup.resize();
      }

    recievedMessage(msgType: string, msgParams: any) {
        // Handle incoming messages
        switch (msgType) {
            case "CallChip":
              this.addChip(msgParams);
              break;
            case "showGameButtons":
              this.gameButtonsContainer.showGameplayButtons();
              break;
            case "showBettingButtons":
              this.showBettingButtonsIfNeeded();
              break;
            case "showButton":
              if (msgParams?.type) {
                this.gameButtonsContainer.showButton(msgParams.type);
              }
              break;
            case "showButtonGroup":
              if (msgParams?.group) {
                this.gameButtonsContainer.showButtonGroup(msgParams.group);
              }
              break;
            // Handle button click events
            case "hitClicked":
              this.onHitClicked();
              break;
            case "standClicked":
              this.onStandClicked();
              break;
            case "clearClicked":
              this.onClearClicked();
              break;
            case "playOnClicked":
              this.onPlayOnClicked();
              break;
            case "playClicked":
              this.onPlayClicked();
              break;
            case "surrenderClicked":
              this.onSurrenderClicked();
              break;
            case "doubleClicked":
              this.onDoubleClicked();
              break;
            case "splitClicked":
              this.onSplitClicked();
              break;
            case "insuranceClicked":
              this.onInsuranceClicked();
              break;
            case "rebetClicked":
              this.onRebetClicked();
              break;
            case "addDoubleChip":
              // This message event is deprecated and should not be used anymore.
              // Doubling is now handled entirely in onDoubleClicked to avoid double counting
              console.log("addDoubleChip message received - this is deprecated");
              // Do NOT call this.addChip(undefined,true) here anymore
              break;
          }
      }
    onSplitClicked() {
        console.log("Split clicked");
        
        // Only allow split in playing phase
        if (this.gameState !== 'playing') {
            console.log("Cannot split - not in playing phase");
            return;
        }
        
        // Check if an action has been in progress for too long and reset if needed
        this.checkForStuckAction();
        
        // Prevent multiple concurrent actions
        if (this.blackjackDealer.actionInProgress) {
            console.log("Action already in progress, ignoring split");
            return;
        }
        
        // Check if player has enough balance to split
        if (Globals.balance < Globals.currentBet) {
            console.log("Not enough balance to split");
            return;
        }
        
        // When connected to backend, send the split action to the server
        if (this.shouldUseBackend()) {
            // Set action in progress to prevent double clicks
            this.blackjackDealer.actionInProgress = true;
            this.blackjackDealer.currentAction = 'split';
            this.blackjackDealer.actionStartTime = Date.now();
            
            // Handle split action through the backend
            this.handleGameAction('split');
            
            // Track last action for reference
            Globals.lastAction = 'split';
            
            return;
        }
        
      
    }
    

    addChip(chipData : any, addDouble : boolean = false, forRebet: boolean = false) {

        if(addDouble)
        {   
          this.chipsZone.investedChips.forEach(Element => {
            const chip = this.createChip({texture:Element.texture,value:Element.value});
        // Animate the chip from the table to the betting area
        this.animateChipToBettingArea(chip);
        
        // Add the chip to the scene
        this.chipsZone.addChip(chip);
        chip.zIndex = Z_INDEX.CHIPS;
        this.addChild(chip);
        
        // Update UI with the chip value - use forRebet flag to prevent double counting
            this.updateUIAfterAddingChip(chip.value, forRebet);
          });
          return;
        }
      
        // Create the chip
        const chip = this.createChip(chipData);
        
        // Animate the chip from the table to the betting area
        this.animateChipToBettingArea(chip);
        
        // Add the chip to the scene
        this.chipsZone.addChip(chip);
        chip.zIndex = Z_INDEX.CHIPS;
        this.addChild(chip);
        
        // Update UI with the chip value - use forRebet flag to prevent double counting
        this.updateUIAfterAddingChip(chipData.value, forRebet);
      }
      /**
   * Update UI after adding a chip
   * @param chipValue - The value of the chip that was added
   * @param forRebet - Whether this is for a rebet operation (to avoid double counting)
   */
  private updateUIAfterAddingChip(chipValue: number, forRebet: boolean = false): void {
    // Skip UI updates during clear operations
    if (this._pendingClearOperation) {
      console.log("Clear in progress, skipping UI update");
      return;
    }

    console.log("Updating UI after adding chip:", chipValue, forRebet ? "(for rebet)" : "");
 
    // Update current bet only if not a rebet operation
    if (!forRebet) {
      Globals.currentBet += chipValue;
    }
    
    // Update balance display
    this.uiContainer.updateBalance();
    
    // Update bet amount display with formatted amount
    const formattedBet = formatBetAmount(Globals.currentBet);
    
    // Always update bet holder if there's a bet
    if (Globals.currentBet > 0) {
      // If not visible, show it with animation
      if (!this.chipsZone.betHolder.visible) {
        console.log("Making bet holder visible with new bet");
        this.chipsZone.showBetDisplay(Globals.currentBet);
      } else {
        // If already visible, just update the text
        this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formattedBet} Chips`);
      }
      
      // Ensure game state is set to betting
      if (this.gameState !== 'betting') {
        this.gameState = 'betting';
      }
      
      // Ensure betting buttons are shown (using direct method to avoid conflicts)
      if (!this._pendingClearOperation) {
         this.showBettingButtonsIfNeeded();
      }
    } else {
      // If bet is zero, hide the bet holder
      this.chipsZone.betHolder.isVisible(false);
    }
  }
    onHitClicked() {
        console.log("Hit clicked");
        
        // Verify the game is in the playing state
        if (this.gameState !== "playing") {
            console.log("Cannot hit: game not in playing state");
            return;
        }
        
        // Check if an action has been in progress for too long and reset if needed
        this.checkForStuckAction();
        
        // Prevent multiple concurrent actions
        if (this.blackjackDealer.actionInProgress) {
            console.log("Action already in progress, ignoring hit");
            return;
        }
        
        // Get the active split hand if in split mode
        const activeSplitHand = this.blackjackDealer.getActiveSplitHand();
        
        // When connected to backend, send the hit action to the server
        if (this.shouldUseBackend()) {
            // Set action in progress to prevent double clicks
            this.blackjackDealer.actionInProgress = true;
            this.blackjackDealer.currentAction = 'hit';
            this.blackjackDealer.actionStartTime = Date.now();
            
            // Hide double and split buttons after hit
            this.gameButtonsContainer.hideDoubleButton();
            this.gameButtonsContainer.hideSplitButton();
            
            // Handle hit action through the backend
            this.handleGameAction('hit', { hand: activeSplitHand });
            
            // Track last action for reference
            Globals.lastAction = 'hit';
            
            return;
        }
        
        // Fallback local implementation
        try {
            this.blackjackDealer.actionInProgress = true;
            this.blackjackDealer.currentAction = 'hit';
            this.blackjackDealer.actionStartTime = Date.now();
            
            // Hide double and split buttons after hit
            this.gameButtonsContainer.hideDoubleButton();
            this.gameButtonsContainer.hideSplitButton();
            
            // In split mode, hit the active hand
            if (activeSplitHand) {
                this.blackjackDealer.playerHitSplitHand(activeSplitHand);
            } else {
                // Regular hit
                this.blackjackDealer.playerHit();
            }
        } finally {
            // End the action after a delay
            setTimeout(() => {
                this.blackjackDealer.actionInProgress = false;
                this.blackjackDealer.currentAction = '';
                this.blackjackDealer.actionStartTime = 0;
            }, 500);
        }
    }
    
    /**
     * Check player's hand after a hit to determine next actions
     */
    private checkPlayerHandAfterHit(): void {
        const playerHand = this.blackjackDealer.playerHand;
        
        // If player has exactly 21, disable hit button
        if (playerHand.value === 21) {
            console.log("Player has 21, showing stand-only buttons");
            // Only show the stand button
            this.gameButtonsContainer.showGameplayAfter21Buttons();
        } else if (playerHand.value > 21) {
            // If player busted, game will end automatically through BlackjackDealer
            console.log("Player busted with value: " + playerHand.value);
            // Hide all buttons - no action possible
            this.gameButtonsContainer.hideAllButtons();
        } else {
            // Player can continue playing but can't double anymore
            console.log("Player hit, showing gameplayAfterHit buttons");
            // Just show hit and stand (no double, surrender, etc)
            this.gameButtonsContainer.showButtonGroup('gameplayAfterHit');
            
            // IMPORTANT: Don't call showGameButtons('gameplay') here or anywhere else 
            // from this method as it causes multiple button groups to show in sequence
        }
    }
      /**
   * Create a new chip
   * @param chipData - Data for the chip to create
   * @returns The created chip
   */
  private createChip(chipData: any): Chips {
    const chip = new Chips(chipData.texture, chipData.value);
    chip.interactive = false;
    return chip;
  }
    
    onStandClicked() {
        console.log("Stand clicked");
        
        // Verify the game is in the playing state
        if (this.gameState !== "playing") {
            console.log("Cannot stand: game not in playing state");
            return;
        }
        
        // Check if an action has been in progress for too long and reset if needed
        this.checkForStuckAction();
        
        // Prevent multiple concurrent actions
        if (this.blackjackDealer.actionInProgress) {
            console.log("Action already in progress, ignoring stand");
            return;
        }
        
        // Get the active split hand if in split mode
        const activeSplitHand = this.blackjackDealer.getActiveSplitHand();
        
            // Set action in progress to prevent double clicks
            this.blackjackDealer.actionInProgress = true;
            this.blackjackDealer.currentAction = 'stand';
            this.blackjackDealer.actionStartTime = Date.now();
            
            // Hide all gameplay buttons during processing
            this.gameButtonsContainer.hideAllButtons();
            
            // Handle stand action through the backend
            this.handleGameAction('stand', { hand: activeSplitHand });
            
            // Track last action for reference
            Globals.lastAction = 'stand';
            
            return;
        
      
    }

      onClearClicked() {
        console.log("Clear clicked");
        
        // Debounce to prevent rapid clicking issues
        if (this._clearClickDebounce || this._pendingClearOperation) {
            console.log("Clear operation in progress, ignoring click");
            return;
        }
        
        // Only allow clear in betting phase
        if (this.gameState !== 'betting') {
            console.log("Cannot clear - not in betting phase");
            return;
        }
        
        // If there's no bet to clear, do nothing
        if (Globals.currentBet <= 0 || this.chipsZone.investedChips.length === 0) {
            console.log("No bet to clear");
            return;
        }
        
        // Set debounce flag to prevent rapid clicking
        this._clearClickDebounce = true;
        this._pendingClearOperation = true;
        
        // Store current bet amount for proper return to balance
        const currentBet = Globals.currentBet;
        
        // Update balance and clear bet amount immediately
        Globals.balance += currentBet;
        Globals.currentBet = 0;
        this.uiContainer.updateBalance(Globals.balance);
        
        // When connected to backend, send the clear action to the server
        if (this.shouldUseBackend()) {
            // Set action in progress to prevent double clicks
            this.blackjackDealer.actionInProgress = true;
            this.blackjackDealer.currentAction = 'clearBet';
            
            // Prevent further betting during clear operation
            this.table.makeButtonsActive(false);
            
            // First save current chips as "remove chips" to animate them
            this.chipsZone.removeChips = [...this.chipsZone.investedChips];
            
            // Hide betting buttons during animation
            this.gameButtonsContainer.hideAllButtons();
            
            // Handle clear action through the backend
            this.handleGameAction('clearBet');
            
            // Animate the chips flying out and fade out bet holder
            this.chipsZone.tweenChipsOut(() => {
                // Reset display after animation completes
                this.chipsZone.clearChips();
                
                // End the action
                this.blackjackDealer.actionInProgress = false;
                this.blackjackDealer.currentAction = '';
                this.blackjackDealer.actionStartTime = 0;
                
                // Update UI - bet text already cleared
                this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");
                
                // Make sure bet holder is hidden
                this.chipsZone.betHolder.isVisible(false);
                
                // Re-enable chip buttons after a short delay
                setTimeout(() => {
                    this.table.makeButtonsActive(true);
                    
                    // Reset debounce flag after operation completes
                    this._clearClickDebounce = false;
                    this._pendingClearOperation = false;
                }, 200);
            }, true); // true to hide bet holder after animation
            
            // Safety timeout to ensure UI state is restored even if animation fails
            setTimeout(() => {
                if (this._pendingClearOperation) {
                    console.log("Clear operation safety timeout triggered");
                    this._clearClickDebounce = false;
                    this._pendingClearOperation = false;
                    this.table.makeButtonsActive(true);
                    this.chipsZone.betHolder.isVisible(false);
                }
            }, 2000);
            
            return;
        }
        
        // Fallback to local implementation
        // Prevent further betting during clear operation
        this.table.makeButtonsActive(false);
        
        // Hide betting buttons during animation
        this.gameButtonsContainer.hideAllButtons();
        
        // Save current chips to remove chips for animation
        this.chipsZone.removeChips = [...this.chipsZone.investedChips];
        
        // Animate chips flying away
        this.chipsZone.tweenChipsOut(() => {
            // Reset display after animation completes
            this.chipsZone.clearChips();
            
            // Update UI - text already updated above
            this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");
            
            // Hide bet holder
            this.chipsZone.betHolder.isVisible(false);
            
            // Re-enable chip buttons after a short delay
            setTimeout(() => {
                this.table.makeButtonsActive(true);
                
                // Reset debounce flags
                this._clearClickDebounce = false;
                this._pendingClearOperation = false;
            }, 200);
        }, true);
        
        // Safety timeout to ensure UI state is restored even if animation fails
        setTimeout(() => {
            if (this._pendingClearOperation) {
                console.log("Clear operation safety timeout triggered");
                this._clearClickDebounce = false;
                this._pendingClearOperation = false;
                this.table.makeButtonsActive(true);
                this.chipsZone.betHolder.isVisible(false);
            }
        }, 2000);
    }
      

    /**
     * Handle when the player clicks the Play button
     * This transitions the game from Betting phase to GameInProgress phase
     */
    onPlayClicked() {
        console.log("Play clicked - Starting game");
        
        // Phase validation: Only allow starting the game from the betting phase
        if (this.gameState !== 'betting') {
            console.log("Cannot start game: not in betting state");
            Globals.emitter?.Call("show_notification", {
                message: "Game already in progress",
                duration: 1500,
                color: 0xDD0000
            });
            return;
        }
        
        // Bet validation: Ensure a bet has been placed
        if (Globals.currentBet <= 0) {
            console.log("Cannot start game: no bet placed");
            Globals.emitter?.Call("show_notification", {
                message: "Please place a bet first",
                duration: 1500,
                color: 0xDD0000
            });
            return;
        }
        
        // PHASE TRANSITION: Betting → GameInProgress
        
        // 1. Set UI state to indicate transition
        this.gameButtonsContainer.hideAllButtons();
        
        // 2. Show loading indicator
        Globals.emitter?.Call("show_notification", {
            message: "Starting game...",
            duration: 1500,
            color: 0xFFFFFF
        });
        
        // 3. Send bet to backend
        this.handleGameAction('bet', { amount: Globals.currentBet });
        
        // 4. Start the game by dealing cards through backend
        this.handleGameAction('deal');
        
        // 5. Animate chips down and update UI state
        this.table.makeButtonsActive(false);
        this.table.animateChipsDown();
        
        // 6. Update game state
        this.gameState = 'playing';
        
        console.log("Game started - Phase transitioned to GameInProgress");
    }
    onSurrenderClicked() {
        console.log("Surrender clicked");
        
        // Only allow surrender in playing phase
        if (this.gameState !== 'playing') {
            console.log("Cannot surrender - not in playing phase");
            return;
        }
        
        // Check if an action has been in progress for too long and reset if needed
        this.checkForStuckAction();
        
        // Prevent multiple concurrent actions
        if (this.blackjackDealer.actionInProgress) {
            console.log("Action already in progress, ignoring surrender");
            return;
        }
        
        // When connected to backend, send the surrender action to the server
        if (this.shouldUseBackend()) {
            // Set action in progress to prevent double clicks
            this.blackjackDealer.actionInProgress = true;
            this.blackjackDealer.currentAction = 'surrender';
            this.blackjackDealer.actionStartTime = Date.now();
            
            // Handle surrender action through the backend
            this.handleGameAction('surrender');
            
            // Track last action for reference
            Globals.lastAction = 'surrender';
            
            return;
        }
        
        // Fallback to local implementation
        try {
            this.blackjackDealer.actionInProgress = true;
            this.blackjackDealer.currentAction = 'surrender';
            this.blackjackDealer.actionStartTime = Date.now();
            
            const halfBet = Globals.currentBet / 2;
            
            // Return half the bet to the player
            Globals.balance += halfBet;
            
            // Update UI
            this.uiContainer.updateBalance(Globals.balance);
            
            // Show surrender result
            this.result.showResult(
                GameOutcome.SURRENDER,
                "You surrendered",
                halfBet
            );
            
            // End game
            this.gameState = 'gameEnd';
            this.gameButtonsContainer.showGameEndButtons();
        } finally {
            // End the action after a delay
            setTimeout(() => {
                this.blackjackDealer.actionInProgress = false;
                this.blackjackDealer.currentAction = '';
                this.blackjackDealer.actionStartTime = 0;
            }, 500);
        }
    }
    onDoubleClicked() {
        console.log("Double Down clicked");
        
        // Only allow double down in playing phase
        if (this.gameState !== 'playing') {
            console.log("Cannot double down - not in playing phase");
            return;
        }
        
        // Check if an action has been in progress for too long and reset if needed
        this.checkForStuckAction();
        
        // Prevent multiple concurrent actions
        if (this.blackjackDealer.actionInProgress) {
            console.log("Action already in progress, ignoring double down");
            return;
        }
        
        // Check if player has enough balance to double down
        if (Globals.balance < Globals.currentBet) {
            console.log("Not enough balance to double down");
            return;
        }
        
        // When connected to backend, send the double down action to the server
        if (this.shouldUseBackend()) {
            // Set action in progress to prevent double clicks
            this.blackjackDealer.actionInProgress = true;
            this.blackjackDealer.currentAction = 'doubleDown';
            this.blackjackDealer.actionStartTime = Date.now();
            
            // Hide all buttons during processing
            this.gameButtonsContainer.hideAllButtons();
            
            // Handle double down action through the backend
            this.handleGameAction('doubleDown');
            
            // Track last action for reference
            Globals.lastAction = 'doubleDown';
            
            return;
        }
        
     
    }
    /**
     * Handle when the player clicks the insurance button
     */
    onInsuranceClicked() {
        console.log("Insurance clicked");
        
        // Only allow insurance in playing phase
        if (this.gameState !== 'playing') {
            console.log("Cannot take insurance - not in playing phase");
            return;
        }
        
        // Check if an action has been in progress for too long and reset if needed
        this.checkForStuckAction();
        
        // Prevent multiple concurrent actions
        if (this.blackjackDealer.actionInProgress) {
            console.log("Action already in progress, ignoring insurance");
            return;
        }
        
        // When connected to backend, send the insurance action to the server
        if (this.shouldUseBackend()) {
            // Set action in progress to prevent double clicks
            this.blackjackDealer.actionInProgress = true;
            this.blackjackDealer.currentAction = 'insurance';
            this.blackjackDealer.actionStartTime = Date.now();
            
            // Close insurance popup if open
            this.popupManager.hidePopup();
            
            // Handle insurance action through the backend
            this.handleGameAction('insurance', { takeInsurance: true });
            
            // Track last action for reference
            Globals.lastAction = 'insurance';
            
            return;
        }
        
        // Fallback to local implementation
        try {
            this.blackjackDealer.actionInProgress = true;
            this.blackjackDealer.currentAction = 'insurance';
            this.blackjackDealer.actionStartTime = Date.now();
            
            // Calculate insurance amount (half the original bet)
            const insuranceAmount = Globals.currentBet / 2;
            
            // Deduct insurance amount from balance
            Globals.balance -= insuranceAmount;
            
            // Update UI
            this.uiContainer.updateBalance(Globals.balance);
            
            // Process insurance bet
            const dealerHasBlackjack = this.blackjackDealer.processDealerBlackjackCheck();
            
            if (dealerHasBlackjack) {
                // Insurance won - end the game immediately with insurance won outcome
                console.log("Insurance won - dealer has blackjack");
                
                // Show the insurance won popup immediately
                this.popupManager.showInsurancePopup(true);
                
                // Calculate insurance payout (2:1 on insurance bet)
                const insurancePayout = this.blackjackDealer.playerInsuranceBet * 2;
                
                // Add the insurance payout to the player's balance
                Globals.balance += insurancePayout;
                
                // Update UI
                this.uiContainer.updateBalance(Globals.balance);
                
                // The game has already ended in the blackjackDealer, so we just need
                // to update our local game state and show the appropriate buttons
                this.gameState = 'gameEnd';
                
                // Store the bet for rebet functionality - handle doubled bets correctly
                const wasDoubled = this.blackjackDealer.wasDoubled();
                const initialBetAmount = wasDoubled ? Globals.currentBet / 2 : Globals.currentBet;
                this.lastBetAmount = initialBetAmount;
                
                // Reset current bet
                Globals.currentBet = 0;
                
                // Update UI
                this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet)} Chips`);
                
                // Show game end buttons
                this.gameButtonsContainer.showGameEndButtons();
                
                console.log(`Game ended with insurance win. Balance: ${Globals.balance}, Insurance payout: ${insurancePayout}`);
            } else {
                // Insurance lost - show lost popup then continue game
                console.log("Insurance lost - dealer doesn't have blackjack");
                
                // Show an insurance lost popup if available
                if (Globals.resources.insuranceLostPopup) {
                    this.popupManager.showPopup(Globals.resources.insuranceLostPopup);
                    
                    // Close the popup after a 2 second delay and show gameplay buttons
                    setTimeout(() => {
                        this.popupManager.hidePopup(() => {
                            this.showGameButtons('gameplay');
                        });
                    }, 2000);
                } else if (Globals.resources.insuranceActivePopup) {
                    // Fallback to generic insurance popup if specific one not available
                    this.popupManager.showPopup(Globals.resources.insuranceActivePopup);
                    
                    // Close the popup after a 2 second delay and show gameplay buttons
                    setTimeout(() => {
                        this.popupManager.hidePopup(() => {
                            this.showGameButtons('gameplay');
                        });
                    }, 2000);
                } else {
                    // If no popup available, just show gameplay buttons after delay
                    setTimeout(() => {
                        this.showGameButtons('gameplay');
                    }, 2000);
                }
            }
        } finally {
            // End the action after a delay
            setTimeout(() => {
                this.blackjackDealer.actionInProgress = false;
                this.blackjackDealer.currentAction = '';
                this.blackjackDealer.actionStartTime = 0;
            }, 500);
        }
    }
    /**
     * Handle rebet button click
     * Places a bet with the same amount as the last bet
     */
    onRebetClicked() {
        console.log("Rebet clicked - Transitioning to Betting phase with automatic bet");
        
        // Phase validation: Only allow rebet from appropriate phases
        if (this.gameState !== 'betting' && this.gameState !== 'gameEnd') {
            console.log("Cannot rebet - not in betting or game end phase");
            Globals.emitter?.Call("show_notification", {
                message: "Cannot rebet at this time",
                duration: 1500,
                color: 0xDD0000
            });
            return;
        }
        
        // Check if there's a last bet to repeat
        if (this.lastBetAmount <= 0) {
            console.log("No previous bet to repeat");
            Globals.emitter?.Call("show_notification", {
                message: "No previous bet to repeat",
                duration: 1500,
                color: 0xDD0000
            });
            return;
        }
        
        // Check if player has enough balance
        if (Globals.balance < this.lastBetAmount) {
            console.log("Not enough balance to rebet");
            Globals.emitter?.Call("show_notification", {
                message: "Insufficient funds for rebet",
                duration: 1500,
                color: 0xDD0000
            });
            return;
        }
        
        // PHASE TRANSITION: EndGame → Betting → (automatically) → GameInProgress
        
        // 1. If we're in EndGame phase, first reset the game
        if (this.gameState === 'gameEnd') {
            // Reset game state first
            this.resetGame(() => {
                // Then continue with rebet logic after reset completes
                this.executeRebet();
            });
        } else {
            // Already in betting phase, just execute the rebet
            this.executeRebet();
        }
    }

    /**
     * Execute the rebet action after any necessary phase transitions
     * This places the previous bet and starts a new game
     */
    private executeRebet(): void {
        // 1. Send request to backend to place the previous bet
        this.handleGameAction('rebet');
        
        // 2. Update local UI state to show the bet
        Globals.emitter?.Call("show_notification", {
            message: `Repeating previous bet: ${formatBetAmount(this.lastBetAmount)}`,
            duration: 1500,
            color: 0xFFFFFF
        });
        
        // 3. Create visual chips for the bet (handled by backend response)
        
        // 4. Hide betting buttons while processing
        this.gameButtonsContainer.hideAllButtons();
        
        console.log(`Rebet placed with amount ${this.lastBetAmount} - Starting new game`);
    }
          /**
   * Reset the game for a new round
   * @param onComplete - Optional callback to run after reset is complete
   */
  private resetGame(onComplete?: () => void): void {
    console.log("Resetting game");
    
    
    // Hide any active popups
    this.popupManager.hidePopup();
    
    // Reset the BlackjackDealer
    this.blackjackDealer.resetGame();
    
    // Reset game state
    this.gameState = 'betting';
    
    // Hide all buttons to prevent UI conflicts
    this.gameButtonsContainer.hideAllButtons();
    
    // Flag to track when animations are complete
    let animationsComplete = false;
    
    // Clear chips from betting area if there are any
    if (this.chipsZone.investedChips.length > 0) {
      // Store chips to be removed
      this.chipsZone.removeChips = [...this.chipsZone.investedChips];
      this.chipsZone.investedChips = [];
      
      // Animate chips flying out
      this.chipsZone.tweenChipsOut(() => {
        // No need to update balance since winnings were already added in endGame
        console.log("Chips cleared");
    
    // Animate chips back up to their original position
    this.table.animateChipsUp();
    
        // Mark animations as complete
        animationsComplete = true;
        
        // If callback provided, call it once animations are done
        if (onComplete) {
          onComplete();
        }
      });
      } else {
      // Just clear any remaining chips
      this.chipsZone.clearChips();
      
      // Animate chips back up to their original position
      this.table.animateChipsUp();
      
      // Mark animations as complete immediately since no chip clearing was needed
      animationsComplete = true;
      
      // If callback provided, call it once animations are done
      if (onComplete) {
        // Add a small delay even when no animations to ensure UI is ready
        setTimeout(onComplete, 300);
      }
    }
    
    // Update UI
    this.uiContainer.updateBalance();
    this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");
    this.chipsZone.betHolder.isVisible(false);
    
    console.log("Game reset initiated, waiting for animations");
  }

    /**
     * Place a bet with the specified amount and create chips for visualization
     * @param amount - The amount to bet
     * @param skipShowingButtons - Whether to skip showing the betting buttons (used by rebet)
     * @param forRebet - Whether this is a rebet operation (to avoid double counting)
     * @returns Whether the bet was placed successfully
     */
    public placeBet(amount: number, skipShowingButtons: boolean = false, forRebet: boolean = false): boolean {
        console.log("Placing bet:", amount, forRebet ? "(for rebet)" : "");
        
        // Check if a game can be started
      if (this.gameState === 'playing') {
            console.log("Cannot place bet during gameplay");
            return false;
        }

        // Check if player has enough balance
      if (amount > Globals.balance) {
            console.log("Not enough balance to place bet");
            return false;
        }
        
        // Set game state to betting
      this.gameState = 'betting';
        
        // Deduct bet amount from balance
      Globals.balance -= amount;
        
        // Set the current bet
        Globals.currentBet = amount;
        
        // Store the bet amount for rebet functionality
        this.lastBetAmount = amount;
        
        // Update UI balance
        this.uiContainer.updateBalance();
        
        // Clear existing chips if any
      this.chipsZone.clearChips();
        
      // Create and add chips for the bet with proper animations
        this.createChipsForBet(amount, false, forRebet);
        
        // Show the bet holder
      this.chipsZone.showBetDisplay(amount);
      this.chipsZone.betHolder.isVisible(true);
      this.chipsZone.betHolder.alpha = 1;
      
      console.log(`Bet placed: ${amount}, balance: ${Globals.balance}`);
      
      // Only show betting buttons if not skipping
      if (!skipShowingButtons) {
          this.showGameButtons('betting');
      }
        
        return true;
    }
    
    /**
     * Start a new game with current bet or provided bet amount
     * @param betAmount - Optional amount to bet (uses current bet if not provided)
     * @param skipShowingButtons - Whether to skip showing betting buttons if game fails to start
     * @returns Whether the game was started successfully
     */
    public startGame(betAmount?: number, skipShowingButtons: boolean = false): boolean {
        console.log("Starting game");
        
        // Check if a game is already in progress
      if (this.gameState === 'playing') {
            console.warn('Game already in progress');
            return false;
        }
        
        // Handle provided bet amount
        if (betAmount !== undefined) {
            if (!this.placeBet(betAmount, skipShowingButtons)) {
                console.warn('Invalid bet amount');
                return false;
            }
        }
        
        // Check if there's a bet placed
        if (Globals.currentBet <= 0) {
            console.log("No bet placed, can't start game");
            return false;
        }
        
      // Ensure animations from previous actions are complete before starting
      // by introducing a small delay
      setTimeout(() => {
        
        // Disable chip selection
        this.table.makeButtonsActive(false);
        
        // Animate chips down and out of the way
        this.table.animateChipsDown();
        
        // Hide any existing buttons first to prevent conflicts
        this.gameButtonsContainer.hideAllButtons();
        
        // Reset special conditions flag
        this._specialConditionsDetected = false;
        this.deck = new Deck();
        // Start the game internally
        this._startGameInternal(skipShowingButtons);
      }, 100);
      
      return true;
  }
  
  /**
   * Internal method to start the game after animations and delays are complete
   * @private
   */
  private _startGameInternal(skipShowingButtons: boolean = false): void {
        // Start the game with the current bet
      if (this.blackjackDealer.startGame()) {
            console.log(`Starting game with bet: ${Globals.currentBet}`);
            
            // Store the current bet as the last bet amount for rebet functionality
            this.lastBetAmount = Globals.currentBet;
            
            // Set game state to started
            this.gameState = "playing";
            Globals.gameStarted = true;
            
            // Reset hands
            this.blackjackDealer.resetHands();
            
            // Reset special conditions flag
            this._specialConditionsDetected = false;
            
            // Set up game event callback before dealing cards
            // This ensures the handlers are ready when checkInitialConditions fires events
            this.setupGameEventCallback();
            
            // Deal initial cards
            this.dealInitialCards();
            
            // Note: No need to show gameplay buttons here anymore as BlackjackDealer.checkInitialConditions 
            // already handles this through the showGameplayButtons event
        } else {
            console.log("Failed to start game");
            
            // Re-enable chip selection
            this.table.makeButtonsActive(true);
            
            // Restore chips to their original position
            this.table.animateChipsUp();
            
            // Set game state back to betting
            this.gameState = 'betting';
            
            // Only show betting buttons if not skipping
            if (!skipShowingButtons) {
                this.showGameButtons('betting');
            }
        }
    }

 /**
   * Set up the game event callback to handle special game events from BlackjackDealer
   * This method connects the BlackjackDealer's events to the UI elements and game flow.
   * It centralizes all button-showing decisions in the GameManager.
   */
  private setupGameEventCallback(): void {
    console.log("Setting up game event callback");
  
    // Reset the special conditions flag
    this._specialConditionsDetected = false;
    
    // Track which special conditions have been processed to prevent duplicates
    const processedEvents = {
      insurance: false,
      split: false
    };
    
    // Create a new callback for game events
    const newGameEventCallback = (eventType: string, data?: any) => {
      console.log(`Game event received: ${eventType}`, data);
      
      // Handle game state events and show appropriate buttons
      switch (eventType) {
          // Handle insurance availability
          case 'insuranceOption':
              if (!processedEvents.insurance && data?.available) {
                  processedEvents.insurance = true;
                  this._specialConditionsDetected = true;
                  console.log("Insurance available, showing insurance buttons");
                  
                  setTimeout(() => {
                      this.showGameButtons('insuranceEligible');
                  }, 200);
              }
              break;
              
          // Handle split availability
          case 'splitOption':
              if (!processedEvents.split && data?.available) {
                  processedEvents.split = true;
                  this._specialConditionsDetected = true;
                  console.log("Split available, showing split buttons");
                  
                  setTimeout(() => {
                      this.showGameButtons('splitEligible');
                  }, 200);
              }
              break;
              
          // Handle initial hand evaluation
          case 'initialEvaluation':
              if (!data?.specialConditions && !this._specialConditionsDetected) {
                  console.log("No special conditions detected, showing regular gameplay buttons");
                  // Delay to ensure animations complete
                  setTimeout(() => {
                      // Use direct button group method instead of showGameButtons
                      this.gameButtonsContainer.showGameplayButtons();
                  }, 1800);
              }
              break;
              
          // Handle active hand change during split
          case 'activeHandChanged':
              console.log(`Active hand changed to: ${data?.activeHand}`);
              
              // Prevent multiple calls for the same active hand
              if ((this as any)._lastActiveHand === data?.activeHand) {
                  console.log(`Skipping duplicate activeHandChanged for ${data?.activeHand}`);
                  return;
              }
              
              // Store the last active hand to prevent duplicates
              (this as any)._lastActiveHand = data?.activeHand;

              // Always highlight the active hand immediately
              this.highlightActiveSplitHand(data?.activeHand);
              
              // Cancel any pending button updates to prevent race conditions
              if ((this as any)._activeHandButtonTimer) {
                  console.log("Cancelling pending button update timer");
                  clearTimeout((this as any)._activeHandButtonTimer);
                  (this as any)._activeHandButtonTimer = null;
              }
              
              // Use a single button update timer with increased delay to ensure UI stability
              (this as any)._activeHandButtonTimer = setTimeout(() => {
                  // Check if we're still in playing state
                  if (this.gameState !== 'playing') {
                      console.log(`Game no longer in playing state, not updating buttons`);
                      return;
                  }
                  
                  // Check which hand is active and its state
                  const activeHand = data?.activeHand;
                  
                  if (activeHand === 'first') {
                      const firstHand = this.blackjackDealer.playerHand;
                      
                      // If the hand is done, auto-switch to second hand
                      if (firstHand.value >= 21) {
                          console.log(`First hand has ${firstHand.value}, auto-switching to second hand`);
                          
                          // Use a slight delay for the switch to ensure UI updates properly
                          setTimeout(() => {
                              // Double-check that we haven't already switched
                              if (this.blackjackDealer.getActiveSplitHand() === 'first') {
                                  this.blackjackDealer.setActiveSplitHand('second');
                              }
                          }, 500);
                          
                          return; // Don't show buttons since we're auto-switching
                      }
                      
                      // For active first hand, check card count
                      const buttonGroup = firstHand.cards.length > 2 ? 'gameplayAfterHit' : 'gameplayWithoutSplit';
                      console.log(`Showing ${buttonGroup} for first hand (via safelyShowButtonGroup)`);
                      
                      // Use our safe button display method
                      this.safelyShowButtonGroup(buttonGroup, 400);
                  } 
                  else if (activeHand === 'second') {
                      const secondHand = this.blackjackDealer.splitHand;
                      
                      // For second hand, check if it exists and card count
                      if (secondHand) {
                          const buttonGroup = secondHand.cards.length > 2 ? 'gameplayAfterHit' : 'gameplayWithoutSplit';
                          console.log(`Showing ${buttonGroup} for second hand (via safelyShowButtonGroup)`);
                          
                          // Use our safe button display method
                          this.safelyShowButtonGroup(buttonGroup, 400);
                      } else {
                          console.error(`Second hand is null despite activeHand being 'second'`);
                      }
                  }
                  
                  // Clear the timer reference
                  (this as any)._activeHandButtonTimer = null;
              }, 200); // Reduced delay since safelyShowButtonGroup has its own delay
              break;
              
          // Handle split completion
          case 'splitComplete':
              console.log("Split complete, showing gameplay buttons for first hand");
              // Just update the bet display text
              this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet * 2)} Chips`);
              
              // Highlight the first hand as active
              this.highlightActiveSplitHand('first');
              
              // Show gameplay buttons without the split option since we've already split
              setTimeout(() => {
                  this.gameButtonsContainer.showButtonGroup('gameplayWithoutSplit');
              }, 200);
              break;
              
          // Handle insurance processing
          case 'insuranceProcessed':
              console.log("Insurance processed", data);
              
              // Check if dealer has blackjack to determine insurance outcome
              const dealerHasBlackjack = data?.dealerHasBlackjack || false;
              
              if (dealerHasBlackjack) {
                  // Insurance won - end the game immediately with insurance won outcome
                  console.log("Insurance won - dealer has blackjack");
                  
                  // Show the insurance won popup immediately
                  this.popupManager.showInsurancePopup(true);
                  
                  // Calculate insurance payout (2:1 on insurance bet)
                  const insurancePayout = this.blackjackDealer.playerInsuranceBet * 2;
                  
                  // Add the insurance payout to the player's balance
                  Globals.balance += insurancePayout;
                  
                  // Update UI
                  this.uiContainer.updateBalance(Globals.balance);
                  
                  // The game has already ended in the blackjackDealer, so we just need
                  // to update our local game state and show the appropriate buttons
                  this.gameState = 'gameEnd';
                  
                  // Store the bet for rebet functionality - handle doubled bets correctly
                  const wasDoubled = this.blackjackDealer.wasDoubled();
                  const initialBetAmount = wasDoubled ? Globals.currentBet / 2 : Globals.currentBet;
                  this.lastBetAmount = initialBetAmount;
                  
                  // Reset current bet
                  Globals.currentBet = 0;
                  
                  // Update UI
                  this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet)} Chips`);
                  
                  // Show game end buttons
                  this.gameButtonsContainer.showGameEndButtons();
                  
                  console.log(`Game ended with insurance win. Balance: ${Globals.balance}, Insurance payout: ${insurancePayout}`);
              } else {
                  // Insurance lost - show lost popup then continue game
                  console.log("Insurance lost - dealer doesn't have blackjack");
                  
                  // Show an insurance lost popup if available
                  if (Globals.resources.insuranceLostPopup) {
                      this.popupManager.showPopup(Globals.resources.insuranceLostPopup);
                      
                      // Close the popup after a 2 second delay and show gameplay buttons
                      setTimeout(() => {
                          this.popupManager.hidePopup(() => {
                              this.showGameButtons('gameplay');
                          });
                      }, 2000);
                  } else if (Globals.resources.insuranceActivePopup) {
                      // Fallback to generic insurance popup if specific one not available
                      this.popupManager.showPopup(Globals.resources.insuranceActivePopup);
                      
                      // Close the popup after a 2 second delay and show gameplay buttons
                      setTimeout(() => {
                          this.popupManager.hidePopup(() => {
                              this.showGameButtons('gameplay');
                          });
                      }, 2000);
                  } else {
                      // If no popup available, just show gameplay buttons after delay
                      setTimeout(() => {
                          this.showGameButtons('gameplay');
                      }, 2000);
                  }
              }
              break;
              
          // Handle double down processing
          case 'doubleDownProcessed':
              console.log("Double down processed", data);
              // Visual chip creation is now handled in onDoubleClicked
              // No need for addChip here, which was causing double counting
              break;
              
          // For legacy compatibility - handle deprecated events
          case 'splitAvailable':
              if (!processedEvents.split) {
                  processedEvents.split = true;
                  this._specialConditionsDetected = true;
                  console.log("Split available (legacy event), showing split buttons");
                  
                  setTimeout(() => {
                      this.showGameButtons('splitEligible');
                  }, 200);
              }
              break;
              
          case 'insuranceAvailable':
              if (!processedEvents.insurance) {
                  processedEvents.insurance = true;
                  this._specialConditionsDetected = true;
                  console.log("Insurance available (legacy event), showing insurance buttons");
                  
                  setTimeout(() => {
                      this.showGameButtons('insuranceEligible');
                  }, 200);
              }
              break;
              
          case 'splitHandSwitch':
              console.log(`Split hand switch (legacy event): ${data?.activeHand}`);
              setTimeout(() => {
                  // Use direct gameplayAfterHit button group for split hands
                  this.gameButtonsContainer.showButtonGroup('gameplayAfterHit');
              }, 200);
              break;
              
          case 'splitPerformed':
              console.log("Split performed (legacy event)");
              setTimeout(() => {
                  // Use direct splitEligible button group
                  this.gameButtonsContainer.showSplitEligibleButtons();
              }, 200);
              
              this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet * 2)} Chips`);
              break;
              
          case 'showGameplayButtons':
              console.log("Show gameplay buttons (legacy event)");
              if (!this._specialConditionsDetected) {
                  setTimeout(() => {
                      // Use direct button group method instead of showGameButtons
                      this.gameButtonsContainer.showGameplayButtons();
                  }, 1800);
              }
              break;
              
          // Handle legacy doubleDown event
          case 'doubleDown':
              console.log("Double down (legacy event)", data);
              // Visual chip creation is now handled in onDoubleClicked
              // No need for addChip here, which was causing double counting
              break;
              
          // Handle the 'split not implemented' case
          case 'splitNotImplemented':
              console.log("Split not fully implemented yet");
              this.popupManager.showPopup(Globals.resources.pushPopup);
              
              setTimeout(() => {
                  this.popupManager.hidePopup(() => {
                      this.showGameButtons('gameplay');
                  });
              }, 1500);
              break;
      }
    };
    
    // Set the new callback
    this.blackjackDealer.setGameEventCallback(newGameEventCallback);
  }

 /**
   * Centralized method to show game buttons
   * @param buttonGroup - The button group to show ('betting', 'gameplay', 'gameEnd', etc.)
   */
  private showGameButtons(buttonGroup: string): void {
    console.log(`Showing button group: ${buttonGroup}`);
    
    // First check game state to prevent showing inappropriate buttons
    if (this.gameState === 'gameEnd' && buttonGroup !== 'gameEnd') {
      console.log(`Cannot show ${buttonGroup} in gameEnd state, showing gameEnd buttons instead`);
      this.gameButtonsContainer.showGameEndButtons();
      return;
    }
    
    // Handle specific button groups based on game state and conditions
    switch (buttonGroup) {
      case 'gameplay':
        // Show gameplay buttons only if in playing state
        if (this.gameState === 'playing') {
          // Check if player has 21 after initial deal (should only see Stand)
          const playerHand = this.blackjackDealer.playerHand;
          if (playerHand && playerHand.value === 21 && !this.blackjackDealer.hasPlayerHit()) {
            console.log("Player has 21, showing stand-only buttons");
            this.gameButtonsContainer.showGameplayAfter21Buttons();
          } else {
            // Check if double is available (only on first two cards)
            const canDoubleDown = Globals.balance >= Globals.currentBet && 
              this.blackjackDealer.playerHand.cards.length === 2;
              
            if (canDoubleDown) {
              this.gameButtonsContainer.showGameplayButtons();
            } else {
              // Show gameplay buttons without double option
              this.gameButtonsContainer.showButtonGroup('gameplayNoDouble');
            }
          }
        } else {
          console.log(`Cannot show gameplay buttons in ${this.gameState} state`);
        }
        break;
        
      case 'splitEligible':
        if (this.gameState === 'playing') {
          // Show split-eligible buttons if in playing state, regardless of whether
          // player can still split (they should still see these buttons after splitting)
          if (this.blackjackDealer.splitHand || this.canSplit()) {
            // Either we have a split hand already or can split
            this.gameButtonsContainer.showSplitEligibleButtons();
          } else {
            console.log("Split not available, showing regular gameplay buttons");
            this.showGameButtons('gameplay');
          }
        } else {
          console.log(`Cannot show split buttons in ${this.gameState} state`);
        }
        break;
        
      case 'insuranceEligible':
        if (this.gameState === 'playing' && 
            GameManager.isInsuranceAvailable(this.blackjackDealer.dealerHand) &&
            Globals.balance >= Globals.currentBet / 2) {
          // Only show insurance if dealer shows an Ace and player has enough balance
          this.gameButtonsContainer.showInsuranceEligibleButtons();
        } else {
          console.log("Insurance not available, showing regular gameplay buttons");
          this.showGameButtons('gameplay');
        }
        break;
        
      case 'gameEnd':
        // Always show game end buttons in game end state
        this.gameButtonsContainer.showGameEndButtons();
        break;
        
      case 'betting':
        // Only show betting buttons in betting state
        if (this.gameState === 'betting') {
           this.showBettingButtonsIfNeeded();
        } else {
          console.log(`Cannot show betting buttons in ${this.gameState} state`);
        }
        break;
        
      case 'gameplayAfter21':
        // Always show stand-only buttons when player has 21
        this.gameButtonsContainer.showGameplayAfter21Buttons();
        break;
        
      default:
        // If a group name is passed directly, try to show it with state validation
        if ((buttonGroup === 'gameplayNoDouble' || 
             buttonGroup === 'gameplayAfterHit') && 
            this.gameState !== 'playing') {
          console.log(`Cannot show ${buttonGroup} in ${this.gameState} state`);
        } else {
          this.gameButtonsContainer.showButtonGroup(buttonGroup);
        }
    }
  }

 /**
   * Animate a chip from the table to the betting area
   * @param chip - The chip to animate
   */
 private animateChipToBettingArea(chip: Chips): void {
    // Find matching chip in table to copy initial position
    const matchingTableChip = this.table.chips.find(c => c.value === chip.value);
    if (!matchingTableChip) return;
    
    // Convert table chip position to global coordinates
    const globalPos = matchingTableChip.parent.toGlobal(matchingTableChip.position);
    
    // Set initial position and scale
    chip.position.copyFrom(globalPos);
    
    const chipScale = 0.3;
    chip.scale.set(chipScale * config.scaleFactor);
    chip.updateOriginalScale();
    
    // Add slight random offset for natural movement
    const randomOffset = {
      x: (Math.random() - 0.5) * 20,
      y: (Math.random() - 0.5) * 20
    };
    
    // Create position tween with smoother animation
    new Tween(chip.position, Globals.sceneManager?.tweenGroup)
      .to({
        x: this.chipsZone.position.x + randomOffset.x,
        y: this.chipsZone.position.y + randomOffset.y
      }, 800) // Increased duration for smoother movement
      .easing(Easing.Cubic.Out) // Changed to Cubic for smoother deceleration
      .start();
      
    // Add a slight rotation during movement
    const targetRotation = (Math.random() - 0.5) * Math.PI * 0.5; // Random rotation between -π/4 and π/4
    new Tween(chip, Globals.sceneManager?.tweenGroup)
      .to({ rotation: targetRotation }, 800)
      .easing(Easing.Cubic.Out)
      .start();
  }

       /**
     * Deal initial cards using blackjackDealer
     * @returns Promise that resolves when initial cards are dealt
     */
    dealInitialCards(): Promise<void> {
        return this.blackjackDealer.dealInitialCards();
    }
    
    /**
     * Check for blackjack and special conditions after initial deal
     */
    private processInitialHandConditions(): void {
        // This method is replaced by BlackjackDealer.checkInitialConditions
        // We shouldn't reach here, but just in case delegate to the dealer
        this.blackjackDealer.checkInitialConditions();
    }
    
   
    
    /**
     * Check if player can split their hand
     * @returns Whether the player can split
     */
    canSplit(): boolean {
        return this.canPlayerSplit();
    }

    /**
     * Handle the end of the game and determine the outcome
     * @param outcome - The game outcome
     * @param playerValue - The value of the player's hand
     * @param dealerValue - The value of the dealer's hand
     */
    private handleGameEnd(outcome: GameOutcome, playerValue: number, dealerValue: number): void {
      // Forward to handleBackendGameEnd since all game logic is now on the backend
      this.handleBackendGameEnd(outcome, playerValue, dealerValue);
    }

    /**
     * Check if insurance is available based on dealer's up card
     * @param dealerHand - The dealer's hand
     * @returns Whether insurance is available
     */
    public static isInsuranceAvailable(dealerHand: any): boolean {
      // Insurance is only available when dealer's face-up card is an Ace
      if (!dealerHand || dealerHand.cards.length === 0) {
        return false;
      }
      
      const dealerUpCard = dealerHand.cards[0];
      return dealerUpCard.rank === 'A';
    }

    /**
     * Handle the end of the game and determine the outcome based on backend data
     * This method is called when the backend sends the game result
     * @param outcome - The game outcome from backend
     * @param playerValue - The value of the player's hand
     * @param dealerValue - The value of the dealer's hand
     * @param payoutFromBackend - Optional payout amount from backend
     */
    private handleBackendGameEnd(outcome: GameOutcome, playerValue: number, dealerValue: number, payoutFromBackend?: number): void {
      console.log(`Game ended with outcome from backend: ${outcome}`);
      console.log(`Player: ${playerValue}, Dealer: ${dealerValue}`);
      
      // Prevent multiple executions of handleGameEnd
      if (this.gameState === "gameEnd") {
        console.log("Game already in end state, ignoring duplicate handleGameEnd call");
        return;
      }
      
      // Set game state to end
      this.gameState = "gameEnd";
      
      Globals.gameStarted = false;
      
      // First, hide any gameplay buttons to prevent conflicting UI
      this.gameButtonsContainer.hideAllButtons();
      
      // Store the current bet before resetting it
      const originalBet = Globals.currentBet;
      
      // Store the initial bet amount for rebet (not the doubled amount)
      // If the bet was doubled, we need to store only half for rebet
      const wasDoubled = this.blackjackDealer.wasDoubled();
      const initialBetAmount = wasDoubled ? originalBet / 2 : originalBet;
      this.lastBetAmount = initialBetAmount;
      
      // Use payout from backend if provided
      const payout = payoutFromBackend !== undefined ? 
                    payoutFromBackend : 
                    this.calculateDefaultPayout(outcome, originalBet);
      
      // Add payout to balance if positive
      if (payout > 0) {
        Globals.balance += payout;
        
        // Show win amount animation/text
        const winAmount = payout - originalBet;
        if (winAmount > 0) {
          this.result.showWin(winAmount);
        }
      }
      
      // Update UI to reflect new balance
      this.uiContainer.updateBalance(Globals.balance);
      
      // Reset bet for next game
      Globals.currentBet = 0;
      
      // Show appropriate outcome popup
      this.showOutcomePopup(outcome);
      
      // Show game end buttons with a delay to ensure popup is shown first
      setTimeout(() => {
        this.gameButtonsContainer.showGameEndButtons();
      }, 500);
      
      // Update UI for next game
      this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet)} Chips`);
      
      // Update special conditions flag
      this._specialConditionsDetected = false;
      
      console.log(`Game ended. balance: ${Globals.balance}, Last bet (for rebet): ${this.lastBetAmount}`);
    }
    
    /**
     * Calculate default payout for an outcome when not provided by backend
     * This is a fallback for display purposes only
     */
    private calculateDefaultPayout(outcome: GameOutcome, betAmount: number): number {
      switch (outcome) {
        case GameOutcome.PLAYER_BLACKJACK:
          return betAmount * 2.5; // Blackjack pays 3:2
        case GameOutcome.PLAYER_WIN:
        case GameOutcome.DEALER_BUST:
          return betAmount * 2; // Regular win pays 1:1
        case GameOutcome.PUSH:
          return betAmount; // Push returns the original bet
        case GameOutcome.SURRENDER:
          return betAmount * 0.5; // Surrender returns half the bet
        default:
          return 0; // Player loses bet
      }
    }

    /**
     * Highlight the active split hand to provide visual feedback
     * @param activeHand - Which hand is active ('first' or 'second')
     */
    private highlightActiveSplitHand(activeHand: 'first' | 'second'): void {
        // Skip if there's no split hand
        if (!this.blackjackDealer.splitHand) {
            return;
        }
        
        // Reset both hands to normal appearance
        this.blackjackDealer.playerHand.alpha = 0.7;
        this.blackjackDealer.splitHand.alpha = 0.7;
        
        // Highlight the active hand
        if (activeHand === 'first') {
            this.blackjackDealer.playerHand.alpha = 1;
        } else {
            this.blackjackDealer.splitHand.alpha = 1;
        }
        
        console.log(`Highlighted ${activeHand} hand`);
    }

    /**
     * Manual method to trigger unlocking premium chips
     * This can be called directly for testing
     */
    public unlockPremiumChipsDirectly(): void {
        console.log("Manual unlock of premium chips triggered");
        this.unlockShopCallback();
    }

    /**
     * Safely show a button group with proper coordination
     * This method ensures only one button group is visible at a time
     * by using timeouts and blocking duplicate requests
     * @param groupName The button group to display
     * @param delay Optional delay before showing buttons (default: 300ms)
     */
    private safelyShowButtonGroup(groupName: string, delay: number = 300): void {
        // Check if already processing a button update
        if ((this as any)._pendingButtonUpdate) {
            console.log(`Button update already pending, cancelling previous (${(this as any)._pendingButtonGroupName}) and queueing: ${groupName}`);
            clearTimeout((this as any)._pendingButtonUpdate);
        }
        
        // Store the pending group name for logging
        (this as any)._pendingButtonGroupName = groupName;
        
        // Hide all buttons first to prevent overlaps
        this.gameButtonsContainer.hideAllButtons();
        
        // Schedule the button group to be shown after delay
        (this as any)._pendingButtonUpdate = setTimeout(() => {
            console.log(`Showing queued button group: ${groupName}`);
            this.gameButtonsContainer.showButtonGroup(groupName);
            (this as any)._pendingButtonUpdate = null;
            (this as any)._pendingButtonGroupName = null;
        }, delay);
    }

    /**
     * Setup listeners for backend events
     */
    setupBackendListeners() {
        // Skip if no backend service available
        if (!Globals.backendService) {
            console.warn("No backend service available, skipping backend event listeners");
            return;
        }
        
        // Handle connection status changes
        Globals.backendService.addEventListener('connection_status_changed', (data) => {
            if (data.connected !== undefined) {
                this._isConnectedToBackend = data.connected;
                this.updateConnectionIndicator(data.connected);
                Globals.isOnline = data.connected;
                
                // Notify the user of connection status change
                Globals.emitter?.Call("show_notification", {
                    message: data.connected ? "Connected to game server" : "Disconnected from game server",
                    duration: 3000,
                    color: data.connected ? 0x00AA00 : 0xAA0000
                });
                
                // If disconnected during gameplay, provide additional info
                if (!data.connected && this.gameState === 'playing') {
                    Globals.emitter?.Call("show_notification", {
                        message: "Connection lost. Game state saved on server.",
                        duration: 5000,
                        color: 0xAA5500
                    });
                }
            }
        });
        
        // Handle player data updates including balance
        Globals.backendService.addEventListener('player_data_updated', (data) => {
            if (data.balance !== undefined) {
                console.log(`Updating player balance from server: ${data.balance}`);
                Globals.balance = data.balance;
                this.uiContainer.updateBalance(data.balance);
            }
        });
        
        // Handle reconnection event
        Globals.backendService.addEventListener('reconnected', () => {
            console.log("Reconnected to server, requesting game state");
            
            // Request current game state after reconnection
            if (Globals.backendService) {
                Globals.backendService.getGameState();
            }
            
            // Show notification
            Globals.emitter?.Call("show_notification", {
                message: "Reconnected to server. Restoring game state...",
                duration: 3000,
                color: 0x00AA00
            });
        });
        
        // Handle game state updates - primary way backend communicates with frontend
        Globals.backendService.addEventListener('game_state_updated', (data) => {
            this.handleGameStateUpdate(data);
        });
        
        // Add specific event listeners for detailed game events
        
        // Bet placed event
        Globals.backendService.addEventListener('bet_placed', (data) => {
            // Update UI to reflect bet
            if (data.currentBalance !== undefined) {
                Globals.balance = data.currentBalance;
                this.uiContainer.updateBalance(data.currentBalance);
            }
            
            if (data.betAmount !== undefined) {
                Globals.currentBet = data.betAmount;
                this.lastBetAmount = data.betAmount;
                this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(data.betAmount)} Chips`);
                this.chipsZone.betHolder.isVisible(true);
                
                // Create visual chips for the bet amount
                this.createChipsForBet(data.betAmount, false, false);
            }
            
            // Reset action in progress state
            this.blackjackDealer.actionInProgress = false;
            this.blackjackDealer.currentAction = '';
        });
        
        // Insurance offer event
        Globals.backendService.addEventListener('offer_insurance', (data) => {
            // Show insurance dialog
            this.showInsurancePopup(data.dealerCard, data.insuranceAmount);
            
            // Reset action in progress state
            this.blackjackDealer.actionInProgress = false;
            this.blackjackDealer.currentAction = '';
        });
        
        // Insurance result event
        Globals.backendService.addEventListener('insurance_result', (data) => {
            // Handle insurance result
            this.handleInsuranceResult(data);
            
            // Reset action in progress state
            this.blackjackDealer.actionInProgress = false;
            this.blackjackDealer.currentAction = '';
        });
        
        // Split offer event
        Globals.backendService.addEventListener('offer_split', (data) => {
            // Show split option
            this.gameButtonsContainer.showButton(GameButtonType.SPLIT);
            
            // Reset action in progress state
            this.blackjackDealer.actionInProgress = false;
            this.blackjackDealer.currentAction = '';
        });
        
        // Split result event
        Globals.backendService.addEventListener('split_result', (data) => {
            // Update UI to show split hands
            this.handleSplitResult(data);
            
            // Reset action in progress state
            this.blackjackDealer.actionInProgress = false;
            this.blackjackDealer.currentAction = '';
        });
        
        // Split hand switch event
        Globals.backendService.addEventListener('split_hand_switch', (data) => {
            // Highlight the active hand
            if (data.activeHand) {
                this.highlightActiveSplitHand(data.activeHand);
                
                // Update UI buttons to match active hand
                setTimeout(() => {
                    if (this.gameState === 'playing') {
                        if (data.allowedActions && Array.isArray(data.allowedActions)) {
                            this.updateButtonsFromAllowedActions(data.allowedActions, 'player_turn');
                        } else {
                            this.gameButtonsContainer.showButtonGroup('gameplayAfterHit');
                        }
                    }
                }, 300);
            }
            
            // Reset action in progress state
            this.blackjackDealer.actionInProgress = false;
            this.blackjackDealer.currentAction = '';
        });
        
        // Game outcome event
        Globals.backendService.addEventListener('game_outcome', (data) => {
            // Show game result
            this.handleGameOutcome(data);
            
            // Reset action in progress state
            this.blackjackDealer.actionInProgress = false;
            this.blackjackDealer.currentAction = '';
        });
        
        // Dealer turn event
        Globals.backendService.addEventListener('dealer_turn', (data) => {
            // Animate dealer card reveal and dealing
            this.handleDealerTurn();
            
            // Reset action in progress state
            this.blackjackDealer.actionInProgress = false;
            this.blackjackDealer.currentAction = '';
        });
        
        // Card dealt event
        Globals.backendService.addEventListener('card_dealt', (data) => {
            // Update the card display based on the data
            console.log("card dealt to", data);
            if (data.card && data.target) {
                console.log(`Card dealt to ${data.target}:`, data.card);
                
              
                // Update the appropriate hand with the new card
                if (data.target === 'player') {
                    setTimeout(()=>{
                        this.blackjackDealer.playerHand.updateCardFromBackend(data.card);
                    },data.index == 0 ? 500 : 3000*data.index);
                } else if (data.target === 'dealer') {
                    setTimeout(()=>{
                        this.blackjackDealer.dealerHand.updateCardFromBackend(data.card);
                    },data.index == 0 ? 1000 : 4000*data.index);
                } else if (data.target === 'split') {
                    setTimeout(()=>{
                        if (this.blackjackDealer.splitHand) {
                            this.blackjackDealer.splitHand.updateCardFromBackend( data.card);
                        }
                    },data.index == 0 ? 500 : 1000*data.index);
                }
                
                // Optionally show a notification about the card
                // Update the game state directly based on the card data
                // The next game state update will refresh the UI with the correct cards
                
                // Note: We don't animate new cards here since the full state update
                // will handle refreshing the UI with all cards in their proper positions
                
                // Optionally show a notification about the card
                if (data.message) {
                    Globals.emitter?.Call("show_notification", {
                        message: data.message,
                        duration: 1500,
                        color: 0xFFFFFF
                    });
                }
            }
            
            // Reset action in progress state after card dealing animation completes
            setTimeout(() => {
                this.blackjackDealer.actionInProgress = false;
                this.blackjackDealer.currentAction = '';
            }, 500);
        });
        
        // Action result event
        Globals.backendService.addEventListener('action_result', (data) => {
            if (data.success) {
                // Action was successful, wait for game state update
                console.log(`Action ${data.action} successful`);
                
                // Show brief notification for player
                if (data.message) {
                    Globals.emitter?.Call("show_notification", {
                        message: data.message,
                        duration: 1500,
                        color: 0xFFFFFF
                    });
                }
            } else {
                // Action failed, show error and reset state
                console.error(`Action ${data.action} failed: ${data.message}`);
                
                // Show error to user
                Globals.emitter?.Call("show_notification", {
                    message: data.message || `Unable to ${data.action}`,
                    duration: 3000,
                    color: 0xAA0000
                });
                
                // Reset action in progress state
                this.blackjackDealer.actionInProgress = false;
                this.blackjackDealer.currentAction = '';
                
                // Show appropriate buttons
                if (this.gameState === 'playing') {
                    this.gameButtonsContainer.showGameplayButtons();
                } else if (this.gameState === 'betting') {
                     this.showBettingButtonsIfNeeded();
                }
            }
        });
        
        // Handle errors
        Globals.backendService.addEventListener('server_error', (data) => {
            // Show error to user
            Globals.emitter?.Call("show_notification", {
                message: `Error: ${data.message}`,
                duration: 3000,
                color: 0xAA0000
            });
            
            // Reset action in progress state
            this.blackjackDealer.actionInProgress = false;
            this.blackjackDealer.currentAction = '';
            
            // Show appropriate buttons
            if (this.gameState === 'playing') {
                this.gameButtonsContainer.showGameplayButtons();
            } else if (this.gameState === 'betting') {
                 this.showBettingButtonsIfNeeded();
            }
        });
    }
    
    /**
     * Show appropriate controls for offline mode
     * @deprecated Offline mode is not supported
     */
    private showOfflineModeControls(): void {
        console.warn("Offline mode is not supported");
    }
    
    /**
     * Reset the game to a clean state
     * @deprecated Use resetGame instead
     */
    private resetGameState(): void {
        this.resetGame();
    }

    /**
     * Update game state from server data
     */
    private handleGameStateUpdate(data: any): void {
        console.log("Handling game state update:", data);
        
        // Save game state from server
        const {
            playerHand,
            dealerHand,
            splitHand,
            activeSplitHand,
            playerBalance,
            currentBet,
            insuranceBet,
            gamePhase,
            allowedActions,
            outcome,
            message,
            payout
        } = data;
        
        // Reset the action in progress state since we received an update
        this.blackjackDealer.actionInProgress = false;
        this.blackjackDealer.currentAction = '';
        
        // Update balance if provided
        if (playerBalance !== undefined) {
            Globals.balance = playerBalance;
            this.uiContainer.updateBalance(playerBalance);
        }
        
        // Update bet amount if provided
        if (currentBet !== undefined) {
            Globals.currentBet = currentBet;
            this.lastBetAmount = currentBet;
            
            // Update bet display
            this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(currentBet)} Chips`);
            this.chipsZone.betHolder.isVisible(currentBet > 0);
        }
        
        // Update insurance bet if provided
        if (insuranceBet !== undefined && this.blackjackDealer) {
            this.blackjackDealer.playerInsuranceBet = insuranceBet;
        }
        
        // Save the previous game phase to handle transitions
        const previousGamePhase = gamePhase ? this.gameState : null;
        
        // Update game phase if provided
        if (gamePhase !== undefined) {
            const oldGameState = this.gameState;
            
            // Map backend game phase to frontend game state
            switch (gamePhase) {
                case 'betting':
                    this.gameState = 'betting';
                    break;
                case 'dealing':
                case 'player_turn':
                    this.gameState = 'playing';
                    break;
                case 'dealer_turn':
                    this.gameState = 'playing';
                    break;
                case 'complete':
                    this.gameState = 'gameEnd';
                    break;
            }
            
            // Handle phase transitions
            if (oldGameState !== this.gameState) {
                console.log(`Game phase changed from ${oldGameState} to ${this.gameState}`);
                
                // PHASE 1: GAME START - Betting to Playing transition
                if (oldGameState === 'betting' && this.gameState === 'playing') {
                    // Disable chip selection during gameplay
                    this.table.makeButtonsActive(false);
                    
                    // Animate chips down and out of the way
                    this.table.animateChipsDown();
                    
                    // Ensure cards are dealt on the frontend when transitioning to playing state
                    this.ensureCardsDealt(playerHand, dealerHand, splitHand);
                }
                // PHASE 3: GAME END - Playing to GameEnd transition
                else if (oldGameState === 'playing' && this.gameState === 'gameEnd') {
                    // Show game outcome when transitioning to game end state
                    if (outcome) {
                        // If payout is provided, show win animation
                        if (payout && payout > 0) {
                            this.result.showWin(payout);
                        }
                        
                        this.handleServerGameOutcome(outcome, message);
                    }
                    
                    // Show game end buttons
                    this.gameButtonsContainer.showGameEndButtons();
                }
                // Handle any other transitions
                else if (this.gameState === 'betting') {
                    // Reset the table when returning to betting phase
                    this.chipsZone.clearChips();
                    this.blackjackDealer.resetHands();
                    
                    // Re-enable chip selection
                    this.table.makeButtonsActive(true);
                    
                    // Restore chips to their original position
                    this.table.animateChipsUp();
                    
                    // Show betting buttons
                     this.showBettingButtonsIfNeeded();
                }
            }
        }
        
        // PHASE 2: GAMEPLAY - Update hands from server state when in playing phase
        if (this.gameState === 'playing') {
            this.updateHandsFromServerState(playerHand, dealerHand, splitHand);
            
            // Update active split hand if in split mode
            if (splitHand && activeSplitHand) {
                this.blackjackDealer.setActiveSplitHand(activeSplitHand);
                this.highlightActiveSplitHand(activeSplitHand);
            }
            
            // If we're in dealer turn phase, make sure dealer's hole card is revealed
            if (gamePhase === 'dealer_turn') {
                this.revealDealerCardIfNeeded();
                
                // Hide all buttons during dealer turn
                this.gameButtonsContainer.hideAllButtons();
                
                // Show message to user
                Globals.emitter?.Call("show_notification", {
                    message: "Dealer's turn",
                    duration: 2000,
                    color: 0xFFFFFF
                });
            }
        }
        
        // Update buttons based on allowed actions if we're in betting, dealing, or player turn phase
        if (allowedActions && Array.isArray(allowedActions) && 
            (gamePhase === 'betting' || gamePhase === 'dealing' || gamePhase === 'player_turn')) {
            this.updateButtonsFromAllowedActions(allowedActions, gamePhase);
        }
    }

    /**
     * Update buttons based on allowed actions from server
     */
    private updateButtonsFromAllowedActions(allowedActions: string[], gamePhase: string): void {
        if (!allowedActions || allowedActions.length === 0) {
            // If no actions are allowed, hide all buttons
            this.gameButtonsContainer.hideAllButtons();
            return;
        }
        
        console.log(`Updating buttons based on allowed actions: ${allowedActions.join(', ')} in phase ${gamePhase}`);
        
        // Convert action strings to uppercase for consistent comparison
        const actions = allowedActions.map(action => action.toUpperCase());
        
        // Handle different game phases with specialized button logic
        switch (gamePhase) {
            case 'betting':
                // In betting phase, show bet controls and play/rebet/clear buttons
                if (actions.includes('PLACE_BET')) {
                    // Make table chip buttons active
                    this.table.makeButtonsActive(true);
                    
                    // Show betting button group with appropriate buttons based on allowed actions
                    const buttonGroup = this.gameButtonsContainer.showButtonGroup('betting');
                    
                    // Only show rebet if it's allowed
                    if (!actions.includes('REBET')) {
                        this.gameButtonsContainer.hideRebetButton();
                    }
                    
                    // Only show clear if there's a bet to clear
                    if (Globals.currentBet <= 0) {
                        this.gameButtonsContainer.hideClearButton();
                    }
                } else {
                    // If betting is not allowed, disable chip selection
                    this.table.makeButtonsActive(false);
                }
                break;
                
            case 'dealing':
            case 'player_turn':
                // In player's turn, determine the appropriate button combination based on available actions
                
                // Special case: Insurance option
                if (actions.includes('INSURANCE')) {
                    // Show insurance dialog instead of buttons
                    const dealerCard = this.blackjackDealer.dealerHand.cards[0];
                    const insuranceAmount = Globals.currentBet / 2;
                    this.showInsurancePopup(dealerCard, insuranceAmount);
                    return;
                }
                
                // Hide all buttons first to prevent stale UI
        this.gameButtonsContainer.hideAllButtons();
                
                // Clear any pending button updates
                if ((this as any)._pendingButtonUpdate) {
                    clearTimeout((this as any)._pendingButtonUpdate);
                    (this as any)._pendingButtonUpdate = null;
                }
                
                // Determine which gameplay button set to show
                if (actions.includes('SPLIT') && actions.includes('DOUBLE_DOWN')) {
                    // Both split and double down available - full options
                    this.gameButtonsContainer.showButtonGroup('splitEligible');
                } 
                else if (actions.includes('SPLIT')) {
                    // Only split available (not enough balance for double down)
                    this.gameButtonsContainer.showButtonGroup('splitEligibleNoDouble');
                } 
                else if (actions.includes('DOUBLE_DOWN')) {
                    // Double down available but not split
                    this.gameButtonsContainer.showButtonGroup('gameplay');
                } 
                else if (actions.includes('HIT') && actions.includes('STAND')) {
                    // Basic hit/stand options - likely after first hit or when doubled not allowed
                    this.gameButtonsContainer.showButtonGroup('gameplayAfterHit');
                }
                else if (actions.includes('STAND') && !actions.includes('HIT')) {
                    // Only stand available - typically when player has 21
                    this.gameButtonsContainer.showGameplayAfter21Buttons();
                }
                else if (actions.includes('SURRENDER')) {
                    // Show surrender button if available
                    this.gameButtonsContainer.showSurrenderButton();
                }
                
                // Check for split mode specific logic
                const activeSplitHand = this.blackjackDealer.getActiveSplitHand();
                if (activeSplitHand) {
                    // Highlight the active split hand
                    this.highlightActiveSplitHand(activeSplitHand);
                }
                break;
                
            case 'dealer_turn':
                // No buttons during dealer turn
        this.gameButtonsContainer.hideAllButtons();
        
                // Show message to user
            Globals.emitter?.Call("show_notification", {
                    message: "Dealer's turn",
                    duration: 2000,
            color: 0xFFFFFF
        });
                    break;
                
            case 'complete':
                // When game is complete, show game end buttons (PLAY_AGAIN, REBET)
                this.gameButtonsContainer.showGameEndButtons();
                    break;
                
                default:
                console.warn(`Unknown game phase: ${gamePhase}`);
                // As a fallback, show buttons based on provided allowed actions
                this.showButtonsBasedOnAllowedActions(actions);
        }
    }

    /**
     * Fallback method to show buttons based solely on allowed actions list
     * @param actions List of allowed actions from the server
     */
    private showButtonsBasedOnAllowedActions(actions: string[]): void {
        // Hide all buttons first
        this.gameButtonsContainer.hideAllButtons();
        
        // Show the relevant buttons based on allowed actions
        if (actions.includes('HIT')) {
            this.gameButtonsContainer.showHitButton();
        }
        
        if (actions.includes('STAND')) {
            this.gameButtonsContainer.showStandButton();
        }
        
        if (actions.includes('DOUBLE_DOWN')) {
            this.gameButtonsContainer.showDoubleButton();
        }
        
        if (actions.includes('SPLIT')) {
            this.gameButtonsContainer.showSplitButton();
        }
        
        if (actions.includes('SURRENDER')) {
            this.gameButtonsContainer.showSurrenderButton();
        }
        
        if (actions.includes('INSURANCE')) {
            this.gameButtonsContainer.showInsuranceButton();
        }
        
        if (actions.includes('PLACE_BET') || actions.includes('DEAL_CARDS')) {
            this.gameButtonsContainer.showPlayButton();
        }
        
        if (actions.includes('REBET')) {
            this.gameButtonsContainer.showRebetButton();
        }
        
        if (Globals.currentBet > 0 && this.gameState === 'betting') {
            this.gameButtonsContainer.showClearButton();
        }
    }

    /**
     * Ensure cards are properly dealt on the frontend to match backend state
     */
    private ensureCardsDealt(playerHand: any, dealerHand: any, splitHand: any): void {
        // If frontend has no cards but backend does, animate dealing cards
        const frontendHasCards = this.blackjackDealer.playerHand.cards.length > 0;
        const backendHasCards = playerHand && playerHand.cards && playerHand.cards.length > 0;
        
        if (!frontendHasCards && backendHasCards) {
            // Trigger card dealing animation
            console.log("Syncing frontend with backend cards state");
            
            // Deal the cards with animation
            this.dealInitialCards().then(() => {
                console.log("Initial cards dealt, showing gameplay buttons");
                
                // Show gameplay buttons after dealing animation completes
                if (this.gameState === 'playing') {
                    setTimeout(() => {
                        // Ensure buttons are shown based on allowed actions
                        this.gameButtonsContainer.showGameplayButtons();
                    }, 500);
                }
            });
        }
    }

    /**
     * Handle game outcome received from server
     */
    private handleServerGameOutcome(outcome: string, message: string): void {
        // Convert server outcome to frontend outcome enum
        let frontendOutcome: GameOutcome;
        
        switch (outcome) {
            case 'player_win':
                frontendOutcome = GameOutcome.PLAYER_WIN;
                break;
            case 'dealer_win':
                frontendOutcome = GameOutcome.DEALER_WIN;
                break;
            case 'push':
                frontendOutcome = GameOutcome.PUSH;
                break;
            case 'player_blackjack':
                frontendOutcome = GameOutcome.PLAYER_BLACKJACK;
                break;
            case 'player_bust':
                frontendOutcome = GameOutcome.PLAYER_BUST;
                break;
            case 'dealer_bust':
                frontendOutcome = GameOutcome.DEALER_BUST;
                break;
            case 'surrender':
                frontendOutcome = GameOutcome.SURRENDER;
                break;
            default:
                console.warn(`Unknown outcome from server: ${outcome}`);
                frontendOutcome = GameOutcome.PLAYER_WIN;
                break;
        }
        
        // Show outcome popup with a slight delay to allow animations to complete
        setTimeout(() => {
            this.showOutcomePopup(frontendOutcome);
        }, 500);
    }
    
    /**
     * Update UI hands from server state
     */
    private updateHandsFromServerState(playerHand: any, dealerHand: any, splitHand: any): void {
        // Update player hand
        if (playerHand) {
            this.blackjackDealer.updatePlayerHandFromServer(playerHand);
        }
        
        // Update dealer hand
        if (dealerHand) {
            this.blackjackDealer.updateDealerHandFromServer(dealerHand);
        }
        
        // Update split hand if available
        if (splitHand) {
            this.blackjackDealer.updateSplitHandFromServer(splitHand);
        }
    }
    
    /**
     * Handle insurance result
     */
    private handleInsuranceResult(data: any): void {
        const { dealerHasBlackjack, payout } = data;
        
        if (dealerHasBlackjack) {
            // Dealer has blackjack, insurance pays out
            this.blackjackDealer.revealDealerCard();
            
            // Show insurance win notification
            Globals.emitter?.Call("show_notification", {
                message: `Insurance pays ${formatBetAmount(payout)} chips`,
                duration: 3000
            });
        } else {
            // Dealer doesn't have blackjack, insurance lost
            Globals.emitter?.Call("show_notification", {
                message: "Insurance lost",
                duration: 2000
            });
        }
        
        // Close insurance popup
        this.popupManager.hidePopup();
    }
    
    /**
     * Handle split result from server
     */
    private handleSplitResult(data: any): void {
        const { playerHand, splitHand, activeHand, balance } = data;
        
        // Update balance
        if (balance !== undefined) {
            Globals.balance = balance;
            this.uiContainer.updateBalance(balance);
        }
        
        // Update hands from server data
        if (playerHand) {
            this.blackjackDealer.updatePlayerHandFromServer(playerHand);
        }
        
        if (splitHand) {
            this.blackjackDealer.updateSplitHandFromServer(splitHand);
        }
        
        // Set the active hand
        if (activeHand) {
            this.blackjackDealer.setActiveSplitHand(activeHand);
            this.highlightActiveSplitHand(activeHand);
        }
        
        // Hide split and insurance buttons, show hit/stand
        this.gameButtonsContainer.hideSplitButton();
        this.gameButtonsContainer.hideInsuranceButton();
        this.gameButtonsContainer.showHitStandButtons();
        
        // Check if double down is still allowed for the first hand
        if (data.allowedActions && data.allowedActions.includes('doubleDown')) {
            this.gameButtonsContainer.showDoubleButton();
        } else {
            this.gameButtonsContainer.hideDoubleButton();
        }
    }
    
    /**
     * Handle dealer turn animation
     */
    private handleDealerTurn(): void {
        // First reveal dealer's hole card if not already revealed
        this.revealDealerCardIfNeeded();
        
        // Then proceed with dealer turn (will be handled by backend)
        console.log("Dealer turn in progress...");
        
        // Notify UI to hide buttons during dealer turn
        this.gameButtonsContainer.hideAllButtons();
    }
    
    /**
     * Reveal dealer's hole card if needed
     */
    private revealDealerCardIfNeeded(): void {
        if (this.blackjackDealer && 
            this.blackjackDealer.dealerHand && 
            this.blackjackDealer.dealerHand.cards.length > 1 && 
            !this.blackjackDealer.dealerHand.cards[1].faceUp) {
            
            // Reveal the dealer's hole card by calling the appropriate method on the hand
            if (typeof this.blackjackDealer.dealerHand.revealDealerCard === 'function') {
                this.blackjackDealer.dealerHand.revealDealerCard();
            } else {
                console.warn("revealDealerCard method not available on dealer hand");
                // Make the card face up directly as a fallback
                this.blackjackDealer.dealerHand.cards[1].faceUp = true;
                this.blackjackDealer.dealerHand.calculateValue();
            }
        }
    }
    
    /**
     * Handle game outcome
     */
    private handleGameOutcome(data: any): void {
        const { outcome, message, payout, playerBalance } = data;
        
        // Update balance
        if (playerBalance !== undefined) {
            Globals.balance = playerBalance;
            this.uiContainer.updateBalance(Globals.balance);
        }
        
        // Show game result
        if (this.result) {
            this.result.showResult(outcome, message || "Game ended", payout || 0);
        }
        
        // Update game state
        this.gameState = 'gameEnd';
        
        // Show play on button after a short delay
        setTimeout(() => {
            this.gameButtonsContainer.showButtonGroup('gameEnd');
        }, 2000);
    }
    
    /**
     * Display insurance popup
     * @param dealerCard - The dealer's face-up card
     * @param insuranceAmount - The amount of insurance
     */
    private showInsurancePopup(dealerCard: any, insuranceAmount: number): void {
        // Display insurance popup
        this.popupManager.showInsurancePopup(
            dealerCard,
            insuranceAmount,
            // Yes callback
            () => {
                if (Globals.backendService) {
                    Globals.backendService.insurance(true);
                }
            },
            // No callback
            () => {
                if (Globals.backendService) {
                    Globals.backendService.insurance(false);
                }
            }
        );
    }

    /**
     * Handle bet click from the table
     */
    onBetClicked(chipType: any, chipValue: number) {
        console.log("Bet clicked", chipType, chipValue);
        
        // Prevent rapid clicking or clicking during clear operation
        if (this._betClickDebounce || this._pendingClearOperation) {
            console.log("Bet click debounced or clear in progress, ignoring");
            return;
        }
        
        // Set debounce flag (will be reset after a short delay)
        this._betClickDebounce = true;
        
        // Only allow betting in betting phase
        if (this.gameState !== 'betting') {
            console.log("Cannot bet - not in betting phase");
            this._betClickDebounce = false;
            return;
        }
        
        // Check if the player has enough balance
        if (Globals.balance < chipValue) {
            console.log("Not enough balance to place bet");
            this._betClickDebounce = false;
            return;
        }
        
        // When connected to backend, send the bet action to the server
        if (this.shouldUseBackend()) {
            // Update UI immediately for responsive feel
            Globals.balance -= chipValue;
            Globals.currentBet += chipValue;
            this.lastBetAmount = Globals.currentBet;
            
            // Update UI
            this.uiContainer.updateBalance(Globals.balance);
            
            // Send the bet action to the server
            this.handleGameAction('bet', { amount: chipValue });
            
            // Update bet amount display
            const formattedBet = formatBetAmount(Globals.currentBet);
            this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formattedBet} Chips`);
            
            // Ensure the bet holder is visible
            if (!this.chipsZone.betHolder.visible) {
                this.chipsZone.showBetDisplay(Globals.currentBet);
            }
            
            // Ensure betting buttons are shown (only if needed)
            this.showBettingButtonsIfNeeded();
            
            // Reset debounce flag after a longer delay (150ms) - gives time for animations
            setTimeout(() => {
                this._betClickDebounce = false;
            }, 150);
            
            return;
        }
        
        // Fallback to local implementation
        Globals.balance -= chipValue;
        Globals.currentBet += chipValue;
        this.lastBetAmount = Globals.currentBet;
        
        // Update UI
        this.uiContainer.updateBalance(Globals.balance);
        this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet)} Chips`);
        
        // Ensure the bet holder is visible
        if (!this.chipsZone.betHolder.visible) {
            this.chipsZone.showBetDisplay(Globals.currentBet);
        }
        
        
        // Reset debounce flag after a longer delay
        setTimeout(() => {
            this._betClickDebounce = false;
        }, 150);
    }

    /**
     * Handle deal button click
     */
    onDealClicked() {
        console.log("Deal clicked");
        
        // Only allow dealing in betting phase with a bet placed
        if (this.gameState !== 'betting' || Globals.currentBet <= 0) {
            console.log("Cannot deal - not in betting phase or no bet placed");
            return;
        }
        
        // When connected to backend, send the deal action to the server
        if (this.shouldUseBackend()) {
            this.handleGameAction('deal');
            return;
        }
        
        // Fallback to local implementation
        this.gameState = 'playing';
        this.blackjackDealer.dealInitialCards();
        
        // Hide betting buttons
        this.gameButtonsContainer.hideAllButtons();
        
        // Show appropriate gameplay buttons
        this.setupGameEventCallback();
    }

    /**
     * Handle double down button click
     */
    onDoubleDownClicked() {
        console.log("Double Down clicked");
        
        // Only allow double down in playing phase
        if (this.gameState !== 'playing') {
            console.log("Cannot double down - not in playing phase");
            return;
        }
        
        // Check if an action has been in progress for too long and reset if needed
        this.checkForStuckAction();
        
        // Prevent multiple concurrent actions
        if (this.blackjackDealer.actionInProgress) {
            console.log("Action already in progress, ignoring double down");
            return;
        }
        
        // Check if player has enough balance to double down
        if (Globals.balance < Globals.currentBet) {
            console.log("Not enough balance to double down");
            return;
        }
        
        // Use backend if connected
        if (this._isConnectedToBackend && Globals.backendService) {
            // Send double down command to backend
            Globals.backendService.doubleDown();
            Globals.lastAction = 'doubleDown';
            return;
        }
        
        // Fallback to local implementation
        Globals.balance -= Globals.currentBet;
        Globals.currentBet *= 2;
        
        // Update UI
        this.uiContainer.updateBalance(Globals.balance);
        this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet)} Chips`);
        
      
        // Hide all buttons during dealer's turn
        this.gameButtonsContainer.hideAllButtons();
    }

    /**
     * Handle play on button click
     * This transitions the game from EndGame phase back to Betting phase
     */
    onPlayOnClicked() {
        console.log("Play On clicked - Transitioning to Betting phase");
        
        // Phase validation: Only allow transition from EndGame phase
        if (this.gameState !== 'gameEnd') {
            console.log("Cannot play on - not in game end phase");
            Globals.emitter?.Call("show_notification", {
                message: "Game not completed yet",
                duration: 1500,
                color: 0xDD0000
            });
            return;
        }
        
        // PHASE TRANSITION: EndGame → Betting
        
        // 1. Set UI state to indicate transition
        this.gameButtonsContainer.hideAllButtons();
        
        // 2. Show loading indicator
        Globals.emitter?.Call("show_notification", {
            message: "Starting new round...",
            duration: 1500,
            color: 0xFFFFFF
        });
        
        // 3. Animate the transition visually
        this.resetGame(() => {
            // 4. Send request to backend to transition to betting phase
            if (Globals.backendService) {
                Globals.backendService.returnToBettingPhase();
            }
            
            // 5. Update local game state
            this.gameState = 'betting';
            
            // 6. Re-enable chip selection
            this.table.makeButtonsActive(true);
        });
        
        console.log("New round ready - Phase transitioned to Betting");
    }

    /**
     * Check if backend connectivity should be used
     * @returns Always true since all game logic is managed by the backend
     */
    private shouldUseBackend(): boolean {
        // Always use backend for game logic - local game logic has been removed
        return true;
    }


    /**
     * Centralized handler for all gameplay actions
     * This ensures all player actions are routed through the backend when available
     * @param action The action to perform
     * @param params Additional parameters for the action
     */
    private handleGameAction(action: string, params: any = {}): void {
        // Prevent redundant actions if one is already in progress
        if (this.blackjackDealer.actionInProgress && 
            !(action === 'stand' && this.blackjackDealer.currentAction === 'hit')) {
            console.log(`Action ${action} skipped - action ${this.blackjackDealer.currentAction} already in progress`);
            return;
        }
        
        console.log(`Sending action to backend: ${action}`, params);
        
        // Track the action being sent to backend
        this.blackjackDealer.actionInProgress = true;
        this.blackjackDealer.currentAction = action;
        this.blackjackDealer.actionStartTime = Date.now();
        
        // Set a safety timeout to reset action flag if no response is received
        // This prevents the UI from getting stuck if there's a communication issue
        const safetyTimeout = setTimeout(() => {
            if (this.blackjackDealer.actionInProgress && this.blackjackDealer.currentAction === action) {
                console.log(`Safety timeout triggered for action ${action} - resetting action in progress state`);
                this.blackjackDealer.actionInProgress = false;
                this.blackjackDealer.currentAction = '';
                this.blackjackDealer.actionStartTime = 0;
            }
        }, 3000); // 3 second safety timeout
        
        // Send action to backend with error handling
        try {
            // Ensure backendService exists
            if (!Globals.backendService) {
                throw new Error("Backend service not available");
            }
            
            // Direct call to the appropriate backend service method
            switch(action) {
                case 'bet':
                    Globals.backendService.placeBet(params.amount);
                    break;
                case 'deal':
                    Globals.backendService.dealCards();
                    break;
                case 'hit':
                    Globals.backendService.hit(params.hand);
                    break;
                case 'stand':
                    Globals.backendService.stand(params.hand);
                    break;
                case 'doubleDown':
                    Globals.backendService.doubleDown();
                    break;
                case 'split':
                    Globals.backendService.split();
                    break;
                case 'insurance':
                    Globals.backendService.insurance(params.takeInsurance);
                    break;
                case 'surrender':
                    Globals.backendService.surrender();
                    break;
                case 'rebet':
                    Globals.backendService.rebet();
                    break;
                case 'clearBet':
                    Globals.backendService.clearBet();
                    break;
                default:
                    console.error(`Unknown action: ${action}`);
                    // Clear the action in progress state
                    clearTimeout(safetyTimeout);
                    this.blackjackDealer.actionInProgress = false;
                    this.blackjackDealer.currentAction = '';
                    this.blackjackDealer.actionStartTime = 0;
            }
            
            // Set a timeout to clear action in progress if no response
            // This prevents UI from being stuck if backend doesn't respond
            setTimeout(() => {
                if (this.blackjackDealer.actionInProgress && this.blackjackDealer.currentAction === action) {
                    console.warn(`Action ${action} timed out, resetting state`);
                    this.blackjackDealer.actionInProgress = false;
                    this.blackjackDealer.currentAction = '';
                    this.blackjackDealer.actionStartTime = 0;
                    
                    // Show appropriate buttons based on game state
                    if (this.gameState === 'playing') {
                        this.gameButtonsContainer.showGameplayButtons();
                    } else if (this.gameState === 'betting') {
                        this.showBettingButtonsIfNeeded();
                    }
                }
            }, 5000); // 5 second timeout
            
        } catch (error) {
            clearTimeout(safetyTimeout);
            this.handleBackendError(error, action);
        }
    }
    
    /**
     * Handle backend errors with specific messaging based on error type
     * @param error The error that occurred
     * @param action The action that failed
     */
    private handleBackendError(error: any, action: string): void {
        console.error(`Backend error during ${action}:`, error);
        
        // Clear the action in progress state
        this.blackjackDealer.actionInProgress = false;
        this.blackjackDealer.currentAction = '';
        this.blackjackDealer.actionStartTime = 0;
        
        // Default error message
        let errorMessage = "Connection error. Please try again.";
        let errorColor = 0xDD0000;
        
        // Check for specific error types based on the error object and action
        if (error && typeof error === 'object') {
            // Handle specific error codes or messages
            if (error.code === "INSUFFICIENT_FUNDS" || error.message?.includes("insufficient")) {
                errorMessage = "Insufficient funds for this action.";
            } 
            else if (error.code === "INVALID_BET" || error.message?.includes("bet")) {
                errorMessage = "Invalid bet amount.";
            }
            else if (error.code === "SPLIT_NOT_ALLOWED" || error.message?.includes("split")) {
                errorMessage = "Cannot split these cards.";
            }
            else if (error.code === "DOUBLE_NOT_ALLOWED" || error.message?.includes("double")) {
                errorMessage = "Double down not allowed in this situation.";
            }
            else if (error.code === "INSURANCE_NOT_AVAILABLE" || error.message?.includes("insurance")) {
                errorMessage = "Insurance not available.";
            }
            else if (error.code === "CONNECTION_ERROR" || error.message?.includes("connection")) {
                errorMessage = "Connection to game server lost. Please try again.";
                // Try to reconnect after a delay
                setTimeout(() => {
                    if (Globals.backendService) {
                        // Use connect instead of reconnect as that's the available method
                        Globals.backendService.connect();
                    }
                }, 5000);
            }
            // Use error message from the error object if available
            if (error.message && typeof error.message === 'string') {
                errorMessage = error.message;
            }
        }
        
        // Show error notification to user
        Globals.emitter?.Call("show_notification", {
            message: errorMessage,
            duration: 3000,
            color: errorColor
        });
        
        // Show appropriate buttons based on game state
        if (this.gameState === 'playing') {
            this.gameButtonsContainer.showGameplayButtons();
        } else if (this.gameState === 'betting') {
             this.showBettingButtonsIfNeeded();
        }
    }

  


 
   
    /**
     * Update the connection status indicator
     * @param isConnected - Whether connected to the backend
     */
    private updateConnectionIndicator(isConnected: boolean): void {
        // Update icon texture based on connection status
        const iconTexture = isConnected ? 
            Globals.resources.connectionOnline || Globals.resources.GreenNormal : 
            Globals.resources.connectionOffline || Globals.resources.RedNormal;
        
        this._connectionStatusIcon.texture = iconTexture;
        this._connectionStatusIcon.width = 16;
        this._connectionStatusIcon.height = 16;
        
        // Update text based on connection status
        this._connectionStatusText.updateLabelText(isConnected ? "Online" : "Offline");
        this._connectionStatusText.updateColor(isConnected ? 0x00AA00 : 0xAA0000);
        
        // Position the indicator in the corner of the screen
        this._connectionIndicator.position.set(
            window.innerWidth - 100,
            30
        );
        
        // Show or hide based on debug settings
        this._connectionIndicator.visible = true;
    }


    
    /**
     * Check if player can split based on their hand
     * This is now determined by the backend, but we provide this helper for UI
     * @returns Whether split appears possible based on local card state
     */
    private canPlayerSplit(): boolean {
      const playerHand = this.blackjackDealer.playerHand;
      // Need exactly 2 cards of the same rank to split
      return playerHand.cards.length === 2 && 
             playerHand.cards[0].value === playerHand.cards[1].value && 
             Globals.balance >= Globals.currentBet;
    }
    
    /**
     * Show the appropriate outcome popup based on game result
     * @param outcome - The game outcome
     */
    private showOutcomePopup(outcome: GameOutcome): void {
        console.log(`Showing outcome popup for: ${outcome}`);
      
        // Handle insurance outcomes
        if (outcome === GameOutcome.INSURANCE_WON || outcome === GameOutcome.INSURANCE_LOST) {
            this.popupManager.showInsurancePopup(outcome === GameOutcome.INSURANCE_WON);
            return;
        }
      
        // Handle split outcomes with special handling
        if (outcome === GameOutcome.SPLIT_WIN || 
            outcome === GameOutcome.SPLIT_LOSE || 
            outcome === GameOutcome.SPLIT_PUSH ||
            outcome === GameOutcome.SPLIT_WIN_LOSE ||
            outcome === GameOutcome.SPLIT_WIN_PUSH ||
            outcome === GameOutcome.SPLIT_LOSE_PUSH) {
          
            // For now, map split outcomes to standard outcomes for popup display
            // In the future, you could create dedicated split outcome popups
            let mappedOutcome: GameOutcome;
          
            switch (outcome) {
                case GameOutcome.SPLIT_WIN:
                    mappedOutcome = GameOutcome.PLAYER_WIN;
                    break;
                case GameOutcome.SPLIT_LOSE:
                    mappedOutcome = GameOutcome.DEALER_WIN;
                    break;
                case GameOutcome.SPLIT_PUSH:
                    mappedOutcome = GameOutcome.PUSH;
                    break;
                case GameOutcome.SPLIT_WIN_LOSE:
                case GameOutcome.SPLIT_WIN_PUSH:
                    mappedOutcome = GameOutcome.PLAYER_WIN;
                    break;
                case GameOutcome.SPLIT_LOSE_PUSH:
                    mappedOutcome = GameOutcome.DEALER_WIN;
                    break;
                default:
                    mappedOutcome = outcome;
            }
          
            this.popupManager.showOutcomePopup(mappedOutcome);
            return;
        }
      
        // For standard outcomes, use popup manager directly
        this.popupManager.showOutcomePopup(outcome);
      
        // End game popups now persist until a button is clicked - no auto-hide
    }
  
    /**
     * Create and display chips for a bet amount
     * @param betAmount - The bet amount to create chips for
     * @param addDouble - Whether this is a double down operation
     * @param forRebet - Whether this is a rebet operation
     */
    private createChipsForBet(betAmount: number, addDouble: boolean = false, forRebet: boolean = false): void {
        console.log("Creating chips for bet amount:", betAmount, forRebet ? "(for rebet)" : "");
      
        // Get available chip values from the table
        const availableChips = this.table.chips.map(chip => chip.value).sort((a, b) => b - a);
      
        if (availableChips.length === 0) {
            console.warn("No chips available to create bet");
            return;
        }
      
        // Calculate how many of each chip to use (greedy algorithm)
        let remainingAmount = betAmount;
        const chipsToCreate: { value: number, count: number }[] = [];
      
        for (const chipValue of availableChips) {
            if (remainingAmount >= chipValue) {
                const count = Math.floor(remainingAmount / chipValue);
                chipsToCreate.push({ value: chipValue, count });
                remainingAmount -= count * chipValue;
            }
        }
      
        // If there's still a remaining amount, add the smallest chip
        if (remainingAmount > 0 && availableChips.length > 0) {
            const smallestChip = availableChips[availableChips.length - 1];
            chipsToCreate.push({ value: smallestChip, count: 1 });
        }
      
        console.log("Chips to create:", chipsToCreate);
      
        // Create and add each chip
        chipsToCreate.forEach(chipInfo => {
            for (let i = 0; i < chipInfo.count; i++) {
                // Find the matching chip in the table
                const tableChip = this.table.chips.find(c => c.value === chipInfo.value);
            
                if (tableChip) {
                    // Create chip data with the same properties as the table chip
                    const chipData = {
                        value: tableChip.value,
                        texture: tableChip.texture
                    };
                    // Add the chip to the betting area, passing the forRebet flag
                    this.addChip(chipData as any, addDouble, forRebet);
                }
            }
        });
        // Ensure the bet display is visible after creating all chips
        if (Globals.currentBet > 0 && !this.chipsZone.betHolder.visible) {
            this.chipsZone.showBetDisplay(Globals.currentBet);
        }
    }

    /**
     * Helper method to check if an action has been stuck for too long and reset if needed
     */
    private checkForStuckAction(): void {
        // If an action has been in progress for more than 5 seconds, it's probably stuck
        if (this.blackjackDealer.actionInProgress && 
            this.blackjackDealer.actionStartTime > 0 &&
            Date.now() - this.blackjackDealer.actionStartTime > 5000) {
            
            console.log(`Action ${this.blackjackDealer.currentAction} has been stuck for too long, resetting`);
            this.blackjackDealer.actionInProgress = false;
            this.blackjackDealer.currentAction = '';
            this.blackjackDealer.actionStartTime = 0;
            
            // Re-show appropriate buttons
            if (this.gameState === 'playing') {
                this.gameButtonsContainer.showGameplayButtons();
            } else if (this.gameState === 'betting') {
                 this.showBettingButtonsIfNeeded();
            }
        }
    }

    /**
     * Check if betting buttons are already visible
     * @returns True if betting buttons are already visible
     */
    private areBettingButtonsVisible(): boolean {
        return this.gameButtonsContainer.areBettingButtonsVisible();
    }

    /**
     * Show betting buttons only if they're not already visible
     */
    private showBettingButtonsIfNeeded(): void {
        if (!this.areBettingButtonsVisible()) {
            this.gameButtonsContainer.showButtonGroup('betting');
        }
    }
} 