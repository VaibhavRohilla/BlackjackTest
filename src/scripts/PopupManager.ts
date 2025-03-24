import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { formatNumber, Globals } from "./globals";
import { Easing, Tween } from "@tweenjs/tween.js";
import { GameOutcome } from "./result";
import { TextLabel } from "./textlabel";
import { log } from "node:console";

// Z-index constants for proper layering
export const Z_INDEX = {
    BACKGROUND: 0,
    TABLE: 10,
    CARDS: 10,
    CHIPS: 20,
    POPUP_OVERLAY: 30,
    POPUPS: 40,
    BUTTONS: 50,
    SHOP: 60
};

/**
 * Manages popup messages with overlay
 */
export class PopupManager extends Container {
    /** Black overlay for background dimming */
    private overlay: Graphics;
    
    /** Container for popup sprites */
    private popupContainer: Container;
    
    /** Currently active popup sprite */
    private activePopup: Sprite | null = null;
    
    /** Shadow sprite for the popup */
    private popupShadow: Sprite | null = null;
    
    /** Whether a popup is currently showing */
    private isShowing: boolean = false;
    
    /** Pulse animation for active popup */
    private pulseAnimation: Tween<any> | null = null;
    
    /** Target scale for the popup */
    private targetPopupScale: number | null = null;
    
    /** Timeout ID for any scheduled hide operations */
    private hideTimeoutId: number | null = null;
    
    /** Whether the current popup is a game end popup (should persist) */
    private isGameEndPopup: boolean = false;

    private payoutText:  Container | null = null;
    
    /**
     * Create a new popup manager
     */
    constructor() {
        super();
        
        // Set z-index for the popup manager
        this.zIndex = Z_INDEX.POPUP_OVERLAY;
        
        // Enable sortable children to respect zIndex
        this.sortableChildren = true;
        
        // Create black overlay with transparency
        this.overlay = new Graphics();
        this.overlay.rect(0, 0, window.innerWidth, window.innerHeight);
        this.overlay.fill(0x000000);
        this.overlay.alpha = 0; // Start invisible
        this.overlay.interactive = true; // Make it interactive to block clicks
        this.overlay.zIndex = Z_INDEX.POPUP_OVERLAY;
        this.addChild(this.overlay);
        
        // Create container for popup sprites
        this.popupContainer = new Container();
        this.popupContainer.position.set(window.innerWidth / 2, window.innerHeight / 2);
        this.popupContainer.zIndex = Z_INDEX.POPUPS;
        this.popupContainer.sortableChildren = true;
        this.addChild(this.popupContainer);
        
        // Hide initially
        this.visible = false;
    }
    
    /**
     * Show a popup based on game outcome
     * @param outcome - The game outcome
     */
    showOutcomePopup(outcome: GameOutcome, payout: number): void {
        console.log(`Showing outcome popup for: ${outcome}`);
        
        let popupTexture;
        let tint = 0xFFFFFF; // Default white (no tint)
        console.log("outcome", outcome);
        
        // Mark as game end popup (should persist until user action)
        this.isGameEndPopup = true;
        
        // Select appropriate popup texture based on outcome
        switch (outcome) {
            case GameOutcome.PLAYER_BLACKJACK:
                popupTexture = Globals.resources.blackjackPopup;
                console.log("Selected blackjack popup");
                break;
            case GameOutcome.PLAYER_WIN:
            case GameOutcome.DEALER_BUST:
                popupTexture = Globals.resources.wonPopup;
                console.log("Selected won popup");
                break;
            case GameOutcome.PUSH:
                popupTexture = Globals.resources.pushPopup;
                console.log("Selected push popup");
                break;
            case GameOutcome.PLAYER_BUST:
                popupTexture = Globals.resources.burstPopup;
                console.log("Selected burst popup");
                break;
            case GameOutcome.DEALER_WIN:
                popupTexture = Globals.resources.loosePopup;
                console.log("Selected lost popup");
                break;
            case GameOutcome.SURRENDER:
                popupTexture = Globals.resources.surrenderPopup;
                console.log("Selected surrender popup");
                break;
            case GameOutcome.INSURANCE_WON:
                popupTexture = Globals.resources.insuranceWonPopup;
                console.log("Selected insurance won popup");
                // Insurance popups aren't end game popups, they're informational
                this.isGameEndPopup = false;
                break;
            case GameOutcome.INSURANCE_LOST:
                popupTexture = Globals.resources.insuranceLostPopup;
                console.log("Selected insurance lost popup");
                // Insurance popups aren't end game popups, they're informational
                this.isGameEndPopup = false;
                break;
            default:
                console.log(`No popup defined for outcome: ${outcome}`);
                return;
        }
        
        if (!popupTexture) {
            console.error(`Failed to load texture for outcome: ${outcome}`);
            return;
        }
        
        // Show the popup with the default white tint
        this.showPopup(popupTexture, tint);
        if(outcome === GameOutcome.PLAYER_WIN || outcome === GameOutcome.DEALER_BUST ) {
            this.addPayoutText(payout);
        }
    }
    
