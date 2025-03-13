import { Container, Sprite, Texture, Text, TextStyle } from "pixi.js";
import { Button, ButtonOptions } from "./Button";
import { Globals } from "./Globals";
import { config as appConfig } from "./appConfig";
import { Easing, Tween } from "@tweenjs/tween.js";
import { TextLabel } from "./TextLabel";

// Button type constants
export enum GameButtonType {
    HIT = 'hit',
    STAND = 'stand',
    CLEAR = 'clear',
    PLAYON = 'playon',
    DOUBLE = 'double',
    SPLIT = 'split',
    SURRENDER = 'surrender',
    INSURANCE = 'insurance'
}

// Button position constants
export enum ButtonPosition {
    LEFT = 'left',
    RIGHT = 'right'
}

// Button configuration interface
export interface GameButtonConfig {
    type: GameButtonType;
    normalTexture: Texture;
    hoverTexture: Texture;
    iconTexture: Texture;
    text: string;
    position: ButtonPosition;
    callback?: () => void;
}

// Button group configurations
export interface ButtonGroupConfig {
    name: string;
    buttons: GameButtonType[];
}

// Interface for button target position
interface ButtonTargetPosition {
    x: number;
    y: number;
}

export class GameButtonContainer extends Container {
    // Active buttons currently displayed
    private currentActiveButtons: GameButton[] = [];
    // Map of all available buttons
    private buttons: Map<GameButtonType, GameButton> = new Map();
    // Map of button groups for easy access
    private buttonGroups: Map<string, ButtonGroupConfig> = new Map();
    // Track bound event listeners for cleanup
    private boundEventListeners: { event: string, handler: EventListener }[] = [];
    // Animation duration for tweens
    private readonly ANIMATION_DURATION = 400;
    // Easing for button entry
    private readonly ENTRY_EASING = Easing.Back.Out;
    // Easing for button exit
    private readonly EXIT_EASING = Easing.Back.In;
    // Flag to track if game is ending (to prevent button conflicts)
    private isGameEnding: boolean = false;
    // Timeout IDs for safety timeouts
    private pendingTimeouts: number[] = [];
    
    constructor() {
        super();
        
        // Initialize button configurations
        this.initializeButtonConfigs();
        
        // Initialize button groups
        this.initializeButtonGroups();
        
        // Hide all buttons initially
        this.hideAllButtons();
        
        // Set up event listeners for window focus/blur and orientation changes
        this.setupWindowEvents();
    }
    
