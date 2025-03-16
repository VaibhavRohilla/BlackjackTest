import { Container, GlobalUniformSystem, Sprite, Texture } from "pixi.js";
import { Scene } from "./Scene";
import { formatNumber, Globals } from "./Globals";
import { log } from "node:console";
import { config } from "./appConfig";
import { Chips, Table } from "./Table";
import { copyFile } from "node:fs";
import { Button } from "./Button";
import { TextLabel } from "./TextLabel";
import { Easing, Tween } from "@tweenjs/tween.js";
import { CenterChip } from "./CenterChip";
import { UiContainer } from "./UiContainer";
import { GameButtonContainer, GameButtonType } from "./GameButtons";
import { BlackjackDealer, Card, GameOutcome } from "./BlackjackDealer";
import { PopupManager, Z_INDEX } from "./PopupManager";
import { ShopPopup } from "./ShopPopup";

/**
 * Main game scene that manages the blackjack table and game logic
 */
export class MainScene extends Scene 
{
  /** The game table */
  table!: Table;
  
  /** Center area where chips are placed */
  chips_zone!: CenterChip;
  
  /** Table text/logo */
  TableText!: Sprite;
  
  /** UI container for balance and menu */
  uiContainer!: UiContainer;
  
  /** Container for game control buttons */
  gameButtonsContainer!: GameButtonContainer;

  /** Dealer instance */
  dealer!: BlackjackDealer;

  /** Container for cards */
  cardContainer!: Container;
  
  /** Popup manager for game messages */
  popupManager!: PopupManager;
  
  /** Shop popup for unlocking premium chips */
  shopPopup!: ShopPopup;

  constructor() {
    super(false);
    
    this.initializeComponents();
    this.addToScene();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Set up keyboard test shortcuts
    this.setupTestShortcuts();
  }

  /**
   * Validate that required resources are loaded
   */
  private validateResources(): void {
    const requiredResources = ['table', 'chips_zone', 'table_text'];
    for (const resource of requiredResources) {
      if (!Globals.resources[resource]) {
        console.error(`Missing required resource: ${resource}`);
      }
      }
    }
    