    addPayoutText(payout: number): void {
        console.log("Adding payout text", payout);
        
        // Create a container to hold both text elements
        const payoutContainer = new Container();
        payoutContainer.zIndex = 100;
        
        // Create separate text labels for amount and "Chips"
        const amountText = new TextLabel(0, 0, 0, formatNumber(payout), 80, 0xFFFFFF);
        const chipsText = new TextLabel(0, 0, 0, "Chips", 80, 0xFFFFFF);
        
        // Style both text elements
        amountText.style.fontWeight = "bold";
        chipsText.style.fontWeight = "bold";
        
        // Position the text elements side by side with a small gap
        payoutContainer.addChild(amountText);
        payoutContainer.addChild(chipsText);
        
        // Calculate positions after adding to container to get proper dimensions
        chipsText.position.set(amountText.width + 15, 0); // 15px gap between texts
        
        if(this.activePopup) {
            // Center the container in the popup
            payoutContainer.position.set(
                this.activePopup.width / 2 - payoutContainer.width ,
                this.activePopup.height - payoutContainer.height*2
            );
            this.activePopup.addChild(payoutContainer);
        }
        
        // Store reference to delete later
        this.payoutText = payoutContainer;
    }
    /**
     * Show an insurance outcome popup
     * @param insuranceWon Whether the insurance bet was won or lost
     */
    public showInsuranceResult(insuranceWon: boolean): void {
        // Call the general showInsurancePopup method with a boolean parameter
        this.showInsurancePopup(insuranceWon);
    }
    
    /**
     * Show a specific popup
     * @param texture - The texture to use for the popup
     * @param tint - Optional color tint for the popup
     */
    showPopup(texture: any, tint: number = 0xFFFFFF): void {
        console.log("showPopup called with texture:", texture ? "texture loaded" : "no texture");
        
        if (!texture) {
            console.error("Cannot show popup: texture is undefined");
            return;
        }
        
        // If already showing, hide current popup first
        if (this.isShowing) {
            console.log("Popup already showing, hiding first");
            this.hidePopup(() => {
                // Short delay to ensure clean transition
                setTimeout(() => {
                    this._showPopup(texture, tint);
                }, 50);
            });
        } else {
            console.log("No popup showing, displaying directly");
            this._showPopup(texture, tint);
        }
    }
    
    /**
     * Check if a popup is currently showing
     * @returns Whether a popup is currently showing
     */
    isPopupShowing(): boolean {
        return this.isShowing;
    }
    
