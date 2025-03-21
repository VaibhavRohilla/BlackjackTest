import { Container, Sprite, Texture } from "pixi.js";
import { Button, ButtonOptions } from "./button";
import { Globals } from "./globals";
import { config as appConfig } from "./appconfig";
import { TextLabel } from "./textlabel";
import { Easing, Tween } from "@tweenjs/tween.js";

// Button type constants
export enum GameButtonType {
    HIT = 'hit',
    STAND = 'stand',
    CLEAR = 'clear',
    PLAYON = 'playon',
    DOUBLE = 'double',
    SPLIT = 'split',
    SURRENDER = 'surrender',
    INSURANCE = 'insurance',
    PLAY = 'play',
    REBET = 'rebet'
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

export class GameButtonContainer extends Container {
    // Active buttons currently displayed
    private currentActiveButtons: GameButton[] = [];
    // Map of all available buttons
    private buttons: Map<GameButtonType, GameButton> = new Map();
    // Map of button groups for easy access
    private buttonGroups: Map<string, ButtonGroupConfig> = new Map();
    // Animation settings - updated for smoother animation
    private readonly ANIMATION_DURATION = 350; // ms - slightly reduced for snappier feel
    private readonly STAGGER_DELAY = 60; // ms between button animations - reduced for quicker sequence
    private readonly OFFSCREEN_OFFSET = 250; // pixels to move offscreen - reduced for more natural feel
    // Flag to track if buttons are currently animating
    private isAnimating: boolean = false;
    // Queued button group to show after animations complete
    private queuedButtonGroup: string | null = null;
    // Track animation completion
    private pendingAnimations: number = 0;
    
    constructor() {
        super();
        
        // Initialize button configurations
        this.initializeButtonConfigs();
        
        // Initialize button groups
        this.initializeButtonGroups();
        
        // Hide all buttons initially
        this.hideAllButtons();
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
        
        // Create Rebet button (left side, green)
        this.createButton({
            type: GameButtonType.REBET,
            normalTexture: Globals.resources.GreenNormal,
            hoverTexture: Globals.resources.GreenHover,
            iconTexture: Globals.resources.Playon, // Using PlayOn icon as placeholder
            text: "REBET",
            position: ButtonPosition.LEFT,
            callback: () => { 
                console.log("Rebet button clicked");
                Globals.emitter?.Call('rebetClicked');
            }
        });
        
        // Create Play button (right side, green)
        this.createButton({
            type: GameButtonType.PLAY,
            normalTexture: Globals.resources.GreenNormal,
            hoverTexture: Globals.resources.GreenHover,
            iconTexture: Globals.resources.Playon, // Using PlayOn icon as placeholder
            text: "PLAY",
            position: ButtonPosition.RIGHT,
            callback: () => { 
                console.log("Play button clicked");
                Globals.emitter?.Call('playClicked');
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
            buttons: [GameButtonType.CLEAR, GameButtonType.PLAY]
        });
        
        this.buttonGroups.set('gameplay', {
            name: 'Gameplay Buttons',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.DOUBLE, GameButtonType.SURRENDER]
        });
        
        this.buttonGroups.set('gameplayNoDouble', {
            name: 'Gameplay Buttons Without Double',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.SURRENDER]
        });
        
        this.buttonGroups.set('gameplayAfterHit', {
            name: 'Gameplay Buttons After Hit',
            buttons: [GameButtonType.HIT, GameButtonType.STAND]
        });
        
        this.buttonGroups.set('gameplayWithoutSplit', {
            name: 'Gameplay Buttons Without Split Option',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.DOUBLE, GameButtonType.SURRENDER]
        });
        