  /**
   * Initialize all scene components
   */
  private initializeComponents(): void {
    this.table = new Table(Globals.resources.table);
    this.chips_zone = new CenterChip();
    this.TableText = new Sprite(Globals.resources.table_text);
    this.TableText.anchor.set(0.5);
    this.uiContainer = new UiContainer();
    this.gameButtonsContainer = new GameButtonContainer();
    this.cardContainer = new Container();
    this.popupManager = new PopupManager();
    
    // Initialize the shop popup with callbacks
    this.shopPopup = new ShopPopup(
      // Unlock callback - called when player clicks "Unlock" in the shop
      () => {
        this.table.unlockPremiumChips();
      },
      // Cancel callback - called when player clicks "Cancel" in the shop
      () => {
        console.log("Shop popup cancelled");
      }
    );
    
    // Set the shop button callback on the table
    this.table.setShopButtonCallback(() => {
      this.shopPopup.open();
    });
    
    // Initialize the dealer with callbacks for card dealing and game end
    this.dealer = new BlackjackDealer(
      this.cardContainer, 
      (hand: 'player' | 'dealer', card: Card) => {
        // Card dealt callback
        if (hand === 'player') {
          console.log("Player card dealt:", card);
        } else if (hand === 'dealer') {
          console.log("Dealer card dealt:", card);
        }
      },
      (outcome: GameOutcome, playerValue: number, dealerValue: number) => {
        // Game end callback
        console.log(`Game ended with outcome: ${outcome}`);
        console.log(`Player value: ${playerValue}, Dealer value: ${dealerValue}`);
        
        // Show appropriate buttons based on game outcome
        this.handleGameEnd(outcome, playerValue, dealerValue);
      },
      (eventType: string, data?: any) => {
        // Game event callback
        console.log(`Game event: ${eventType}`, data);
        
        // First, hide any existing buttons to prevent conflicts
        this.gameButtonsContainer.hideAllButtons();
        
        // For special events like split and insurance, explicitly reset game ending state
        if (eventType === 'splitAvailable' || eventType === 'insuranceAvailable' || eventType === 'showGameplayButtons') {
          console.log(`Resetting game ending state for ${eventType}`);
          this.gameButtonsContainer.setGameEnding(false);
        }
        
        // Handle balance change events
        if (eventType === 'balanceChanged') {
          console.log("Balance changed event received:", data);
          this.uiContainer.updateBalance();
        }
        
        // Handle special game events after a short delay to ensure buttons are hidden
        setTimeout(() => {
          switch (eventType) {
            case 'splitAvailable':
              // Show split button only if player has enough balance to split
              if (Globals.Balance >= Globals.currentBet) {
                console.log("Split is available and player has enough balance");
                console.log("Current balance:", Globals.Balance, "Current bet:", Globals.currentBet);
                console.log("Showing split buttons...");
                
                // Force a small delay to ensure previous buttons are fully hidden
                setTimeout(() => {
                  // Explicitly reset game ending state again right before showing buttons
                  this.gameButtonsContainer.setGameEnding(false);
                  
                  // Use direct button group access to avoid race conditions
                  const canDoubleDown = Globals.Balance >= Globals.currentBet;
                  const groupName = canDoubleDown ? 'splitEligible' : 'splitEligibleNoDouble';
                  console.log(`Directly showing ${groupName} button group`);
                  this.gameButtonsContainer.showButtonGroup(groupName);
                  
                  // Verify buttons were shown
                  setTimeout(() => {
                    console.log("Active buttons after showing split:", 
                      this.gameButtonsContainer['currentActiveButtons'].length);
                    console.log("Split button visible:", 
                      this.gameButtonsContainer['buttons'].get(GameButtonType.SPLIT)?.visible);
                  }, 500);
                }, 200);
              } else {
                console.log("Split is available but player doesn't have enough balance");
                // Just show regular gameplay buttons without split option
                this.gameButtonsContainer.showGameplayButtons();
              }
              break;
            case 'insuranceAvailable':
              // Show insurance button only if player has enough balance for insurance
              if (Globals.Balance >= Globals.currentBet / 2) {
                console.log("Insurance is available and player has enough balance");
                console.log("Current balance:", Globals.Balance, "Current bet:", Globals.currentBet);
                console.log("Showing insurance buttons...");
                
                // Force a small delay to ensure previous buttons are fully hidden
                setTimeout(() => {
                  // Explicitly reset game ending state again right before showing buttons
                  this.gameButtonsContainer.setGameEnding(false);
                  
                  // Use direct button group access to avoid race conditions
                  const canDoubleDown = Globals.Balance >= Globals.currentBet;
                  const groupName = canDoubleDown ? 'insuranceEligible' : 'insuranceEligibleNoDouble';
                  console.log(`Directly showing ${groupName} button group`);
                  this.gameButtonsContainer.showButtonGroup(groupName);
                  
                  // Verify buttons were shown
                  setTimeout(() => {
                    console.log("Active buttons after showing insurance:", 
                      this.gameButtonsContainer['currentActiveButtons'].length);
                    console.log("Insurance button visible:", 
                      this.gameButtonsContainer['buttons'].get(GameButtonType.INSURANCE)?.visible);
                  }, 500);
                }, 200);
              } else {
                console.log("Insurance is available but player doesn't have enough balance");
                // Just show regular gameplay buttons without insurance option
                this.gameButtonsContainer.showGameplayButtons();
              }
              break;
            case 'showGameplayButtons':
              // Show regular gameplay buttons after insurance decision
              console.log("Showing regular gameplay buttons after insurance decision");
              
              // Force a small delay to ensure previous buttons are fully hidden
              setTimeout(() => {
                // Explicitly reset game ending state again right before showing buttons
                this.gameButtonsContainer.setGameEnding(false);
                
                // Show gameplay buttons
                this.gameButtonsContainer.showGameplayButtons();
                
                // Verify buttons were shown
                setTimeout(() => {
                  console.log("Active buttons after showing gameplay buttons:", 
                    this.gameButtonsContainer['currentActiveButtons'].length);
                }, 500);
              }, 200);
              break;
            default:
              // For any other events, show regular gameplay buttons
              console.log("Unknown game event, showing regular gameplay buttons");
              this.gameButtonsContainer.showGameplayButtons();
          }
        }, 300); // Increased delay to ensure buttons are properly hidden first
      }
    );
    
    // Store the dealer reference in Globals for access from other components
    Globals.dealer = this.dealer;
  }
  