    /**
     * Initialize all button configurations
     */
    private initializeButtonConfigs(): void {
        // Create Hit button (right side, green)
        this.createButton({
            type: GameButtonType.HIT,
            normalTexture: Globals.resources.GreenNormal,
            hoverTexture: Globals.resources.GreenHover,
            iconTexture: Globals.resources.Hit,
            text: "HIT",
            position: ButtonPosition.RIGHT,
            callback: () => { 
                console.log("Hit button clicked");
                Globals.emitter?.Call('hitClicked');
            }
        });
        
        // Create Stand button (left side, red)
        this.createButton({
            type: GameButtonType.STAND,
            normalTexture: Globals.resources.RedNormal,
            hoverTexture: Globals.resources.RedHover,
            iconTexture: Globals.resources.Stand,
            text: "STAND",
            position: ButtonPosition.LEFT,
            callback: () => { 
                console.log("Stand button clicked");
                Globals.emitter?.Call('standClicked');
            }
        });
        
        // Create Double button (right side, green)
        this.createButton({
            type: GameButtonType.DOUBLE,
            normalTexture: Globals.resources.GreenNormal,
            hoverTexture: Globals.resources.GreenHover,
            iconTexture: Globals.resources.Hit, // Using Hit icon as placeholder
            text: "DOUBLE",
            position: ButtonPosition.RIGHT,
            callback: () => { 
                console.log("Double button clicked");
                Globals.emitter?.Call('doubleClicked');
            }
        });
        
        // Create Split button (right side, green)
        this.createButton({
            type: GameButtonType.SPLIT,
            normalTexture: Globals.resources.GreenNormal,
            hoverTexture: Globals.resources.GreenHover,
            iconTexture: Globals.resources.Hit, // Using Hit icon as placeholder
            text: "SPLIT",
            position: ButtonPosition.RIGHT,
            callback: () => { 
                console.log("Split button clicked");
                Globals.emitter?.Call('splitClicked');
            }
        });
        
        // Create Insurance button (left side, red)
        this.createButton({
            type: GameButtonType.INSURANCE,
            normalTexture: Globals.resources.RedNormal,
            hoverTexture: Globals.resources.RedHover,
            iconTexture: Globals.resources.Stand, // Using Stand icon as placeholder
            text: "INSURANCE",
            position: ButtonPosition.LEFT,
            callback: () => { 
                console.log("Insurance button clicked");
                Globals.emitter?.Call('insuranceClicked');
            }
        });
        
        // Create Clear button (left side, red)
        this.createButton({
            type: GameButtonType.CLEAR,
            normalTexture: Globals.resources.RedNormal,
            hoverTexture: Globals.resources.RedHover,
            iconTexture: Globals.resources.Clear,
            text: "CLEAR",
            position: ButtonPosition.LEFT,
            callback: () => { 
                console.log("Clear button clicked");
                Globals.emitter?.Call('clearClicked');
            }
        });
        
        // Create PlayOn button (right side, green)
        this.createButton({
            type: GameButtonType.PLAYON,
            normalTexture: Globals.resources.GreenNormal,
            hoverTexture: Globals.resources.GreenHover,
            iconTexture: Globals.resources.Playon,
            text: "PLAY ON",
            position: ButtonPosition.RIGHT,
            callback: () => { 
                console.log("Play On button clicked");
                Globals.emitter?.Call('playOnClicked');
            }
        });
        
        // Add Surrender button if texture is available
        if (Globals.resources.Surrender) {
            this.createButton({
                type: GameButtonType.SURRENDER,
                normalTexture: Globals.resources.RedNormal,
                hoverTexture: Globals.resources.RedHover,
                iconTexture: Globals.resources.Surrender,
                text: "SURRENDER",
                position: ButtonPosition.LEFT,
                callback: () => { 
                    console.log("Surrender button clicked");
                    Globals.emitter?.Call('surrenderClicked');
                }
            });
        }
    }
    
    /**
     * Create a button and add it to the container
     */
    private createButton(config: GameButtonConfig): void {
        // Create button instance
        const button = new GameButton(
            config.normalTexture,
            config.callback || (() => {}),
            {
                hoverTexture: config.hoverTexture,
                iconTexture: config.iconTexture,
                buttonText: config.text,
                position: config.position
            }
        );
        
        // Center button anchor
        button.anchor.set(0.5);
        
        // Add to container
        this.addChild(button);
        
        // Store in buttons map
        this.buttons.set(config.type, button);
        
        // Hide initially
        button.visible = false;
    }
    
    /**
     * Initialize button groups for easy access
     */
    private initializeButtonGroups(): void {
        // Define common button groups
        this.buttonGroups.set('betting', {
            name: 'Betting Buttons',
            buttons: [GameButtonType.CLEAR, GameButtonType.HIT]
        });
        
        this.buttonGroups.set('gameplay', {
            name: 'Gameplay Buttons',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.DOUBLE]
        });
        
        this.buttonGroups.set('gameplayNoDouble', {
            name: 'Gameplay Buttons Without Double',
            buttons: [GameButtonType.HIT, GameButtonType.STAND]
        });
        
