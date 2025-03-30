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
    PLAYON = 'place_bet',
    DOUBLE = 'double',
    SPLIT = 'split',
    SURRENDER = 'surrender',
    INSURANCE = 'insurance',
    PLAY = 'play',
    REBET = 'rebet'
}

export function getButtonType(action: string[]): GameButtonType[] {
    const buttonTypes = action.map(action => {
        switch(action) {
            case 'hit': return GameButtonType.HIT;
            case 'stand': return GameButtonType.STAND;
            case 'double_down': return GameButtonType.DOUBLE;
            case 'surrender': return GameButtonType.SURRENDER;
            case 'split': return GameButtonType.SPLIT;
            case 'insurance': return GameButtonType.INSURANCE;
            case 'place_bet': return GameButtonType.PLAYON;
            case 'rebet': return GameButtonType.REBET;
            default: 
                console.warn(`Unknown action type: ${action}`);
                return null;
        }
    }).filter(type => type !== null) as GameButtonType[];

    return buttonTypes;
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

/**
 * Enhance GameButtonContainer to better coordinate with GameManager
 * - Improved button show/hide coordination
 * - Better handling of race conditions
 * - More robust button management
 * - Enhanced state tracking
 */
export class GameButtonContainer extends Container {
    // Active buttons currently displayed
    private currentActiveButtons: GameButton[] = [];
    // Map of all available buttons
    private buttons: Map<GameButtonType, GameButton> = new Map();
    // Animation settings - updated for smoother animation
    private readonly ANIMATION_DURATION = 350; // ms 
    private readonly STAGGER_DELAY = 60; // ms between button animations
    private readonly OFFSCREEN_OFFSET = 250; // pixels to move offscreen
    
    // Improved state tracking
    private isAnimating: boolean = false;
    private pendingAnimations: number = 0;
    private buttonStateVersion: number = 0;
    private currentOperationId: number = 0;
    private animationTimeout: any = null;
    public toShowButtons: GameButtonType[] = [];
    
    // Stored values for reuse
    private _buttonsScale: number = 0;
    private _buttonsWidth: number = 0;
    private _screenWidth: number = 0;
    private _screenHeight: number = 0;
    
    // Internal state trackers for showing/hiding buttons
    private _showButtonsInProgress: boolean = false;
    private _hideButtonsInProgress: boolean = false;
    
    // Store animation tweens so they can be cancelled
    private _activeTweens: any[] = [];
    
    constructor() {
        super();
        
        // Initialize button configurations
        this.initializeButtonConfigs();
        
        // Hide all buttons initially
        this.hideAllButtons();
        
        console.log("GameButtonContainer initialized");
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
     * Get the count of currently active buttons
     * @returns The number of active buttons
     */
    getActiveButtonCount(): number {
        return this.currentActiveButtons.length;
    }
    
    /**
     * Check if a specific button is currently visible
     * @param buttonType The button type to check
     * @returns True if the button is currently displayed
     */
    public isButtonVisible(buttonType: GameButtonType): boolean {
        const button = this.buttons.get(buttonType);
        return button ? button.visible : false;
    }
    
    /**
     * Get current button state for debugging
     * @returns Object containing state information
     */
    public getButtonState(): any {
        return {
            isAnimating: this.isAnimating,
            pendingAnimations: this.pendingAnimations,
            activeButtons: this.currentActiveButtons.map(b => 
                this.getButtonTypeByInstance(b)).filter(Boolean),
            stateVersion: this.buttonStateVersion
        };
    }
    
    /**
     * Get button type by button instance (for debugging)
     */
    private getButtonTypeByInstance(button: GameButton): GameButtonType | null {
        for (const [type, btn] of this.buttons.entries()) {
            if (btn === button) return type;
        }
        return null;
    }
    
    /**
     * Show a specific button with animation safely
     * @param buttonType The button to show
     * @param immediate If true, show instantly without animation
     */
    showButton(buttonType: GameButtonType, immediate: boolean = false): boolean {
        console.log(`Showing button: ${buttonType}`);
        const button = this.buttons.get(buttonType);
        if (!button) {
            console.warn(`Button ${buttonType} not found`);
            return false;
        }
        
        // If button is already visible and active, do nothing
        if (button.visible && button.alpha > 0.9 && 
            this.currentActiveButtons.includes(button)) {
            console.log(`Button ${buttonType} already visible, skipping`);
            return true;
        }
        
        // Position button first (to get final position)
        this.positionButton(button);
        
        // If immediate mode, skip animation
        if (immediate) {
            button.visible = true;
            button.alpha = 1;
            button.setActive(true);
            
            // If not already in active buttons list
            if (!this.currentActiveButtons.includes(button)) {
                this.currentActiveButtons.push(button);
            }
            
            return true;
        }
        
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
        this.pendingAnimations++;
        this.buttonStateVersion++;
        
        // Animate button into position
        new Tween(button.position, Globals.sceneManager!.tweenGroup)
            .to({ x: finalPosition.x }, this.ANIMATION_DURATION)
            .easing(Easing.Quadratic.InOut)
            .start();
            
        // Fade in
        new Tween(button, Globals.sceneManager!.tweenGroup)
            .to({ alpha: 1 }, this.ANIMATION_DURATION)
            .easing(Easing.Quadratic.Out)
            .onComplete(() => {
                this.pendingAnimations--;
                if (this.pendingAnimations <= 0) {
                    this.isAnimating = false;
                }
            })
            .start();
        
        button.setActive(true);
        if (!this.currentActiveButtons.includes(button)) {
            this.currentActiveButtons.push(button);
        }
        
        return true;
    }
    
    /**
     * Hide all active buttons with animation
     * @param immediate Whether to use a faster animation (for immediate transitions)
     * @param onComplete Callback to run when all buttons are hidden
     */
    hideAllButtons(immediate: boolean = false, onComplete?: () => void): void {
        // Early return if no buttons to hide
        if (this.currentActiveButtons.length === 0) {
            this.isAnimating = false;
            if (onComplete) onComplete();
            return;
        }
        
        console.log(`Hiding all buttons (${this.currentActiveButtons.length})${immediate ? ' immediately' : ''}`);
        
        // Use faster animation duration when requested
        const hideDuration = immediate ? 0 : 200;
        
        // Create a copy of current buttons to avoid modifying while iterating
        const buttonsToHide = [...this.currentActiveButtons];
        this.currentActiveButtons = [];
        this.buttonStateVersion++;
        
        // If immediate mode, just hide all buttons instantly
        if (immediate) {
            buttonsToHide.forEach(button => {
                button.visible = false;
                button.alpha = 0;
                button.setActive(false);
            });
            this.isAnimating = false;
            if (onComplete) onComplete();
            return;
        }
        
        // Mark as animating
        this.isAnimating = true;
        this.pendingAnimations = buttonsToHide.length;
        
        // Animate each button with staggered timing for exit
        buttonsToHide.forEach((button, index) => {
            // Calculate offscreen position based on button position
            const offscreenX = button.options.position === ButtonPosition.LEFT 
                ? button.position.x - this.OFFSCREEN_OFFSET 
                : button.position.x + this.OFFSCREEN_OFFSET;
                
            // Use shorter stagger delay for exit
            const delay = index * 20; // ms
            
            // Animation for this button exit
            const animateButtonOut = () => {
                // Animate button off-screen
                new Tween(button.position, Globals.sceneManager!.tweenGroup)
                    .to({ x: offscreenX }, hideDuration)
                    .easing(Easing.Cubic.In)
                    .delay(delay)
                    .start();
                
                // Fade out
                new Tween(button, Globals.sceneManager!.tweenGroup)
                    .to({ alpha: 0 }, hideDuration)
                    .easing(Easing.Quadratic.In)
                    .delay(delay)
                    .onComplete(() => {
                        button.visible = false;
                        button.setActive(false);
                        this.pendingAnimations--;
                        if (this.pendingAnimations <= 0) {
                            this.isAnimating = false;
                            if (onComplete) onComplete();
                        }
                    })
                    .start();
            };
            
            // Start animation immediately
            animateButtonOut();
        });
        
        // Safety timeout to ensure callback is always executed
        if (onComplete) {
            setTimeout(() => {
                if (this.pendingAnimations > 0) {
                    console.warn("Button hide animations did not complete in time, forcing completion");
                    this.pendingAnimations = 0;
                    this.isAnimating = false;
                    onComplete();
                }
            }, hideDuration + 300);
        }
    }
    
    /**
     * Position a button based on its type and the current active buttons
     */
    private positionButton(button: GameButton): void {
        const isPortrait = window.innerWidth < window.innerHeight;
        const scaleFactor = isPortrait ? 0.8 : 1;
        
        // Apply scaling
        button.setOriginalScale(scaleFactor * appConfig.scaleFactor, scaleFactor * appConfig.scaleFactor);
        
        // Calculate positions for left and right sides (adjusted to be more symmetric)
        const leftX = isPortrait ? window.innerWidth * 0.30 : window.innerWidth * 0.38;
        const rightX = isPortrait ? window.innerWidth * 0.70 : window.innerWidth * 0.62;
        
        // Get list of buttons on each side
        const leftButtons = this.currentActiveButtons.filter(b => 
            b.visible && b.options.position === ButtonPosition.LEFT);
        const rightButtons = this.currentActiveButtons.filter(b => 
            b.visible && b.options.position === ButtonPosition.RIGHT);
        
        // Fixed starting Y position for the first button
        const startY = 650 * appConfig.scaleFactor;
        
        // Button dimensions and spacing
        const buttonHeight = 85 * appConfig.scaleFactor * scaleFactor; 
        const verticalSpacing = 5 * scaleFactor;
        
        let posX = button.options.position === ButtonPosition.LEFT ? leftX : rightX;
        let posY = startY;
        
        // Calculate the button index for its side
        let buttonIndex = 0;
        
        if (button.options.position === ButtonPosition.LEFT) {
            buttonIndex = leftButtons.findIndex(b => b === button);
            if (buttonIndex === -1) buttonIndex = leftButtons.length;
        } else {
            buttonIndex = rightButtons.findIndex(b => b === button);
            if (buttonIndex === -1) buttonIndex = rightButtons.length;
        }
        
        // Position each button below the previous one
        posY = startY + (buttonIndex * (buttonHeight + verticalSpacing));
        
        // Apply position
        button.position.set(posX, posY);
        
        // Ensure internal button content is properly aligned
        button.adjustPositions();
    }
    
    /**
     * Shows specific buttons based on provided button names
     * @param buttonNames Array of button names to show
     * @param immediate Whether to show buttons immediately without animation
     * @param preventDuplicates Whether to check if buttons are already shown
     * @returns boolean indicating if all buttons were shown successfully
     */
    public showSpecificButtons(buttonNames: GameButtonType[], immediate: boolean = false): void {
        console.log(`Showing specific buttons:`, buttonNames);

        // Cancel any ongoing animations first
        this.cancelAllButtonAnimations();

        // Hide all current buttons instantly
        this.hideAllButtons(true);

        // If no buttons to show, we're done
        if (buttonNames.length === 0) {
            return;
        }

        // Mark as animating
        this.isAnimating = true;
        this.pendingAnimations = 0;
        this.buttonStateVersion++;

        // Pre-position all buttons first
        const buttonsToShow: GameButton[] = [];
        buttonNames.forEach(buttonType => {
            const button = this.buttons.get(buttonType);
            if (button) {
                buttonsToShow.push(button);
                button.visible = true;
                button.alpha = 0;
                if (!this.currentActiveButtons.includes(button)) {
                    this.currentActiveButtons.push(button);
                }
            }
        });

        // Position all buttons
        buttonsToShow.forEach(button => {
            this.positionButton(button);
        });

        // If immediate mode, show all buttons instantly
        if (immediate) {
            buttonsToShow.forEach(button => {
                button.visible = true;
                button.alpha = 1;
                button.setActive(true);
            });
            this.isAnimating = false;
            return;
        }

        // Animate each button with minimal stagger
        buttonsToShow.forEach((button, index) => {
            const finalPosition = {
                x: button.position.x,
                y: button.position.y
            };

            // Move button off-screen based on its position
            const offscreenX = button.options.position === ButtonPosition.LEFT 
                ? finalPosition.x - 100  // Reduced offset for faster animation
                : finalPosition.x + 100;

            button.position.set(offscreenX, finalPosition.y);

            // Shorter delay between buttons
            const delay = index * 30; // Reduced delay
            this.pendingAnimations++;

            // Create and store tweens
            const positionTween = new Tween(button.position, Globals.sceneManager!.tweenGroup)
                .to({ x: finalPosition.x }, 200) // Faster animation
                .easing(Easing.Quadratic.Out)
                .delay(delay)
                .onStart(() => {
                    button.visible = true;
                })
                .start();

            const alphaTween = new Tween(button, Globals.sceneManager!.tweenGroup)
                .to({ alpha: 1 }, 200) // Faster animation
                .easing(Easing.Quadratic.Out)
                .delay(delay)
                .onComplete(() => {
                    button.setActive(true);
                    this.pendingAnimations--;
                    if (this.pendingAnimations <= 0) {
                        this.isAnimating = false;
                    }
                })
                .start();

            // Store tweens for potential cancellation
            this._activeTweens.push(positionTween, alphaTween);
        });

        // Failsafe: ensure animation state is cleared after max possible time
        setTimeout(() => {
            if (this.isAnimating) {
                console.log("Forcing animation completion");
                this.isAnimating = false;
                this.pendingAnimations = 0;
                
                // Ensure all buttons are visible
                buttonsToShow.forEach(button => {
                    button.alpha = 1;
                    button.visible = true;
                    button.setActive(true);
                    button.position.x = button.position.x; // Reset to final position
                });
            }
        }, 500); // Short timeout
    }

    /**
     * Check if any gameplay buttons are currently visible
     * @returns True if any buttons are visible
     */
    areAnyButtonsVisible(): boolean {
        // Check if we have any visible buttons - buttons is Map<GameButtonType, GameButton>
        for (const [_, button] of this.buttons) {
            if (button.visible) {
                return true;
            }
        }
        return false;
    }

    /**
     * Force show the stand button in any situation, particularly useful for split hands with value 21
     * This method will always show the stand button even if other operations are in progress
     */
    public universalShowStandButton(): void {
        // Find the stand button
        const standButton = this.getButton(GameButtonType.STAND);
        if (!standButton) {
            console.warn("Stand button not found");
            return;
        }
        
        console.log("Universal display of stand button - will override any current state");
        
        // First position the button
        standButton.visible = true;
        standButton.alpha = 1;
        standButton.setActive(true);
        this.positionButton(standButton);
        
        // Make sure it's in the active buttons list
        if (!this.currentActiveButtons.includes(standButton)) {
            this.currentActiveButtons.push(standButton);
        }
        
        // Hide all other buttons (except stand)
        Array.from(this.buttons.entries()).forEach(([type, button]) => {
            if (type !== GameButtonType.STAND && button.visible) {
                button.visible = false;
                button.alpha = 0;
                button.setActive(false);
                
                // Remove from active buttons list
                const index = this.currentActiveButtons.indexOf(button);
                if (index !== -1) {
                    this.currentActiveButtons.splice(index, 1);
                }
            }
        });
    }

    /**
     * Cancel all active button animations
     */
     cancelAllButtonAnimations(): void {
        // Stop all active tweens
        if (this._activeTweens.length > 0) {
            this._activeTweens.forEach(tween => {
                if (tween) {
                    tween.stop();
                }
            });
            this._activeTweens = [];
        }

        // Reset animation flags
        this.isAnimating = false;
        this.pendingAnimations = 0;
        
        // Ensure all current buttons are in their final state
        this.currentActiveButtons.forEach(button => {
            button.alpha = 1;
            button.visible = true;
            button.setActive(true);
        });
    }

    /**
     * Get all currently visible buttons
     * @returns Array of GameButtonType that are currently visible
     */
    public getVisibleButtons(): GameButtonType[] {
        return Array.from(this.buttons.entries())
            .filter(([_, btn]) => btn.visible)
            .map(([type]) => type);
    }

    /**
     * Get a button by type
     */
    public getButton(type: GameButtonType): GameButton | undefined {
        return this.buttons.get(type);
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