  /**
   * Set up event listeners for game events
   */
  private setupEventListeners(): void {
    if (Globals.emitter) {
      console.log("Event listeners set up");
    }
  }

  /**
   * Handle chip click events from the table
   */
  private onChipClicked(chipData: any): void {
    // Check if we can place a bet
    if (Globals.gameStarted) {
      console.log("Game already in progress, can't place bet");
      return;
    }
    
    // Check if player has enough balance
    if (Globals.Balance < chipData.value) {
      console.log("Not enough balance to place this bet");
      return;
    }
    
    // Deduct chip value from balance
    Globals.Balance -= chipData.value;
    
    // Add to current bet (don't update Globals.currentBet directly here)
    // Let the addChip method handle this to avoid double counting
    
    // Add the chip to the betting area
    this.addChip(chipData);
  }

  recievedMessage(msgType: string, msgParams: any): void {
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
    }
  }

  addToScene(): void {
    // Add components with proper z-index
    this.table.zIndex = Z_INDEX.TABLE;
    this.addChildToFullScene(this.table);
    
    this.chips_zone.zIndex = Z_INDEX.CHIPS;
    this.addChildToFullScene(this.chips_zone);
    
    this.TableText.zIndex = Z_INDEX.TABLE;
    this.addChildToFullScene(this.TableText);
    
    this.uiContainer.zIndex = Z_INDEX.BUTTONS +5;
    this.addChildToFullScene(this.uiContainer);
    
    this.cardContainer.zIndex = Z_INDEX.CARDS;
    this.addChildToFullScene(this.cardContainer);
    
    this.table.chipsContainer.zIndex = Z_INDEX.CHIPS+1;
    this.addChildToFullScene(this.table.chipsContainer);
    
    // Add popup manager with its predefined z-index
    this.addChildToFullScene(this.popupManager);
    
    // Add shop popup with its predefined z-index
    this.addChildToFullScene(this.shopPopup);
    
    // Add game buttons last with highest z-index
    this.gameButtonsContainer.zIndex = Z_INDEX.BUTTONS;
    this.addChildToFullScene(this.gameButtonsContainer);
    
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
    this.cardContainer.sortableChildren = true;
    this.table.sortableChildren = true;
    this.gameButtonsContainer.sortableChildren = true;
  }

  update(dt: number): void {
    // Update game logic if needed
  }

  resize(): void {
    super.resize();

    this.table.resize();
    this.TableText.scale.set(1*config.scaleFactor);
    this.TableText.position.set(window.innerWidth/2, this.TableText.height*1.5);
    this.chips_zone.resize();
    this.gameButtonsContainer.resize();
    this.uiContainer.resize(this.table);
    
    // Center the card container on the screen
    this.cardContainer.position.set(window.innerWidth/2, window.innerHeight/2);
    
    // Call dealer resize after positioning the card container
    this.dealer.resize();
    
    // Resize popup manager
    this.popupManager.resize();
    
    // Resize shop popup
    this.shopPopup.resize();
  }

  // Button click handlers
  private onHitClicked(): void {
    if (!this.dealer.gameInProgress) {
        console.log("Game not in progress, Hit button should only be used during gameplay");
        return;
    }
    
    console.log("Hit clicked - calling dealer.playerHit()");
    console.log("Before hit - playerHasHit flag:", this.dealer.playerHit());
    
    // Player hits for another card
    // Note: If player busts, the dealer will call endGame which will
    // trigger handleGameEnd and set the game ending state
    this.dealer.playerHit();
    
    console.log("After hit - playerHasHit flag:", this.dealer.playerHit());
    
    // Force update of gameplay buttons to reflect the new state
    // Only if the game is still in progress (player didn't bust)
    if (this.dealer.gameInProgress) {
      setTimeout(() => {
        console.log("Updating gameplay buttons after hit");
        this.gameButtonsContainer.showGameplayButtons();
      }, 500);
    }
  }
  
  /**
   * Handle stand button click
   */
  private onStandClicked(): void {
    if (!this.dealer.gameInProgress) {
        return;
    }
    
    console.log("Stand clicked");
    
    // Close any active popups (including insurance popup) before proceeding
    this.popupManager.hidePopup();
    
    // Set game ending state to prevent button conflicts
    this.gameButtonsContainer.setGameEnding(true);
    
    // Hide all buttons
    this.gameButtonsContainer.hideAllButtons();
    
    // Player stands
    this.dealer.playerStand();
  }
  
  private onClearClicked(): void {
    console.log("Clear action");
    
    // If game is in progress, can't clear
    if (Globals.gameStarted) {
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
    if (this.chips_zone.investedChips.length === 0 || currentBetAmount <= 0) {
      // Update the bet display
      this.chips_zone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");
      this.chips_zone.betHolder.isVisible(false);
      return;
    }
    
    // Store chips to be removed
    this.chips_zone.removeChips = [...this.chips_zone.investedChips];
    this.chips_zone.investedChips = [];
    
    // Animate chips flying out of the canvas
    this.chips_zone.tweenChipsOut(() => {
      // Update balance after animation completes
      Globals.Balance += currentBetAmount;
      this.uiContainer.updateBalance();
      this.table.makeButtonsActive(true);
      
      // Update the bet display
      this.chips_zone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");
      this.chips_zone.betHolder.isVisible(false);
    });
  }
  
  private onPlayOnClicked(): void {
    console.log("Play On action");
    
    // Prevent multiple rapid clicks
    if ((this as any)._processingPlayOn) {
      console.log("Already processing Play On action, ignoring duplicate click");
      return;
    }
    
    // Set flag to prevent multiple calls
    (this as any)._processingPlayOn = true;
    
    // Reset game ending state since we're starting a new round
    this.gameButtonsContainer.setGameEnding(false);
    
    // Hide any active popups
    this.popupManager.hidePopup();
    
    // Hide all buttons to prevent UI conflicts
    this.gameButtonsContainer.hideAllButtons();
    
    // Reset the game for a new round
    this.resetGame();
    
    // Show betting buttons after a short delay to ensure animations complete
    setTimeout(() => {
      // Don't automatically show betting buttons - they should only appear when a bet is placed
      // Instead, just enable chip selection
      
      // Animate chips back up to their original position
      this.table.animateChipsUp();
      
      // Enable chip selection
      this.table.makeButtonsActive(true);
      
      console.log("Ready for next round");
      
      // Clear the processing flag after a delay to prevent rapid clicks
      setTimeout(() => {
        (this as any)._processingPlayOn = false;
      }, 500);
    }, 500);
  }
  
  /**
   * Handle Surrender button click
   */
  private onSurrenderClicked(): void {
    console.log("Surrender action");
    
    if (Globals.gameStarted && this.dealer.gameInProgress) {
      // Close any active popups (including insurance popup) before proceeding
      this.popupManager.hidePopup();
      
      // Set game ending state to prevent button conflicts
      this.gameButtonsContainer.setGameEnding(true);
      
      // Hide all buttons
      this.gameButtonsContainer.hideAllButtons();
      
      // Surrender (give up half the bet)
      this.dealer.playerSurrender();
      
      // Note: We don't call resetGame() here anymore
      // The dealer.playerSurrender() will call endGame with SURRENDER outcome
      // which will trigger handleGameEnd and show the proper popup
      // This matches the flow of other game end scenarios
    }
  }
  
  private onDoubleClicked(): void {
    if (!this.dealer.gameInProgress) {
        return;
    }
    
    console.log("Double Down clicked");
    
    // Check if player has enough balance to double down
    if (Globals.Balance < Globals.currentBet) {
      console.log("Not enough balance to double down");
      return;
    }
    
    // Close any active popups (including insurance popup) before proceeding
    this.popupManager.hidePopup();
    
    // Set game ending state to prevent button conflicts
    this.gameButtonsContainer.setGameEnding(true);
    
    // Hide all buttons
    this.gameButtonsContainer.hideAllButtons();
    
    // Double down (double bet, take one card, then stand)
    this.dealer.playerDoubleDown();
  }
  
  /**
   * Handle Split button click
   */
  private onSplitClicked(): void {
    console.log("Split action");
    
    if (Globals.gameStarted && this.dealer.gameInProgress) {
      console.log("Executing split with current bet:", Globals.currentBet);
      console.log("Current balance before split:", Globals.Balance);
      
      // Close any active popups (including insurance popup) before proceeding
      this.popupManager.hidePopup();
      
      // Split the hand if eligible
      this.dealer.playerSplit();
      
      // After split, show regular gameplay buttons
      setTimeout(() => {
        console.log("Split completed, showing regular gameplay buttons");
        this.gameButtonsContainer.showGameplayButtons();
      }, 500);
    } else {
      console.log("Cannot split - game not in progress");
    }
  }
  
  /**
   * Handle Insurance button click
   */
  private onInsuranceClicked(): void {
    console.log("Insurance action");
    
    if (Globals.gameStarted && this.dealer.gameInProgress) {
      console.log("Taking insurance with current bet:", Globals.currentBet);
      console.log("Current balance before insurance:", Globals.Balance);
      
      // Hide all buttons while insurance is being processed
      this.gameButtonsContainer.hideAllButtons();
      
      // Take insurance if dealer's up card is an Ace
      this.dealer.playerInsurance();
      
      // Update the UI balance display immediately after taking insurance
      this.uiContainer.updateBalance();
      console.log("Balance updated after insurance deduction:", Globals.Balance);
      
      // Note: The dealer will handle showing the appropriate buttons after insurance is processed
    } else {
      console.log("Cannot take insurance - game not in progress");
    }
  }
  
  /**
   * Handle game end based on outcome
   */
  private handleGameEnd(outcome: GameOutcome, playerValue: number, dealerValue: number): void {
    console.log(`Game ended: ${outcome}`);
    
    // Set game ending state to prevent button conflicts
    this.gameButtonsContainer.setGameEnding(true);
    
    // Special outcomes that don't end the game
    if (outcome === GameOutcome.INSURANCE_AVAILABLE || outcome === GameOutcome.SPLIT_AVAILABLE) {
      // These are handled by the game event callback
      // Reset game ending state since game is not actually ending
      this.gameButtonsContainer.setGameEnding(false);
      return;
    }
    
    // Handle insurance outcomes separately
    if (outcome === GameOutcome.INSURANCE_WON || outcome === GameOutcome.INSURANCE_LOST) {
      console.log(`Insurance ${outcome === GameOutcome.INSURANCE_WON ? 'won' : 'lost'}`);
      
      // Show insurance popup
      this.popupManager.showInsurancePopup(outcome === GameOutcome.INSURANCE_WON);
      
      if (outcome === GameOutcome.INSURANCE_WON) {
        // If insurance is won, end the game there
        console.log("Insurance won, ending the game without proceeding further");
        
        // Update game state
        Globals.gameStarted = false;
        
        // Update UI
        this.uiContainer.updateBalance();
        
        // Show game end buttons after a delay
        setTimeout(() => {
          // Make sure any previous buttons are hidden
          this.gameButtonsContainer.hideAllButtons();
          
          // Show game end buttons
          this.gameButtonsContainer.showGameEndButtons();
        }, 2000); // 2 second delay to show the insurance popup
      } else {
        // If insurance is lost, show popup briefly then continue with gameplay
        console.log("Insurance lost, continuing with gameplay after brief popup");
        
        // Reset game ending state to allow gameplay to continue
        this.gameButtonsContainer.setGameEnding(false);
        
        // Show popup for 1000ms then hide it and show gameplay buttons
        setTimeout(() => {
          // Hide the popup
          this.popupManager.hidePopup(() => {
            // Show gameplay buttons after popup is hidden
            console.log("Showing gameplay buttons after insurance lost popup");
            this.gameButtonsContainer.showGameplayButtons();
          });
        }, 1000); // 1000ms (1 second) delay as requested
      }
      
      return;
    }
    
    // Show appropriate message based on outcome
    let message = "";
    
    switch (outcome) {
      case GameOutcome.PLAYER_BLACKJACK:
        message = "Blackjack! You win!";
        break;
      case GameOutcome.PLAYER_WIN:
        message = "You win!";
        break;
      case GameOutcome.DEALER_WIN:
        message = "Dealer wins.";
        break;
      case GameOutcome.PUSH:
        message = "Push (tie).";
        break;
      case GameOutcome.PLAYER_BUST:
        message = "Bust! You lose.";
        break;
      case GameOutcome.DEALER_BUST:
        message = "Dealer busts! You win!";
        break;
      case GameOutcome.SURRENDER:
        message = "You surrendered.";
        break;
    }
    
    console.log(message);
    
    // Update game state
    Globals.gameStarted = false;
    
    // Update UI
    this.uiContainer.updateBalance();
    
    // Show popup with outcome
    this.popupManager.showOutcomePopup(outcome);
    
    // Show game end buttons (Play On, Surrender) after a delay
    setTimeout(() => {
      // Make sure any previous buttons are hidden
      this.gameButtonsContainer.hideAllButtons();
      
      // Add a slight delay to show the outcome before showing buttons
      setTimeout(() => {
        console.log("Showing game end buttons");
        
        // Use the showGameEndButtons method which sets the game ending state
        this.gameButtonsContainer.showGameEndButtons();
      }, 500);
    }, 100); // Increased delay to allow popup to be seen
  }

  /**
   * Reset the game for a new round
   */
  private resetGame(): void {
    console.log("Resetting game");
    
    // Reset game ending state since we're starting a new round
    this.gameButtonsContainer.setGameEnding(false);
    
    // Hide any active popups
    this.popupManager.hidePopup();
    
    // Reset the dealer
    this.dealer.resetGame();
    
    // Reset game state
    Globals.gameStarted = false;
    
    // Store current bet before resetting
    const currentBet = Globals.currentBet;
    Globals.currentBet = 0;
    
    // Hide all buttons to prevent UI conflicts
    this.gameButtonsContainer.hideAllButtons();
    
    // Clear chips from betting area if there are any
    if (this.chips_zone.investedChips.length > 0) {
      // Store chips to be removed
      this.chips_zone.removeChips = [...this.chips_zone.investedChips];
      this.chips_zone.investedChips = [];
      
      // Animate chips flying out
      this.chips_zone.tweenChipsOut(() => {
        // No need to update balance since winnings were already added in endGame
        console.log("Chips cleared");
      });
    } else {
      // Just clear any remaining chips
      this.chips_zone.clearChips();
    }
    
    // Update UI
    this.uiContainer.updateBalance();
    this.chips_zone.betHolder.middleChipsCountTxt.updateLabelText("0 Chips");
    this.chips_zone.betHolder.isVisible(false);
    
    // Animate chips back up to their original position
    this.table.animateChipsUp();
    
    console.log("Game reset complete");
  }

  /**
   * Start a new game
   */
  private startNewGame(): void {
    // Check if there's a bet placed
    if (Globals.currentBet <= 0) {
      console.log("No bet placed, can't start game");
      return;
    }
    
    // Check if a game is already in progress
    if (Globals.gameStarted) {
      console.log("Game already in progress");
      return;
    }
    
    // Reset game ending state since we're starting a new game
    this.gameButtonsContainer.setGameEnding(false);
    
    // Disable chip selection
    this.table.makeButtonsActive(false);
    
    // Animate chips down and out of the way
    this.table.animateChipsDown();
 
    // Hide any existing buttons first to prevent conflicts
    this.gameButtonsContainer.hideAllButtons();
    
    // Flag to track if special conditions were detected
    let specialConditionsDetected = false;
    
    // Store the original game event callback
    const originalGameEventCallback = this.dealer.getGameEventCallback();
    
    // Create a new callback that wraps the original one
    const newGameEventCallback = (eventType: string, data?: any) => {
      // Call the original callback first
      if (originalGameEventCallback) {
        originalGameEventCallback(eventType, data);
      }
      
      // Check for special conditions
      if (eventType === 'splitAvailable' || eventType === 'insuranceAvailable') {
        specialConditionsDetected = true;
        console.log(`Special condition detected: ${eventType}, won't show regular gameplay buttons`);
      }
    };
    
    // Set the new callback
    this.dealer.setGameEventCallback(newGameEventCallback);
    
    // Start the game with the current bet
    if (this.dealer.startGame()) {
      console.log(`Starting game with bet: ${Globals.currentBet}`);
      
      // Set game state to started
      Globals.gameStarted = true;
      
      // Show gameplay buttons with a slight delay to ensure animations complete
      // BUT ONLY if no special conditions were detected
      setTimeout(() => {
        // Restore the original game event callback
        if (originalGameEventCallback) {
          this.dealer.setGameEventCallback(originalGameEventCallback);
        }
        
        if (!specialConditionsDetected) {
          console.log("No special conditions detected, showing regular gameplay buttons");
          this.gameButtonsContainer.showGameplayButtons();
        } else {
          console.log("Special conditions were detected, not showing regular gameplay buttons");
        }
      }, 1800);
    } else {
      console.log("Failed to start game");
      
      // Restore the original game event callback
      if (originalGameEventCallback) {
        this.dealer.setGameEventCallback(originalGameEventCallback);
      }
      
      // Re-enable chip selection
      this.table.makeButtonsActive(true);
      
      // Restore chips to their original position
      this.table.animateChipsUp();
      
      // Show betting buttons
      this.gameButtonsContainer.showBettingButtons();
    }
  }

  /**
   * Add a chip to the betting area
   * @param chipData - Data for the chip to add
   */
  addChip(chipData : any)
  {
    // Create the chip
    const chip = this.createChip(chipData);
    
    // Animate the chip from the table to the betting area
    this.animateChipToBettingArea(chip);
    
    // Add the chip to the scene
    this.chips_zone.addChip(chip);
    chip.zIndex = Z_INDEX.CHIPS;
    this.addChildToFullScene(chip);
    
    // Update UI with the chip value
    this.updateUIAfterAddingChip(chipData.value);
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
    new Tween(chip.position, Globals.SceneManager?.tweenGroup)
      .to({
        x: this.chips_zone.position.x + randomOffset.x,
        y: this.chips_zone.position.y + randomOffset.y
      }, 800) // Increased duration for smoother movement
      .easing(Easing.Cubic.Out) // Changed to Cubic for smoother deceleration
      .start();
      
    // Add a slight rotation during movement
    const targetRotation = (Math.random() - 0.5) * Math.PI * 0.5; // Random rotation between -π/4 and π/4
    new Tween(chip, Globals.SceneManager?.tweenGroup)
      .to({ rotation: targetRotation }, 800)
      .easing(Easing.Cubic.Out)
      .start();
  }
    
  /**
   * Update UI after adding a chip
   * @param chipValue - The value of the chip that was added
   */
  private updateUIAfterAddingChip(chipValue: number): void {
    // Update current bet
    Globals.currentBet += chipValue;
    
    // Update balance display
    this.uiContainer.updateBalance();
    
    // Update bet amount display
    this.chips_zone.betHolder.middleChipsCountTxt.updateLabelText(`${this.formatBetAmount(Globals.currentBet)} Chips`);
    
    // Show bet holder and betting buttons if not already visible
    if(!this.chips_zone.betHolder.visible) {
      this.chips_zone.betHolder.isVisible(true);
      this.gameButtonsContainer.showButtonGroup('betting');
    }
  }
  
  /**
   * Format a bet amount for display (e.g. 1000 -> 1k)
   * @param amount - The bet amount to format
   * @returns Formatted bet amount as a string
   */
  private formatBetAmount(amount: number): string {
    if (amount >= 1000) {
      return (amount / 1000).toFixed(2).replace(/\.?0+$/, '') + 'k';
    }
    return amount.toString();
  }

  /**
   * Set up keyboard shortcuts for testing
   */
  private setupTestShortcuts(): void {
    // Add keyboard event listener
    window.addEventListener('keydown', (event) => {
      // Only respond to key presses if not in input field
      if (document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      // Test scenarios with number keys
      switch (event.key) {
        case '1':
          console.log("TEST: Setting up insurance scenario (dealer has Ace with blackjack)");
          this.testScenario('insurance');
          break;
        case '2':
          console.log("TEST: Setting up insurance lost scenario (dealer has Ace but no blackjack)");
          this.testScenario('insuranceLost');
          break;
        case '3':
          console.log("TEST: Setting up split scenario (player has a pair)");
          this.testScenario('split');
          break;
      }
    });
    
    console.log("Test shortcuts enabled:");
    console.log("Press 1 for insurance test (dealer has Ace with blackjack)");
    console.log("Press 2 for insurance lost test (dealer has Ace but no blackjack)");
    console.log("Press 3 for split test (player has a pair)");
  }
  
  /**
   * Run a test scenario
   * @param scenario - The scenario to test
   */
  private testScenario(scenario: 'insurance' | 'insuranceLost' | 'split'): void {
    // Make sure we have enough balance for testing
    if (Globals.Balance < 100) {
      Globals.Balance = 1000;
      this.uiContainer.updateBalance();
    }
    
    // Set a minimum bet for testing
    if (Globals.currentBet < 10) {
      Globals.currentBet = 10;
    }
    
    // Reset any existing game state
    this.resetGame();
    
    // Hide any active buttons
    this.gameButtonsContainer.hideAllButtons();
    
    // Set game state
    Globals.gameStarted = true;
    
    // Run the test scenario in the dealer
    if (this.dealer.testScenario(scenario)) {
      console.log(`Test scenario '${scenario}' started successfully`);
      
      // Animate chips down and out of the way
      this.table.animateChipsDown();
      
      // Disable chip selection
      this.table.makeButtonsActive(false);
      
      // Update bet display
      this.chips_zone.betHolder.middleChipsCountTxt.updateLabelText(`${this.formatBetAmount(Globals.currentBet)} Chips`);
      this.chips_zone.betHolder.isVisible(true);
    } else {
      console.error(`Failed to start test scenario '${scenario}'`);
    }
  }

  /**
   * Handle Play button click
   */
  private onPlayClicked(): void {
    console.log("Play button clicked");
    
    // Check if there's a bet placed
    if (Globals.currentBet <= 0) {
      console.log("No bet placed, can't start game");
      return;
    }
    
    // Start a new game with the current bet
    this.startNewGame();
  }
  
  /**
   * Handle Rebet button click
   */
  private onRebetClicked(): void {
    console.log("Rebet button clicked");
    
    // Prevent multiple rapid clicks
    if ((this as any)._processingRebet) {
      console.log("Already processing Rebet action, ignoring duplicate click");
      return;
    }
    
    // Set flag to prevent multiple calls
    (this as any)._processingRebet = true;
    
    try {
      // Reset game ending state since we're starting a new round
      this.gameButtonsContainer.setGameEnding(false);
      
      // Hide any active popups
      this.popupManager.hidePopup();
      
      // Hide all buttons to prevent UI conflicts
      this.gameButtonsContainer.hideAllButtons();
      
      // Get the last bet amount from the dealer
      const lastBetAmount = this.dealer.getLastBetAmount();
      
      if (lastBetAmount <= 0) {
        console.log("No previous bet amount available for rebet");
        
        // Re-enable chip selection
        this.table.makeButtonsActive(true);
        
        // Show betting buttons
        this.gameButtonsContainer.showBettingButtons();
        return;
      }
      
      // Check if player has enough balance for the rebet
      if (lastBetAmount > Globals.Balance) {
        console.log("Insufficient balance for rebet");
        
        // Re-enable chip selection
        this.table.makeButtonsActive(true);
        
        // Show betting buttons
        this.gameButtonsContainer.showBettingButtons();
        return;
      }
      
      // Reset the game state
      this.resetGame();
      
      // Create and add chips to the betting area
      this.createChipsForBet(lastBetAmount);
      
      // Explicitly show the bet display with the correct amount
      this.chips_zone.showBetDisplay(lastBetAmount);
      
      // Now directly call the play button function to start the game
      setTimeout(() => {
        console.log("Starting game after rebet");
        this.onPlayClicked();
      }, 300);
    } finally {
      // Clear the processing flag after a delay to prevent rapid clicks
      setTimeout(() => {
        (this as any)._processingRebet = false;
      }, 500);
    }
  }
  
  /**
   * Create and display chips for a bet amount
   * @param betAmount - The bet amount to create chips for
   */
  private createChipsForBet(betAmount: number): void {
    console.log("Creating chips for bet amount:", betAmount);
    
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
          
          // Add the chip to the betting area
          this.addChip(chipData);
        }
      }
    });
    
    // Ensure the bet display is visible after creating all chips
    if (Globals.currentBet > 0 && !this.chips_zone.betHolder.visible) {
      this.chips_zone.showBetDisplay(Globals.currentBet);
    }
  }
}
