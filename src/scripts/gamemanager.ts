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
    
    // Track pending game outcome to show after card dealing
    pendingOutcome: any = null;

    // Flag to track if we have a pending split option to handle
    private pendingSplitOption: boolean = false;

    unlockShopCallback: () => void = () => { };
    cancelShopCallBack: () => void = () => { };
    shopPopup: ShopPopup = new ShopPopup(this.unlockShopCallback, this.cancelShopCallBack);

    // Add this property declaration at the class level along with the other private properties
    // Flag to track if we're already processing an outcome to prevent duplicate calls
    private _processingOutcome: boolean = false;

    // Add a debounce flag for Play On button
    private _playOnInProgress: boolean = false;

    // Add these properties to the class
    private _outcomePopupShown: boolean = false;
    private _currentOutcomeId: number = 0;

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
            
        if (hasInitialBlackjack) {
            console.log("Initial player blackjack detected - will show outcome after all cards are dealt");
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
        this.pendingOutcome = null; // Clear any pending outcome
        Globals.gameState = 'betting';
        // this.popupManager.hidePopup(() => {
            this.gameButtonsContainer.hideAllButtons();
        // });
        
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
        
        // Handle special cases for split operations
        if (msgType === MessageType.SPLIT_RESULT) {
            // For split result, don't process other messages until split is done
            this.handleSplitResult(data);
            return;
        }
        
        // Skip most message processing if we're processing a split result
        if (this._processingSplitResult) {
            console.log("Currently processing split result, deferring message:", msgType);
            
            
            // Only process these critical message types during split
            if (msgType === MessageType.BALANCE_UPDATE) {
                // Always process balance updates
                this.uiContainer.updateBalancefromBackend(data.balance);
                return;
            } else if (msgType === MessageType.GAME_OUTCOME) {
                // Store the outcome to be shown after split processing completes
                this.pendingOutcome = data.outcome;
                return;
            } else if (msgType === MessageType.ACTION_RESULT && data.action === 'split') {
                // Let split-related action results through
                console.log("Processing split-related action result during split processing");
            } 
           
            else {
                // Queue up other messages by returning early
                return;
            }
        }
        
        // Store allowed actions for later use after card dealing completes
        if (data && data.allowedActions) {
            // Don't process allowed actions here for GAME_OUTCOME or during split - we'll do it specially in those cases
            if (msgType !== MessageType.GAME_OUTCOME && !this._processingSplitResult) {
                this.gameButtonsContainer.toShowButtons = getButtonType(data.allowedActions);
            }
        }
        
        // Process the message normally
        switch (msgType) {
            case MessageType.GAME_STATE:
                // Handle game state updates (replaces HAND_UPDATED)
                this.HandleGameInProgress(data);
                break;
            
            case MessageType.CARD_DEALT:
                // When dealing cards, don't show buttons until all cards are dealt
                this.blackjackDealer.isCardDealInProgress = true;
                this.giveCards(data);
                break;
            
            case MessageType.BALANCE_UPDATE:
                // Handle balance updates
                this.uiContainer.updateBalancefromBackend(data.balance);
                break;
            
            case MessageType.SPECIAL_CASE:
                // Handle special cases like insurance and split
                if (data.type === 'insurance_win') {
                    // Show insurance popup or UI
                    // this.handleInsuranceOffer();
                } else if (data.type === 'insurance_lost') {
                    // Handle insurance lost outcome
                    console.log("Insurance lost - dealer doesn't have blackjack");
                    
                    // Show the insurance lost popup
                    this.popupManager.showInsuranceResult(false);
                    
                    // Set a timer to hide the popup and show action buttons after 2 seconds
                    setTimeout(() => {
                        this.popupManager.hidePopup(()=>{
                            this.gameButtonsContainer.showGameplayButtons();
                        });
                        
                        // Now show the allowed action buttons
                        if (data.allowedActions) {
                            this.gameButtonsContainer.toShowButtons = getButtonType(data.allowedActions);
                        }
                        this.checkPendingOutcome();
                    }, 2000);
                } else if (data.type === 'split') {
                    // Skip split option if we already have a split hand or are processing split
                    if (this.blackjackDealer.splitHand || this._processingSplitResult) {
                        console.log("Split already performed or in progress, ignoring split option");
                        return;
                    }
                    
                    // For split option, we need to be careful about button timing
                    // Only proceed if we're not already in the middle of card dealing
                    if (!this.blackjackDealer.isCardDealInProgress) {
                        this.handleSplitOption();
                    } else {
                        // If cards are being dealt, wait until complete
                        console.log("Received split option during card dealing, deferring handling");
                        this.pendingSplitOption = true;
                    }
                }
                break;
            
            case MessageType.GAME_OUTCOME:
                // Update game state
                Globals.gameState = data.gamePhase || 'complete';
                
                // For game outcome specifically, explicitly map the allowed actions
                let outcomeButtons = [];
                
                // Log the allowed actions we received
                console.log("Game outcome allowed actions:", data.allowedActions);
                
                // If allowedActions is present, process them
                if (data.allowedActions && Array.isArray(data.allowedActions)) {
                    // Explicitly check for each action type for game outcome
                    if (data.allowedActions.includes('place_bet')) {
                        outcomeButtons.push(GameButtonType.PLAYON);
                    }
                    if (data.allowedActions.includes('rebet')) {
                        outcomeButtons.push(GameButtonType.REBET);
                    }
                    
                    // If no buttons were added but we had actions, use the standard function as fallback
                    if (outcomeButtons.length === 0 && data.allowedActions.length > 0) {
                        outcomeButtons = getButtonType(data.allowedActions);
                        
                        // Always remove split button from outcome buttons
                        const splitIndex = outcomeButtons.indexOf(GameButtonType.SPLIT);
                        if (splitIndex !== -1) {
                            outcomeButtons.splice(splitIndex, 1);
                        }
                    }
                    
                    // If still empty, use default buttons
                    if (outcomeButtons.length === 0) {
                        outcomeButtons = [GameButtonType.PLAYON, GameButtonType.REBET];
                    }
                } else {
                    // Default if no allowed actions
                    outcomeButtons = [GameButtonType.PLAYON, GameButtonType.REBET];
                }
                
                // Store the button types we've determined
                console.log("Mapped outcome buttons:", outcomeButtons);
                this.gameButtonsContainer.toShowButtons = outcomeButtons;
                
                // Update balance
                this.uiContainer.updateBalancefromBackend(data.playerBalance);
                this.blackjackDealer.payout = data.payout;
                
                // Store outcome to be shown after all card dealing completes
                this.pendingOutcome = data.outcome;
                
                // Special handling for insurance win
                if (data.outcome === 'insurance_won') {
                    console.log("Insurance win outcome received - this is the final outcome");
                    // Ensure we don't show a second outcome popup
                    Globals.gameState = 'complete';
                }
                
                // Special handling for blackjack
                const isBlackjack = data.outcome === 'player_blackjack';
                
                if (isBlackjack) {
                    console.log("Blackjack outcome detected - ensuring all cards are dealt before showing popup");
                    
                    // For blackjack, always wait for card dealing to complete
                    if (this.blackjackDealer.isCardDealInProgress || !this.blackjackDealer.dealerHand.cards[0]?.faceUp) {
                        console.log("Card dealing still in progress for blackjack - deferring outcome display");
                        
                        // Add a robust check to wait for all cards to be dealt properly
                        const checkCardsDealt = () => {
                            // Wait for dealer's card to be face up and card dealing to complete
                            if (!this.blackjackDealer.isCardDealInProgress && 
                                this.blackjackDealer.dealerHand.cards[0]?.faceUp &&
                                !this._processingSplitResult) {
                                console.log("All cards now dealt - showing blackjack outcome");
                                this.showPendingOutcome();
                                
                                // Ensure end game buttons are shown
                                setTimeout(() => {
                                    this.gameButtonsContainer.showSpecificButtons(
                                        this.gameButtonsContainer.toShowButtons,
                                        true // Show immediately
                                    );
                                }, 300);
                            } else {
                                // Check again after a short delay
                                setTimeout(checkCardsDealt, 300);
                            }
                        };
                        
                        // Start checking for cards to be fully dealt
                        setTimeout(checkCardsDealt, 300);
                        return;
                    }
                }
                
                // If no cards are currently being dealt, show outcome immediately
                if (!this.blackjackDealer.isCardDealInProgress && !this._processingSplitResult) {
                    this.showPendingOutcome();
                    
                    // For player_blackjack, ensure buttons are shown right away
                    if (isBlackjack && Globals.gameState === 'complete') {
                        console.log("Player blackjack detected, ensuring end-game buttons are visible immediately");
                        this.gameButtonsContainer.showSpecificButtons(
                            this.gameButtonsContainer.toShowButtons, 
                            true  // Show immediately
                        );
                    }
                } else {
                    console.log("Card dealing or split processing in progress, outcome will be shown when complete");
                    
                    // Add a failsafe check in case the flag gets stuck
                    setTimeout(() => {
                        if (this.pendingOutcome && !this._processingOutcome) {
                            console.log("Failsafe: forcing pending outcome display after timeout");
                            this.showPendingOutcome();
                            
                            // Also ensure buttons are shown if it's a complete state
                            if (Globals.gameState === 'complete') {
                                console.log("Ensuring end-game buttons are visible after delayed outcome");
                                this.gameButtonsContainer.showSpecificButtons(
                                    this.gameButtonsContainer.toShowButtons, 
                                    true  // Show immediately
                                );
                            }
                        }
                    }, 5000); // 5 second safety timeout
                }
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
        // Only proceed if all card dealing animations are complete
        if (this.blackjackDealer.isCardDealInProgress || this._processingSplitResult) {
            console.log("Card dealing or split processing in progress, deferring button display");
            return;
        }
        
        // Set flag to prevent multiple calls
        if (this._processingOutcome) {
            console.log("Already processing outcome, skipping duplicate call");
            
            // Special case: If we're in split mode with second hand at 21, force button display
            if (this.blackjackDealer.splitHand && Globals.activeHand === 'second') {
                const splitHandValue = this.blackjackDealer.calculateHandValue(this.blackjackDealer.splitHand);
                if (splitHandValue === 21 && this.gameButtonsContainer.toShowButtons?.length > 0) {
                    console.log("Split second hand has 21 - forcing button display despite processing flag");
                    // Reset processing flag to allow buttons to show
                    this._processingOutcome = false;
                    // Continue processing to show buttons
                } else {
                    return; // Return normally for other cases
                }
            } else {
                return; // Return normally for non-split cases
            }
        }
        
        // Set flag to prevent multiple calls (if we got here without the flag already set)
        if (!this._processingOutcome) {
            this._processingOutcome = true;
        }
        
        // Special check for blackjack - ensure dealer card is face up
        if (this.pendingOutcome === 'player_blackjack' && 
            (!this.blackjackDealer.dealerHand.cards[0]?.faceUp || this.blackjackDealer.dealerHand.cards.length < 2)) {
            console.log("Detected blackjack but dealer card not fully revealed, deferring outcome display");
            setTimeout(() => this.checkPendingOutcome(), 300);
            return;
        }
        
        // Create stable version for this operation to track race conditions
        const operationVersion = Date.now();
        this._currentOperationVersion = operationVersion;
        
        console.log(`Starting button update operation ${operationVersion}`);
        
        // Always hide current buttons first to ensure a clean state
        this.gameButtonsContainer.hideAllButtons(true, () => {
            // Check if this operation is still current
            if (operationVersion !== this._currentOperationVersion) {
                console.log(`Button operation ${operationVersion} was superseded, aborting`);
                this._processingOutcome = false;
                return;
            }
            
            // After buttons are hidden, proceed with outcome and new buttons
            setTimeout(() => {
                // Check if this operation is still current
                if (operationVersion !== this._currentOperationVersion) {
                    console.log(`Button operation ${operationVersion} was superseded, aborting`);
                    this._processingOutcome = false;
                    return;
                }
                
                // First check if we have a pending split option
                if (this.pendingSplitOption && !this.blackjackDealer.splitHand) {
                    console.log("Processing pending split option");
                    this.handleSplitOption();
                    this.pendingSplitOption = false;
                }
                
                // Show outcome if there is one - this should happen BEFORE showing buttons
                if (this.pendingOutcome) {
                    console.log("Showing pending outcome:", this.pendingOutcome);
                    
                    // Show the outcome popup first, then wait before showing buttons
                    this.popupManager.showOutcomePopup(this.pendingOutcome, this.blackjackDealer.payout);
                    this.pendingOutcome = null;
                    
                    // Delay showing buttons to ensure popup is fully visible first
                    setTimeout(() => {
                        // Check if this operation is still current
                        if (operationVersion !== this._currentOperationVersion) {
                            console.log(`Button operation ${operationVersion} was superseded, aborting`);
                            this._processingOutcome = false;
                            return;
                        }
                        
                        this.showButtonsAfterOutcome(operationVersion);
                    }, 600); // Increased delay to avoid conflicts
                } else {
                    // No outcome to show, show buttons immediately
                    this.showButtonsAfterOutcome(operationVersion);
                }
            }, 300); // Increased delay before showing new content
        });
    }
    
    // Track the current operation version to prevent race conditions
    private _currentOperationVersion: number = 0;
    
    /**
     * Helper method to show buttons after outcome is displayed
     * Extracted to avoid duplicating code
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
            const activeHand = Globals.activeHand;
            const handToCheck = activeHand === 'first' ? this.blackjackDealer.playerHand : this.blackjackDealer.splitHand;
            
            if (handToCheck) {
                const handValue = this.blackjackDealer.calculateHandValue(handToCheck);
                const isBusted = handValue > 21;
                
                // Special case - never skip buttons if we have 21 in split mode
                const hasExactly21 = handValue === 21;
                
                // Only skip buttons if the current active hand is busted and doesn't have 21
                // This ensures we show buttons for the second hand even if first hand is busted
                if (isBusted && !hasExactly21) {
                    console.log(`Active hand ${activeHand} is busted with value ${handValue}, not showing buttons`);
                    this._processingOutcome = false;
                    return;
                }
                
                if (hasExactly21) {
                    console.log(`Active hand ${activeHand} has exactly 21, ensuring buttons are shown`);
                }
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
            
            // Show the buttons - use immediate mode for complete state to ensure buttons appear
            this.gameButtonsContainer.showSpecificButtons(finalButtons, showImmediately, true);
            
            // Add a failsafe to ensure buttons stay visible
            setTimeout(() => {
                // Double-check if any buttons are visible
                let anyButtonsVisible = false;
                finalButtons.forEach(buttonType => {
                    if (this.gameButtonsContainer.isButtonVisible(buttonType)) {
                        anyButtonsVisible = true;
                    } else {
                        // Force show any buttons that should be visible but aren't
                        console.log(`Button ${buttonType} should be visible - forcing display`);
                        this.gameButtonsContainer.showButton(buttonType, true);
                    }
                });
                
                if (!anyButtonsVisible && finalButtons.length > 0) {
                    console.warn("No end-game buttons visible, forcing display");
                    this.gameButtonsContainer.showSpecificButtons(finalButtons, true, false);
                }
            }, 800);
        }
        
        // Reset processing flag
        this._processingOutcome = false;
    }

    private showPendingOutcome(): void {
        // Only show outcome if card dealing is complete
        if (this.blackjackDealer.isCardDealInProgress) {
            console.log("Card dealing in progress, deferring outcome display");
            return;
        }
        
        // This method now just calls checkPendingOutcome for centralized button management
        this.checkPendingOutcome();
    }

    // Flag to track if a button update is in progress
    private _pendingButtonUpdate: boolean = false;

    giveCards(cardData: { target: string, card: any, isHoleCard: boolean, isAdditionalCard: boolean }) {
        console.log("GIVE CARDS", cardData);
        
        // Skip card dealing if we're processing a split result
        if (this._processingSplitResult) {
            console.log("Currently processing split result, skipping individual card deal for", cardData.target);
            return;
        }

        if(cardData.target === 'player') {
            // Check if the card is already in the player's hand
            const isCardDuplicate = this.blackjackDealer.playerHand.cards.some(card => 
                card.rank === cardData.card.rank && 
                card.suit === cardData.card.suit &&
                card.value === cardData.card.value
            );
            
            if (isCardDuplicate) {
                console.log("Skipping duplicate player card:", cardData.card);
                return;
            }
            
            // Set flag to prevent button display during animation
            this.blackjackDealer.isCardDealInProgress = true;
            
            this.blackjackDealer.playerHand.dealCards(cardData.card).then(() => {
                // Add a small delay to ensure animations are complete
                setTimeout(() => {
                    // Mark card dealing as complete ONLY if there are no pending card deals
                    this.blackjackDealer.isCardDealInProgress = false;
                    
                    // Check if player busted and we're in split mode
                    if (this.blackjackDealer.splitHand) {
                        // Calculate player hand value using blackjackDealer method
                        const playerHandValue = this.blackjackDealer.calculateHandValue(this.blackjackDealer.playerHand);
                        
                        // Check if player busted and we're on the first hand
                        if (playerHandValue > 21 && Globals.activeHand === 'first') {
                            console.log("First hand busted with value", playerHandValue, "- switching to second hand");
                            
                            // Update bust status visuals
                            if (this.blackjackDealer.updateBustStatus) {
                                this.blackjackDealer.updateBustStatus();
                            }
                            
                            // Force points to stay visible with red tint
                            if (this.blackjackDealer.playerHand.pointsDisplay) {
                                this.blackjackDealer.playerHand.pointsDisplay.visible = true;
                                this.blackjackDealer.playerHand.pointsDisplay.tint = 0xFF0000;
                            }
                            
                            // Force split hand positions to be maintained - prevent drift
                            this.blackjackDealer.positionSplitHands();
                            
                            // Create a copy of the buttons to show for second hand
                            const secondHandButtons = [
                                GameButtonType.HIT, 
                                GameButtonType.STAND,
                                GameButtonType.DOUBLE
                            ];
                            
                            // Switch to the second hand AFTER storing buttons
                            this.updateActiveHandIndicator('second');
                            
                            // Wait a moment for visual transition to complete
                            setTimeout(() => {
                                // Make sure card dealing flag is off
                                this.blackjackDealer.isCardDealInProgress = false;
                                this._processingOutcome = false;
                                
                                // Ensure positions are maintained
                                this.blackjackDealer.positionSplitHands();
                                
                                // Clear existing buttons by hiding them first
                                this.gameButtonsContainer.hideAllButtons(true, () => {
                                    console.log("Showing buttons for second hand after first hand bust:", secondHandButtons);
                                    
                                    // Show buttons for second hand with immediate display
                                    this.gameButtonsContainer.showSpecificButtons(
                                        secondHandButtons,
                                        true,   // Immediate display
                                        false   // Don't prevent duplicates
                                    );
                                });
                            }, 300);
                        }
                    }
                    
                    // Update the points display to show current hand value
                    if (this.blackjackDealer.playerHand.updatePointsDisplay) {
                        this.blackjackDealer.playerHand.updatePointsDisplay(true);
                    }
                    
                    // Update bust status visuals for all hands
                    if (this.blackjackDealer.updateBustStatus) {
                        this.blackjackDealer.updateBustStatus();
                    }
                    
                    // Check if we can show buttons
                    this.checkPendingOutcome();
                }, 200);
            });
        }
        else if(cardData.target === 'dealer') {
            // Check if the card is already in the dealer's hand
            const isCardDuplicate = this.blackjackDealer.dealerHand.cards.some(card => 
                card.rank === cardData.card.rank && 
                card.suit === cardData.card.suit &&
                card.value === cardData.card.value
            );
            
            if (isCardDuplicate && !cardData.isHoleCard) {
                console.log("Skipping duplicate dealer card:", cardData.card);
                return;
            }
            
            // Set flag to prevent button display during animation
            this.blackjackDealer.isCardDealInProgress = true;
            
            if(cardData.isHoleCard) {
                // Special handling for hole card: Make sure we have at least one card first
                if (this.blackjackDealer.dealerHand.cards.length === 0) {
                    console.log("Cannot reveal dealer hole card yet - dealing it face down first");
                    // Deal the hole card face down first
                    const faceDownCard = {...cardData.card, faceUp: false};
                    this.blackjackDealer.dealerHand.dealCards(faceDownCard).then(() => {
                        // Now reveal it in a moment
                        setTimeout(() => {
                            this.blackjackDealer.dealerHand.revealDealerCard(cardData.card).then(() => {
                                setTimeout(() => {
                                    this.blackjackDealer.isCardDealInProgress = false;
                                    
                                    // Check if this is a blackjack reveal
                                    if (this.pendingOutcome === 'player_blackjack') {
                                        console.log("Dealer card revealed for blackjack outcome");
                                        // Force check for pending outcome after dealer card is revealed
                                        this.checkPendingOutcome();
                                    } else {
                                        this.checkPendingOutcome();
                                    }
                                }, 200);
                            });
                        }, 300);
                    });
                } else {
                    // Revealing the hole card normally
                    this.blackjackDealer.dealerHand.revealDealerCard(cardData.card).then(() => {
                        setTimeout(() => {
                            this.blackjackDealer.isCardDealInProgress = false;
                            
                            // Check if this is a blackjack reveal
                            if (this.pendingOutcome === 'player_blackjack') {
                                console.log("Dealer card revealed for blackjack outcome");
                                // Force check for pending outcome after dealer card is revealed
                                this.checkPendingOutcome();
                            } else {
                                this.checkPendingOutcome();
                            }
                        }, 200);
                    });
                }
            } else {
                // Regular dealer card
                this.blackjackDealer.dealerHand.dealCards(cardData.card).then(() => {
                    setTimeout(() => {
                        this.blackjackDealer.isCardDealInProgress = false;
                        this.checkPendingOutcome();
                    }, 200);
                });
            }
        }
        else if(cardData.target === 'split') {
            // Set flag to prevent button display during animation
            this.blackjackDealer.isCardDealInProgress = true;
            
            // Initialize split hand if it doesn't exist
            if (!this.blackjackDealer.splitHand) {
                const isNewHand = this.blackjackDealer.initializeSplitHand();
                if (isNewHand) {
                    console.log("Created new split hand for split target card");
                }
            }
            
            if(this.blackjackDealer.splitHand) {
                // Check if the card is already in the split hand
                const isCardDuplicate = this.blackjackDealer.splitHand.cards.some(card => 
                    card.rank === cardData.card.rank && 
                    card.suit === cardData.card.suit &&
                    card.value === cardData.card.value
                );
                
                if (isCardDuplicate) {
                    console.log("Skipping duplicate split card:", cardData.card);
                    this.blackjackDealer.isCardDealInProgress = false;
                    this.checkPendingOutcome();
                    return;
                }
                
                console.log("Dealing card to split hand:", cardData.card);
                this.blackjackDealer.splitHand.dealCards(cardData.card).then(() => {
                    // Add a small delay to ensure animations are complete
                    setTimeout(() => {
                        // Mark card dealing as complete
                        this.blackjackDealer.isCardDealInProgress = false;
                        
                        // Update the points display
                        if (this.blackjackDealer.splitHand?.updatePointsDisplay) {
                            this.blackjackDealer.splitHand.updatePointsDisplay(true);
                        }
                        
                        // Update bust status visuals
                        if (this.blackjackDealer.updateBustStatus) {
                            this.blackjackDealer.updateBustStatus();
                        }
                        
                        // Check if split hand busted while active
                        if (this.blackjackDealer.splitHand) {
                            const splitHandValue = this.blackjackDealer.calculateHandValue(this.blackjackDealer.splitHand);
                            
                            // Handle bust case - second split hand went over 21
                            if (splitHandValue > 21 && Globals.activeHand === 'second') {
                                console.log("Second hand busted with value", splitHandValue);
                                
                                // Apply red tint to points display
                                if (this.blackjackDealer.splitHand.pointsDisplay) {
                                    this.blackjackDealer.splitHand.pointsDisplay.tint = 0xFF0000;
                                }
                                
                                // Hide all buttons immediately when second hand busts
                                this.gameButtonsContainer.hideAllButtons(true, () => {
                                    console.log("Second hand busted - hiding all buttons");
                                    // Set game phase to dealer turn or complete based on game state
                                    if (Globals.gameState === 'player_turn') {
                                        // The backend will transition to dealer_turn or complete
                                        console.log("Waiting for backend to progress game state after second hand bust");
                                    }
                                });
                                
                                // Make sure we don't show buttons again for busted hand
                                this.gameButtonsContainer.toShowButtons = [];
                                this._processingOutcome = true;
                                
                                // Clear the flag after a delay to prevent it getting stuck 
                                setTimeout(() => {
                                    // Only reset if we're in complete or dealer_turn phase
                                    if (Globals.gameState !== 'player_turn') {
                                        this._processingOutcome = false;
                                    }
                                }, 1000);
                            } 
                            // Handle 21 case - second split hand reached exactly 21
                            else if (splitHandValue === 21 && Globals.activeHand === 'second') {
                                console.log("Second hand has exactly 21 - ensuring buttons appear");
                                
                                // Reset processing flags to allow stand button to show
                                this._processingOutcome = false;
                                
                                // Apply green tint to points display for 21
                                if (this.blackjackDealer.splitHand.pointsDisplay) {
                                    this.blackjackDealer.splitHand.pointsDisplay.tint = 0x00FF00;
                                }
                                
                                // For a hand with 21, we should show the stand button
                                // Check if we need to force stand button display
                                const standButtonVisible = this.gameButtonsContainer.isButtonVisible(GameButtonType.STAND);
                                
                                if (!standButtonVisible) {
                                    console.log("Stand button not visible for hand with 21 - forcing display");
                                    // Force stand button to display using universal method
                                    this.gameButtonsContainer.universalShowStandButton();
                                } else {
                                    console.log("Stand button already visible for hand with 21");
                                }
                            }
                            // For other cases, ensure flags are reset to allow button display
                            else {
                                // Reset processing flags to ensure buttons can be shown
                                this._processingOutcome = false;
                            }
                        }
                        
                        // Check if we can show buttons
                        this.checkPendingOutcome();
                    }, 200);
                });
            } else {
                console.error("Split hand is still null after initialization attempt");
                this.blackjackDealer.isCardDealInProgress = false;
                this.checkPendingOutcome();
            }
        }
    }
    
    HandleGameInProgress(data: any) {
        // Skip handling during split processing to avoid visual glitches
        if (this._processingSplitResult) {
            console.log("Currently processing split result, deferring HandleGameInProgress");
            return;
        }
        
        // --- LOGGING FOR DEBUGGING ---
        // Log detailed information for split hand states
        if (data.splitHand && data.activeSplitHand) {
            console.log("Processing split game state:", {
                activeSplitHand: data.activeSplitHand,
                playerHand: data.playerHand ? 
                    `Cards: ${data.playerHand.cards?.length}, Value: ${data.playerHand.value}, Busted: ${data.playerHand.busted}` : 'N/A',
                splitHand: data.splitHand ? 
                    `Cards: ${data.splitHand.cards?.length}, Value: ${data.splitHand.value}, Busted: ${data.splitHand.busted}` : 'N/A',
                gamePhase: data.gamePhase
            });
            
            // Maintain card positions for split hands
            if (data.cardPositionsLocked) {
                this.blackjackDealer.positionSplitHands();
            }
        }
        
        // --- HANDLE ACTIVE SPLIT HAND CHANGES ---
        // Update active split hand if provided by backend
        if (data.activeSplitHand && (data.activeSplitHand === 'first' || data.activeSplitHand === 'second')) {
            const previousHand = Globals.activeHand;
            
            if (previousHand !== data.activeSplitHand) {
                console.log(`Updating active split hand from backend: ${data.activeSplitHand} (was: ${previousHand})`);
                Globals.activeHand = data.activeSplitHand;
                
                // Update visual indicators for active hand
                this.blackjackDealer.setActiveSplitHand(data.activeSplitHand);
                
                // Handle special case: switching to second hand after first hand busts
                if (previousHand === 'first' && data.activeSplitHand === 'second' && data.playerHand?.busted) {
                    console.log("First hand busted, switched to second hand");
                }
                
                // Ensure buttons are visible for the newly active hand
                if (data.activeSplitHand === 'second') {
                    this._processingOutcome = false;
                    this.blackjackDealer.isCardDealInProgress = false;
                    
                    // Show appropriate buttons
                    this.updateButtonsForActiveSplitHand(data);
                }
            }
        }
        
        // --- HANDLE ALLOWED ACTIONS ---
        // Update buttons based on allowed actions from backend
        if (data.allowedActions) {
            this.gameButtonsContainer.toShowButtons = getButtonType(data.allowedActions);
            
            // In split mode, remove split button (can't split again)
            if (this.blackjackDealer.splitHand) {
                const splitIndex = this.gameButtonsContainer.toShowButtons.indexOf(GameButtonType.SPLIT);
                if (splitIndex !== -1) {
                    this.gameButtonsContainer.toShowButtons.splice(splitIndex, 1);
                }
            }
            
            console.log("Allowed actions from backend:", data.allowedActions);
            console.log("Buttons that will be shown:", this.gameButtonsContainer.toShowButtons);
            
            // Determine if we should show buttons based on game state
            const canShowButtons = !this.blackjackDealer.isCardDealInProgress && 
                                  !this._processingSplitResult && 
                                  !this._processingOutcome &&
                                  data.gamePhase !== 'dealer_turn' && 
                                  data.gamePhase !== 'complete';
            
            if (canShowButtons) {
                this.gameButtonsContainer.showSpecificButtons(
                    this.gameButtonsContainer.toShowButtons,
                    true,   // Show immediately
                    false   // Don't prevent duplicates
                );
            }
        }
        
        // --- HANDLE SPECIAL HAND VALUES ---
        // Handle player hands with special values (21 or bust)
        if (data.gamePhase === 'player_turn') {
            // Get the currently active hand based on split status
            const currentHand = this.blackjackDealer.splitHand && Globals.activeHand === 'second' ? 
                data.splitHand : data.playerHand;
            
            if (currentHand) {
                const handValue = currentHand.value;
                const isBusted = currentHand.busted || handValue > 21;
                
                console.log(`Current hand value: ${handValue}, Busted: ${isBusted}, Active hand: ${Globals.activeHand || 'main'}`);
                
                if (isBusted) {
                    // Handle busted hand
                    console.log("Current hand is busted");
                    this.handleBustedHand(data);
                } else if (handValue === 21) {
                    // Handle hand with value 21
                    console.log("Hand has 21 - automatically standing");
                    this.handleHand21(data);
                }
            }
        }
        
        // --- HANDLE COMPLETE PHASE ---
        // Special handling for game completion
        if (data.gamePhase === 'complete' && !this._processingOutcome) {
            console.log("Game entered complete phase - handling outcome");
            
            // Mark as processing outcome to prevent duplicate handling
            this._processingOutcome = true;
            
            // Hide all buttons during outcome processing
            this.gameButtonsContainer.hideAllButtons(true);
            
            // If data contains outcome, handle it
            if (data.outcome) {
                console.log("Handling outcome from complete phase:", data.outcome);
                this.handleGameOutcome(data);
            } else {
                console.log("Complete phase without outcome data - waiting for game_end message");
            }
        }
    }

    /**
     * Handle case where current hand has busted
     */
    private handleBustedHand(data: any): void {
        // Hide buttons immediately on bust
        this.gameButtonsContainer.hideAllButtons(true);
        
        // Update bust status visually
        if (this.blackjackDealer.updateBustStatus) {
            this.blackjackDealer.updateBustStatus();
        }
        
        // Check if we need to switch to second hand
        if (this.blackjackDealer.splitHand && Globals.activeHand === 'first') {
            console.log("First hand busted - switching to second hand");
            Globals.activeHand = 'second';
            this.blackjackDealer.setActiveSplitHand('second');
            
            // Update buttons for second hand
            this.updateButtonsForActiveSplitHand(data);
        } else {
            // Both hands busted or non-split bust - end the game
            console.log("Hand busted - proceeding to dealer turn");
            this._processingOutcome = true;
        }
    }

    /**
     * Handle case where current hand has value 21
     */
    private handleHand21(data: any): void {
        console.log("Hand has 21 - showing only stand button");
        
        // When hand has 21, only allow standing
        this.gameButtonsContainer.toShowButtons = [GameButtonType.STAND];
        
        // Show stand button
        this.gameButtonsContainer.showSpecificButtons(
            this.gameButtonsContainer.toShowButtons,
            true,   // Show immediately
            false   // Don't prevent duplicates
        );
    }

    /**
     * Update buttons for the active split hand
     */
    private updateButtonsForActiveSplitHand(data: any): void {
        // Clear any processing flags
        this._processingOutcome = false;
        this.blackjackDealer.isCardDealInProgress = false;
        
        // Determine which buttons to show
        let buttonsToShow = [];
        
        if (data.allowedActions && Array.isArray(data.allowedActions)) {
            buttonsToShow = getButtonType(data.allowedActions);
        } else {
            // Default buttons if none provided
            buttonsToShow = [
                GameButtonType.HIT, 
                GameButtonType.STAND
            ];
            
            // Add double only if we have exactly 1 card in the active hand
            const activeHand = Globals.activeHand === 'second' ? 
                this.blackjackDealer.splitHand : this.blackjackDealer.playerHand;
            
            if (activeHand && activeHand.cards.length === 1) {
                buttonsToShow.push(GameButtonType.DOUBLE);
            }
        }
        
        console.log(`Buttons for ${Globals.activeHand} hand:`, buttonsToShow);
        
        // Store the buttons
        this.gameButtonsContainer.toShowButtons = buttonsToShow;
        
        // Force correct position of split hands
        this.blackjackDealer.positionSplitHands();
        
        // Show buttons with slight delay
        setTimeout(() => {
            this.gameButtonsContainer.showSpecificButtons(
                buttonsToShow,
                true,   // Show immediately
                false   // Don't prevent duplicates
            );
        }, 200);
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
    /**
     * Handle hit button click
     */
    onHitClicked() {
        // Track the active hand for split scenarios
        const activeHand = Globals.activeHand || 'first';
        console.log(`Hit clicked for ${this.blackjackDealer.splitHand ? activeHand + ' hand' : 'hand'}`);
        
        // Prevent multiple hits while card animation is in progress
        if (this.blackjackDealer.isCardDealInProgress) {
            console.log("Card deal in progress, ignoring hit request");
            return;
        }
        
        // Hide buttons during card deal to prevent double-clicking
        this.gameButtonsContainer.hideAllButtons(true);
        
        // Set flag to indicate card deal is in progress
        this.blackjackDealer.isCardDealInProgress = true;
        
        // Send hit request to backend based on active hand
        if (this.blackjackDealer.splitHand && activeHand === 'second') {
            console.log("Hitting second (split) hand");
            // Globals.backendService?.hitSplit(activeHand);
        } else {
            console.log("Hitting main hand");
            Globals.backendService?.hit(activeHand);
        }
        
        // Failsafe to ensure buttons come back if no response
        setTimeout(() => {
            if (this.blackjackDealer.isCardDealInProgress) {
                console.log("Hit response timeout - resetting card deal flag");
                this.blackjackDealer.isCardDealInProgress = false;
                
                // Only restore buttons if game is still in player turn
                if (Globals.gameState === 'player_turn') {
                    this.gameButtonsContainer.showSpecificButtons(
                        this.gameButtonsContainer.toShowButtons,
                        true,
                        false
                    );
                }
            }
        }, 2000);
    }

    /**
     * Handle stand button click
     */
    onStandClicked() {
        // Track the active hand for split scenarios
        const activeHand = Globals.activeHand || 'first';
        console.log(`Stand clicked for ${this.blackjackDealer.splitHand ? activeHand + ' hand' : 'hand'}`);
        
        // Prevent action while card animation is in progress
        if (this.blackjackDealer.isCardDealInProgress) {
            console.log("Card deal in progress, ignoring stand request");
            return;
        }
        
        // Hide buttons during action
        this.gameButtonsContainer.hideAllButtons(true);
        
        // Send stand request to backend based on active hand
        if (this.blackjackDealer.splitHand) {
            if (activeHand === 'second') {
                console.log("Standing on second (split) hand");
                // Standing on second hand ends player turn
                // Globals.backendService?.standSplit(activeHand);
            } else {
                console.log("Standing on first hand - will switch to second hand");
                // Standing on first hand should switch to second hand
                // Globals.backendService?.standSplit(activeHand);
                
                // Mark that we're intentionally processing a split result
                this._processingSplitResult = true;
                
                // Failsafe to ensure processing flag is cleared
                setTimeout(() => {
                    this._processingSplitResult = false;
                }, 2000);
            }
        } else {
            console.log("Standing on main hand");
            Globals.backendService?.stand();
        }
    }

    /**
     * Handle double down button click
     */
    onDoubleClicked() {
        console.log("Double down clicked");
        
        // Prevent action while card animation is in progress
        if (this.blackjackDealer.isCardDealInProgress) {
            console.log("Card deal in progress, ignoring double down request");
            return;
        }
        
        // Hide buttons during action
        this.gameButtonsContainer.hideAllButtons(true);
        
        // Set flag to indicate card deal is in progress
        this.blackjackDealer.isCardDealInProgress = true;
        
        // Send double down request to backend
        Globals.backendService?.doubleDown();
        
        // Failsafe to ensure flags are reset if no response
        setTimeout(() => {
            this.blackjackDealer.isCardDealInProgress = false;
        }, 2000);
    }

    /**
     * Handle split button click
     */
    onSplitClicked() {
        console.log("Split clicked");
        
        // Prevent action while card animation is in progress
        if (this.blackjackDealer.isCardDealInProgress) {
            console.log("Card deal in progress, ignoring split request");
            return;
        }
        
        // Hide buttons during action
        this.gameButtonsContainer.hideAllButtons(true);
        
        // Set flag to indicate we're processing split
        this._processingSplitResult = true;
        
        // Send split request to backend
        Globals.backendService?.split();
        
        // Failsafe to ensure processing flag is cleared if no response
        setTimeout(() => {
            this._processingSplitResult = false;
            this.blackjackDealer.isCardDealInProgress = false;
        }, 5000);
    }

    /**
     * Handle surrender button click
     */
    onSurrenderClicked() {
        console.log("Surrender clicked");
        
        // Prevent action while card animation is in progress
        if (this.blackjackDealer.isCardDealInProgress) {
            console.log("Card deal in progress, ignoring surrender request");
            return;
        }
        
        // Hide buttons during action
        this.gameButtonsContainer.hideAllButtons(true);
        
        // Send surrender request to backend
        Globals.backendService?.surrender();
        
        // Mark as processing outcome to prevent further actions
        this._processingOutcome = true;
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

        if(Globals.gameState === 'complete' ) {
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
    onInsuranceClicked() {
        if(Globals.gameState === 'player_turn') {
            // Hide all buttons during insurance operation
            this.gameButtonsContainer.hideAllButtons(true);
            
            // Set card dealing flag to prevent premature button display
            this.blackjackDealer.isCardDealInProgress = true;
            
            console.log("Insurance accepted - sending to backend");
            
            // Clear the insurance available flag since player has made a decision
            this.blackjackDealer.isInsuranceAvailable = false;
            
            // Calculate insurance amount (half the current bet)
            const insuranceAmount = Globals.currentBet / 2;
            console.log(`Taking insurance for ${insuranceAmount} chips`);
            
            // Send insurance request to backend
            Globals.backendService?.insurance(true);
            
            // The backend will handle the result:
            // If dealer has blackjack: 
            //   - Player wins insurance bet at 2:1
            //   - Game ends with dealer win but insurance win
            // If dealer does not have blackjack:
            //   - Player loses insurance bet
            //   - Game continues with normal gameplay
        }
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
                    }, 300); // Small delay before adding new chips
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
        this.gameButtonsContainer.hideAllButtons(true);
        
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
            
            // Force resize to ensure proper positions
            this.blackjackDealer.resize();
            
            // Get allowed action buttons from backend or use defaults
            let splitButtons: GameButtonType[];
            
            if (data.allowedActions && data.allowedActions.length > 0) {
                // Convert backend actions to button types
                splitButtons = getButtonType(data.allowedActions);
                
                // Always remove split button - can't split again
                const splitIndex = splitButtons.indexOf(GameButtonType.SPLIT);
                if (splitIndex !== -1) {
                    splitButtons.splice(splitIndex, 1);
                    console.log("Removed split button from allowed actions after split");
                }
            } else {
                // Use default buttons if not provided
                splitButtons = [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.DOUBLE];
                console.log("Using default buttons for split hand");
            }
            
            // Store the buttons for showing
            this.gameButtonsContainer.toShowButtons = [...splitButtons];
            
            console.log("Showing buttons after split completion:", splitButtons);
            
            // Clear any other flags that might prevent button display
            this._processingOutcome = false;
            
            // Force split hand positions to be maintained
            this.blackjackDealer.positionSplitHands();
            
            // Show buttons immediately
            this.gameButtonsContainer.showSpecificButtons(
                splitButtons,
                true,   // Show immediately
                false   // Don't prevent duplicates (ensure buttons appear)
            );
        });
    }

    /**
     * Setup split hands visuals based on backend data
     */
    private async setupSplitHandsVisuals(data: any): Promise<void> {
        // Initialize the split hand if it doesn't exist
        if (!this.blackjackDealer.splitHand) {
            console.log("Initializing split hand for the first time");
            // The animation starts here and creates the split hand
            this.blackjackDealer.initializeSplitHand();
            
            // Wait for the animation to complete (approximate timing)
            await new Promise(resolve => setTimeout(resolve, 800));
        }
        
        // Wait a bit more to ensure the split hand is created and animations are done
        if (!this.blackjackDealer.splitHand) {
            // If it's still not created, force creation without animation
            console.warn("Split hand not created after animation, creating directly");
            this.blackjackDealer.splitHand = new Hand('split');
            this.blackjackDealer.cardContainer.addChild(this.blackjackDealer.splitHand);
            this.blackjackDealer.positionSplitHands();
        }
        
        // Always call positionSplitHands before dealing cards to ensure correct starting positions
        this.blackjackDealer.positionSplitHands();
        
        // Store original positions to maintain them during card dealing
        let playerHandX = 0;
        let splitHandX = 0;
        
        if (this.blackjackDealer.playerHand) {
            playerHandX = this.blackjackDealer.playerHand.x;
        }
        
        if (this.blackjackDealer.splitHand) {
            splitHandX = this.blackjackDealer.splitHand.x;
        }
        
        // Setup the player's first hand with cards from backend
        if (data.playerHand && data.playerHand.cards) {
            // Reset existing player hand but keep its position
            this.blackjackDealer.playerHand.reset();
            this.blackjackDealer.playerHand.x = playerHandX; // Restore position
            
            // Deal each card to the player's hand
            for (const card of data.playerHand.cards) {
                await this.blackjackDealer.playerHand.dealCards(card);
                // Ensure position is maintained after each card deal
                this.blackjackDealer.playerHand.x = playerHandX;
                // Small delay between cards for animation
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        // Setup the split hand with cards from backend
        if (data.splitHand && data.splitHand.cards && this.blackjackDealer.splitHand) {
            // Clear existing split hand cards but keep position
            this.blackjackDealer.splitHand.reset();
            this.blackjackDealer.splitHand.x = splitHandX; // Restore position
            
            // Deal each card to the split hand
            for (const card of data.splitHand.cards) {
                await this.blackjackDealer.splitHand.dealCards(card);
                // Ensure position is maintained after each card deal
                this.blackjackDealer.splitHand.x = splitHandX;
                // Small delay between cards for animation
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        // Make sure points are displayed on both hands
        this.blackjackDealer.playerHand.updatePointsDisplay?.(true);
        this.blackjackDealer.splitHand?.updatePointsDisplay?.(true);
        
        // Update bust status indicators
        this.blackjackDealer.updateBustStatus?.();
        
        // Set the active hand based on backend data
        const activeHand = data.activeSplitHand || 'first';
        this.updateActiveHandIndicator(activeHand);
        
        // Set global state
        Globals.activeHand = activeHand;
        
        // Ensure final positions are correct by calling positionSplitHands again
        this.blackjackDealer.positionSplitHands();
        
        // Do one final resize to ensure everything is positioned correctly
        this.blackjackDealer.resize();
        
        // Log final positions for debugging
        if (this.blackjackDealer.splitHand) {
            console.log(`Final split setup positions: player (${this.blackjackDealer.playerHand.x}), split (${this.blackjackDealer.splitHand.x})`);
        }
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
     * Update visual indicator for active hand
     * @param activeHand Which hand is active ('first' or 'second')
     */
    private updateActiveHandIndicator(activeHand: string): void {
        if (!activeHand) {
            console.warn("updateActiveHandIndicator called with null or undefined activeHand");
            return;
        }
        
        console.log(`Setting active split hand: ${activeHand}`);
        
        // Update active hand in game state for reference
        if (activeHand === "first" || activeHand === "second") {
            const oldHand = Globals.activeHand;
            Globals.activeHand = activeHand as 'first' | 'second';
            
            // Only proceed with visual updates if we have both hands
            if (!this.blackjackDealer.splitHand) {
                console.warn("Can't update active split hand visual - split hand doesn't exist");
                return;
            }
            
            // Store current positions before making any changes
            const playerHandX = this.blackjackDealer.playerHand.x;
            const splitHandX = this.blackjackDealer.splitHand.x;
            
            // Apply visual changes to indicate active hand
            this.blackjackDealer.setActiveSplitHand(activeHand as 'first' | 'second');
            
            // Check if the first hand is busted when switching to second hand
            const isFirstHandBusted = activeHand === 'second' && 
                this.blackjackDealer.calculateHandValue(this.blackjackDealer.playerHand) > 21;
            
            // Check if current hand has exactly 21
            const currentHandValue = activeHand === 'first' 
                ? this.blackjackDealer.calculateHandValue(this.blackjackDealer.playerHand)
                : this.blackjackDealer.calculateHandValue(this.blackjackDealer.splitHand);
            
            const hasExactly21 = currentHandValue === 21;
            
            if (isFirstHandBusted) {
                console.log("First hand is busted, switching to second hand with special handling");
            }
            
            if (hasExactly21) {
                console.log(`Current hand (${activeHand}) has exactly 21 - special handling`);
            }
            
            // Restore positions to prevent teleporting - this is important for smooth transitions
            this.blackjackDealer.playerHand.x = playerHandX;
            this.blackjackDealer.splitHand.x = splitHandX;
            
            // Force positions to be maintained
            this.blackjackDealer.positionSplitHands();
            
            // Force a resize to update positions - but don't recalculate positions which would cause teleporting
            this.blackjackDealer.resize();
            
            // Log detailed split hand info for debugging
            this.blackjackDealer.logSplitHandInfo();
            
            // If the active hand changed, we need to update buttons
            if (oldHand !== activeHand) {
                console.log(`Hand switched from ${oldHand} to ${activeHand} - updating buttons`);
                
                // Ensure card dealing flag is cleared to allow buttons
                this.blackjackDealer.isCardDealInProgress = false;
                
                // Clear the processing outcome flag if it's set to ensure we can show buttons
                this._processingOutcome = false;
                
                // If we switched to second hand, ensure appropriate buttons are shown
                if (activeHand === 'second') {
                    // Define the default buttons for second hand
                    const secondHandButtons = [
                        GameButtonType.HIT, 
                        GameButtonType.STAND,
                        GameButtonType.DOUBLE
                    ];
                    
                    // Force a clear of any queued buttons to prevent backend override
                    this.gameButtonsContainer.toShowButtons = [...secondHandButtons];
                    
                    // Different handling based on whether first hand busted
                    if (isFirstHandBusted) {
                        // For busted first hand, use immediate button display
                        console.log("First hand busted - using immediate button display for second hand");
                        
                        // Hide current buttons first
                        this.gameButtonsContainer.hideAllButtons(true, () => {
                            // Show the buttons immediately
                            this.gameButtonsContainer.showSpecificButtons(
                                secondHandButtons,
                                true,   // Show immediately
                                false   // Don't prevent duplicates to ensure they appear
                            );
                        });
                        
                        // Force positions again after UI updates to prevent any drift
                        setTimeout(() => {
                            this.blackjackDealer.positionSplitHands();
                        }, 100);
                    } else {
                        // For normal hand transition, use the standard hide-then-show approach
                        // Hide any current buttons first
                        this.gameButtonsContainer.hideAllButtons(true, () => {
                            // Use a local copy of buttons to show
                            const buttonsToShow = [...this.gameButtonsContainer.toShowButtons];
                            
                            // Clear the queue to prevent showing buttons twice
                            this.gameButtonsContainer.toShowButtons = [];
                            
                            console.log("Showing buttons for second hand:", buttonsToShow);
                            
                            // Show buttons immediately to ensure they appear
                            setTimeout(() => {
                                this.gameButtonsContainer.showSpecificButtons(
                                    buttonsToShow, 
                                    true,   // Show immediately
                                    false   // Don't prevent duplicates to ensure buttons show
                                );
                                
                                // Force positions again after UI updates to prevent any drift
                                this.blackjackDealer.positionSplitHands();
                            }, 100); // Small delay to ensure previous hide operation completes
                        });
                    }
                } else {
                    // For first hand, use standard behavior
                    setTimeout(() => {
                        this.checkPendingOutcome();
                        
                        // Force positions again after UI updates to prevent any drift
                        this.blackjackDealer.positionSplitHands();
                    }, 100);
                }
                
                // Schedule one more position check after all animations to ensure stability
                setTimeout(() => {
                    this.blackjackDealer.positionSplitHands();
                }, 500);
            }
        } else {
            console.warn(`Invalid active hand value: ${activeHand}`);
        }
    }

    // Flag to track if we're processing a split result to prevent duplicates
    private _processingSplitResult: boolean = false;

    /* Add a method to decline insurance */
    handleInsuranceDeclined() {
        console.log("Declining insurance");
        
        // Hide all buttons during processing
        this.gameButtonsContainer.hideAllButtons(true);
        
        // Set card dealing flag to prevent premature button display
        this.blackjackDealer.isCardDealInProgress = true;
        
        // Send insurance decline request to backend
        Globals.backendService?.insurance(false);
        
        // Backend will check if dealer has blackjack:
        // If yes: Dealer wins immediately (player loses bet)
        // If no: Game continues with normal gameplay
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
     * Central handler for all backend messages
     * Call this from app.ts to handle all messages from backend in one place
     */
    handleBackendMessage(messageType: string, data: any): void {
        console.log(`GameManager received message: ${messageType}`, data);
        
        // Track the previous game phase before processing this message
        const previousPhase = Globals.gameState;
        
        // --- PRIORITY HANDLERS: These messages take precedence over normal flow ---
        
        // Handle game_end message with highest priority - this always contains the final outcome
        if (messageType === 'game_end') {
            console.log("Received game_end message with priority handling", data);
            
            // Reset processing flags to ensure clean state
            this._processingOutcome = true; // Mark as processing to prevent duplicate handling
            this._processingSplitResult = false;
            this.blackjackDealer.isCardDealInProgress = false;
            
            // Create a stable unique ID to track this outcome
            const outcomeId = Date.now();
            this._currentOutcomeId = outcomeId;
            
            // Cancel any pending button updates to prevent flashing
            if (this._currentOperationVersion) {
                this._currentOperationVersion = Date.now() + 10000; // Force any in-progress operations to abort
            }
            
            // Hide all gameplay buttons immediately for clean UI
            this.gameButtonsContainer.hideAllButtons(true);
            
            // Update game state to complete
            Globals.gameState = 'complete';
            
            // Directly process the outcome without waiting for other messages
            if (data) {
                // Handle the outcome immediately
                this.handleGameOutcome(data);
            }
            
            // Return early to prevent normal message flow
            return;
        }
        
        // Handle balance updates immediately
        if (messageType === 'balance_update' && data.balance !== undefined) {
            // Update UI balance
            this.uiContainer.updateBalancefromBackend(data.balance);
        }
        
        // Handle insurance action specifically
        if (messageType === 'action_result' && data?.action === 'insurance') {
            console.log("Received insurance action result:", data);
            // Reset insurance flags
            this.blackjackDealer.isInsuranceAvailable = false;
        }
        
        // --- GAME STATE HANDLERS: Update the core game state ---
        
        // Handle game state and update messages
        if (messageType === 'game_state' || messageType === 'hand_updated') {
            // Update game phase if provided
            if (data.gamePhase && data.gamePhase !== previousPhase) {
                Globals.gameState = data.gamePhase;
                console.log(`Game phase changed from ${previousPhase} to ${data.gamePhase}`);
                
                // Handle specific phase transitions
                // this.handleGamePhaseChange(previousPhase, data.gamePhase, data);
            }
            
            // Process the game state update
            this.HandleGameInProgress(data);
        }
        
        // --- ACTION HANDLERS: Process specific actions ---
        
        switch (messageType) {
            case 'start_game':
                this.HandleStartGame(data);
                break;
            
            case 'card_dealt':
                this.giveCards(data);
                break;
            
            case 'special_case':
                // this.handleSpecialCase(data);
                break;
            
            case 'split_result':
                this.handleSplitResult(data);
                break;
        }
    }

    /**
     * Handle game phase changes
     */
    private handleGamePhaseChange(previousPhase: string, newPhase: string, data: any): void {
        console.log(`Handling phase change: ${previousPhase} -> ${newPhase}`);
        
        // Log for debugging phase transitions
        if (newPhase === 'complete') {
            console.log("Game entered complete phase - preparing for outcome display");
        } else if (newPhase === 'dealer_turn') {
            console.log("Game entered dealer turn phase - hiding buttons");
            this.gameButtonsContainer.hideAllButtons(true);
        } else if (newPhase === 'player_turn' && previousPhase === 'dealing') {
            console.log("Transitioning from dealing to player turn");
            // Ensure buttons are visible for player's turn
            this._processingOutcome = false;
            this.blackjackDealer.isCardDealInProgress = false;
        } else if (newPhase === 'betting') {
            console.log("Entering betting phase");
            // Update allowed actions for betting phase
            if (data.allowedActions && Array.isArray(data.allowedActions)) {
                console.log("Allowed actions from backend:", data.allowedActions);
                this.gameButtonsContainer.toShowButtons = getButtonType(data.allowedActions);
                console.log("Buttons that will be shown:", this.gameButtonsContainer.toShowButtons);
                
                // Show betting buttons
                this.gameButtonsContainer.showSpecificButtons(
                    this.gameButtonsContainer.toShowButtons,
                    true,    // Show immediately
                    false    // Don't prevent duplicates
                );
            }
        }
    }

    /**
     * Handle the game outcome from backend
     */
    private handleGameOutcome(data: any): void {
        console.log("Handling game outcome:", {
            outcome: data.outcome,
            gamePhase: data.gamePhase,
            splitHand: !!data.splitHand,
            playerHandBusted: data.playerHand?.busted,
            splitHandBusted: data.splitHand?.busted,
            allowedActions: data.allowedActions,
            winnings: data.winnings,
            message: data.message
        });

        // Reset processing flags to ensure clean state
        this._processingOutcome = true; // Mark as processing to prevent duplicate handling
        this._processingSplitResult = false;
        this.blackjackDealer.isCardDealInProgress = false;
        this._outcomePopupShown = false; // Reset the popup shown flag

        // Hide all gameplay buttons immediately
        this.gameButtonsContainer.hideAllButtons(true);
        
        // Update game state to complete
        Globals.gameState = data.gamePhase || 'complete';

        // Determine which buttons to show based on allowed actions
        if (data.allowedActions && data.allowedActions.length > 0) {
            this.gameButtonsContainer.toShowButtons = getButtonType(data.allowedActions);
            console.log("End game buttons to show:", this.gameButtonsContainer.toShowButtons);
        } else {
            // Default to showing PLAYON if no specific actions provided
            this.gameButtonsContainer.toShowButtons = [GameButtonType.PLAYON];
            console.log("No specific actions provided, defaulting to PLAYON button");
        }

        // Special handling for split hand outcomes to ensure proper display
        if (data.splitHand) {
            this.handleSplitHandGameOutcome(data);
        }

        // Show outcome popup immediately to ensure it's visible
        if (data.outcome) {
            console.log("Showing outcome popup for:", data.outcome, "with winnings:", data.winnings);
            
            // Mark that we're showing a popup
            this._outcomePopupShown = true;
            
            // Force hide any existing popup first to prevent flashing
            this.popupManager.hidePopup(() => {
                // Show the outcome popup
                setTimeout(() => {
                    this.popupManager.showOutcomePopup(data.outcome, data.winnings);
                    
                    // Show end game buttons after a short delay
                    setTimeout(() => {
                        // Reset processing flag to allow button display
                        this._processingOutcome = false;
                        
                        // Show end game buttons
                        if (this.gameButtonsContainer.toShowButtons?.length > 0) {
                            this.gameButtonsContainer.showSpecificButtons(
                                this.gameButtonsContainer.toShowButtons,
                                true,    // Show immediately
                                false    // Don't prevent duplicates
                            );
                        }
                    }, 500);
                }, 50);
            });
        } else {
            // If no outcome, just show buttons
            this._processingOutcome = false;
            
            // Show end game buttons immediately
            if (this.gameButtonsContainer.toShowButtons?.length > 0) {
                this.gameButtonsContainer.showSpecificButtons(
                    this.gameButtonsContainer.toShowButtons,
                    true,    // Show immediately
                    false    // Don't prevent duplicates
                );
            }
        }

        // Set a failsafe timeout to ensure outcome is shown
        this.scheduleFailsafeOutcomeCheck(data);
    }

    /**
     * Handle special case for split hand game outcomes
     */
    private handleSplitHandGameOutcome(data: any): void {
        console.log("Processing split hand outcome");
        
        // Ensure both hands' points are visible
        if (this.blackjackDealer.playerHand?.pointsDisplay) {
            this.blackjackDealer.playerHand.pointsDisplay.visible = true;
        }
        if (this.blackjackDealer.splitHand?.pointsDisplay) {
            this.blackjackDealer.splitHand.pointsDisplay.visible = true;
        }
        
        // Update bust status
        if (this.blackjackDealer.updateBustStatus) {
            this.blackjackDealer.updateBustStatus();
        }
        
        // Lock positions of split hands to prevent movement
        this.blackjackDealer.positionSplitHands();
        
        // Log for debugging
        this.blackjackDealer.logSplitHandInfo();
    }

    /**
     * Schedule a failsafe check to ensure outcome is shown
     */
    private scheduleFailsafeOutcomeCheck(data: any): void {
        // Store the current outcome ID for this check
        const outcomeId = this._currentOutcomeId;
        
        setTimeout(() => {
            // Only proceed if this is still the current outcome
            if (outcomeId !== this._currentOutcomeId) {
                console.log(`Failsafe for outcome ${outcomeId} was superseded, not showing popup`);
                return;
            }
            
            // Check if popup wasn't shown
            if (!this._outcomePopupShown && data.outcome) {
                console.log("Failsafe: Showing pending outcome:", data.outcome);
                this._outcomePopupShown = true;
                this.popupManager.showOutcomePopup(data.outcome, data.winnings);
            }
            
            // Check if popup is showing but buttons are missing
            if (!this.gameButtonsContainer.areAnyButtonsVisible() && 
                this.gameButtonsContainer.toShowButtons?.length > 0) {
                
                console.log("Failsafe: Forcing button display");
                this._processingOutcome = false;
                
                this.gameButtonsContainer.showSpecificButtons(
                    this.gameButtonsContainer.toShowButtons,
                    true,    // Show immediately
                    false    // Don't prevent duplicates
                );
            }
            
            // Final safety check for specific outcomes that might not show correctly
            if ((data.outcome === 'dealer_win' || data.outcome === 'dealer_bust' || 
                 data.outcome === 'surrender') && !this.popupManager.isPopupShowing()) {
                
                console.log(`Failsafe: Forcing ${data.outcome} popup display`);
                this.popupManager.showOutcomePopup(data.outcome, data.winnings);
            }
        }, 1000);
    }

}