        this.buttonGroups.set('splitEligible', {
            name: 'Split Eligible Buttons',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.DOUBLE, GameButtonType.SPLIT]
        });
        
        this.buttonGroups.set('splitEligibleNoDouble', {
            name: 'Split Eligible Buttons Without Double',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.SPLIT]
        });
        
        this.buttonGroups.set('insuranceEligible', {
            name: 'Insurance Eligible Buttons',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.DOUBLE, GameButtonType.INSURANCE]
        });
        
        this.buttonGroups.set('insuranceEligibleNoDouble', {
            name: 'Insurance Eligible Buttons Without Double',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.INSURANCE]
        });
        
        this.buttonGroups.set('gameEnd', {
            name: 'Game End Buttons',
            buttons: [GameButtonType.PLAYON, GameButtonType.SURRENDER]
        });
        
        this.buttonGroups.set('startGame', {
            name: 'Start Game Buttons',
            buttons: [GameButtonType.HIT, GameButtonType.CLEAR]
        });
        
        // Create 'all' group with all available buttons
        const allButtonTypes = Array.from(this.buttons.keys());
        this.buttonGroups.set('all', {
            name: 'All Buttons',
            buttons: allButtonTypes
        });
    }
    
    /**
     * Show a specific button
     */
    showButton(buttonType: GameButtonType): void {
        this.showButtons([buttonType]);
    }
    
    /**
     * Show a button group with proper transition
     */
    showButtonGroup(groupName: string): void {
        const group = this.buttonGroups.get(groupName);
        
        if (!group) {
            console.warn(`Button group '${groupName}' not found`);
            return;
        }
        
        this.showButtons(group.buttons);
    }
    
    /**
     * Show specific buttons with animation
     */
    showButtons(buttonTypes: GameButtonType[]): void {
        // Log the buttons being requested to show for debugging
        console.log("Showing buttons:", buttonTypes.join(", "));
        
        // Check if these are special buttons (split or insurance)
        const isSpecialButtons = buttonTypes.includes(GameButtonType.SPLIT) || 
                                buttonTypes.includes(GameButtonType.INSURANCE);
        
        // If game is ending, don't show gameplay buttons UNLESS they are special buttons
        if (this.isGameEnding && 
            buttonTypes.includes(GameButtonType.HIT) && 
            buttonTypes.includes(GameButtonType.STAND) &&
            !isSpecialButtons) {
            console.log("Game is ending, not showing gameplay buttons");
            return;
        }

        // If we have active buttons, hide them first with a callback to show new buttons
        if (this.currentActiveButtons.length > 0) {
            // Log current active buttons for debugging
            const activeButtonNames = this.currentActiveButtons.map(button => {
                for (const [type, btn] of this.buttons.entries()) {
                    if (btn === button) return type;
                }
                return "unknown";
            });
            console.log("Currently active buttons:", activeButtonNames);
            
            // Store the button types we want to show after hiding current buttons
            const buttonTypesToShow = [...buttonTypes];
            
            this.hideButtons(() => {
                // Use a small timeout to ensure buttons are fully hidden before showing new ones
                setTimeout(() => {
                    this.animateButtonsIn(buttonTypesToShow);
                }, 50);
            });
        } else {
            // No active buttons, just show the new ones
            this.animateButtonsIn(buttonTypes);
        }
    }
    
    /**
     * Animate buttons in from off-screen
     */
    private animateButtonsIn(buttonTypes: GameButtonType[]): void {
        // Cancel any active tweens first
        this.cancelAllActiveTweens();
        
        // Filter out missing buttons to avoid errors
        const validButtonTypes = buttonTypes.filter(type => this.buttons.has(type));
        
        if (validButtonTypes.length === 0) {
            console.warn("No valid buttons to show");
            return;
        }
        
        // Log the valid buttons being animated in
        console.log("Animating in buttons:", validButtonTypes.join(", "));
        
        // Clear current active buttons
        this.currentActiveButtons = [];
        
        // Calculate positions for buttons
        const positions = this.calculateButtonPositions(validButtonTypes);
        
        // Show and position each button
        validButtonTypes.forEach((type, index) => {
            const button = this.buttons.get(type);
            if (!button) return;
            
            // Add to active buttons
            this.currentActiveButtons.push(button);
            
            // Make button visible but not interactive yet
            button.visible = true;
            button.setActive(false);
            
            // Apply scaling
            const scaleFactor = this.getScaleFactor();
            button.setOriginalScale(scaleFactor, scaleFactor);
            
            // Get target position
            const targetPosition = positions.get(type);
            if (!targetPosition) return;
            
            // Store target position for potential repositioning
            button.targetPosition = targetPosition;
            
            // Set initial position off-screen
            const offScreenX = button.options.position === ButtonPosition.LEFT 
                ? -button.width - 100 
                : window.innerWidth + button.width + 100;
            
            button.position.set(offScreenX, targetPosition.y);
            
            // Animate button sliding in with staggered delay
            const delay = index * 50; // 50ms delay between each button
            
            const tween = new Tween(button.position, Globals.SceneManager?.tweenGroup)
                .to({ x: targetPosition.x }, this.ANIMATION_DURATION)
                .delay(delay)
                .easing(this.ENTRY_EASING)
                .onComplete(() => {
                    // Ensure icon and text are properly positioned
                    button.adjustPositions();
                    
                    // Make button interactive after animation completes
                    button.setActive(true);
                    
                    // Log when button animation completes
                    console.log(`Button ${type} animation completed`);
                })
                .start();
            
            // Store tween reference for potential cancellation
            button['activeTween'] = tween;
        });
        
        // Safety timeout to ensure all buttons become interactive even if animations fail
        const timeoutId = setTimeout(() => {
            this.currentActiveButtons.forEach(button => {
                if (!button.interactive) {
                    button.setActive(true);
                    console.log("Safety timeout activated for button interactivity");
                }
            });
            // Remove this timeout from the pending list
            this.pendingTimeouts = this.pendingTimeouts.filter(id => id !== timeoutId);
        }, this.ANIMATION_DURATION + 200) as unknown as number;
        
        // Store timeout ID for potential cancellation
        this.pendingTimeouts.push(timeoutId);
    }
    
    /**
     * Calculate positions for a set of buttons
     */
    private calculateButtonPositions(buttonTypes: GameButtonType[]): Map<GameButtonType, ButtonTargetPosition> {
        const positions = new Map<GameButtonType, ButtonTargetPosition>();
        
        // Get scaling factors
        const isPortrait = window.innerWidth < window.innerHeight;
        const scaleFactor = isPortrait ? 0.8 : 1;
        
        // Calculate base vertical position
        const baseButtonY = window.innerHeight * 0.65; // Position at 65% down the screen
        
        // Calculate button dimensions
        const buttonHeight = 80 * appConfig.scaleFactor * scaleFactor;
        
        // Calculate vertical spacing between buttons
        const verticalSpacing = 20 * scaleFactor;
        
        // Calculate horizontal positions for left and right sides
        const leftX =  isPortrait ? window.innerWidth * 0.25: window.innerWidth * 0.4; // 25% from left edge
        const rightX = isPortrait ? window.innerWidth * 0.75:  window.innerWidth * 0.6; // 75% from left edge
        
        // Separate buttons by position
        const leftButtons: GameButtonType[] = [];
        const rightButtons: GameButtonType[] = [];
        
        buttonTypes.forEach(type => {
            const button = this.buttons.get(type);
            if (!button) return;
            
            if (button.options.position === ButtonPosition.LEFT) {
                leftButtons.push(type);
            } else {
                rightButtons.push(type);
            }
        });
        
        // Calculate starting Y positions for top button on each side
        const leftStartY = baseButtonY - ((leftButtons.length - 1) * (buttonHeight + verticalSpacing)) / 2;
        const rightStartY = baseButtonY - ((rightButtons.length - 1) * (buttonHeight + verticalSpacing)) / 2;
        
        // Set positions for left buttons
        leftButtons.forEach((type, index) => {
            const targetY = leftStartY + index * (buttonHeight + verticalSpacing);
            positions.set(type, { x: leftX, y: targetY });
        });
        
        // Set positions for right buttons
        rightButtons.forEach((type, index) => {
            const targetY = rightStartY + index * (buttonHeight + verticalSpacing);
            positions.set(type, { x: rightX, y: targetY });
        });
        
        return positions;
    }
    
    /**
     * Hide all active buttons with animation
     */
    hideButtons(callback: () => void = () => {}): void {
        // If no buttons are active, just call the callback
        if (this.currentActiveButtons.length === 0) {
            console.log("No active buttons to hide, calling callback directly");
            callback();
            return;
        }
        
        // Log which buttons are being hidden
        console.log("Hiding buttons:", this.currentActiveButtons.length);
        
        // Cancel any active tweens first to prevent animation conflicts
        this.cancelAllActiveTweens();
        
        // Make a copy of the current active buttons to avoid modification issues
        const buttonsToHide = [...this.currentActiveButtons];
        
        // Clear current active buttons immediately to prevent race conditions
        this.currentActiveButtons = [];
        
        // Track completion of animations
        let completedCount = 0;
        const totalCount = buttonsToHide.length;
        
        // Function to check if all buttons are hidden
        const checkAllHidden = () => {
            completedCount++;
            console.log(`Button hide animation completed: ${completedCount}/${totalCount}`);
            if (completedCount >= totalCount) {
                // All buttons hidden, call the callback
                console.log("All buttons hidden, calling callback");
                callback();
            }
        };
        
        // Hide each button with animation
        buttonsToHide.forEach(button => {
            // Disable interaction during animation
            button.setActive(false);
            
            // Determine target off-screen position
            const targetX = button.options.position === ButtonPosition.LEFT
                ? -button.width - 100
                : window.innerWidth + button.width + 100;
            
            // Animate button sliding out
            const tween = new Tween(button.position, Globals.SceneManager?.tweenGroup)
                .to({ x: targetX }, this.ANIMATION_DURATION / 2) // Faster exit animation
                .easing(this.EXIT_EASING)
                .onComplete(() => {
                    button.visible = false;
                    checkAllHidden();
                })
                .start();
            
            // Store tween reference for potential cancellation
            button['activeTween'] = tween;
        });
        
        // Safety timeout to ensure callback is called even if animations fail
        setTimeout(() => {
            if (completedCount < totalCount) {
                console.warn("Button hide animation timeout triggered");
                
                // Force hide all remaining buttons
                buttonsToHide.forEach(button => {
                    if (button.visible) {
                        button.visible = false;
                        button.setActive(false);
                    }
                });
                
                // Force completion
                console.log("Forcing completion of button hiding");
                callback();
            }
        }, this.ANIMATION_DURATION);
    }
    
    /**
     * Cancel all active tweens
     */
    private cancelAllActiveTweens(): void {
        this.buttons.forEach(button => {
            if (button['activeTween']) {
                try {
                    button['activeTween'].stop();
                } catch (e) {
                    console.warn("Error stopping tween:", e);
                }
                button['activeTween'] = undefined;
            }
        });
    }
    
    /**
     * Hide all buttons immediately without animation
     */
    hideAllButtons(): void {
        // Cancel any active tweens first
        this.cancelAllActiveTweens();
        
        // Cancel any pending timeouts
        this.cancelPendingTimeouts();
        
        // Hide all buttons immediately
        this.buttons.forEach(button => {
            button.visible = false;
            button.setActive(false);
            button['activeTween'] = undefined;
        });
        
        // Clear current active buttons
        this.currentActiveButtons = [];
    }
    
    /**
     * Convenience methods for common button groups
     */
    showBettingButtons(): void {
        // Reset game ending state
        this.setGameEnding(false);
        
        // Show betting buttons
        this.showButtonGroup('betting');
    }
    
    /**
     * Show gameplay buttons with conditional double button based on player balance
     */
    showGameplayButtons(): void {
        // If game is ending, don't show gameplay buttons
        if (this.isGameEnding) {
            console.log("Game is ending, not showing gameplay buttons");
            return;
        }
        
        // Check if player has enough balance to double down
        const canDoubleDown = Globals.Balance >= Globals.currentBet;
        
        // Show appropriate button group based on balance
        if (canDoubleDown) {
            console.log("Player can double down, showing double button");
            this.showButtonGroup('gameplay');
        } else {
            console.log("Player cannot double down, hiding double button");
            this.showButtonGroup('gameplayNoDouble');
        }
    }
    
    /**
     * Show split eligible buttons with conditional double button based on player balance
     */
    showSplitEligibleButtons(): void {
        console.log("showSplitEligibleButtons called");
        console.log("Current game ending state:", this.isGameEnding);
        
        // Reset game ending state to ensure buttons can be shown
        this.setGameEnding(false);
        
        // Check if player has enough balance to double down
        const canDoubleDown = Globals.Balance >= Globals.currentBet;
        
        // Log button group details before showing
        const groupName = canDoubleDown ? 'splitEligible' : 'splitEligibleNoDouble';
        const group = this.buttonGroups.get(groupName);
        console.log(`Showing ${groupName} button group:`, group ? group.buttons.join(", ") : "Group not found");
        
        // Show appropriate button group based on balance
        if (canDoubleDown) {
            console.log("Player can double down, showing split with double button");
            this.showButtonGroup('splitEligible');
        } else {
            console.log("Player cannot double down, showing split without double button");
            this.showButtonGroup('splitEligibleNoDouble');
        }
        
        // Verify buttons after a short delay
        setTimeout(() => {
            console.log("Active buttons after split buttons shown:", this.currentActiveButtons.length);
            console.log("Split button visible:", this.buttons.get(GameButtonType.SPLIT)?.visible);
        }, 500);
    }
    
    /**
     * Show insurance eligible buttons with conditional double button based on player balance
     */
    showInsuranceEligibleButtons(): void {
        console.log("showInsuranceEligibleButtons called");
        console.log("Current game ending state:", this.isGameEnding);
        
        // Reset game ending state to ensure buttons can be shown
        this.setGameEnding(false);
        
        // Check if player has enough balance to double down
        const canDoubleDown = Globals.Balance >= Globals.currentBet;
        
        // Log button group details before showing
        const groupName = canDoubleDown ? 'insuranceEligible' : 'insuranceEligibleNoDouble';
        const group = this.buttonGroups.get(groupName);
        console.log(`Showing ${groupName} button group:`, group ? group.buttons.join(", ") : "Group not found");
        
        // Show appropriate button group based on balance
        if (canDoubleDown) {
            console.log("Player can double down, showing insurance with double button");
            this.showButtonGroup('insuranceEligible');
        } else {
            console.log("Player cannot double down, showing insurance without double button");
            this.showButtonGroup('insuranceEligibleNoDouble');
        }
        
        // Verify buttons after a short delay
        setTimeout(() => {
            console.log("Active buttons after insurance buttons shown:", this.currentActiveButtons.length);
            console.log("Insurance button visible:", this.buttons.get(GameButtonType.INSURANCE)?.visible);
        }, 500);
    }
    
    showGameEndButtons(): void {
        // Set game ending state to prevent gameplay buttons from showing
        this.setGameEnding(true);
        
        // Show game end buttons
        this.showButtonGroup('gameEnd');
    }
    
    showStartGameButtons(): void {
        this.showButtonGroup('startGame');
    }
    
    /**
     * Handle window resize
     */
    resize(): void {
        // If no active buttons, nothing to do
        if (this.currentActiveButtons.length === 0) return;
        
        // Check for orientation change
        const isPortrait = window.innerWidth < window.innerHeight;
        const wasPortrait = (this as any)._previousIsPortrait;
        
        // Store current orientation for next resize
        (this as any)._previousIsPortrait = isPortrait;
        
        // If orientation changed, handle it specially
        if (wasPortrait !== undefined && wasPortrait !== isPortrait) {
            this.handleOrientationChange();
            return;
        }
        
        // Recalculate positions for current active buttons
        const activeButtonTypes = this.currentActiveButtons.map(button => {
            // Find the button type from the map
            for (const [type, btn] of this.buttons.entries()) {
                if (btn === button) return type;
            }
            return null;
        }).filter(Boolean) as GameButtonType[];
        
        // Calculate new positions
        const positions = this.calculateButtonPositions(activeButtonTypes);
        
        // Update positions for all active buttons
        this.currentActiveButtons.forEach(button => {
            // Find button type
            let buttonType: GameButtonType | null = null;
            for (const [type, btn] of this.buttons.entries()) {
                if (btn === button) {
                    buttonType = type;
                    break;
                }
            }
            
            if (!buttonType) return;
            
            // Get new position
            const newPosition = positions.get(buttonType);
            if (!newPosition) return;
            
            // Cancel any active tween
            if (button['activeTween']) {
                try {
                    button['activeTween'].stop();
                } catch (e) {
                    console.warn("Error stopping tween during resize:", e);
                }
                button['activeTween'] = undefined;
            }
            
            // Update position directly
            button.position.set(newPosition.x, newPosition.y);
            
            // Store target position for reference
            button.targetPosition = newPosition;
            
            // Update scale
            const scaleFactor = this.getScaleFactor();
            button.setOriginalScale(scaleFactor, scaleFactor);
            
            // Ensure icon and text are properly positioned
            button.adjustPositions();
        });
    }
    
    /**
     * Get current scale factor based on orientation
     */
    private getScaleFactor(): number {
        const isPortrait = window.innerWidth < window.innerHeight;
        const baseFactor = isPortrait ? 0.8 : 1;
        return 0.9 * appConfig.scaleFactor * baseFactor;
    }
    
    /**
     * Handle orientation change
     */
    private handleOrientationChange(): void {
        // If we have active buttons, reposition them with animation
        if (this.currentActiveButtons.length > 0) {
            // Store current active button types
            const activeButtonTypes = this.currentActiveButtons.map(button => {
                for (const [type, btn] of this.buttons.entries()) {
                    if (btn === button) return type;
                }
                return null;
            }).filter(Boolean) as GameButtonType[];
            
            // Hide current buttons and show them again with new positions
            this.hideButtons(() => {
                setTimeout(() => {
                    this.showButtons(activeButtonTypes);
                }, 100);
            });
        }
    }
    
    /**
     * Set up window event listeners
     */
    private setupWindowEvents(): void {
        // Handle window blur (game loses focus)
        const blurHandler = (() => {
            // Disable interaction but keep buttons visible
            this.currentActiveButtons.forEach(button => {
                button.setActive(false);
            });
        }) as EventListener;
        
        // Handle window focus (game regains focus)
        const focusHandler = (() => {
            // Re-enable interaction for active buttons
            this.currentActiveButtons.forEach(button => {
                button.setActive(true);
            });
        }) as EventListener;
        
        // Handle orientation change
        const orientationHandler = (() => {
            setTimeout(() => this.handleOrientationChange(), 300);
        }) as EventListener;
        
        // Add event listeners
        window.addEventListener('blur', blurHandler);
        window.addEventListener('focus', focusHandler);
        window.addEventListener('orientationchange', orientationHandler);
        
        // Store references to event listeners for cleanup
        this.boundEventListeners.push(
            { event: 'blur', handler: blurHandler },
            { event: 'focus', handler: focusHandler },
            { event: 'orientationchange', handler: orientationHandler }
        );
    }
    
    /**
     * Cancel all pending timeouts
     */
    private cancelPendingTimeouts(): void {
        this.pendingTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        this.pendingTimeouts = [];
    }
    
    /**
     * Set game ending state to prevent button conflicts
     */
    setGameEnding(isEnding: boolean): void {
        this.isGameEnding = isEnding;
        
        // If game is ending, cancel any pending button animations
        if (isEnding) {
            this.cancelPendingTimeouts();
        }
    }
    
    /**
     * Cleanup method to remove event listeners and dispose of resources
     */
    public cleanup(): void {
        // Cancel any active tweens
        this.cancelAllActiveTweens();
        
        // Cancel any pending timeouts
        this.cancelPendingTimeouts();
        
        // Remove all event listeners
        this.boundEventListeners.forEach(({ event, handler }) => {
            window.removeEventListener(event, handler);
        });
        
        // Clear event listeners array
        this.boundEventListeners = [];
        
        // Hide all buttons
        this.hideAllButtons();
        
        // Remove all buttons from container
        this.buttons.forEach(button => {
            if (button.parent === this) {
                this.removeChild(button);
            }
            
            // Clean up button resources
            if (button.icon) {
                button.icon.destroy();
            }
            
            if (button.text) {
                button.text.destroy();
            }
        });
        
        // Clear button maps
        this.buttons.clear();
        this.buttonGroups.clear();
        this.currentActiveButtons = [];
    }
    
    /**
     * Get a button by type
     */
    public getButton(type: GameButtonType): GameButton | undefined {
        return this.buttons.get(type);
    }
}

