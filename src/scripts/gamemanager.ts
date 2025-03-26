import { Easing } from "@tweenjs/tween.js";
import { Tween } from "@tweenjs/tween.js";
import { Container, Sprite } from "pixi.js";
import { config } from "./appconfig";
import { BlackjackDealer } from "./blackjackdealer";
import { CenterChip } from "./centerchip";
import { GameButtonContainer, GameButtonType, getButtonType } from "./gamebuttons";
import { Globals, formatBetAmount } from "./globals";
import { PopupManager, Z_INDEX } from "./popupmanager";
import { Result, GameOutcome } from "./result";
import { Table, Chips } from "./table";
import { UiContainer } from "./uicontainer";
import { ShopPopup } from "./shoppopup";
import { starGame,MessageType } from "./services/messagetypes";    
import { Card, Hand } from "./hand";


export class GameManager extends Container {
 
    /** Last bet amount for rebet functionality */
    lastBetAmount: number = 0;

    blackjackDealer: BlackjackDealer = new BlackjackDealer();
    table: Table = new Table();
    chipsZone: CenterChip = new CenterChip();
    tableText: Sprite = new Sprite();
    uiContainer: UiContainer = new UiContainer();
    result: Result = new Result();
    popupManager: PopupManager = new PopupManager();
    gameButtonsContainer: GameButtonContainer = new GameButtonContainer();
    
    // Flag to track if we're already processing an outcome to prevent duplicate calls
    private _processingOutcome: boolean = false;

    // Add a debounce flag for Play On button
    private _playOnInProgress: boolean = false;

    // Flag to track if we're processing a split result to prevent duplicates
    private _processingSplitResult: boolean = false;

    // Flag to track if a pending split option is available
    private pendingSplitOption: boolean = false;
    
    // Flag to track if we're in a surrender animation
    private _isSurrenderInProgress: boolean = false;

    unlockShopCallback: () => void = () => { };
    cancelShopCallBack: () => void = () => { };
    shopPopup: ShopPopup = new ShopPopup(this.unlockShopCallback, this.cancelShopCallBack);

    // Add this property to track card dealing
    private _pendingCardDeals: number = 0;
    private _showPopupAfterDealing: boolean = false;
    private _pendingPopupMessage: string = '';

    // Add this property to track insurance decision
    private _insuranceDecided: boolean = false;

    constructor() {
        super();
        Globals.Manager = this;
        // Now initialize components
        this.initializeComponents();

        // Create and set up shop popup with the callbacks
        this.shopPopup = new ShopPopup(this.unlockShopCallback, this.cancelShopCallBack);
        // Add to scene after all components are initialized
        this.addToScene();

        // Add a failsafe timer to ensure end-game buttons are showing
        setInterval(() => {
            // Only check if the game is in 'complete' state
            if (Globals.gameState === 'complete') {
                // Check if there are any visible end-game buttons
                const isPlayonVisible = this.gameButtonsContainer.isButtonVisible(GameButtonType.PLAYON);
                const isRebetVisible = this.gameButtonsContainer.isButtonVisible(GameButtonType.REBET);
                
                if (!isPlayonVisible && !isRebetVisible) {
                    console.warn("Game is in complete state but no end-game buttons are visible!");
                    
                    // Only fix if we're not in the middle of processing an outcome
                    if (!this._processingOutcome && !this.blackjackDealer.isCardDealInProgress) {
                        console.log("Applying failsafe to restore end-game buttons");
                        
                        // Force show the standard end-game buttons
                        this.gameButtonsContainer.toShowButtons = [GameButtonType.PLAYON, GameButtonType.REBET];
                        this.gameButtonsContainer.showSpecificButtons(
                            this.gameButtonsContainer.toShowButtons, 
                            true,  // Show immediately
                            false  // Don't prevent duplicates
                        );
                        
                        // Clear to prevent multiple showings
                        this.gameButtonsContainer.toShowButtons = [];
                    }
                }
            } else if (Globals.gameState === 'player_turn' && this.blackjackDealer.splitHand) {
                // Special case for split mode - check if buttons are missing but should be visible
                // Check if there are NO visible buttons
                const anyButtonsVisible = this.gameButtonsContainer.areAnyButtonsVisible();
                
                if (!anyButtonsVisible && !this.blackjackDealer.isCardDealInProgress && !this._processingSplitResult) {
                    console.warn("No buttons visible in split mode during player turn - checking if they should be");
                    
                    // Get the active hand value
                    const activeHand = Globals.activeHand || 'first';
                    const handToCheck = activeHand === 'first' ? this.blackjackDealer.playerHand : this.blackjackDealer.splitHand;
                    
                    if (handToCheck) {
                        const handValue = this.blackjackDealer.calculateHandValue(handToCheck);
                        const isBusted = handValue > 21;
                        
                        if (!isBusted && this.gameButtonsContainer.toShowButtons?.length > 0) {
                            console.log("Applying failsafe to show missing buttons in split mode");
                            
                            // Force clear any flags that might be preventing button display
                            this._processingOutcome = false;
                            
                            // Show the buttons
                            this.gameButtonsContainer.showSpecificButtons(
                                this.gameButtonsContainer.toShowButtons,
                                true,  // Show immediately
                                false  // Don't prevent duplicates
                            );
                        }
                        
                        // Special case for hand with 21 - force stand button
                        if (handValue === 21) {
                            console.log("Detected hand with 21 in failsafe check - forcing stand button");
                            
                            // Force stand button regardless of other conditions
                            this._processingOutcome = false;
                            this.blackjackDealer.isCardDealInProgress = false;
                            
                            // Wait a moment to allow any pending operations to complete
                            setTimeout(() => {
                                this.gameButtonsContainer.universalShowStandButton();
                            }, 200);
                        }
                    }
                }
            }
            
            // GLOBAL PROCESSING FLAG FAILSAFE
            // Check if processing flags have been stuck for too long in betting phase
            if (Globals.gameState === 'betting') {
                const shouldShowBettingButtons = !this.gameButtonsContainer.isButtonVisible(GameButtonType.PLAY);
                
                if (shouldShowBettingButtons && (this._processingOutcome || this.blackjackDealer.isCardDealInProgress)) {
                    console.warn("Processing flags stuck in betting phase - force resetting");
                    this._processingOutcome = false;
                    this.blackjackDealer.isCardDealInProgress = false;
                    this._processingSplitResult = false;
                    
                    // Force buttons to show after reset
                    setTimeout(() => {
                        this.gameButtonsContainer.toShowButtons = [GameButtonType.PLAY, GameButtonType.REBET];
                        this.gameButtonsContainer.showSpecificButtons(
                            this.gameButtonsContainer.toShowButtons,
                            true, // Show immediately
                            false // Don't prevent duplicates
                        );
                    }, 100);
                }
            }
        }, 3000); // Check every 3 seconds
    }

    /**
     * Initialize all components in the proper order
     */
    initializeComponents() {

        // Set up the shop button callback on the table
        this.table.setShopButtonCallback(() => {
            console.log("Shop button clicked - opening shop popup");
            if (this.shopPopup) {
                this.shopPopup.open();
            } else {
                console.error("Shop popup is not initialized when trying to open it");
            }
        });


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

    }




    addToScene(): void {
        // Add components with proper z-index
        this.table.zIndex = Z_INDEX.TABLE;
        this.addChild(this.table);

        this.chipsZone.zIndex = Z_INDEX.CHIPS;
        this.addChild(this.chipsZone);

        this.tableText.zIndex = Z_INDEX.TABLE+100;
        this.addChild(this.tableText);

        this.uiContainer.zIndex = Z_INDEX.BUTTONS + 5;
        this.addChild(this.uiContainer);

        this.blackjackDealer.cardContainer.zIndex = Z_INDEX.CARDS;
        this.addChild(this.blackjackDealer.cardContainer);

        this.table.chipsContainer.zIndex = Z_INDEX.CHIPS + 1;
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
        this.tableText.scale.set(1 * config.scaleFactor);
        this.tableText.position.set(0,0);
        this.chipsZone.resize();
        this.gameButtonsContainer.resize();
        this.uiContainer.resize(this.table);
        this.blackjackDealer.resize();
        this.popupManager.resize();
        this.shopPopup.resize();
    }


