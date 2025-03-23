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


    unlockShopCallback: () => void = () => { };
    cancelShopCallBack: () => void = () => { };
    shopPopup: ShopPopup = new ShopPopup(this.unlockShopCallback, this.cancelShopCallBack);


    constructor() {
        super();
        Globals.Manager = this;
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

        this.tableText.zIndex = Z_INDEX.TABLE;
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
        this.tableText.position.set(window.innerWidth / 2, this.tableText.height * 1.5);
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
        Globals.gameState = data.gamePhase;

        this.table.animateChipsDown();
        this.gameButtonsContainer.hideAllButtons();
        this.chipsZone.betHolder.isVisible(true);
        this.chipsZone.betHolder.middleChipsCountTxt.updateLabelText(`${formatBetAmount(Globals.currentBet)} Chips`);
        this.blackjackDealer.dealCards(data.playerHand, data.dealerHand).then(() => {
            console.log("Buttons to Show", data.allowedActions);
            
            console.log('Game State', Globals.gameState);
            
            if(data.allowedActions) 
            this.gameButtonsContainer.showSpecificButtons(getButtonType(data.allowedActions));
            
        });
    }
    resetGame() {
        this.blackjackDealer.resetHands();
        Globals.gameState = 'betting';
        this.gameButtonsContainer.hideAllButtons();
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
        console.log("Recieved message", msgType, data);
        switch (msgType) {
            case MessageType.CARD_DEALT:
                this.giveCards(data);
                break;
            case MessageType.HAND_UPDATED:
                if(data.action === "double_down") {
                    this.chipsZone.investedChips.forEach(element => {
                        this.addChip(element, true);
                    });
                }else
                this.gameButtonsContainer.toShowButtons = getButtonType(data.allowedActions);
                
                if(data.action === "stand") {
                    console.log("Stand action detected, revealing dealer cards:", data);
                    this.blackjackDealer.isCardDealInProgress = true;
                    
                    // First reveal the hidden dealer card
                    if(this.blackjackDealer.dealerHand.cards[1] && this.blackjackDealer.dealerHand.cards[1].sprite) {
                        this.blackjackDealer.dealerHand.revealDealerCard(data.dealerHand.cards[1]).then(() => {
                            // Create a promise chain to deal additional dealer cards one by one
                            let dealPromise = Promise.resolve();
                            
                            // Start from the 3rd card (index 2) since first two cards are already dealt
                            for(let i = 2; i < data.dealerHand.cards.length; i++) {
                                dealPromise = dealPromise.then(() => {
                                    return this.blackjackDealer.dealerHand.dealCards(data.dealerHand.cards[i]).then(() => {
                                        // Return void to maintain Promise<void> chain
                                        return;
                                    });
                                });
                            }
                            
                            // After all cards are dealt, mark dealing as complete
                            dealPromise.then(() => {
                                console.log("All dealer cards revealed after stand action");
                                this.blackjackDealer.isCardDealInProgress = false;
                                this.gameButtonsContainer.showSpecificButtons(this.gameButtonsContainer.toShowButtons);
                                this.checkPendingOutcome();
                            });
                        });
                    } else {
                        console.log("No dealer card to reveal, proceeding");
                        this.blackjackDealer.isCardDealInProgress = false;
                        this.checkPendingOutcome();
                    }
                } else if(data.action === "blackjack") {
                    console.log("Blackjack detected! Revealing dealer's hidden card");
                    this.blackjackDealer.isCardDealInProgress = true;
                    
                    // Reveal the dealer's hidden card
                    if(this.blackjackDealer.dealerHand.cards[1] && this.blackjackDealer.dealerHand.cards[1].sprite) {
                        this.blackjackDealer.dealerHand.revealDealerCard(data.dealerHand.cards[1]).then(() => {
                            console.log("Dealer card revealed after blackjack");
                            this.blackjackDealer.isCardDealInProgress = false;
                            // Show the outcome popup after dealer card is revealed
                            this.checkPendingOutcome();
                        });
                    } else {
                        console.log("No dealer card to reveal for blackjack");
                        this.blackjackDealer.isCardDealInProgress = false;
                        this.checkPendingOutcome();
                    }
                } else {
                    // For other actions, use the existing card dealing logic
                    this.blackjackDealer.isCardDealInProgress = true;
                    this.giveCards(data);
                }
                break;
                
            case MessageType.GAME_OUTCOME:
                this.gameButtonsContainer.toShowButtons = getButtonType(data.allowedActions);
                this.uiContainer.updateBalancefromBackend(data.newBalance);
                if(!this.blackjackDealer.isCardDealInProgress) {
                    // Show outcome immediately if no cards are being dealt
                    this.gameButtonsContainer.showButtonGroup('gameEnd', false);
                    this.blackjackDealer.payout = data.payout;
                    this.popupManager.showOutcomePopup(data.outcome,this.blackjackDealer.payout);
                } else {
                    // Store the outcome to show after card dealing is complete
                    console.log("Card dealing in progress, storing outcome to show later");
                    this.pendingOutcome = data.outcome;
                }
                break;
        }
    }


    giveCards(cardData: any) {
        console.log("GIVE CARDS", cardData);
        if(cardData.target === 'player') {
            this.blackjackDealer.playerHand.dealCards(cardData.card).then(() => {
                this.gameButtonsContainer.showSpecificButtons(this.gameButtonsContainer.toShowButtons);
                this.blackjackDealer.isCardDealInProgress = false;
                this.checkPendingOutcome();
            });
        }
        else if(cardData.target === 'dealer') {
            this.blackjackDealer.dealerHand.dealCards(cardData.card).then(() => {
                this.gameButtonsContainer.showSpecificButtons(this.gameButtonsContainer.toShowButtons);
                this.blackjackDealer.isCardDealInProgress = false;
                this.checkPendingOutcome();
            });
        }
        else if(cardData.target === 'split' && this.blackjackDealer.splitHand) {
            this.blackjackDealer.splitHand.dealCards(cardData.card).then(() => {
                this.gameButtonsContainer.showSpecificButtons(this.gameButtonsContainer.toShowButtons);
                this.blackjackDealer.isCardDealInProgress = false;
                this.checkPendingOutcome();
            });
        }
        else if (cardData.dealerHand && !cardData.target) {
            // Handle full hand state updates 
            // This happens when receiving a complete HAND_UPDATED message with full dealer hand
            this.blackjackDealer.isCardDealInProgress = false;
            this.gameButtonsContainer.showSpecificButtons(this.gameButtonsContainer.toShowButtons);
            this.checkPendingOutcome();
        }
    }
    
    /**
     * Check if there's a pending outcome to show after card dealing is complete
     */
    private checkPendingOutcome(): void {
        if (this.pendingOutcome && !this.blackjackDealer.isCardDealInProgress) {
            console.log("Card dealing complete, showing pending outcome:", this.pendingOutcome);
            this.gameButtonsContainer.showButtonGroup('gameEnd', false);
            this.popupManager.showOutcomePopup(this.pendingOutcome,this.blackjackDealer.payout);
            this.pendingOutcome = null;
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
            Globals.backendService?.hit();
            this.gameButtonsContainer.hideAllButtons();
        }
    }
    onStandClicked() {
        if(Globals.gameState === 'player_turn' ) {
            Globals.backendService?.stand();
            this.gameButtonsContainer.hideAllButtons();
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
        if(Globals.gameState === 'complete' ) {
            this.resetGame();
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
        if(Globals.gameState === 'player_turn' ) {
            Globals.backendService?.surrender();
            this.gameButtonsContainer.hideAllButtons();
        }
    }
    onDoubleClicked() {
        if(Globals.gameState === 'player_turn' ) {
            Globals.backendService?.doubleDown();
            this.gameButtonsContainer.hideAllButtons();
        }
    }
    onSplitClicked() {
        if(Globals.gameState === 'player_turn' ) {
            Globals.backendService?.split();
            this.gameButtonsContainer.hideAllButtons();
        }
    }
    onInsuranceClicked() {
        if(Globals.gameState === 'player_turn' && this.blackjackDealer.isInsuranceAvailable ) {
            Globals.backendService?.insurance(true);
            this.gameButtonsContainer.hideAllButtons();
        }
    }
    onRebetClicked() {
        if(Globals.gameState === 'complete' || Globals.gameState === 'betting' ) {
            
                if(Globals.currentBet > 0) {
                console.log("------REBETING------",Globals.currentBet);
                    
                Globals.backendService?.startGame(Globals.currentBet);
            }
        }
    }

    addChip(chipData: Chips, addDouble: boolean = false, forRebet: boolean = false) {

        this.uiContainer.updateBalance(-chipData.value);
        Globals.currentBet += chipData.value;
        if (addDouble) {
            this.chipsZone.investedChips.forEach(Element => {
                const chip = new Chips(Element.texture, Element.value);
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
        const chip = new Chips(chipData.texture, chipData.value);
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

}