    /**
     * Show a popup with the given texture
     * @param texture - The texture to use for the popup
     * @param tint - Color tint for the popup
     */
    private _showPopup(texture: any, tint: number): void {
        console.log("_showPopup internal method called");
        
        // If already showing, hide first
        if (this.isShowing) {
            console.log("Popup still showing in _showPopup, hiding first");
            this.hidePopup(() => {
                this._showPopup(texture, tint);
            });
            return;
        }
        
        if (!texture) {
            console.error("Cannot show popup: texture is undefined");
            return;
        }
        
        // Calculate base scale based on screen size - lower value for better appearance
        const baseScale = Math.min(window.innerWidth, window.innerHeight) * 0.00035;
        
        // Calculate shadow offset based on screen size
        const shadowOffsetX = Math.max(3, Math.min(window.innerWidth, window.innerHeight) * 0.003);
        const shadowOffsetY = shadowOffsetX;
        
        // Create shadow sprite first (so it appears behind the popup)
        this.popupShadow = new Sprite(texture);
        this.popupShadow.anchor.set(0.5);
        this.popupShadow.tint = 0x000000; // Black shadow
        this.popupShadow.alpha = 0; // Start invisible for fade-in
        this.popupShadow.scale.set(0); // Start at 0 for animation
        this.popupShadow.position.set(shadowOffsetX, shadowOffsetY); // Offset for shadow effect
        this.popupShadow.zIndex = 0; // Behind the popup
        this.popupContainer.addChild(this.popupShadow);
        
        // Create popup sprite
        this.activePopup = new Sprite(texture);
        this.activePopup.anchor.set(0.5);
        this.activePopup.tint = 0xFFFFFF; // Always use white (no tint)
        this.activePopup.alpha = 0; // Start invisible for fade-in
        this.activePopup.scale.set(0); // Start at 0 for animation
        this.activePopup.zIndex = 1; // In front of shadow
        this.popupContainer.addChild(this.activePopup);
        
        // Make visible
        this.visible = true;
        this.overlay.visible = true;
        this.isShowing = true;
        console.log("Popup now visible and showing");
        
        // Store the target scale for later use in animations
        this.targetPopupScale = baseScale;
        
        // Animation durations
        const fadeInDuration = 400;
        const scaleInDuration = 550;
        
        // Add click handler to overlay 
        this.overlay.interactive = true;
        this.overlay.removeAllListeners();
        
        // For game end popups, don't allow overlay clicks to dismiss
        if (!this.isGameEndPopup) {
            this.overlay.on('pointerdown', () => {
                console.log("Overlay clicked, hiding popup");
                this.hidePopup();
            });
        }
        
        // Animate overlay fade in smoothly
        new Tween(this.overlay, Globals.sceneManager?.tweenGroup)
            .to({ alpha: 0.7 }, fadeInDuration)
            .easing(Easing.Cubic.Out) // Smoother fade in
            .start();
        
        // Animate the shadow with a slight delay
        if (this.popupShadow) {
            // Fade in the shadow
            new Tween(this.popupShadow, Globals.sceneManager?.tweenGroup)
                .to({ alpha: 0.4 }, fadeInDuration)
                .easing(Easing.Cubic.Out)
                .start();
            
            // Scale in the shadow
            new Tween(this.popupShadow.scale, Globals.sceneManager?.tweenGroup)
                .to({ x: baseScale * 1.03, y: baseScale * 1.03 }, scaleInDuration)
                .easing(Easing.Back.Out) // Smoother entrance with slight overshoot
                .start();
        }
        
        // Animate the popup with a smooth entrance
        if (this.activePopup) {
            // Fade in the popup
            new Tween(this.activePopup, Globals.sceneManager?.tweenGroup)
                .to({ alpha: 1 }, fadeInDuration)
                .easing(Easing.Cubic.Out)
                .start();
            
            // Scale in the popup with a slight overshoot
            new Tween(this.activePopup.scale, Globals.sceneManager?.tweenGroup)
                .to({ x: baseScale, y: baseScale }, scaleInDuration)
                .onUpdate(() => {
                    if(this.payoutText && this.activePopup) {
                        this.payoutText.position.set(this.activePopup.width *0.1 - this.payoutText.width *0.5, this.activePopup.height - this.payoutText.height*0.7);
                    }
                })
                .easing(Easing.Back.Out) // Smoother entrance with slight overshoot
                .onComplete(() => {
                    // Start pulsing animation immediately after the entrance animation
                    this.animatePopupPulse();
                    
                    // For non-end game popups, schedule automatic hide after delay
                    if (!this.isGameEndPopup) {
                        this.scheduleHideAfterDelay(3000);
                    }
                })
                .start();
        }
    }
    