    HandleStartGame(data: starGame) {
        if(Globals.gameState !== 'betting') return;
        console.log("---------STARTING GAME NOW---------", data);
        this.resetGame();
        Globals.currentBet = data.currentBet;
        Globals.balance = data.playerBalance;
        this.uiContainer.updateBalancefromBackend(data.playerBalance);
        Globals.gameState = data.gamePhase;

        this.table.animateChipsDown();
        
        // Make sure to hide all buttons first 
        this.gameButtonsContainer.hideAllButtons(true);
        
        this.chipsZone.betHolder.isVisible(true);
        this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet)} Chips`);
        
        // Set card dealing in progress to prevent premature button display
        this.blackjackDealer.isCardDealInProgress = true;
        
        // Store the allowed actions to show after card dealing
        if(data.allowedActions) {
            this.gameButtonsContainer.toShowButtons = getButtonType(data.allowedActions);
        }
        
        // Flag to track initial blackjack detection
        let hasInitialBlackjack = data.playerHand?.cards?.length === 2 && 
            this.blackjackDealer.calculateHandValue(data.playerHand) === 21;
            
        // Initialize card tracking - 4 cards for standard initial deal
        const totalCards = data.playerHand?.cards?.length + data.dealerHand?.cards?.length || 4;
        let handMessage = "";
            
        if (hasInitialBlackjack) {
            console.log("Initial player blackjack detected");
            handMessage = "Blackjack! 21 on first deal.";
        } else if (data.playerHand?.cards?.length === 2) {
            const handValue = this.blackjackDealer.calculateHandValue(data.playerHand);
            handMessage = `Starting hand: ${handValue}`;
        }
        
        if (handMessage) {
            this.trackCardDealing(totalCards, handMessage);
        }
        
        // Delay checking for outcomes until ALL cards are dealt
        this.blackjackDealer.dealCards(data.playerHand, data.dealerHand)
            .then(() => {
                console.log("All initial cards have been dealt");
                // Add a small delay to ensure animations are complete
                setTimeout(() => {
                    // Mark card dealing as complete
                    this.blackjackDealer.isCardDealInProgress = false;
                    
                    // Let checkPendingOutcome handle button display
                    this.checkPendingOutcome();
                }, 500); // Add a 500ms buffer to ensure animations are complete
            });
    }
    resetGame() {
        Globals.currentBet = 0;
        this.blackjackDealer.resetHands();
        // Remove pendingOutcome reference
        Globals.gameState = 'betting';
        this.gameButtonsContainer.hideAllButtons();
        // Reset flags
        this._insuranceDecided = false;
        this._isSurrenderInProgress = false;
    }

    moveToBetting() {
        Globals.gameState = 'betting';
        this.gameButtonsContainer.hideAllButtons();
        this.table.animateChipsUp();
        this.table.makeButtonsActive(true);
        this.chipsZone.betHolder.isVisible(false);
           // Prevent further betting during clear operation
           this.table.makeButtonsActive(false);

           // First save current chips as "remove chips" to animate them
           this.chipsZone.removeChips = [...this.chipsZone.investedChips];
   
           // Hide betting buttons during animation
           this.gameButtonsContainer.hideAllButtons();
   
           // Animate the chips flying out and fade out bet holder
           this.chipsZone.tweenChipsOut(() => {
   
               // Reset display after animation completes
               this.chipsZone.clearChips();
   
               // Update UI - bet text already cleared
               this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");
   
               // Make sure bet holder is hidden
               this.chipsZone.betHolder.isVisible(false);
   
               // Re-enable chip buttons after a short delay
               setTimeout(() => {
                   this.table.makeButtonsActive(true);
               }, 200);
           }, true); // true to hide bet holder after animation
   
    }

      
    recveiveBackendMessages(msgType: string, data: any) {
        console.log("Received message", msgType, data);
        
        // Skip message processing for split operations or if in the middle of a split result
        if (msgType === MessageType.SPLIT_RESULT) {
            this.handleSplitResult(data);
            return;
        }
        
        if (this._processingSplitResult && 
            msgType !== MessageType.BALANCE_UPDATE && 
            msgType !== MessageType.GAME_OUTCOME && 
            !(msgType === MessageType.ACTION_RESULT && data?.action === 'split')) {
                return;
        }
        
        // Store allowed actions for later use
        if (data?.allowedActions && msgType !== MessageType.GAME_OUTCOME && !this._processingSplitResult) {
            // Convert backend actions to button types
                this.gameButtonsContainer.toShowButtons = getButtonType(data.allowedActions);
            
            // Remove insurance button from allowed actions if insurance has already been decided
            if (this._insuranceDecided) {
                const insuranceIndex = this.gameButtonsContainer.toShowButtons.indexOf(GameButtonType.INSURANCE);
                if (insuranceIndex !== -1) {
                    console.log("Insurance already decided - removing insurance button from allowed actions");
                    this.gameButtonsContainer.toShowButtons.splice(insuranceIndex, 1);
                }
            }
        }
        
        // Process the message based on type
        switch (msgType) {
            case MessageType.GAME_STATE:
                this.HandleGameInProgress(data);
                break;
            
            case MessageType.CARD_DEALT:
                this.blackjackDealer.isCardDealInProgress = true;
                this.giveCards(data);
                break;
            
            case MessageType.BALANCE_UPDATE:
                this.uiContainer.updateBalancefromBackend(data.balance);
                break;
            
            case MessageType.SPECIAL_CASE:
                if (data.type === 'insurance' && !this._insuranceDecided) {
                    this.handleInsuranceOffer(data);
                } 
                else if (data.type === 'split') {
                    // Queue split option for when card dealing completes
                    if (!this.blackjackDealer.splitHand && !this._processingSplitResult) {
                    if (!this.blackjackDealer.isCardDealInProgress) {
                        this.handleSplitOption();
                    } else {
                        this.pendingSplitOption = true;
                        }
                    }
                }
                break;
            
            case MessageType.GAME_OUTCOME:
                this.handleGameOutcome(data);
                break;
            
            case MessageType.HAND_UPDATED:
                this.HandleGameInProgress(data);
                break;
        }
    }

    /**
     * Check if there's a pending outcome to show after card dealing is complete
     */
    private checkPendingOutcome(): void {
        // Don't show buttons while cards are being dealt or split is processing
        if (this.blackjackDealer.isCardDealInProgress || this._processingSplitResult) {
            return;
        }
        
        // Prevent multiple simultaneous calls
        if (this._processingOutcome) {
            // Force reset processing flag for betting phase to avoid stuck state
            if (Globals.gameState === 'betting') {
                this._processingOutcome = false;
            } else {
                return;
            }
        }
        
        // Set processing flag
        this._processingOutcome = true;
            
        // Set a timeout to auto-reset the flag after 3s in case of errors
        setTimeout(() => {
            if (this._processingOutcome) {
                console.log("Auto-resetting processing flag after timeout");
                this._processingOutcome = false;
            }
        }, 3000);
        
        // Check for pending split option first
        if (this.pendingSplitOption && !this.blackjackDealer.splitHand) {
            this.handleSplitOption();
            this.pendingSplitOption = false;
        }
        
        // Clone the buttons array to avoid reference issues
        const buttonsToShow = [...(this.gameButtonsContainer.toShowButtons || [])];
        
        // Remove split button if already in split mode
        if (this.blackjackDealer.splitHand) {
            const splitIndex = buttonsToShow.indexOf(GameButtonType.SPLIT);
            if (splitIndex !== -1) {
                buttonsToShow.splice(splitIndex, 1);
            }
        }
        
        // Clear the button queue to prevent showing buttons multiple times
        this.gameButtonsContainer.toShowButtons = [];
        
        // Show buttons if we have any to show
        if (buttonsToShow.length > 0) {
            const showImmediately = Globals.gameState === 'complete';
            
            // Use the improved button transition method
            this.manageButtonTransition(
                buttonsToShow,
                showImmediately,
                () => {
                    // Reset processing flag after transition completes
                    this._processingOutcome = false;
                }
            );
        } else {
            // No buttons to show, just reset the flag
            this._processingOutcome = false;
        }
    }
    
    // Track the current operation version to prevent race conditions
    private _currentOperationVersion: number = 0;
    
    /**
     * Enhanced method to manage button transitions with better reliability
     * @param buttonsToShow Array of button types to show
     * @param immediate Whether to show buttons immediately without animation
     * @param callback Optional callback to execute after transition completes
     */
    private manageButtonTransition(buttonsToShow: GameButtonType[], immediate: boolean = false, callback?: () => void): void {
        console.log(`Managing button transition to: ${buttonsToShow.join(', ')}`);
        
        // Generate a unique operation ID to track this specific transition
        const operationId = Date.now();
        
        // First, cancel ALL ongoing animations to prevent conflicts
        this.gameButtonsContainer.cancelAllButtonAnimations();
        
        // Clear any queued button operations
        this.gameButtonsContainer.toShowButtons = [];
        
        // Set a flag to prevent simultaneous transitions
        if (this._pendingButtonUpdate) {
            console.log("Button transition already in progress, canceling previous");
        }
        this._pendingButtonUpdate = true;
        
        // Hide all buttons first with immediate=true to ensure clean state
        this.gameButtonsContainer.hideAllButtons(true, () => {
            // Check if this operation is still valid (not superseded by a newer one)
            if (!this._pendingButtonUpdate) {
                console.log("Button transition was cancelled, aborting");
                if (callback) callback();
                return;
            }
            
            // If we have buttons to show, show them
            if (buttonsToShow.length > 0) {
                // Add a small delay to ensure DOM updates and prevent visual glitches
                setTimeout(() => {
                    // Final check before showing buttons
                    if (!this._pendingButtonUpdate) {
                        console.log("Button transition was cancelled during delay, aborting");
                        if (callback) callback();
                        return;
                    }
                    
                    // Show the buttons with specified animation setting
                    this.gameButtonsContainer.showSpecificButtons(
                        buttonsToShow,
                        immediate,
                        false // Don't prevent duplicates - we already cleared everything
                    );
                    
                    // Reset the pending flag after a delay to ensure animations complete
                    setTimeout(() => {
                        this._pendingButtonUpdate = false;
                        
                        // Execute callback if provided
                        if (callback) callback();
                        
                        // Verify buttons are visible for reliability
                        const allShown = buttonsToShow.every(btn => 
                            this.gameButtonsContainer.isButtonVisible(btn)
                        );
                        
                        if (!allShown && buttonsToShow.length > 0) {
                            console.warn("Button visibility verification failed - attempting recovery");
                            this.gameButtonsContainer.showSpecificButtons(
                                buttonsToShow,
                                true, // Use immediate mode for recovery
                                false
                            );
                        }
                    }, immediate ? 50 : 450); // Use 450ms instead of accessing private ANIMATION_DURATION (350ms + buffer)
                }, 50); // Small delay for DOM updates
            } else {
                // No buttons to show, just reset flag and call callback
                this._pendingButtonUpdate = false;
                if (callback) callback();
            }
        });
    }

    /**
     * Enhanced version of showButtonsAfterOutcome that uses improved transition management
     */
    private showButtonsAfterOutcome(operationVersion?: number): void {
        // Check if this operation was superseded
        if (operationVersion && operationVersion !== this._currentOperationVersion) {
            console.log(`Button operation ${operationVersion} was superseded in showButtonsAfterOutcome, aborting`);
            this._processingOutcome = false;
            return;
        }
        
        // Skip button display if the active split hand is busted
        if (this.blackjackDealer.splitHand && Globals.activeHand) {
            // Check if current active hand is busted
            const isBusted = Globals.activeHand === 'first' 
                ? this.blackjackDealer.isHandBusted(this.blackjackDealer.playerHand)
                : this.blackjackDealer.isHandBusted(this.blackjackDealer.splitHand);
            
            // Special case - never skip buttons if we have 21 in split mode
            const handValue = Globals.activeHand === 'first'
                ? this.blackjackDealer.calculateHandValue(this.blackjackDealer.playerHand)
                : this.blackjackDealer.calculateHandValue(this.blackjackDealer.splitHand);
            
            const hasExactly21 = handValue === 21;
            
            if (isBusted && !hasExactly21) {
                console.log(`Active hand ${Globals.activeHand} is busted, not showing buttons`);
                this._processingOutcome = false;
                return;
            }
            
            if (hasExactly21) {
                console.log(`Active hand ${Globals.activeHand} has exactly 21, ensuring buttons are shown`);
            }
        }
        
        // Create a local copy of buttons to prevent race conditions
        const buttonsToShow = [...(this.gameButtonsContainer.toShowButtons || [])];
        
        // Show buttons if we have any to show
        if (buttonsToShow && buttonsToShow.length > 0) {
            console.log("Now showing buttons:", buttonsToShow);
            
            // If split is already done, remove split button from array
            const finalButtons = [...buttonsToShow];
            if (this.blackjackDealer.splitHand) {
                const splitIndex = finalButtons.indexOf(GameButtonType.SPLIT);
                if (splitIndex !== -1) {
                    finalButtons.splice(splitIndex, 1);
                }
            }
            
            // Clear buttons to show to prevent them being shown multiple times
            // Do this BEFORE showing buttons to prevent race conditions
            this.gameButtonsContainer.toShowButtons = [];
            
            // For complete state (like blackjack), show buttons immediately 
            const showImmediately = Globals.gameState === 'complete';
            if (showImmediately) {
                console.log("Game complete state detected - showing end-game buttons immediately");
            }
            
            // Use the improved button transition method
            this.manageButtonTransition(
                finalButtons,
                showImmediately,
                () => {
                    // Reset processing flag after transition completes
                    this._processingOutcome = false;
                }
            );
        } else {
            // Reset processing flag
            this._processingOutcome = false;
        }
    }

    private showPendingOutcome(): void {
        // Replace this method with a direct popup show
        // Reset all processing flags to allow buttons to display
        this._processingOutcome = false;
        this.blackjackDealer.isCardDealInProgress = false;
        
        // Show buttons directly
        this.checkPendingOutcome();
    }

    // Flag to track if a button update is in progress
    private _pendingButtonUpdate: boolean = false;

    /**
     * Track card dealing and show popup when complete
     * @param totalCards Total number of cards to be dealt
     * @param message Message to show in popup after dealing
     */
    private trackCardDealing(totalCards: number, message: string = ''): void {
        this._pendingCardDeals = totalCards;
        this._showPopupAfterDealing = true;
        this._pendingPopupMessage = message;
    }

    /**
     * Register a card has been dealt and check if dealing is complete
     */
    private cardDealComplete(): void {
        // Decrement pending card count
        if (this._pendingCardDeals > 0) {
            this._pendingCardDeals--;
        }
        
        // Check if all card dealing is complete
        if (this._pendingCardDeals === 0 && this._showPopupAfterDealing) {
            // Reset the flag
            this._showPopupAfterDealing = false;
            
            // Show popup with the pending message
            if (this._pendingPopupMessage) {
                // Use a small delay to ensure animations complete
                setTimeout(() => {
                    // Create a temporary text display over the cards
                    const isBlackjack = this._pendingPopupMessage.includes("Blackjack");
                    
                    // For blackjack, use the existing visual feedback
                    if (isBlackjack) {
                        if (this.blackjackDealer.playerHand.pointsDisplay) {
                            // Highlight the points display in green with a pulse
                            this.blackjackDealer.playerHand.pointsDisplay.tint = 0x00FF00;
                            
                            // Add a scale animation to draw attention
                            const originalScale = this.blackjackDealer.playerHand.pointsDisplay.scale.x;
                            const { Tween, Easing } = require("@tweenjs/tween.js");
                            
                            // Create a pulse animation for the points display
                            new Tween(this.blackjackDealer.playerHand.pointsDisplay.scale)
                                .to({ x: originalScale * 1.3, y: originalScale * 1.3 }, 300)
                                .easing(Easing.Quadratic.Out)
                                .yoyo(true)
                                .repeat(1)
                                .start();
                            
                            // Make sure animation runs
                            if (Globals.sceneManager && Globals.sceneManager.tweenGroup) {
                                Globals.sceneManager.tweenGroup.update();
                            }
                        }
                    } else {
                        // For regular hands, just emphasize the points display
                        if (this.blackjackDealer.playerHand.pointsDisplay) {
                            // Make sure points display is visible
                            this.blackjackDealer.playerHand.pointsDisplay.visible = true;
                            this.blackjackDealer.playerHand.pointsDisplay.alpha = 1.0;
                            
                            // Add a subtle pulse animation
                            const originalScale = this.blackjackDealer.playerHand.pointsDisplay.scale.x;
                            const { Tween, Easing } = require("@tweenjs/tween.js");
                            
                            // Create a pulse animation for the points display
                            new Tween(this.blackjackDealer.playerHand.pointsDisplay.scale)
                                .to({ x: originalScale * 1.2, y: originalScale * 1.2 }, 200)
                                .easing(Easing.Quadratic.Out)
                                .yoyo(true)
                                .repeat(1)
                                .start();
                            
                            // Make sure animation runs
                            if (Globals.sceneManager && Globals.sceneManager.tweenGroup) {
                                Globals.sceneManager.tweenGroup.update();
                            }
                        }
                    }
                    
                    // Clear the message
                    this._pendingPopupMessage = '';
                        }, 300);
            }
        }
    }

    giveCards(cardData: { target: string, card: any, isHoleCard: boolean, isAdditionalCard: boolean }) {
        if (this._processingSplitResult) return;
    
        this.blackjackDealer.isCardDealInProgress = true;
    
        const handleCardDealing = async (hand: Hand) => {
            await hand.dealCards(cardData.card);
            hand.updatePointsDisplay?.(true);
            this.blackjackDealer.positionSplitHands();
            this.blackjackDealer.isCardDealInProgress = false;
            this.cardDealComplete();
            this.checkPendingOutcome();
        };
    
        if (cardData.target === 'dealer') {
            if (cardData.isHoleCard) {
                this.blackjackDealer.dealerHand.revealDealerCard(cardData.card).then(() => {
                    this.blackjackDealer.isCardDealInProgress = false;
                    this.cardDealComplete();
                    this.checkPendingOutcome();
                });
            } else {
                handleCardDealing(this.blackjackDealer.dealerHand);
            }
        } 
        else if (cardData.target === 'player') {
            if (this.blackjackDealer.splitHand && Globals.activeHand === 'first') {
                // Handle split hand dealing
                handleCardDealing(this.blackjackDealer.playerHand);
            } else if (!this.blackjackDealer.splitHand) {
                // Regular dealing to player's hand
                handleCardDealing(this.blackjackDealer.playerHand);
            }
        }
        else if (cardData.target === 'split') {
            if (!this.blackjackDealer.splitHand) {
                console.warn("Split hand not created, creating it now...");
                this.blackjackDealer.initializeSplitHand();
                this.blackjackDealer.positionSplitHands();
            }
            
            if (this.blackjackDealer.splitHand) {
                handleCardDealing(this.blackjackDealer.splitHand);
            } else {
                console.error("Failed to create split hand.");
            }
        }
    }
    
    
    HandleGameInProgress(data: any) {
        // Skip handling during split processing
        if (this._processingSplitResult) {
            console.log("Currently processing split result, deferring HandleGameInProgress");
            return;
        }
        
        // Log full data for debugging split hand issues
        if (data.splitHand && data.activeSplitHand) {
            console.log("Received split game state data:", {
                activeSplitHand: data.activeSplitHand,
                playerHand: {
                    cards: data.playerHand?.cards?.length,
                    value: data.playerHand?.value,
                    busted: data.playerHand?.busted
                },
                splitHand: {
                    cards: data.splitHand?.cards?.length,
                    value: data.splitHand?.value,
                    busted: data.splitHand?.busted
                },
                allowedActions: data.allowedActions,
                cardPositionsLocked: data.cardPositionsLocked || false
            });
            
            // Check if the backend has indicated card positions should remain locked
            if (data.cardPositionsLocked) {
                console.log("Card positions are locked - maintaining current positions");
                // Force current positions to be maintained
                this.blackjackDealer.positionSplitHands();
            }
        }
        
        // Update game state
        if (data.gamePhase) {
            Globals.gameState = data.gamePhase;
        }
        
        // Update active split hand in Globals if it's set in the data and has changed
        if (data.activeSplitHand && 
            (data.activeSplitHand === 'first' || data.activeSplitHand === 'second') &&
            data.activeSplitHand !== Globals.activeHand) {
            
            console.log(`Backend indicates hand switch to: ${data.activeSplitHand}`);
            
            // Use our improved split hand switch handler
            this.handleSplitHandSwitch(data.activeSplitHand);
        }
        
        // Store the allowed buttons for later use
        if (data.allowedActions) {
            // Convert actions to button types
            this.gameButtonsContainer.toShowButtons = getButtonType(data.allowedActions);
            
            // If in split mode, always remove split button (can't split again)
            if (this.blackjackDealer.splitHand) {
                const splitIndex = this.gameButtonsContainer.toShowButtons.indexOf(GameButtonType.SPLIT);
                if (splitIndex !== -1) {
                    console.log("Removing split button - already in split mode");
                    this.gameButtonsContainer.toShowButtons.splice(splitIndex, 1);
                }
            }
            
            // If we're not dealing cards or processing split, we can show buttons now
            if (!this.blackjackDealer.isCardDealInProgress && !this._processingSplitResult) {
                this.checkPendingOutcome();
            }
        }
    }

    recieveMessages(msgType: string, data: any) {
        console.log('Recieved message', msgType, data);

        switch (msgType) {
            case "CallChip":
                this.addChip(data);
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

        }
    }
    onHitClicked() {
        if(Globals.gameState === 'player_turn' ) {
            // Check if insurance decision is pending
            if (this.blackjackDealer.isInsuranceAvailable) {
                // Auto-decline insurance before proceeding with hit
                this.handleInsuranceDecisionNeeded('hit');
                return;
            }

            // Hide all buttons during hit operation to prevent multiple clicks
            this.gameButtonsContainer.hideAllButtons(true);
            
            // Flag as dealing to prevent premature button display
            this.blackjackDealer.isCardDealInProgress = true;
            
            // If in split mode, determine which hand is active
            if (this.blackjackDealer.splitHand) {
                // Use the active hand from globals (this is set when we receive the hand_updated message)
                const activeHand = Globals.activeHand || 'first';
                console.log(`Hit on ${activeHand} hand in split mode`);
                
                // Set up card tracking for the hit
                const targetHand = activeHand === 'first' ? 
                    this.blackjackDealer.playerHand : 
                    this.blackjackDealer.splitHand;
                
                if (targetHand) {
                    const currentValue = this.blackjackDealer.calculateHandValue(targetHand);
                    this.trackCardDealing(1, `${activeHand === 'first' ? 'First' : 'Second'} hand: ${currentValue}`);
                }
                
                // Call hit with the appropriate hand parameter
                Globals.backendService?.hit(activeHand);
            } else {
                // Not in split mode, just call hit without a hand parameter
                // Set up card tracking for the hit
                const currentValue = this.blackjackDealer.calculateHandValue(this.blackjackDealer.playerHand);
                this.trackCardDealing(1, `Hand: ${currentValue}`);
                
                Globals.backendService?.hit();
            }
        }
    }
    onStandClicked() {
        if(Globals.gameState !== 'player_turn') return;
        
        // Check if insurance decision is pending
        if (this.blackjackDealer.isInsuranceAvailable) {
            console.log("Handling stand with insurance available - auto declining");
            // Auto-decline insurance before proceeding with stand
            this.handleInsuranceDecisionNeeded('stand');
            
            // Early return to prevent calling stand twice
            return;
        }

        console.log("Processing stand action without insurance");
        
        // Hide all buttons during stand operation
        this.gameButtonsContainer.hideAllButtons(true);
        
        // Flag as dealing to prevent premature button display
        this.blackjackDealer.isCardDealInProgress = true;
        
        // If in split mode, determine which hand is active
        if (this.blackjackDealer.splitHand) {
            // Use the active hand from globals
            const activeHand = Globals.activeHand || 'first';
            console.log(`Stand on ${activeHand} hand in split mode`);
            
            // Special handling for standing on first hand
            if (activeHand === 'first') {
                // Call stand with the appropriate hand parameter
                Globals.backendService?.stand(activeHand);
                
                // Schedule a switch to second hand after a delay
                setTimeout(() => {
                    // If we're still on first hand, force switch to second
                    if (Globals.activeHand === 'first') {
                        console.log("Forcing switch to second hand after standing on first");
                        this.handleSplitHandSwitch('second');
                    }
                }, 800);
            } else {
                // For second hand, standard behavior
                Globals.backendService?.stand(activeHand);
            }
        } else {
            // Not in split mode, just call stand without a hand parameter
            Globals.backendService?.stand();
        }
    }
    onClearClicked() {

        const currentBet = Globals.currentBet;

        Globals.currentBet = 0;

        // If bet is zero, hide the bet holder
        this.chipsZone.betHolder.isVisible(false);

        this.uiContainer.updateBalance(currentBet);
        // Prevent further betting during clear operation
        this.table.makeButtonsActive(false);

        // First save current chips as "remove chips" to animate them
        this.chipsZone.removeChips = [...this.chipsZone.investedChips];

        // Hide betting buttons during animation
        this.gameButtonsContainer.hideAllButtons();

        // Animate the chips flying out and fade out bet holder
        this.chipsZone.tweenChipsOut(() => {

            // Reset display after animation completes
            this.chipsZone.clearChips();

            // Update UI - bet text already cleared
            this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");

            // Make sure bet holder is hidden
            this.chipsZone.betHolder.isVisible(false);

            // Re-enable chip buttons after a short delay
            setTimeout(() => {
                this.table.makeButtonsActive(true);
            }, 200);
        }, true); // true to hide bet holder after animation



        return;

    }

    onPlayOnClicked() {
        // Prevent multiple rapid clicks from being processed
        if (this._playOnInProgress) {
            console.log("Play On already in progress, ignoring duplicate click");
            return;
        }
        
        // Set debounce flag
        this._playOnInProgress = true;
        
        console.log("Processing Play On click - hiding popup");
        this.popupManager.hidePopup();

        if(Globals.gameState === 'complete' || Globals.gameState === 'betting' ) {
            this.resetGame();

            // First save current chips as "remove chips" to animate them
            this.chipsZone.removeChips = [...this.chipsZone.investedChips];

            // Hide betting buttons during animation
            this.gameButtonsContainer.hideAllButtons();

            // Animate the chips flying out and fade out bet holder
            this.chipsZone.tweenChipsOut(() => {
                // Reset display after animation completes
                this.chipsZone.clearChips();

                // Update UI - bet text already cleared
                this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");

                // Make sure bet holder is hidden
                this.chipsZone.betHolder.isVisible(false);
                this.table.animateChipsUp();
                
                // Re-enable chip buttons after a short delay
                setTimeout(() => {
                    this.table.makeButtonsActive(true);
                    
                    // Reset debounce flag after all animations complete
                    this._playOnInProgress = false;
                }, 200);
            }, true); // true to hide bet holder after animation
        } else {
            // Reset debounce flag if we're not in 'complete' state
            setTimeout(() => {
                this._playOnInProgress = false;
            }, 500);
        }
    }
  
    onPlayClicked() {
        if(Globals.gameState == 'betting') {
            if(Globals.currentBet > 0) {
            Globals.backendService?.startGame(Globals.currentBet);
        }
        }
    }
    onSurrenderClicked() {
        if(Globals.gameState === 'player_turn') {
            // Prevent multiple surrender clicks
            if (this._isSurrenderInProgress) {
                console.log("Surrender already in progress - ignoring duplicate click");
                return;
            }
            
            // Check if insurance decision is pending
            if (this.blackjackDealer.isInsuranceAvailable) {
                // Auto-decline insurance before proceeding with surrender
                this.handleInsuranceDecisionNeeded('surrender');
                return;
            }

            console.log("Processing surrender action");
            
            // Set surrender in progress flag
            this._isSurrenderInProgress = true;
            
            // Hide all action buttons immediately to prevent double clicks
            this.gameButtonsContainer.hideAllButtons(true);
            
            // Set card dealing flag to block premature button display
            this.blackjackDealer.isCardDealInProgress = true;
            
            // Pre-emptively update the game state to complete
            // This ensures any race conditions with backend messages don't cause issues
            Globals.gameState = 'complete';
            
            // Reset the surrender flag if it was set
            this._isSurrenderInProgress = false;
            
            // Special visual for surrender - fade player's hand
            if (this.blackjackDealer.playerHand) {
                // Ensure consistent alpha value for surrender
                this.blackjackDealer.playerHand.alpha = 0.6;
                
                // Add a subtle pulse animation to indicate the surrender
                // This helps users understand the outcome visually
                const originalScale = this.blackjackDealer.playerHand.scale.x;
                new Tween(this.blackjackDealer.playerHand.scale)
                    .to({ x: originalScale * 0.95, y: originalScale * 0.95 }, 200)
                    .easing(Easing.Cubic.Out)
                    .yoyo(true)
                    .repeat(1)
                    .start();
            }
            
            // Make sure dealer cards are visible
            if (this.blackjackDealer.dealerHand && this.blackjackDealer.dealerHand.cards.length > 0) {
                this.blackjackDealer.dealerHand.cards.forEach(card => {
                    if (card.sprite) {
                        card.sprite.visible = true;
                    }
                });
            }
            
            // Call the backend surrender method
            Globals.backendService?.surrender();
        }
    }
    onDoubleClicked() {
        if(Globals.gameState === 'player_turn') {
            // Check if insurance decision is pending
            if (this.blackjackDealer.isInsuranceAvailable) {
                // Auto-decline insurance before proceeding with double
                this.handleInsuranceDecisionNeeded('double');
                return;
            }

            // In split mode, doubleDown requires specifying which hand
            if (this.blackjackDealer.splitHand) {
                // Check which hand is active based on tint
                const isFirstHandActive = this.blackjackDealer.playerHand.pointsDisplay.tint === 0xFFFFFF;
                
                // Currently the backend doubleDown doesn't accept a hand parameter
                // We would need to modify the backend service and backend code
                // For now, we'll at least ensure that the UI stays consistent
                Globals.backendService?.doubleDown();
                
                // Force a resize to ensure split positioning is maintained
                this.blackjackDealer.resize();
            } else {
                // Standard double down
                Globals.backendService?.doubleDown();
            }
        }
    }
    onSplitClicked() {
        if(Globals.gameState === 'player_turn') {
            console.log("Split button clicked");
            
            // Check if insurance decision is pending
            if (this.blackjackDealer.isInsuranceAvailable) {
                // Auto-decline insurance before proceeding with split
                this.handleInsuranceDecisionNeeded('split');
                return;
            }
            
            // Check if this is a valid split scenario (two cards of the same rank)
            if (this.blackjackDealer.playerHand && this.blackjackDealer.playerHand.cards.length === 2) {
                const card1 = this.blackjackDealer.playerHand.cards[0];
                const card2 = this.blackjackDealer.playerHand.cards[1];
                
                if (card1 && card2 && card1.value === card2.value) {
                    // this.blackjackDealer.isCardDealInProgress = true;
                    // this._processingSplitResult = true;  // Correctly setting the split result flag
                    this.gameButtonsContainer.hideAllButtons(true);
                    Globals.activeHand = 'first';
                    Globals.backendService?.split();
                } else {
                    console.log("Cannot split: cards must be of the same rank");
                }
            }
            
        }
    }
    
    onInsuranceClicked() {
        if (Globals.gameState !== 'player_turn' || !this.blackjackDealer.isInsuranceAvailable) return;
        
            // Hide all buttons during insurance operation
            this.gameButtonsContainer.hideAllButtons(true);
            
        // Set processing flag to prevent premature button display
            this.blackjackDealer.isCardDealInProgress = true;
            
        // Clear the insurance available flag
            this.blackjackDealer.isInsuranceAvailable = false;
            
        // Mark insurance as decided for this game
        this._insuranceDecided = true;
        
        // Close any insurance popup
        this.popupManager.hidePopup();
        
        // Call backend with insurance acceptance
        Globals.backendService?.insurance(true);
    }
   
    onRebetClicked() {
        this.popupManager.hidePopup();

        if(Globals.gameState === 'complete' || Globals.gameState === 'betting' ) {
            if(Globals.currentBet > 0) {
                console.log("------REBETING------", Globals.currentBet);
                this.resetGame();
                
                // Store the bet amount to use after animations
                
                // Store the chip configuration to recreate after animations
                const chipConfig = this.chipsZone.investedChips.map(chip => {
                    console.log("chip", chip.isDouble);
                    
                    if(!chip.isDouble)
                    return { texture: chip.texture, value: chip.value };
                });
                console.log("chipConfig", chipConfig);
                
                // First save current chips as "remove chips" to animate them
                this.chipsZone.removeChips = [...this.chipsZone.investedChips];
                
                // Hide betting buttons during animation
                this.gameButtonsContainer.hideAllButtons();
                
                // Animate the chips flying out and fade out bet holder
                this.chipsZone.tweenChipsOut(() => {
                    // Reset display after animation completes
                    this.chipsZone.clearChips();
                    
                    // Update UI - bet text already cleared
                    this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");
                    
                    // Reset current bet temporarily
                    Globals.currentBet = 0;
                    
                    // After chips are cleared, add new chips one by one
                    setTimeout(() => {
                        // Now add new chips based on previous configuration
                        chipConfig.forEach(chipData => {
                            if(chipData)
                            {
                                const chip = new Chips(chipData.texture, chipData.value,false);
                                chip.interactive = false;
                                
                                // Animate the chip from the table to the betting area
                                this.animateChipToBettingArea(chip);
                                
                                // Add the chip to the scene
                                this.chipsZone.addChip(chip);
                                chip.zIndex = Z_INDEX.CHIPS;
                                this.addChild(chip);
                                
                                // Update UI with the chip value
                                this.updateUIAfterAddingChip(chipData.value, true);
                                
                                // Add to current bet
                                Globals.currentBet += chipData.value;
                            }
                        });
                        
                        // Show bet holder with the total bet amount
                        this.chipsZone.showBetDisplay(Globals.currentBet);
                        
                        // Start the game with the bet amount
                        Globals.backendService?.startGame(Globals.currentBet);
                    }, 300);
                }, true); // true to hide bet holder after animation
            }
        }
    }

    addChip(chipData: Chips, addDouble: boolean = false, forRebet: boolean = false) {

        this.uiContainer.updateBalance(-chipData.value);
        Globals.currentBet += chipData.value;
        if (addDouble) {
            console.log("added for rebet");
            
            this.chipsZone.investedChips.forEach(Element => {
                const chip = new Chips(Element.texture, Element.value,addDouble);
                chip.interactive = false;
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
        const chip = new Chips(chipData.texture, chipData.value,false);
        chip.interactive = false;
        // Animate the chip from the table to the betting area
        this.animateChipToBettingArea(chip);

        // Add the chip to the scene
        this.chipsZone.addChip(chip);
        chip.zIndex = Z_INDEX.CHIPS;
        this.addChild(chip);

        // Update UI with the chip value - use forRebet flag to prevent double counting
        this.updateUIAfterAddingChip(chipData.value, forRebet);

        this.gameButtonsContainer.showButtonGroup('betting', false);
    }


    /**
* Update UI after adding a chip
* @param chipValue - The value of the chip that was added
* @param forRebet - Whether this is for a rebet operation (to avoid double counting)
*/
    private updateUIAfterAddingChip(chipValue: number, forRebet: boolean = false): void {

        console.log("Updating UI after adding chip:", chipValue, forRebet ? "(for rebet)" : "");


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

        // / Convert table chip position to global coordinates
        const globalPos = matchingTableChip.parent.toGlobal(matchingTableChip.position);

        chip.animateChipToBettingArea(globalPos, this.chipsZone.position);
    }

    /**
     * Handle split result from the backend
     * @param data The split result data
     */
    private handleSplitResult(data: any): void {
        // Skip if we're already processing a split result
        if (this._processingSplitResult) {
            console.log("Already processing split result, ignoring duplicate");
            return;
        }
        
        console.log("Processing split result:", data);
        
        // Set flag to prevent duplicate processing
        this._processingSplitResult = true;
        
        // Hide all buttons during processing
        this.gameButtonsContainer.hideAllButtons(false);
        
        // Set card dealing flag to prevent premature button display
        this.blackjackDealer.isCardDealInProgress = true;
        
        // Update balance if provided
        if (data.playerBalance !== undefined) {
            this.uiContainer.updateBalancefromBackend(data.playerBalance);
        }
        
        // Setup the visual split hands
        this.setupSplitHandsVisuals(data).then(() => {
            // Clear processing flags when complete
            this._processingSplitResult = false;
            this.blackjackDealer.isCardDealInProgress = false;
            
            // Get the active hand to switch to
            const activeHand = data.activeSplitHand || 'first';
            
            // Use our improved split hand switch handler
            this.handleSplitHandSwitch(activeHand);
        });
    }

    /**
     * Setup split hands visuals based on backend data
     */
    private async setupSplitHandsVisuals(data: any): Promise<void> {
        // Initialize the split hand if it doesn't exist
        if (!this.blackjackDealer.splitHand) {
            console.log("Initializing split hand for the first time...");
            this.blackjackDealer.initializeSplitHand();
    
            // Wait for the animation to complete
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    
        // Make sure split hand is created
        if (!this.blackjackDealer.splitHand) {
            console.warn("Split hand still not created. Creating directly.");
            this.blackjackDealer.splitHand = new Hand('split');
            this.blackjackDealer.cardContainer.addChild(this.blackjackDealer.splitHand);
        }
    
        // Always position hands before dealing cards
        this.blackjackDealer.positionSplitHands();
    
        // Update the player's hand with cards from backend
        if (data.playerHand && data.playerHand.cards) {
            this.blackjackDealer.playerHand.reset();
    
            for (const card of data.playerHand.cards) {
                await this.blackjackDealer.playerHand.dealCards(card);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    
        // Update the split hand with cards from backend
        if (data.splitHand && data.splitHand.cards) {
            this.blackjackDealer.splitHand.reset();
    
            for (const card of data.splitHand.cards) {
                await this.blackjackDealer.splitHand.dealCards(card);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    
        // Make sure points are displayed correctly
        this.blackjackDealer.playerHand.updatePointsDisplay?.(true);
        this.blackjackDealer.splitHand?.updatePointsDisplay?.(true);
    
        // Update bust status if necessary
        this.blackjackDealer.updateBustStatus?.();
    
        // Activate the appropriate hand
        const activeHand = data.activeSplitHand || 'first';
        this.handleSplitHandSwitch(activeHand);
        Globals.activeHand = activeHand;
    
        // Ensure everything is positioned correctly
        this.blackjackDealer.positionSplitHands();
        this.blackjackDealer.resize();
    
        console.log("Split hands setup complete.");
    }
    
    
    /**
     * Ensure split hand is initialized properly
     */
    private async ensureSplitHandInitialized(): Promise<void> {
        if (!this.blackjackDealer.splitHand) {
            console.log("Initializing split hand for the first time");
            this.blackjackDealer.initializeSplitHand();
            await this.delay(800);
    
            if (!this.blackjackDealer.splitHand) {
                console.warn("Split hand not created after animation, creating directly");
                this.blackjackDealer.splitHand = new Hand('split');
                this.blackjackDealer.cardContainer.addChild(this.blackjackDealer.splitHand);
            }
        }
        this.blackjackDealer.positionSplitHands();
    }
    
    /**
     * Store original positions of player and split hands
     */
    private storeHandPositions() {
        return {
            playerHandX: this.blackjackDealer.playerHand?.x || 0,
            splitHandX: this.blackjackDealer.splitHand?.x || 0
        };
    }
    
    /**
     * Setup hand visuals and cards
     */
    private async setupHand(hand: Hand, handData: any, originalX: number): Promise<void> {
        if (!hand || !handData?.cards) return;
    
        hand.reset();
        hand.x = originalX;
    
        for (const card of handData.cards) {
            await hand.dealCards(card);
            hand.x = originalX; // Ensure position is maintained
            await this.delay(200); // Add delay for animation effect
        }
    }
    
    /**
     * Update points display for both hands
     */
    private updatePointsDisplay(): void {
        this.blackjackDealer.playerHand.updatePointsDisplay?.(true);
        this.blackjackDealer.splitHand?.updatePointsDisplay?.(true);
    }
    
    /**
     * Finalize positions and resize UI
     */
    private finalizeHandSetup(): void {
        this.blackjackDealer.positionSplitHands();
        this.blackjackDealer.resize();
        console.log(`Final split setup positions: player (${this.blackjackDealer.playerHand.x}), split (${this.blackjackDealer.splitHand?.x})`);
    }
    
    /**
     * Helper function for async delays
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    

    /**
     * Handle a split option special case
     */
    handleSplitOption(): void {
        console.log("Handling split option");
        
        // Don't proceed if already split or processing a split
        if (this.blackjackDealer.splitHand || this._processingSplitResult) {
            return;
        }
        
        // Visually indicate splitting is available
        this.blackjackDealer.setSplitAvailableVisual(true);
        
        // Add split button if not already in the buttons to show
        if (this.gameButtonsContainer.toShowButtons) {
            if (!this.gameButtonsContainer.toShowButtons.includes(GameButtonType.SPLIT)) {
                this.gameButtonsContainer.toShowButtons.push(GameButtonType.SPLIT);
            }
        } else {
            this.gameButtonsContainer.toShowButtons = [GameButtonType.SPLIT];
        }
        
        // Update the buttons display
        this.checkPendingOutcome();
    }

    /**
     * Handle switching between split hands with proper visual transition
     * @param toHand The hand to switch to ('first' or 'second')
     */
    private handleSplitHandSwitch(toHand: 'first' | 'second'): void {
        console.log(`Switching to ${toHand} hand in split mode`);
        
        // Ensure we have a split hand
            if (!this.blackjackDealer.splitHand) {
            console.error("Cannot switch hands - split hand doesn't exist");
                return;
            }
            
        // Pause any ongoing processes to prevent race conditions
        this._processingOutcome = true;
        this.blackjackDealer.isCardDealInProgress = true;
        
        // Store the previous active hand for reference
        const previousHand = Globals.activeHand;
        
        // Update global state immediately
        Globals.activeHand = toHand;
        
        // Check if this is an actual switch or initial setup
        const isActualSwitch = previousHand && previousHand !== toHand;
        
        // Show visual transition between hands
        if (isActualSwitch) {
            this.blackjackDealer.showHandTransition(toHand);
        }
        
        // Check hand values to determine correct button state after switch
        const firstHandValue = this.blackjackDealer.calculateHandValue(this.blackjackDealer.playerHand);
        const firstHandBusted = firstHandValue > 21;
        
        const secondHandValue = this.blackjackDealer.splitHand ? 
            this.blackjackDealer.calculateHandValue(this.blackjackDealer.splitHand) : 0;
        const secondHandBusted = secondHandValue > 21;
        
        // Set the correct buttons for the target hand
        let targetButtons: GameButtonType[] = [];
        
        if (toHand === 'first') {
            // First hand buttons
            if (!firstHandBusted && firstHandValue !== 21) {
                // Normal gameplay buttons
                targetButtons = [GameButtonType.HIT, GameButtonType.STAND];
                
                // Add double down only for first action on this hand (exactly 2 cards)
                if (this.blackjackDealer.playerHand.cards.length === 2) {
                    targetButtons.push(GameButtonType.DOUBLE);
                }
            } 
            else if (firstHandValue === 21) {
                // Only stand button for 21
                targetButtons = [GameButtonType.STAND];
            }
            // No buttons for busted hand
        } 
        else {
            // Second hand buttons
            if (!secondHandBusted && secondHandValue !== 21) {
                // Normal gameplay buttons
                targetButtons = [GameButtonType.HIT, GameButtonType.STAND];
                
                // Add double down only for first action on this hand (exactly 2 cards)
                if (this.blackjackDealer.splitHand.cards.length === 2) {
                    targetButtons.push(GameButtonType.DOUBLE);
                }
            } 
            else if (secondHandValue === 21) {
                // Only stand button for 21
                targetButtons = [GameButtonType.STAND];
            }
            // No buttons for busted hand
        }
        
        // Store the buttons to show
        this.gameButtonsContainer.toShowButtons = targetButtons;
        
        // Allow time for animations to complete
        setTimeout(() => {
            // Ensure visual indicators are updated
            this.blackjackDealer.setActiveSplitHand(toHand);
            
            // Fix hand positions to prevent jumping
            this.blackjackDealer.positionSplitHands();
            
            // Clear flags to allow UI updates
            this._processingOutcome = false;
            this.blackjackDealer.isCardDealInProgress = false;
            
            // Hide old buttons and show new ones
                        this.gameButtonsContainer.hideAllButtons(true, () => {
                if (targetButtons.length > 0) {
                            this.gameButtonsContainer.showSpecificButtons(
                        targetButtons,
                        true, // Show immediately
                        false // Don't prevent duplicates
                    );
                }
            });
        }, 400); // Wait for transition animation
    }

    /**
     * Handle insurance offers from the backend
     * @param data Insurance offer data
     */
    private handleInsuranceOffer(data: any): void {
        // Skip if insurance decision has already been made for this game
        if (this._insuranceDecided) {
            console.log("Insurance already decided, skipping offer");
            return;
        }
        
        // Set flag to indicate insurance is available
        this.blackjackDealer.isInsuranceAvailable = true;
        
        // Add insurance button to allowed actions
        const currentButtons = this.gameButtonsContainer.toShowButtons || [];
        if (!currentButtons.includes(GameButtonType.INSURANCE)) {
            this.gameButtonsContainer.toShowButtons = [...currentButtons, GameButtonType.INSURANCE];
        }
        
        // Update buttons to include insurance option
        this.checkPendingOutcome();
    }

    /**
     * Handle actions when player tries to continue without making insurance decision
     * This method will automatically decline insurance and check for dealer blackjack
     * @param action The action the player attempted (hit, stand, etc.)
     */
    handleInsuranceDecisionNeeded(action: string): void {
        console.log(`Player attempted ${action} without making insurance decision - auto declining`);
        
        // If insurance is available but player hasn't made a decision,
        // automatically decline insurance first
        if (this.blackjackDealer.isInsuranceAvailable) {
            console.log("Auto-declining insurance before processing action");
            
            // Hide all buttons during processing
            this.gameButtonsContainer.hideAllButtons(true);
            
            // Set card dealing flag to prevent premature button display
            this.blackjackDealer.isCardDealInProgress = true;
            
            // Store the intended action to execute after insurance is processed
            const pendingAction = action;
            
            // Clear the insurance flag immediately to prevent loops
            this.blackjackDealer.isInsuranceAvailable = false;
            
            // Automatically decline insurance
            Globals.backendService?.insurance(false);
            
            // Add a single timeout handler to execute the original action 
            // after insurance response is processed
            setTimeout(() => {
                console.log("Executing original action after insurance timeout:", pendingAction);
                
                // Clear any flags that might be preventing the action
                this.blackjackDealer.isCardDealInProgress = false;
                
                // Execute the original action after insurance is declined
                switch (pendingAction) {
                    case 'hit':
                        // Use the backend directly to avoid recursion with the onHitClicked method
                        console.log("Executing hit after insurance declined");
                        if (this.blackjackDealer.splitHand) {
                            const activeHand = Globals.activeHand || 'first';
                            Globals.backendService?.hit(activeHand);
                        } else {
                            Globals.backendService?.hit();
                        }
                        break;
                    case 'stand':
                        // Use the backend directly to avoid recursion with the onStandClicked method
                        console.log("Executing stand after insurance declined");
                        if (this.blackjackDealer.splitHand) {
                            const activeHand = Globals.activeHand || 'first';
                            Globals.backendService?.stand(activeHand);
                        } else {
                            Globals.backendService?.stand();
                        }
                        break;
                    case 'double':
                        console.log("Executing double after insurance declined");
                        Globals.backendService?.doubleDown();
                        break;
                    case 'surrender':
                        console.log("Executing surrender after insurance declined");
                        Globals.backendService?.surrender();
                        break;
                    case 'split':
                        console.log("Executing split after insurance declined");
                        Globals.backendService?.split();
                        break;
                }
            }, 800); // Use a longer timeout to ensure backend has time to process insurance
        }
    }

    /**
     * Handle split outcome visuals
     * @param outcomeType The split outcome type
     */
    private handleSplitOutcome(outcomeType: string): void {
        // Only proceed if we have both hands
        if (!this.blackjackDealer.playerHand || !this.blackjackDealer.splitHand) {
            return;
        }
        
        // Set appropriate tints based on outcome
        switch (outcomeType) {
            case 'split_win':
            case 'split_win_lose':
            case 'split_win_push':
                // At least one hand won - highlight appropriately
                this.blackjackDealer.playerHand.pointsDisplay.tint = 0x00FF00;
                this.blackjackDealer.splitHand.pointsDisplay.tint = 0x00FF00;
                break;
                
            case 'split_lose':
            case 'split_lose_push':
                // Both hands lost or one lost, one push - highlight appropriately
                this.blackjackDealer.playerHand.pointsDisplay.tint = 0xFF0000;
                this.blackjackDealer.splitHand.pointsDisplay.tint = 0xFF0000;
                break;
                
            case 'split_push':
                // Both hands pushed - neutral highlight
                this.blackjackDealer.playerHand.pointsDisplay.tint = 0xFFFF00;
                this.blackjackDealer.splitHand.pointsDisplay.tint = 0xFFFF00;
                break;
        }
        
        // Make sure both hands are visible for the outcome
        this.blackjackDealer.playerHand.alpha = 1;
        this.blackjackDealer.splitHand.alpha = 1;
        
        // Make sure hands are positioned correctly
        this.blackjackDealer.positionSplitHands();
    }

    /**
     * Handle insurance declined - call backend
     */
    handleInsuranceDeclined() {
        // Only proceed if insurance is actually available
        if (!this.blackjackDealer.isInsuranceAvailable) return;
        
        // Hide all buttons during processing
        this.gameButtonsContainer.hideAllButtons(true);
        
        // Set processing flag to prevent premature button display
        this.blackjackDealer.isCardDealInProgress = true;
        
        // Clear the insurance available flag
        this.blackjackDealer.isInsuranceAvailable = false;
        
        // Mark insurance as decided for this game
        this._insuranceDecided = true;
        
        // Close any insurance popup
        this.popupManager.hidePopup();
        
        // Call backend with insurance declined
        Globals.backendService?.insurance(false);
    }

    /**
     * Handle game outcome messages
     * @param data The outcome data from the backend
     */
    handleGameOutcome(data: any): void {
        // Update game state to complete
        Globals.gameState = 'complete';
        
        // Reset all processing flags to ensure buttons and popups can show
        this._processingOutcome = false;
        this.blackjackDealer.isCardDealInProgress = false;
        this._processingSplitResult = false;
        
        // Determine buttons to show - default to play again and rebet
        let outcomeButtons = [GameButtonType.PLAYON, GameButtonType.REBET];
        if(Globals.balance < Globals.currentBet) {
            outcomeButtons = [GameButtonType.PLAYON];
        }
        
        // Map backend outcome to GameOutcome enum if needed
        let outcomeType = data.outcome;
        
        // Special handling based on outcome type
        console.log(`Processing game outcome: ${outcomeType}`, data);
        
        // Apply special visuals based on outcome type
        switch (outcomeType) {
            case 'blackjack':
            case 'player_blackjack':
                // Special visual for blackjack
                this.blackjackDealer.playerHand.pointsDisplay.tint = 0x00FF00;
                
                // Make sure dealer cards are visible
                if (this.blackjackDealer.dealerHand && this.blackjackDealer.dealerHand.cards.length > 0) {
                    this.blackjackDealer.dealerHand.cards.forEach(card => {
                        if (card.sprite) {
                            card.sprite.visible = true;
                        }
                    });
                }
                break;
            
            case 'surrender':
                // Reset the surrender flag if it was set
                this._isSurrenderInProgress = false;
                
                // Special visual for surrender - fade player's hand
                if (this.blackjackDealer.playerHand) {
                    // Ensure consistent alpha value for surrender
                    this.blackjackDealer.playerHand.alpha = 0.6;
                    
                    // Add a subtle pulse animation to indicate the surrender
                    // This helps users understand the outcome visually
                    const originalScale = this.blackjackDealer.playerHand.scale.x;
                    new Tween(this.blackjackDealer.playerHand.scale)
                        .to({ x: originalScale * 0.95, y: originalScale * 0.95 }, 200)
                        .easing(Easing.Cubic.Out)
                        .yoyo(true)
                        .repeat(1)
                        .start();
                }
                
                // Make sure dealer cards are visible
                if (this.blackjackDealer.dealerHand && this.blackjackDealer.dealerHand.cards.length > 0) {
                    this.blackjackDealer.dealerHand.cards.forEach(card => {
                        if (card.sprite) {
                            card.sprite.visible = true;
                        }
                    });
                }
                break;
            
            case 'insurance_won':
                // Make sure dealer cards are visible
                if (this.blackjackDealer.dealerHand && this.blackjackDealer.dealerHand.cards.length > 0) {
                    this.blackjackDealer.dealerHand.cards.forEach(card => {
                        if (card.sprite) {
                            card.sprite.visible = true;
                        }
                    });
                }
                
                if (data.insurancePayout) {
                    this.blackjackDealer.payout = data.insurancePayout;
                }
                
                // Show positive insurance outcome
                this.popupManager.showInsuranceResult(true);
                break;
                
            case 'player_win':
                // Highlight player's hand for win
                this.blackjackDealer.playerHand.pointsDisplay.tint = 0x00FF00;
                break;
                
            case 'dealer_win':
                // Standard dealer win - no special visual
                break;
                
            case 'push':
                // Push outcome - show a neutral highlight
                this.blackjackDealer.playerHand.pointsDisplay.tint = 0xFFFF00;
                break;
                
            case 'player_bust':
                // Player bust - red highlight
                this.blackjackDealer.playerHand.pointsDisplay.tint = 0xFF0000;
                break;
                
            case 'dealer_bust':
                // Dealer bust - green highlight for player
                this.blackjackDealer.playerHand.pointsDisplay.tint = 0x00FF00;
                break;
                
            // Handle split outcomes
            case 'split_win':
            case 'split_win_lose':
            case 'split_win_push':
                // At least one hand won - highlight appropriately
                this.handleSplitOutcome(outcomeType);
                break;
                
            case 'split_lose':
            case 'split_lose_push':
                // Both hands lost or one lost, one push - highlight appropriately
                this.handleSplitOutcome(outcomeType);
                break;
                
            case 'split_push':
                // Both hands pushed - neutral highlight
                this.handleSplitOutcome(outcomeType);
                break;
        }

        console.log("Showing outcome popup", data.outcome, data.payout); 
        
        // Cancel any pending animations and clear any existing buttons
        if (this.gameButtonsContainer.cancelAllButtonAnimations) {
            this.gameButtonsContainer.cancelAllButtonAnimations();
        }
        
        // Clean existing toShowButtons to prevent conflicting buttons
        this.gameButtonsContainer.toShowButtons = [];
        
        // For surrender, we need special handling to ensure popup shows properly
        if (outcomeType === 'surrender') {
            // Update UI with outcome popup - explicit call for surrender
            setTimeout(() => {
                // Show outcome popup with a slight delay to ensure all visuals are updated
                this.popupManager.showOutcomePopup(data.outcome, data.payout || 0);
                
                // Update player balance
                this.uiContainer.updateBalancefromBackend(data.playerBalance);
                
                // Store payout info for reference
                this.blackjackDealer.payout = data.payout || 0;
                
                // Show buttons after popup is displayed
                setTimeout(() => {
                    // Hide any existing buttons first
                    this.gameButtonsContainer.hideAllButtons(true, () => {
                        // Force complete state
                        Globals.gameState = 'complete';
                        
                        // Show end game buttons
                        this.gameButtonsContainer.showSpecificButtons(
                            outcomeButtons,
                            true,  // Show immediately
                            false  // Don't prevent duplicates
                        );
                    });
                }, 500); // Wait for popup to appear
            }, 100);
        } else {
            // Normal outcome handling for non-surrender outcomes
            
            // Update UI with outcome popup
            this.popupManager.showOutcomePopup(data.outcome, data.payout || 0);
            
            // Update player balance
            this.uiContainer.updateBalancefromBackend(data.playerBalance);
            
            // Store payout info for reference
            this.blackjackDealer.payout = data.payout || 0;
            
            // Add a small delay to ensure popup is displayed before showing buttons
            // This prevents visual conflict between popup and buttons
            setTimeout(() => {
                // Make sure all buttons are fully hidden before showing outcome buttons
                this.gameButtonsContainer.hideAllButtons(true, () => {
                    // Double-check that we're still in 'complete' state
                    if (Globals.gameState !== 'complete') {
                        console.warn("Game state changed from 'complete' during outcome processing - forcing complete state");
                        Globals.gameState = 'complete';
                    }
                    
                    // Set the buttons to show explicitly for this game outcome
                    // This prevents other messages from overriding with the wrong buttons
                    this.gameButtonsContainer.toShowButtons = [GameButtonType.PLAYON, GameButtonType.REBET];
                    
                    // Show end-game buttons with guaranteed animation completion
                    this.gameButtonsContainer.showSpecificButtons(
                        outcomeButtons,
                        true,  // Show immediately
                        false   // Don't prevent duplicates
                    );
                    
                    // Add a safety check to ensure buttons are visible
                    setTimeout(() => {
                        // Check if buttons are visible
                        const anyButtonVisible = outcomeButtons.some(btn => 
                            this.gameButtonsContainer.isButtonVisible(btn)
                        );
                        
                        if (!anyButtonVisible) {
                            console.warn("End-game buttons not visible after delay - forcing display");
                            
                            // Force reset any flags that might be preventing buttons from appearing
                            this._processingOutcome = false;
                            this.blackjackDealer.isCardDealInProgress = false;
                            
                            // Ensure we're in the right game state for end buttons
                            Globals.gameState = 'complete';
                            
                            // Force show the end game buttons one more time
                            this.gameButtonsContainer.toShowButtons = [GameButtonType.PLAYON, GameButtonType.REBET];
                            this.gameButtonsContainer.showSpecificButtons(
                                outcomeButtons, 
                                true,   // Show immediately
                                false   // Don't prevent duplicates
                            );
                        }
                    }, 500);
                });
            }, 300);
        }
    }

    /**
     * Central handler for all backend messages
     * Call this from app.ts to handle all messages from backend in one place
     */
    handleBackendMessage(messageType: string, data: any): void {
        console.log(`GameManager received message: ${messageType}`, data);
        
        // Special handling for GAME_END to prevent race conditions
        if (messageType === MessageType.GAME_END) {
            // Cancel all pending button animations
            if (this.gameButtonsContainer.cancelAllButtonAnimations) {
                this.gameButtonsContainer.cancelAllButtonAnimations();
            }
            
            // Force correct game state regardless of what message says
            Globals.gameState = 'complete';
            
            // Prevent any other message processing
            this._processingOutcome = true;
            
            // Reset flags in a controlled sequence
            setTimeout(() => {
                this._processingOutcome = false;
                this.blackjackDealer.isCardDealInProgress = false;
                this._processingSplitResult = false;
                
                // Now handle the game outcome
                this.handleGameOutcome(data);
            }, 100);
            
            return;
        }
        
        // CRITICAL FIX: If we're in 'complete' state, ignore any phase changes to 'betting'
        // This prevents betting buttons from replacing end-game buttons after a bust/win/loss
        if (Globals.gameState === 'complete' && 
            (messageType === MessageType.ACTION_RESULT || messageType === MessageType.PHASE_CHANGE) &&
            data?.phase === 'betting') {
            console.log(`Ignoring phase change to betting while in complete state`);
            
            // Force end game buttons to appear if they're missing
            const isPlayonVisible = this.gameButtonsContainer.isButtonVisible(GameButtonType.PLAYON);
            const isRebetVisible = this.gameButtonsContainer.isButtonVisible(GameButtonType.REBET);
                    
            if (!isPlayonVisible && !isRebetVisible) {
                console.log("Forcing end-game buttons to appear");
                
                // Force show the standard end-game buttons
                this.gameButtonsContainer.toShowButtons = [GameButtonType.PLAYON, GameButtonType.REBET];
                this.gameButtonsContainer.showSpecificButtons(
                    this.gameButtonsContainer.toShowButtons, 
                    true,  // Show immediately
                    false  // Don't prevent duplicates
                );
                
                // Clear to prevent multiple showings
                this.gameButtonsContainer.toShowButtons = [];
            }
            
            return; // Skip further processing to prevent button replacement
        }
        
        // Reset processing flags for betting phase to ensure buttons appear
        // Only do this for legitimate phase transitions, not for inconsistent states
        if ((messageType === MessageType.GAME_STATE || messageType === MessageType.PHASE_CHANGE) && 
            (data.gamePhase === 'betting' || data.to === 'betting') &&
            Globals.gameState !== 'complete') { // Don't reset flags if we're in complete state
                
            this._processingOutcome = false;
            this.blackjackDealer.isCardDealInProgress = false;
            this._processingSplitResult = false;
            // Do not reset _insuranceDecided here - it should persist until game is reset
        }
        
        // Handle insurance lost in ACTION_RESULT
        if (messageType === MessageType.ACTION_RESULT && 
            data?.action === MessageType.INSURANCE && 
            data?.outcome === 'insurance_lost') {
            
            // User took insurance but dealer doesn't have blackjack
            this.blackjackDealer.isInsuranceAvailable = false;
            // Mark insurance as decided
            this._insuranceDecided = true;
                
            // Show insurance lost popup
            this.popupManager.showInsuranceResult(false);
                
            // Auto-hide popup after delay and continue game
            setTimeout(() => {
                this.popupManager.hidePopup(() => {
                    if (data.allowedActions) {
                        // Cancel any pending button animations first
                        if (this.gameButtonsContainer.cancelAllButtonAnimations) {
                            this.gameButtonsContainer.cancelAllButtonAnimations();
                        }
                        
                        this.gameButtonsContainer.toShowButtons = getButtonType(data.allowedActions);
                        
                        // Remove insurance button if present - insurance has been decided
                        const insuranceIndex = this.gameButtonsContainer.toShowButtons.indexOf(GameButtonType.INSURANCE);
                        if (insuranceIndex !== -1) {
                            console.log("Removing insurance button after insurance lost outcome");
                            this.gameButtonsContainer.toShowButtons.splice(insuranceIndex, 1);
                        }
                    }
                    this.checkPendingOutcome();
                });
            }, 2000);
            
            return;
        }
        
        // Similar protection for PLAYER_TURN message
        if (messageType === MessageType.PLAYER_TURN && data?.allowedActions && this._insuranceDecided) {
            // Convert backend actions to button types
            const buttons = getButtonType(data.allowedActions);
            
            // Filter out insurance button if insurance has been decided
            const insuranceIndex = buttons.indexOf(GameButtonType.INSURANCE);
            if (insuranceIndex !== -1) {
                console.log("Removing insurance button from PLAYER_TURN message - insurance already decided");
                buttons.splice(insuranceIndex, 1);
            }
            
            // Store filtered buttons
            this.gameButtonsContainer.toShowButtons = buttons;
            
            // Update allowed actions in the message to ensure consistency
            data.allowedActions = data.allowedActions.filter((action: string) => action !== 'insurance');
        }
        
        // Reset flags for specific actions that should clear states
        if (messageType === MessageType.ACTION_RESULT && 
            (data?.action === 'surrender' || data?.action === 'insurance')) {
            this._processingOutcome = false;
            this.blackjackDealer.isCardDealInProgress = false;
            this.blackjackDealer.isInsuranceAvailable = false;
            
            // Also mark insurance as decided if this was an insurance action
            if (data?.action === 'insurance') {
                this._insuranceDecided = true;
            }
        }
        
        // Process the message normally
        this.recveiveBackendMessages(messageType, data);
    }

}