// Extended options for game buttons
export interface GameButtonOptions extends ButtonOptions {
    iconTexture?: Texture;    // Icon to display on the button
    buttonText?: string;      // Text to display on the button
    position?: ButtonPosition; // Which side the button appears from
}

export class GameButton extends Button {
    public icon?: Sprite;
    public text?: Text;
    options: GameButtonOptions;
    targetPosition?: ButtonTargetPosition;
    
    constructor(texture: Texture, public callback: () => void, options: GameButtonOptions = {}) {
        // Set default options
        const defaultOptions: GameButtonOptions = {
            hoverScale: 1.05,
            pressScale: 0.95,
            animationDuration: 200,
            position: ButtonPosition.RIGHT
        };
        
        // Merge default options with provided options
        const mergedOptions = { ...defaultOptions, ...options };
        
        super(texture, callback, mergedOptions);
        
        this.options = mergedOptions;
        
        // Create and add icon if provided
        if (options.iconTexture) {
            this.icon = new Sprite(options.iconTexture);
            this.icon.anchor.set(0.5);
            
            // Scale icon to fit button (about 60% of button height)
            const iconScale = (this.height * 0.6) / this.icon.height;
            this.icon.scale.set(iconScale);
            
            // Initially position icon in center, will be adjusted later
            this.icon.position.set(0, 0);
            this.addChild(this.icon);
        }
        
        // Create and add text if provided
        if (options.buttonText) {
            const textStyle = new TextStyle({
                fontFamily: 'Lato, Arial',
                fontSize: 14 * appConfig.scaleFactor,
                fontWeight: 'bold',
                fill: '#FFFFFF',
                align: 'center'
            });
            
            this.text = new TextLabel(0, 0, 0.5, options.buttonText, 14 * appConfig.scaleFactor, 0xFFFFFF, 'Lato, Arial');
            this.text.anchor.set(0.5, 0.5);
            this.text.style = textStyle;
            
            // Initially position text in center, will be adjusted later
            this.text.position.set(0, 0);
            this.addChild(this.text);
        }
        
        // Adjust positions once the button is added to the stage
        this.once('added', this.adjustPositions.bind(this));
    }
    