    /**
     * Create a subtle pulsing animation for the popup
     */
    private animatePopupPulse(): void {
        if (!this.activePopup || !this.popupShadow) return;
        
        // Stop any existing pulse animation
        if (this.pulseAnimation) {
            this.pulseAnimation.stop();
            this.pulseAnimation = null;
        }
        
        // Use the stored target scale from _showPopup
        const baseScale = this.targetPopupScale || Math.min(window.innerWidth, window.innerHeight) * 0.00035;
        
        // Define pulse parameters - more subtle values
        const minPulseScale = 0.98;  // Minimum scale during pulse (98% of base)
        const maxPulseScale = 1.02;  // Maximum scale during pulse (102% of base)
        const pulseDuration = 2000;  // Full cycle duration for smoother effect
        
        // Create pulse animation object
        const pulseScale = { value: 1.0 }; // Start at 100% of base scale
        
        // Create a continuous pulse animation using a chain of tweens
        // This creates a seamless loop between min and max values
        const createContinuousPulse = () => {
            // First tween: from current value to max
            const tweenUp = new Tween(pulseScale, Globals.sceneManager?.tweenGroup)
                .to({ value: maxPulseScale }, pulseDuration / 2)
                .easing(Easing.Sinusoidal.InOut)
                .onUpdate(() => {
                    this.updatePulseScale(baseScale, pulseScale.value);
                });
                
            // Second tween: from max to min
            const tweenDown = new Tween(pulseScale, Globals.sceneManager?.tweenGroup)
                .to({ value: minPulseScale }, pulseDuration / 2)
                .easing(Easing.Sinusoidal.InOut)
                .onUpdate(() => {
                    this.updatePulseScale(baseScale, pulseScale.value);
                });
                
            // Third tween: from min back to starting value (1.0)
            // This completes the cycle and ensures we always return to the base value
            const tweenReset = new Tween(pulseScale, Globals.sceneManager?.tweenGroup)
                .to({ value: 1.0 }, pulseDuration / 2)
                .easing(Easing.Sinusoidal.InOut)
                .onUpdate(() => {
                    this.updatePulseScale(baseScale, pulseScale.value);
                });
            
            // Chain the tweens to create a continuous cycle
            tweenUp.chain(tweenDown);
            tweenDown.chain(tweenReset);
            tweenReset.chain(tweenUp);
            
            // Start the cycle
            tweenUp.start();
            
            // Store reference to the first tween for potential cancellation
            return tweenUp;
        };
        
        // Start the continuous pulse animation
        this.pulseAnimation = createContinuousPulse();
    }
    
    /**
     * Update the scale of the popup and shadow during pulse animation
     * @param baseScale - The base scale of the popup
     * @param scaleValue - The current pulse scale value
     */
    private updatePulseScale(baseScale: number, scaleValue: number): void {
        if (this.activePopup) {
            this.activePopup.scale.set(baseScale * scaleValue);
            
            // Make shadow follow with slightly larger scale
            if (this.popupShadow) {
                this.popupShadow.scale.set(baseScale * scaleValue * 1.03);
            }
        }
    }
    
    /**
     * Hide the current popup
     * @param callback - Optional callback when hiding is complete
     */
    hidePopup(callback?: () => void): void {
        console.log("hidePopup called, isShowing:", this.isShowing, "activePopup:", this.activePopup ? "exists" : "null");
        
        if (!this.isShowing || !this.activePopup) {
            console.log("No popup to hide, calling callback directly");
            if (callback) callback();
            return;
        }
        
        console.log("Hiding popup with animation");
        
        // Stop pulse animation if running
        if (this.pulseAnimation) {
            this.pulseAnimation.stop();
            this.pulseAnimation = null;
            this.activePopup?.removeChildren();
        }
        
        // Animation duration for hiding
        const fadeOutDuration = 350;
        const scaleOutDuration = 400;
        
        // First, slightly scale up the popup for a smoother transition
        if (this.activePopup) {
            // Get current scale
            const currentScale = this.activePopup.scale.x;
            
            // First slightly scale up
            new Tween(this.activePopup.scale, Globals.sceneManager?.tweenGroup)
                .to({ x: currentScale * 1.05, y: currentScale * 1.05 }, 120)
                .easing(Easing.Quadratic.Out)
                .onComplete(() => {
                    // Then scale down to zero
                    new Tween(this.activePopup!.scale, Globals.sceneManager?.tweenGroup)
                        .to({ x: 0, y: 0 }, scaleOutDuration)
                        .easing(Easing.Quadratic.In) // Smoother scale down
                        .start();
                    
                    // Add a slight fade out as well
                    new Tween(this.activePopup!, Globals.sceneManager?.tweenGroup)
                        .to({ alpha: 0 }, scaleOutDuration)
                        .easing(Easing.Quadratic.In)
                        .start();
                    
                    // Add a very subtle rotation
                    new Tween(this.activePopup!, Globals.sceneManager?.tweenGroup)
                        .to({ rotation: Math.PI * 0.1 }, scaleOutDuration) // Just a slight rotation
                        .easing(Easing.Quadratic.In)
                        .start();
                })
                .start();
        }
        
        // Animate overlay fade out
        new Tween(this.overlay, Globals.sceneManager?.tweenGroup)
            .to({ alpha: 0 }, fadeOutDuration)
            .easing(Easing.Quadratic.Out) // Smoother fade out
            .start();
        
        // Also animate the shadow with the same pattern
        if (this.popupShadow) {
            // Get current scale
            const currentShadowScale = this.popupShadow.scale.x;
            
            // First slightly scale up
            new Tween(this.popupShadow.scale, Globals.sceneManager?.tweenGroup)
                .to({ x: currentShadowScale * 1.05, y: currentShadowScale * 1.05 }, 120)
                .easing(Easing.Quadratic.Out)
                .onComplete(() => {
                    // Then scale down to zero
                    new Tween(this.popupShadow!.scale, Globals.sceneManager?.tweenGroup)
                        .to({ x: 0, y: 0 }, scaleOutDuration)
                        .easing(Easing.Quadratic.In)
                        .start();
                    
                    // Add a slight fade out as well
                    new Tween(this.popupShadow!, Globals.sceneManager?.tweenGroup)
                        .to({ alpha: 0 }, scaleOutDuration)
                        .easing(Easing.Quadratic.In)
                        .onComplete(() => {
                            // Clean up after all animations complete
                            setTimeout(() => {
                                this.cleanupPopup(callback);
                            }, 50); // Small delay to ensure animations are complete
                        })
                        .start();
                })
                .start();
        } else if (this.activePopup) {
            // If no shadow, complete on the popup animation
            new Tween(this.activePopup, Globals.sceneManager?.tweenGroup)
                .to({ alpha: 0 }, scaleOutDuration)
                .easing(Easing.Quadratic.In)
                .onComplete(() => {
                    // Clean up after all animations complete
                    setTimeout(() => {
                        this.cleanupPopup(callback);
                    }, 50); // Small delay to ensure animations are complete
                })
                .start();
        }
    }
    