        this.buttonGroups.set('splitEligible', {
            name: 'Split Eligible Buttons',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.DOUBLE, GameButtonType.SPLIT, GameButtonType.SURRENDER]
        });
        
        this.buttonGroups.set('splitEligibleNoDouble', {
            name: 'Split Eligible Buttons Without Double',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.SPLIT, GameButtonType.SURRENDER]
        });
        
        this.buttonGroups.set('insuranceEligible', {
            name: 'Insurance Eligible Buttons',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.DOUBLE, GameButtonType.INSURANCE, GameButtonType.SURRENDER]
        });
        
        this.buttonGroups.set('insuranceEligibleNoDouble', {
            name: 'Insurance Eligible Buttons Without Double',
            buttons: [GameButtonType.HIT, GameButtonType.STAND, GameButtonType.INSURANCE, GameButtonType.SURRENDER]
        });
        
        this.buttonGroups.set('gameplayafter21', {
            name: 'Gameplay Buttons After 21',
            buttons: [GameButtonType.STAND]
        });
        
        this.buttonGroups.set('gameEnd', {
            name: 'Game End Buttons',
            buttons: [GameButtonType.REBET, GameButtonType.PLAYON]
        });
        
        this.buttonGroups.set('startGame', {
            name: 'Start Game Buttons',
            buttons: [GameButtonType.PLAY]
        });
    }
    
    /**
     * Get the count of currently active buttons
     * @returns The number of active buttons
     */
    getActiveButtonCount(): number {
        return this.currentActiveButtons.length;
    }
    
    /**
     * Show a specific button with animation
     */
    showButton(buttonType: GameButtonType): void {
        const button = this.buttons.get(buttonType);
        if (button) {
            // Position button first (to get final position)
            this.positionButton(button);
            
            // Store final position
            const finalPosition = {
                x: button.position.x,
                y: button.position.y
            };
            
            // Move button off-screen based on its position
            const offscreenX = button.options.position === ButtonPosition.LEFT 
                ? finalPosition.x - this.OFFSCREEN_OFFSET 
                : finalPosition.x + this.OFFSCREEN_OFFSET;
            
            button.position.set(offscreenX, finalPosition.y);
            button.alpha = 0;
            button.visible = true;
            
            // Mark animation as in progress
            this.isAnimating = true;
            
            // Animate button into position
            new Tween(button.position, Globals.sceneManager?.tweenGroup)
                .to({ x: finalPosition.x }, this.ANIMATION_DURATION)
                .easing(Easing.Quadratic.InOut)
                .start();
                
            // Fade in
            new Tween(button, Globals.sceneManager?.tweenGroup)
                .to({ alpha: 1 }, this.ANIMATION_DURATION)
                .easing(Easing.Quadratic.Out)
                .onComplete(() => {
                    this.isAnimating = false;
                    this.checkQueuedButtonGroup();
                })
                .start();
            
            button.setActive(true);
            this.currentActiveButtons.push(button);
        }
    }
    
    /**
     * Show a button group with staggered animation
     */
    showButtonGroup(groupName: string): void {
        // If buttons are currently animating, queue this request
        if (this.isAnimating) {
            console.log(`Buttons animating, queueing group: ${groupName}`);
            // Override any previous queued button group to ensure latest request is handled
            this.queuedButtonGroup = groupName;
            
            // Limit how long we'll wait for animations - force show after timeout
            setTimeout(() => {
                if (this.queuedButtonGroup === groupName) {
                    console.log(`Force showing queued button group: ${groupName} after timeout`);
                    this.isAnimating = false;
                    this.pendingAnimations = 0;
                    this.showButtonGroup(groupName);
                }
            }, 300); // Shorter timeout to ensure buttons appear quickly
            
            return;
        }
        
        const group = this.buttonGroups.get(groupName);
        
        if (!group) {
            console.warn(`Button group '${groupName}' not found`);
            return;
        }
        
        console.log(`Showing button group: ${groupName} with ${group.buttons.length} buttons`);
        
        // If there are no buttons to show, just hide all buttons
        if (group.buttons.length === 0) {
            this.hideAllButtons();
            return;
        }
        
        // Hide current buttons first - but use a faster hide animation
        this.hideAllButtons(true);
        
        // Mark as animating
        this.isAnimating = true;
        this.pendingAnimations = 0;
        
        // Pre-position all buttons first so calculations are correct
        const buttonsToShow: GameButton[] = [];
        group.buttons.forEach(buttonType => {
            const button = this.buttons.get(buttonType);
            if (button) {
                buttonsToShow.push(button);
                // Make button active for correct positioning
                button.visible = true;
                button.alpha = 0;
                this.currentActiveButtons.push(button);
            }
        });
        
        // Now position all buttons (needs to be done after currentActiveButtons is populated)
        buttonsToShow.forEach(button => {
            this.positionButton(button);
        });
        
        // Use faster animations
        const fasterAnimationDuration = 200; // ms, down from default
        const fasterStaggerDelay = 40; // ms, down from default
        
        // Animate each button with staggered timing
        buttonsToShow.forEach((button, index) => {
            // Store final position
            const finalPosition = {
                x: button.position.x,
                y: button.position.y
            };
            
            // Move button off-screen based on its position
            const offscreenX = button.options.position === ButtonPosition.LEFT 
                ? finalPosition.x - this.OFFSCREEN_OFFSET 
                : finalPosition.x + this.OFFSCREEN_OFFSET;
            
            button.position.set(offscreenX, finalPosition.y);
            
            // Calculate delay for staggered animation - use shorter delay
            const delay = index * fasterStaggerDelay;
            this.pendingAnimations++;
            
            // Animation group for this button (position + alpha)
            const animateButton = () => {
                // Animate button into position
                new Tween(button.position, Globals.sceneManager?.tweenGroup)
                    .to({ x: finalPosition.x }, fasterAnimationDuration)
                    .easing(Easing.Cubic.Out) // More natural movement
                    .delay(delay)
                    .start();
                
                // Fade in
                new Tween(button, Globals.sceneManager?.tweenGroup)
                    .to({ alpha: 1 }, fasterAnimationDuration)
                    .easing(Easing.Quadratic.Out)
                    .delay(delay)
                    .onComplete(() => {
                        button.setActive(true);
                        this.completeAnimation();
                    })
                    .start();
            };
            
            // Start animation immediately
            animateButton();
        });
        
        // If no animations were started, mark as not animating
        if (this.pendingAnimations === 0) {
            this.isAnimating = false;
        }
    }
    
    /**
     * Track animation completion 
     */
    private completeAnimation(): void {
        this.pendingAnimations--;
        if (this.pendingAnimations <= 0) {
            this.isAnimating = false;
            this.checkQueuedButtonGroup();
        }
    }
    
    /**
     * Check if there's a queued button group to show
     */
    private checkQueuedButtonGroup(): void {
        if (this.queuedButtonGroup) {
            const groupName = this.queuedButtonGroup;
            this.queuedButtonGroup = null;
            this.showButtonGroup(groupName);
        }
    }
    
    /**
     * Hide all active buttons with animation
     * @param fast Whether to use a faster animation (for immediate transitions)
     */
    hideAllButtons(fast: boolean = false): void {
        // Early return if no buttons to hide
        if (this.currentActiveButtons.length === 0) {
            this.isAnimating = false;
            return;
        }
        
        // Use faster animation duration when requested
        const hideDuration = fast ? 100 : 200; // Default was slower
        
        // Create a copy of current buttons to avoid modifying while iterating
        const buttonsToHide = [...this.currentActiveButtons];
        this.currentActiveButtons = [];
        
        // Mark as animating
        this.isAnimating = true;
        this.pendingAnimations = 0;
        
        // If fast mode, just hide all buttons instantly
        if (fast) {
            buttonsToHide.forEach(button => {
                button.visible = false;
                button.alpha = 0;
                button.setActive(false);
            });
            this.isAnimating = false;
            return;
        }
        
        // Animate each button with staggered timing for exit
        buttonsToHide.forEach((button, index) => {
            // Calculate offscreen position based on button position
            const offscreenX = button.options.position === ButtonPosition.LEFT 
                ? button.position.x - this.OFFSCREEN_OFFSET 
                : button.position.x + this.OFFSCREEN_OFFSET;
                
            // Use shorter stagger delay
            const delay = index * 20; // ms
            this.pendingAnimations++;
            
            // Animation for this button exit
            const animateButtonOut = () => {
                // Animate button off-screen
                new Tween(button.position, Globals.sceneManager?.tweenGroup)
                    .to({ x: offscreenX }, hideDuration)
                    .easing(Easing.Cubic.In)
                    .delay(delay)
                    .start();
                
                // Fade out
                new Tween(button, Globals.sceneManager?.tweenGroup)
                    .to({ alpha: 0 }, hideDuration)
                    .easing(Easing.Quadratic.In)
                    .delay(delay)
                    .onComplete(() => {
                        button.visible = false;
                        button.setActive(false);
                        this.completeAnimation();
                    })
                    .start();
            };
            
            // Start animation immediately
            animateButtonOut();
        });
        
        // If no animations were started, mark as not animating
        if (this.pendingAnimations === 0) {
            this.isAnimating = false;
        }
    }
    
    /**
     * Position a button based on its type and configuration
     */
    private positionButton(button: GameButton): void {
        const isPortrait = window.innerWidth < window.innerHeight;
        const scaleFactor = isPortrait ? 0.8 : 1;
        
        // Apply scaling
        button.setOriginalScale(scaleFactor * appConfig.scaleFactor, scaleFactor * appConfig.scaleFactor);
        
        // Calculate positions for left and right sides
        // Adjusted to be more symmetric and ensure right buttons don't get cut off
        const leftX = isPortrait ? window.innerWidth * 0.30 : window.innerWidth * 0.38;
        const rightX = isPortrait ? window.innerWidth * 0.70 : window.innerWidth * 0.62;
        
        // Get list of buttons on each side
        const leftButtons = this.currentActiveButtons.filter(b => b.options.position === ButtonPosition.LEFT);
        const rightButtons = this.currentActiveButtons.filter(b => b.options.position === ButtonPosition.RIGHT);
        
        // Base Y position for vertical centering
        const baseY = window.innerHeight * 0.65;
        
        // Adjusted for better visibility and spacing
        const buttonHeight = 85 * appConfig.scaleFactor * scaleFactor; 
        const verticalSpacing = 25 * scaleFactor;
        
        let posX = button.options.position === ButtonPosition.LEFT ? leftX : rightX;
        let posY = baseY;
        
        // Calculate the button index for its side
        let buttonIndex = 0;
        let totalButtons = 0;
        
        if (button.options.position === ButtonPosition.LEFT) {
            buttonIndex = leftButtons.findIndex(b => b === button);
            if (buttonIndex === -1) buttonIndex = leftButtons.length;
            totalButtons = leftButtons.length;
        } else {
            buttonIndex = rightButtons.findIndex(b => b === button);
            if (buttonIndex === -1) buttonIndex = rightButtons.length;
            totalButtons = rightButtons.length;
        }
        
        // Calculate vertical positions with more balanced spacing
        if (totalButtons > 0) {
            const totalHeight = totalButtons * buttonHeight + (totalButtons - 1) * verticalSpacing;
            const startY = baseY - (totalHeight / 2);
            posY = startY + buttonIndex * (buttonHeight + verticalSpacing);
        }
        
        // Apply position
        button.position.set(posX, posY);
        
        // Ensure internal button content is properly aligned
        button.adjustPositions();
    }
    
    /**
     * Convenience methods for common button groups
     */
    showBettingButtons(): void {
        this.showButtonGroup('betting');
    }
    
    showGameplayButtons(): void {
        // If game is not started, don't show gameplay buttons
        if (!Globals.gameStarted) {
            console.log("Game is not started, not showing gameplay buttons");
            return;
        }
        
        this.showButtonGroup('gameplay');
    }
    
    showSplitEligibleButtons(): void {
        // Check if player has enough balance to double
        const canDoubleDown = Globals.balance >= Globals.currentBet;
        
        if (canDoubleDown) {
            this.showButtonGroup('splitEligible');
        } else {
            this.showButtonGroup('splitEligibleNoDouble');
        }
    }
    
    showInsuranceEligibleButtons(): void {
        console.log("Showing insurance eligible buttons");
        
        // Check if player has enough balance to double
        const canDoubleDown = Globals.balance >= Globals.currentBet;
        
        // Show the appropriate button group
        if (canDoubleDown) {
            this.showButtonGroup('insuranceEligible');
        } else {
            this.showButtonGroup('insuranceEligibleNoDouble');
        }
        
        // Log button state to help with debugging
        setTimeout(() => {
            console.log(`Insurance buttons shown: ${this.currentActiveButtons.length} buttons active`);
        }, 500);
    }
    
    showGameEndButtons(): void {
        // Check if game end buttons are already showing to prevent flickering
        const gameEndGroup = this.buttonGroups.get('gameEnd');
        if (gameEndGroup && this.currentActiveButtons.length > 0) {
            // Check if the exact same buttons are already showing
            // Use the appropriate property to get button types
            const currentTypes = this.currentActiveButtons.map(button => {
                // Find the button type by looking up the button in our buttons Map
                for (const [type, btn] of this.buttons.entries()) {
                    if (btn === button) return type;
                }
                return undefined;
            }).filter(type => type !== undefined);
            
            const endTypes = gameEndGroup.buttons;
            
            // If all current buttons match the game end buttons, no need to re-show
            if (currentTypes.length === endTypes.length && 
                currentTypes.every(type => endTypes.includes(type as GameButtonType))) {
                console.log("Game end buttons already showing, skipping redundant show call");
                return;
            }
        }
        
        // Otherwise show the game end buttons normally
        this.showButtonGroup('gameEnd');
    }
    
    showStartGameButtons(): void {
        this.showButtonGroup('startGame');
    }
    
    showGameplayAfter21Buttons(): void {
        this.showButtonGroup('gameplayafter21');
    }
    
    /**
     * Handle window resize
     */
    resize(): void {
        // Reposition all active buttons
        this.currentActiveButtons.forEach(button => {
            this.positionButton(button);
        });
    }
    
    /**
     * Cleanup method
     */
    public cleanup(): void {
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
    iconTexture?: Texture;     // Icon to display on the button
    buttonText?: string;       // Text to display on the button
    position?: ButtonPosition; // Which side the button appears from
}

