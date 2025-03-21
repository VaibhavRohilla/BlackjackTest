import { Easing } from "@tweenjs/tween.js";
import { Tween } from "@tweenjs/tween.js";
import { Container, Sprite } from "pixi.js";
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
    

    unlockShopCallback: () => void = () => {};
    cancelShopCallBack: () => void = () => {};
    shopPopup: ShopPopup = new ShopPopup(this.unlockShopCallback, this.cancelShopCallBack);
  



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
    }

    /**
     * Initialize all components in the proper order
     */
    initializeComponents() {
        Globals.deck = this.deck;
        Globals.popupManager = this.popupManager;
        
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
              this.gameButtonsContainer.showBettingButtons();
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
        
        // Verify the game is in the playing state
        if (this.gameState !== "playing") {
            console.log("Cannot split: game not in progress");
            return;
        }
        
        // Check if player can split
        if (!this.canSplit()) {
            if (Globals.balance < Globals.currentBet) {
                console.log("Not enough balance to split");
            } else {
                console.log("Cannot split: conditions not met");
            }
            return;
        }
        
        // Check if player has enough balance to split (needs to match current bet)
        if (Globals.balance < Globals.currentBet) {
            console.log("Not enough balance to split");
            return;
        }
        
        // Add debounce for rapid clicks
        if ((this as any)._processingSplit) {
            console.log("Already processing Split action, ignoring duplicate click");
            return;
        }
        
        // Set flag to prevent multiple calls
        (this as any)._processingSplit = true;
        
        try {
            // Deduct the split bet from the balance
            Globals.balance -= Globals.currentBet;
            
            // Update the UI to reflect the new balance
            this.uiContainer.updateBalance(Globals.balance);
            
            // Create chips for the split bet - use forRebet=true to prevent double counting 
            this.createChipsForBet(Globals.currentBet, false, true);
            
            // Hide all buttons to prevent UI conflicts
            this.gameButtonsContainer.hideAllButtons();
            
            // Player splits their hand
            this.blackjackDealer.playerSplit();
            
            // Clear existing event listeners to prevent duplicates
            
                Globals.emitter?.Call("splitPerformed");
                Globals.emitter?.Call("splitHandSwitch");
            
            
            // Setup event listeners for split-specific events with proper delays
            Globals.emitter?.Call("splitPerformed", (data: any) => {
                console.log("Split performed, showing split-spe cific buttons");
                
                // Ensure we wait for animations to complete
                setTimeout(() => {
                    // Hide any existing buttons to prevent duplicate groups
                    this.gameButtonsContainer.hideAllButtons();
                    
                    // Show appropriate buttons for split hand - use the dedicated method
                    this.gameButtonsContainer.showButtonGroup('gameplayWithoutSplit');
                    
                    this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet * 2)} Chips`);
                }, 800); // Increased delay for animation completion
            });
            
            // Listen for hand switch events
            Globals.emitter?.Call("splitHandSwitch", (data: any) => {
                console.log(`Switching to ${data.activeHand} hand`);
                
                // Hide any existing buttons to prevent duplicates
                this.gameButtonsContainer.hideAllButtons();
                
                // Add a delay to ensure UI stability
                setTimeout(() => {
                    // Show appropriate buttons for the active split hand
                    this.gameButtonsContainer.showButtonGroup('gameplayWithoutSplit');
                }, 400);
            });
        } finally {
            // Clear the processing flag after a delay
            setTimeout(() => {
                (this as any)._processingSplit = false;
            }, 1000);
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
    console.log("Updating UI after adding chip:", chipValue, forRebet ? "(for rebet)" : "");
 
    // Update current bet only if not a rebet operation
    if (!forRebet) {
      Globals.currentBet += chipValue;
    }
    
    // Update balance display
    this.uiContainer.updateBalance();
    
    // Update bet amount display
    this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet)} Chips`);
    
    // Show bet holder and betting buttons if not already visible
    if(!this.chipsZone.betHolder.visible) {
      this.chipsZone.betHolder.isVisible(true);
      this.showGameButtons('betting');
    }
  }
    onHitClicked() {
        // Add debounce for rapid clicks
        if ((this as any)._processingHit) {
            console.log("Already processing Hit action, ignoring duplicate click");
            return;
        }
        
        // Set flag to prevent multiple calls
        (this as any)._processingHit = true;
        
        try {
            if (this.gameState != "playing") {
                console.log("Game not in progress, Hit button should only be used during gameplay");
                return;
            }
            
            console.log("Hit clicked");
            
            // Disable all buttons temporarily to prevent spam clicking
            this.gameButtonsContainer.hideAllButtons();
            
            const attemptHit = (retryCount = 0, maxRetries = 5) => {
                if (retryCount >= maxRetries) {
                    console.error("Failed to execute hit after multiple attempts");
                    // Don't restore buttons, let the active hand handler show the right buttons
                    (this as any)._processingHit = false;
                    return;
                }
                
                try {
                    // Check if we're in a split hand scenario
                    if (this.blackjackDealer.splitHand) {
                        // Get which hand is active
                        const activeHand = this.blackjackDealer.getActiveSplitHand();
                        if (!activeHand) {
                            console.error("Split hand exists but no active hand is set");
                            this.blackjackDealer.setActiveSplitHand('first');
                            console.log("Defaulting to first split hand");
                        }
                        
                        // Use the active hand or default to 'first'
                        const handToHit = activeHand || 'first';
                        console.log(`Hit on split hand: ${handToHit}`);
                        
                        // Call the appropriate hit method for split hands
                        this.blackjackDealer.playerHitSplitHand(handToHit);
                        
                        // Since split hand hit doesn't set the callback, we need to set a timeout
                        // to check the hand status after animation completes
                        setTimeout(() => {
                            // Check if the game is still in progress
                            if (this.gameState === "playing") {
                                const activeHand = this.blackjackDealer.getActiveSplitHand();
                                
                                if (activeHand === 'first') {
                                    const firstHand = this.blackjackDealer.playerHand;
                                    
                                    // Auto-switch logic for first hand
                                    if (firstHand.value >= 21) {
                                        console.log(`First hand has ${firstHand.value}, auto-switching to second hand`);
                                        
                                        // Clear processing flag to allow proper event handling
                                        (this as any)._processingHit = false;
                                        
                                        // Switch to second hand after a short delay
                                        setTimeout(() => {
                                            this.blackjackDealer.setActiveSplitHand('second');
                                        }, 600);
                                        
                                        return; // Return early, let activeHandChanged handle buttons
                                    } else {
                                        // Show appropriate buttons with a delay to avoid conflicts
                                        this.safelyShowButtonGroup('gameplayAfterHit', 500);
                                        setTimeout(() => {
                                            (this as any)._processingHit = false;
                                        }, 200);
                                    }
                                } else {
                                    // Second hand - check for bust/21
                                    const secondHand = this.blackjackDealer.splitHand;
                                    if (secondHand && (secondHand.value >= 21)) {
                                        console.log(`Second hand has ${secondHand.value}, showing stand-only button`);
                                        
                                        // For busted or 21 hands, only show stand
                                        setTimeout(() => {
                                            this.gameButtonsContainer.hideAllButtons();
                                            this.gameButtonsContainer.showGameplayAfter21Buttons();
                                            (this as any)._processingHit = false;
                                        }, 400);
                                    } else {
                                        // Normal second hand, just use after hit buttons
                                        this.safelyShowButtonGroup('gameplayAfterHit', 500);
                                        setTimeout(() => {
                                            (this as any)._processingHit = false;
                                        }, 200);
                                    }
                                }
                            } else {
                                // Game no longer in playing state
                                (this as any)._processingHit = false;
                            }
                        }, 800);
                    } else {
                        // Regular hit for non-split scenario
                        this.blackjackDealer.playerHit();
                        
                        // Set up a callback to evaluate the hand after the hit completes
                        const checkHandAndShowButtons = () => {
                            // Check player hand and show appropriate buttons 
                            // (this method handles button display internally)
                            this.checkPlayerHandAfterHit();
                            
                            // Clear processing flag after a short delay
                            setTimeout(() => {
                                (this as any)._processingHit = false;
                            }, 300);
                        };
                        
                        // Set callback on player hand
                        if (this.blackjackDealer.playerHand.onCardRevealComplete !== undefined) {
                            this.blackjackDealer.playerHand.onCardRevealComplete = checkHandAndShowButtons;
                        } else {
                            // If callback not available, use timeout
                            setTimeout(checkHandAndShowButtons, 500);
                        }
                    }
                } catch (error) {
                    console.log("Hit failed, retrying in 300ms...", error);
                    setTimeout(() => attemptHit(retryCount + 1), 300);
                }
            };
            
            // Start the hit attempt process
            attemptHit();
        } catch (error) {
            console.error("Error in hit action:", error);
            // Release the processing flag in case of error
            (this as any)._processingHit = false;
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
        // Add debounce for rapid clicks
        if ((this as any)._processingStand) {
            console.log("Already processing Stand action, ignoring duplicate click");
            return;
        }
        
        // Set flag to prevent multiple calls
        (this as any)._processingStand = true;
        
        try {
            if (this.gameState != "playing") {
                return;
            }
            
            console.log("Stand clicked");
            
            // Close any active popups (including insurance popup) before proceeding
            this.popupManager.hidePopup();
            
            // Hide all buttons to prevent further interaction during the process
            this.gameButtonsContainer.hideAllButtons();
            
            // Retry mechanism for when the stand action is blocked by another action in progress
            const attemptStand = (retryCount = 0, maxRetries = 5) => {
                if (retryCount >= maxRetries) {
                    console.error("Failed to execute stand after multiple attempts");
                    // Don't restore buttons, let the game state handle it
                    (this as any)._processingStand = false;
                    return;
                }
                
                // Check if we're in a split hand scenario
                if (this.blackjackDealer.splitHand) {
                    // Get which hand is active
                    const activeHand = this.blackjackDealer.getActiveSplitHand();
                    if (!activeHand) {
                        console.error("Split hand exists but no active hand is set");
                        this.blackjackDealer.setActiveSplitHand('first');
                    }
                    
                    const handToStand = activeHand || 'first';
                    console.log(`Stand on split hand: ${handToStand}`);
                    
                    // If it's the first hand, switch to the second hand
                    if (handToStand === 'first') {
                        // Try to set active split hand, but handle if another action is in progress
                        if (this.blackjackDealer.actionInProgress) {
                            console.log("Cannot stand yet - waiting for current action to complete");
                            setTimeout(() => attemptStand(retryCount + 1), 500);
                            return;
                        }
                        
                        // Switch to second hand
                        console.log("Switching from first to second hand after stand");
                        
                        // Make sure to hide all buttons before switching to prevent overlaps
                        this.gameButtonsContainer.hideAllButtons();
                        
                        // First complete the standing action on the first hand
                        try {
                            this.blackjackDealer.playerStand();
                        } catch (error) {
                            console.error("Error standing on first hand:", error);
                        }
                        
                        // Clear the processing flag immediately to prevent conflicts
                        (this as any)._processingStand = false;
                        
                        // Add a delay to ensure UI and game state are fully updated
                        setTimeout(() => {
                            // Set the second hand as active
                            this.blackjackDealer.setActiveSplitHand('second');
                            
                            // Highlight the second hand
                            this.highlightActiveSplitHand('second');
                            
                            // Let the activeHandChanged event handle showing buttons
                            // This avoids duplicate button groups
                        }, 700);
                    } else {
                        // For the second hand, stand proceeds to dealer turn
                        console.log("Standing on second hand, proceeding to dealer turn");
                        
                        // Try to execute stand, but handle if another action is in progress
                        try {
                            this.blackjackDealer.playerStand();
                        } catch (error) {
                            console.log("Stand failed, retrying in 500ms...", error);
                            setTimeout(() => attemptStand(retryCount + 1), 500);
                        }
                    }
                } else {
                    // Regular stand for non-split scenario
                    try {
                        // Check if hit is in progress
                        if (this.blackjackDealer.actionInProgress && this.blackjackDealer.currentAction === 'hit') {
                            console.log("Hit in progress, stand will be queued after hit completes");
                            // No need to retry, the dealer will handle it automatically
                            this.blackjackDealer.playerStand();
                        } else if (this.blackjackDealer.actionInProgress) {
                            console.log("Another action in progress, retrying in 500ms...");
                            setTimeout(() => attemptStand(retryCount + 1), 500);
                        } else {
                            this.blackjackDealer.playerStand();
                        }
                    } catch (error) {
                        console.log("Stand failed, retrying in 500ms...", error);
                        setTimeout(() => attemptStand(retryCount + 1), 500);
                    }
                }
            };
            
            // Start the stand attempt process
            attemptStand();
        } finally {
            // Clear the processing flag after a delay to prevent rapid clicks
            // Only clear if regular game or second split hand (first hand was cleared early)
            if (!this.blackjackDealer.splitHand || 
                this.blackjackDealer.getActiveSplitHand() === 'second') {
                setTimeout(() => {
                    (this as any)._processingStand = false;
                }, 1000);
            }
        }
    }

      onClearClicked() {
        console.log("Clear action");
    
        // If game is in progress, can't clear
        if (this.gameState == "playing") {
          console.log("Can't clear during a game");
          return;
        }
        
        // Store the current bet value before resetting
        const currentBetAmount = Globals.currentBet;
        
        // Hide buttons
        this.gameButtonsContainer.hideAllButtons();
        
        // Reset the current bet
        Globals.currentBet = 0;
       
        // Edge case: If there are no chips or bet is 0, just reset everything
        if (this.chipsZone.investedChips.length === 0 || currentBetAmount <= 0) {
          // Update the bet display
          this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");
          this.chipsZone.betHolder.isVisible(false);
          return;
        }
        
        // Store chips to be removed
        this.chipsZone.removeChips = [...this.chipsZone.investedChips];
        this.chipsZone.investedChips = [];
        
        // Animate chips flying out of the canvas
        this.chipsZone.tweenChipsOut(() => {
          // Update balance after animation completes
          Globals.balance += currentBetAmount;
          this.uiContainer.updateBalance();
          this.table.makeButtonsActive(true);
          
          // Update the bet display
          this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");
          this.chipsZone.betHolder.isVisible(false);
        });
      }
      
    onPlayOnClicked() {
        console.log("Play On button clicked");
        
        // Check if we can start a new round
        if (this.gameState !== 'gameEnd') {
            console.log("Can only play on after a game has ended");
            return;
        }
        
        // Hide any active popups - this will close the end game popup
        this.popupManager.hidePopup();
        
        // Reset the game state completely
        this.resetGame();
        
        // Go back to betting state without placing any bet
        this.gameState = 'betting';
        
        
        // Re-enable chip selection
        this.table.makeButtonsActive(true);
    }
    onPlayClicked() {
        console.log("Play button clicked");
        
        if (this.gameState !== 'betting' || Globals.currentBet <= 0) {
            console.log("Cannot start game: not in betting state or no bet placed");
            return;
        }
        
        // Start the game with current bet
        this.startGame(undefined, true);
    }
    onSurrenderClicked() {
        console.log("Surrender action");
    
    if (this.gameState == "playing") {
      // Close any active popups (including insurance popup) before proceeding
      this.popupManager.hidePopup();
      
      
      // Hide all buttons
      this.gameButtonsContainer.hideAllButtons();
      
      // Surrender (give up half the bet)
      this.blackjackDealer.playerSurrender();
      
      // Note: We don't call resetGame() here anymore
      // The BlackjackDealer.playerSurrender() will call endGame with SURRENDER outcome
      // which will trigger handleGameEnd and show the proper popup
      // This matches the flow of other game end scenarios
    }
  }
    onDoubleClicked() {
        if (this.gameState != "playing") {
            return;
        }
        
        console.log("Double Down clicked");
        
        // Check if player has enough balance to double down
        if (Globals.balance < Globals.currentBet) {
          console.log("Not enough balance to double down");
          return;
        }
        
        // Close any active popups before proceeding
        this.popupManager.hidePopup();
        
        // Hide all buttons
        this.gameButtonsContainer.hideAllButtons();
        
        // Store original bet for doubling
        const originalBet = Globals.currentBet;
        
        // Check if we're in a split hand scenario
        if (this.blackjackDealer.splitHand) {
            // Get which hand is active
            const activeHand = this.blackjackDealer.getActiveSplitHand();
            if (!activeHand) {
                console.error("Split hand exists but no active hand is set");
                this.blackjackDealer.setActiveSplitHand('first');
            }
            
            const handToDouble = activeHand || 'first';
            console.log(`Double down on split hand: ${handToDouble}`);
            
            // Deduct the additional bet from balance
            Globals.balance -= originalBet;
            
            // Update the bet amount
            Globals.currentBet = originalBet * 2;
            
            // Create visual chips for the doubled amount - we use createChipsForBet with 
            // a single bet amount to avoid doubling issues
            this.createChipsForBet(originalBet, false, true);
            
            // Execute the double down in BlackjackDealer
            this.blackjackDealer.playerDoubleDown();
        } else {
            // Regular double down for non-split scenario
            // Deduct the additional bet from balance
            Globals.balance -= originalBet;
            
            // Update the bet amount
            Globals.currentBet = originalBet * 2;
            
            // Create visual chips for the doubled amount - we use createChipsForBet with 
            // a single bet amount to avoid doubling issues
            this.createChipsForBet(originalBet, false, true);
            
            // Execute the double down in BlackjackDealer
            this.blackjackDealer.playerDoubleDown();
        }
        
        // Update UI to reflect the changes
        this.uiContainer.updateBalance(Globals.balance);
        
        // Update bet display
        this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet)} Chips`);
    }
    /**
     * Handle when the player clicks the insurance button
     */
    onInsuranceClicked() {
        console.log("Insurance action");

        // Check if the game is in progress
        if(this.gameState != "playing") {
            console.log("Cannot take insurance - game not in progress");
            return;
        }
        
        // Check if dealer's up card is an ace
        if (!Result.isInsuranceAvailable(this.blackjackDealer.dealerHand)) {
            console.log("Insurance not available - dealer's up card is not an Ace");
            return;
        }
        
        // Check if player has enough balance for insurance
        const insuranceBet = Globals.currentBet / 2;
        if (Globals.balance < insuranceBet) {
            console.log("Not enough balance for insurance");
            return;
        }
        
        console.log("Taking insurance with current bet:", Globals.currentBet);
        console.log("Insurance bet amount:", insuranceBet);
        
        // Deduct the insurance bet from balance
        Globals.balance -= insuranceBet;
        
        // Create chips for the insurance bet
        this.createChipsForBet(insuranceBet, false);
        
        // Hide regular game buttons while showing a message about insurance
        this.gameButtonsContainer.hideAllButtons();
        
        // Set the insurance bet in the BlackjackDealer class
        this.blackjackDealer.playerInsuranceBet = insuranceBet;
        
        // Call the insurance method on BlackjackDealer
        this.blackjackDealer.playerInsurance();
        
        // Update the UI to reflect changes
        this.uiContainer.updateBalance(Globals.balance);
        
        // The buttons will be handled by the insuranceProcessed event callback
        // so we don't need to show buttons here to avoid duplicates
        
        console.log("Balance after insurance deduction:", Globals.balance);
    }
    /**
     * Handle rebet button click
     * Places a bet with the same amount as the last bet
     */
    onRebetClicked() {
        console.log("Rebet button clicked");
       
        // Prevent multiple rapid clicks
        if ((this as any)._processingRebet) {
            console.log("Already processing Rebet action, ignoring duplicate click");
            return;
        }
        
        // Set flag to prevent multiple calls
        (this as any)._processingRebet = true;
        
        try {
            // Hide any active popups - this will close the end game popup
            this.popupManager.hidePopup();
            
            // Hide all buttons to prevent UI conflicts
            this.gameButtonsContainer.hideAllButtons();
            
            // Get the last bet amount - use lastBetAmount directly which now
            // correctly stores the initial bet amount, not the doubled amount
            const lastBetAmount = this.lastBetAmount;
            
            if (!lastBetAmount || lastBetAmount <= 0) {
                console.log("No previous bet amount available for rebet");
                
                // Re-enable chip selection
                this.table.makeButtonsActive(true);
                return;
            }
            
            console.log(`Using last bet amount for rebet: ${lastBetAmount}`);
            
            // Check if player has enough balance for the rebet
            if (lastBetAmount > Globals.balance) {
                console.log("Insufficient balance for rebet");
                
                // Re-enable chip selection
                this.table.makeButtonsActive(true);
                return;
            }
            
            // Let animations from previous game finish first
            this.resetGame(() => {
                // Place the bet using the modified method with forRebet = true
                // Pass true to skipShowingButtons to prevent showing betting buttons
                if (this.placeBet(lastBetAmount, true, true)) {
                    // Show animation of chips flying to betting area
                    console.log("Animating chips for rebet");
                     // Reposition hands
                    this.blackjackDealer.positionHands();
                    this.blackjackDealer.playerHand.positionCardsInHand(this.blackjackDealer.playerHand);
                    this.blackjackDealer.playerHand.alpha = 1;
                    
                    // Start the game after animations have completed
                    // Increased delay to allow for chip animations to complete
                    setTimeout(() => {
                        console.log("Starting game after rebet");
                        this.startGame(undefined, true);
                    }, 800);
                }
            });
        } finally {
            // Clear the processing flag after a delay to prevent rapid clicks
            setTimeout(() => {
                (this as any)._processingRebet = false;
            }, 1000); // Increased to avoid rapid clicking during animations
        }
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
                  
                  // Update UI to reflect the new balance
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
            Result.isInsuranceAvailable(this.blackjackDealer.dealerHand) &&
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
          this.gameButtonsContainer.showBettingButtons();
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
     * Deal the initial cards (2 to player, 2 to dealer with one face down)
     * and handle initial special conditions like blackjack, insurance, and split
     */
       dealInitialCards(): void {
        console.log("Dealing initial cards");
        
        // Deal first card to player (face up)
        this.blackjackDealer.playerHand.dealCardWithErrorHandling(true)
            .then(() => {
                // Deal first card to dealer (face up)
                return this.blackjackDealer.dealerHand.dealCardWithErrorHandling(true);
            })
            .then(() => {
                // Deal second card to player (face up)
                return this.blackjackDealer.playerHand.dealCardWithErrorHandling(true);
            })
            .then(() => {
                // Deal second card to dealer as a backcard with no value
                // The actual card value will be stored but not used until insurance or game end
                return this.blackjackDealer.dealBackCardToDealer();
            })
            .then(() => {
                console.log("Initial cards dealt");
                console.log("Player hand:", this.blackjackDealer.playerHand.value);
                console.log("Dealer visible card:", this.blackjackDealer.dealerHand.cards[0].value);
                
                // Check for special conditions (blackjack, insurance, split)
                this.blackjackDealer.checkInitialConditions();
            })
            .catch(error => {
                console.error("Error dealing initial cards:", error);
            });
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
        // Use Result.canSplit for consistent checking
        return Globals.balance >= Globals.currentBet && Result.canSplit(this.blackjackDealer.playerHand);
    }

    /**
     * Handle the end of the game and determine the outcome
     * @param outcome - The game outcome
     * @param playerValue - The value of the player's hand
     * @param dealerValue - The value of the dealer's hand
     */
    private handleGameEnd(outcome: GameOutcome, playerValue: number, dealerValue: number): void {
      console.log(`Game ended with outcome: ${outcome}`);
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
      
      // Handle surrender outcome specially
      if (outcome === GameOutcome.SURRENDER) {
        // For surrender, player gets half their bet back
        const surrenderPayout = Globals.currentBet / 2;
        Globals.balance += surrenderPayout;
        console.log(`Player surrendered. Half bet returned: ${surrenderPayout}`);
        
        // Show the surrender popup
        this.showOutcomePopup(GameOutcome.SURRENDER);
        
        // Reset bet for next game
        Globals.currentBet = 0;
        
        // Show end game buttons
        setTimeout(() => {
          this.gameButtonsContainer.showGameEndButtons();
        }, 500); // Add a small delay
        
        // Update UI for next game
        this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet)} Chips`);
        
        // Store initial bet amount for potential rebet
        this.lastBetAmount = initialBetAmount;
        
        console.log(`Game ended. balance: ${Globals.balance}, Last bet (for rebet): ${this.lastBetAmount}`);
        return;
      }
      
      // Get detailed outcome with payout information for non-surrender outcomes
      const detailedOutcome = Result.determineDetailedOutcome(
        this.blackjackDealer.playerHand, 
        this.blackjackDealer.dealerHand,
        this.blackjackDealer.splitHand,
        this.blackjackDealer.playerInsuranceBet
      );
      
      console.log("Detailed outcome:", detailedOutcome);
      
      // Calculate payout and update balance
      let payout = detailedOutcome.payout;
      
      // Add payout to balance
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
      this.showOutcomePopup(detailedOutcome.outcome);
      
      // Show game end buttons with a delay to ensure popup is shown first
      setTimeout(() => {
        this.gameButtonsContainer.showGameEndButtons();
      }, 500);
      
      // Update UI for next game
      this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet)} Chips`);
      
      // Store initial bet amount for potential rebet
      this.lastBetAmount = initialBetAmount;
      
      // Update special conditions flag
      this._specialConditionsDetected = false;
      
      console.log(`Game ended. balance: ${Globals.balance}, Last bet (for rebet): ${this.lastBetAmount}`);
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
     * Process special game conditions in the correct order
     */
    private processSpecialConditions(): void {
        // This is now handled by BlackjackDealer.checkInitialConditions
        // No need to handle manually anymore
        console.log("Processing special conditions via BlackjackDealer");
    }

    /**
     * Process the next condition in the queue
     */
    private processNextCondition(queue: Array<(next: () => void) => void>): void {
        // This is now handled by BlackjackDealer.checkInitialConditions
        // No need to handle manually anymore
    }

    /**
     * Check for insurance if dealer shows an Ace
     */
    private checkForInsurance(next: () => void): void {
        // This is now handled by BlackjackDealer.checkInitialConditions and playerInsurance
        // No need to handle manually anymore
        next();
    }

    /**
     * Check if player can split their hand
     */
    private checkForSplitCondition(next: () => void): void {
        // This is now handled by BlackjackDealer.checkInitialConditions and playerSplit
        // No need to handle manually anymore
        next();
    }

    /**
     * Determine the outcome of the game
     */
    determineOutcome(): GameOutcome {
        return Result.determineOutcome(this.blackjackDealer.playerHand.value, this.blackjackDealer.dealerHand.value);
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
} 