    /**
     * Clean up popup resources after hiding
     * @param callback - Optional callback to execute after cleanup
     */
    private cleanupPopup(callback?: () => void): void {
        // Remove popup shadow if it exists
        if (this.popupShadow) {
            this.popupContainer.removeChild(this.popupShadow);
            this.popupShadow.destroy({children: true});
            this.popupShadow = null;
        }
        
        // Remove active popup if it exists
        if (this.activePopup) {
            // Remove payout text first if it exists
            if (this.payoutText) {
                if (this.payoutText instanceof Container) {
                    // If it's a container, remove all its children properly
                    while (this.payoutText.children.length > 0) {
                        const child = this.payoutText.children[0];
                        this.payoutText.removeChild(child);
                        if (child instanceof TextLabel) {
                            child.destroy();
                        }
                    }
                }
                
                // Now remove the payoutText from its parent
                if (this.payoutText.parent) {
                    this.payoutText.parent.removeChild(this.payoutText);
                }
                
                this.payoutText.destroy({children: true});
                this.payoutText = null;
            }
            
            this.popupContainer.removeChild(this.activePopup);
            this.activePopup.destroy({children: true});
            this.activePopup = null;
        }
        
        // Hide the overlay
        this.overlay.visible = false;
        
        // Reset state
        this.isShowing = false;
        this.isGameEndPopup = false;
        
        // Execute callback if provided
        if (callback) {
            callback();
        }
    }
    
    /**
     * Resize the popup manager
     */
    resize(): void {
        // Resize overlay to cover the entire screen
        this.overlay.clear();
        this.overlay.rect(0, 0, window.innerWidth, window.innerHeight);
        this.overlay.fill(0x000000);
        
        // Maintain current alpha
        const currentAlpha = this.overlay.alpha;
        this.overlay.alpha = currentAlpha;
        
        // Center popup container
        if(window.innerWidth < window.innerHeight){
            this.popupContainer.position.set(window.innerWidth / 2, window.innerHeight / 2 );
        }else{
            this.popupContainer.position.set(window.innerWidth / 2, window.innerHeight *0.4);
        }
        
        // Resize active popup if present
        if (this.activePopup) {
            // Calculate new base scale based on current screen size - lower value
            const baseScale = Math.min(window.innerWidth, window.innerHeight) * 0.0004;
            this.targetPopupScale = baseScale;
            
            // Update popup scale
            this.activePopup.scale.set(baseScale);
            
            // Also resize shadow if present
            if (this.popupShadow) {
                // Calculate shadow offset based on screen size
                const shadowOffsetX = Math.max(3, Math.min(window.innerWidth, window.innerHeight) * 0.003);
                const shadowOffsetY = shadowOffsetX;
                
                // Update shadow scale and position
                this.popupShadow.scale.set(baseScale * 1.05);
                this.popupShadow.position.set(shadowOffsetX, shadowOffsetY);
            }
        }
    }