export class GameButton extends Button {
    public icon?: Sprite;
    public text?: TextLabel;
    options: GameButtonOptions;
    
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
            
            // Position icon in center
            this.icon.position.set(0, 0);
            this.addChild(this.icon);
        }
        
        // Create and add text if provided
        if (options.buttonText) {
            // Improved text style for crisper rendering
            const fontSize = 12 * appConfig.scaleFactor;
            
            // Create TextLabel with improved parameters for crisper text
            this.text = new TextLabel(
                0,                          // x position
                0,                          // y position 
                0.5,                        // anchor
                options.buttonText,         // text content
                fontSize,                   // font size
                0xFFFFFF,                   // text color
                'Lato, Arial, sans-serif'   // font family
            );
            this.text.resolution = 2;
            // Apply simple style improvements that are likely to be supported
            if (this.text.style) {
                // Apply stroke for sharper edges (if supported)
              
                
                // Set text alignment
                this.text.style.align = 'center';
                
                // Add slight letter spacing
                try {
                    this.text.style.letterSpacing = 1;
                } catch (e) {
                    console.log("Letter spacing not supported");
                }
                
                // Make text bold if supported
                try {
                    this.text.style.fontWeight = 'bold';
                } catch (e) {
                    console.log("Font weight not supported");
                }
            }
            
            this.text.anchor.set(0.5, 0.5);
            
            // Position text in center
            this.text.position.set(0, 0);
            this.addChild(this.text);
        }
    }
    
    /**
     * Adjust positions of icon and text
     */
    public adjustPositions(): void {
        if (this.icon && this.text) {
            // Calculate the total width needed for icon and text with spacing
            const iconWidth = this.icon.width * this.icon.scale.x;
            const textWidth = this.text.width;
            const spacing = 15 * appConfig.scaleFactor; // Increased spacing between icon and text
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
     * Set original scale with adjustment for button
     */
    public setOriginalScale(x: number, y: number): void {
        this.scale.set(x, y);
        this.adjustPositions();
    }
}