    /**
     * Adjust positions of icon and text
     */
    public adjustPositions(): void {
        // Ensure the button has proper dimensions
        if (this.width === 0 || !this.visible) {
            // If button has no width yet or is not visible, try again on next frame
            requestAnimationFrame(() => {
                if (this.visible) {
                    this.adjustPositions();
                }
            });
            return;
        }
        
        if (this.icon && this.text) {
            // Calculate the total width needed for icon and text with spacing
            const iconWidth = this.icon.width * this.icon.scale.x;
            const textWidth = this.text.width;
            const spacing = 10 * appConfig.scaleFactor; // Space between icon and text
            const totalWidth = iconWidth + spacing + textWidth;
            
            // Center the combined icon and text within the button
            const startX = -totalWidth / 2;
            
            // Position icon on the left
            this.icon.position.set(startX + iconWidth / 2, 0);
            
            // Position text on the right of the icon
            this.text.position.set(startX + iconWidth + spacing, 0);
            
            // Ensure text anchor is set correctly for proper alignment
            this.text.anchor.set(0, 0.5);
        } else if (this.icon) {
            // Center the icon if there's no text
            this.icon.position.set(0, 0);
        } else if (this.text) {
            // Center the text if there's no icon
            this.text.position.set(0, 0);
            this.text.anchor.set(0.5, 0.5);
        }
    }
    
    /**
     * Override setActive to also update icon and text
     */
    public setActive(active: boolean): void {
        super.setActive(active);
        
        if (this.icon) {
            this.icon.alpha = active ? 1 : 0.6;
        }
        
        if (this.text) {
            this.text.alpha = active ? 1 : 0.6;
        }
    }
}