    /**
     * Schedule a popup to hide after a delay, then execute a callback
     * @param delay - The delay in milliseconds
     * @param callback - Function to call after hiding the popup
     */
    scheduleHideAfterDelay(delay: number, callback?: () => void): void {
        // Don't auto-hide game end popups
        if (this.isGameEndPopup) {
            console.log("Not scheduling hide for game end popup");
            return;
        }
        
        // Cancel any existing timeout
        if (this.hideTimeoutId !== null) {
            clearTimeout(this.hideTimeoutId);
            this.hideTimeoutId = null;
        }
        
        // If no popup is showing and there's a callback, just execute it
        if (!this.isShowing && callback) {
            callback();
            return;
        }
        
        // Schedule the hide operation
        this.hideTimeoutId = window.setTimeout(() => {
            this.hideTimeoutId = null;
            
            // Hide the popup and call the callback when done
            this.hidePopup(() => {
                if (callback) {
                    callback();
                }
            });
        }, delay);
    }
    
    /**
     * Clean up resources on destroy
     */
    destroy(options?: any): void {
        // Clear any pending timeout
        if (this.hideTimeoutId !== null) {
            clearTimeout(this.hideTimeoutId);
            this.hideTimeoutId = null;
        }
        
        // Clean up existing popups
        this.cleanupPopup();
        
        // Call parent destroy
        super.destroy(options);
    }

    /**
     * Show insurance popup with dealer's face-up card
     * @param dealerCard - The dealer's face-up card or true to show insurance won popup
     * @param insuranceAmount - The amount of insurance bet
     * @param onYesCallback - Callback for yes response
     * @param onNoCallback - Callback for no response
     */
    public showInsurancePopup(
        dealerCard: any | boolean,
        insuranceAmount?: number,
        onYesCallback?: () => void,
        onNoCallback?: () => void
    ): void {
        // If dealerCard is a boolean, it's being used to show insurance result popup
        if (typeof dealerCard === 'boolean') {
            const insuranceWon = dealerCard;
            // Show insurance outcome popup
            if (insuranceWon) {
                if (Globals.resources.insuranceWonPopup) {
                    this.showPopup(Globals.resources.insuranceWonPopup);
                } else {
                    // Fallback if specific texture not available
                    this.showGenericPopup("Insurance Paid", "You win 2:1 on your insurance bet.");
                }
            } else {
                if (Globals.resources.insuranceLostPopup) {
                    this.showPopup(Globals.resources.insuranceLostPopup);
                } else {
                    // Fallback if specific texture not available
                    this.showGenericPopup("Insurance Lost", "Dealer doesn't have blackjack.");
                }
            }
            return;
        }
        
        // Otherwise, it's the initial insurance offer popup
        let texture: Texture;
        if (Globals.resources.insurancePopup) {
            texture = Globals.resources.insurancePopup;
        } else {
            console.error("Insurance popup texture not found");
            // Create fallback texture - using a white texture as a basic fallback
            texture = Texture.WHITE;
        }
        
        // Show the popup
        this.showPopup(texture);
        
        // Add yes/no buttons
        if (onYesCallback || onNoCallback) {
            // Add buttons with callbacks after a short delay
            setTimeout(() => {
                // Implementation would add yes/no buttons with the callbacks
                if (onYesCallback) onYesCallback();
                if (onNoCallback) onNoCallback();
            }, 200);
        }
    }

    /**
     * Show a generic popup with title and message
     * @param title The title of the popup
     * @param message The message to display
     */
    public showGenericPopup(title: string, message: string): void {
        // Create a generic popup with the title and message
        // Implementation would create a basic popup with text
        console.log(`Generic popup: ${title} - ${message}`);
        
        // In a real implementation, this would create visual elements
        // For now, just show a message in the console
    }
} 