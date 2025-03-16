import { Container, Graphics, Sprite } from "pixi.js";
import { Globals } from "./Globals";
import { Easing, Tween } from "@tweenjs/tween.js";
import { GameOutcome } from "./BlackjackDealer";
import { config } from "./appConfig";

// Z-index constants for proper layering
export const Z_INDEX = {
    BACKGROUND: 0,
    TABLE: 10,
    CARDS: 10,
    CHIPS: 20,
    POPUP_OVERLAY: 30,
    POPUPS: 40,
    BUTTONS: 50
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
    showOutcomePopup(outcome: GameOutcome): void {
        console.log(`Showing outcome popup for: ${outcome}`);
        
        let popupTexture;
        let tint = 0xFFFFFF; // Default white (no tint)
        
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
                popupTexture = Globals.resources.LoosePopup;
                console.log("Selected lost popup");
                break;
            case GameOutcome.SURRENDER:
                popupTexture = Globals.resources.surrenderPopup;
                console.log("Selected surrender popup");
                break;
            case GameOutcome.INSURANCE_WON:
                popupTexture = Globals.resources.insuranceWonPopup;
                console.log("Selected insurance won popup");
                break;
            case GameOutcome.INSURANCE_LOST:
                popupTexture = Globals.resources.insuranceLostPopup;
                console.log("Selected insurance lost popup");
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
    }
    
    /**
     * Show insurance popup based on outcome
     * @param won - Whether the insurance bet was won
     */
    showInsurancePopup(won: boolean): void {
        console.log(`Showing insurance popup, won: ${won}`);
        
        if (won) {
            // Show insurance won popup with default tint
            this.showPopup(Globals.resources.insuranceWonPopup);
        } else {
            // Show insurance lost popup with default tint
            this.showPopup(Globals.resources.insuranceLostPopup);
        }
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
        this.isShowing = true;
        console.log("Popup now visible and showing");
        
        // Store the target scale for later use in animations
        this.targetPopupScale = baseScale;
        
        // Animation durations
        const fadeInDuration = 400;
        const scaleInDuration = 550;
        
        // Animate overlay fade in smoothly
        new Tween(this.overlay, Globals.SceneManager?.tweenGroup)
            .to({ alpha: 0.7 }, fadeInDuration)
            .easing(Easing.Cubic.Out) // Smoother fade in
            .start();
        
        // Animate the shadow with a slight delay
        if (this.popupShadow) {
            // Fade in the shadow
            new Tween(this.popupShadow, Globals.SceneManager?.tweenGroup)
                .to({ alpha: 0.4 }, fadeInDuration)
                .easing(Easing.Cubic.Out)
                .start();
            
            // Scale in the shadow
            new Tween(this.popupShadow.scale, Globals.SceneManager?.tweenGroup)
                .to({ x: baseScale * 1.03, y: baseScale * 1.03 }, scaleInDuration)
                .easing(Easing.Back.Out) // Smoother entrance with slight overshoot
                .start();
        }
        
        // Animate the popup with a smooth entrance
        if (this.activePopup) {
            // Fade in the popup
            new Tween(this.activePopup, Globals.SceneManager?.tweenGroup)
                .to({ alpha: 1 }, fadeInDuration)
                .easing(Easing.Cubic.Out)
                .start();
            
            // Scale in the popup with a slight overshoot
            new Tween(this.activePopup.scale, Globals.SceneManager?.tweenGroup)
                .to({ x: baseScale, y: baseScale }, scaleInDuration)
                .easing(Easing.Back.Out) // Smoother entrance with slight overshoot
                .onComplete(() => {
                    // Start pulsing animation immediately after the entrance animation
                    this.animatePopupPulse();
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
            const tweenUp = new Tween(pulseScale, Globals.SceneManager?.tweenGroup)
                .to({ value: maxPulseScale }, pulseDuration / 2)
                .easing(Easing.Sinusoidal.InOut)
                .onUpdate(() => {
                    this.updatePulseScale(baseScale, pulseScale.value);
                });
                
            // Second tween: from max to min
            const tweenDown = new Tween(pulseScale, Globals.SceneManager?.tweenGroup)
                .to({ value: minPulseScale }, pulseDuration / 2)
                .easing(Easing.Sinusoidal.InOut)
                .onUpdate(() => {
                    this.updatePulseScale(baseScale, pulseScale.value);
                });
                
            // Third tween: from min back to starting value (1.0)
            // This completes the cycle and ensures we always return to the base value
            const tweenReset = new Tween(pulseScale, Globals.SceneManager?.tweenGroup)
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
        }
        
        // Animation duration for hiding
        const fadeOutDuration = 350;
        const scaleOutDuration = 400;
        
        // First, slightly scale up the popup for a smoother transition
        if (this.activePopup) {
            // Get current scale
            const currentScale = this.activePopup.scale.x;
            
            // First slightly scale up
            new Tween(this.activePopup.scale, Globals.SceneManager?.tweenGroup)
                .to({ x: currentScale * 1.05, y: currentScale * 1.05 }, 120)
                .easing(Easing.Quadratic.Out)
                .onComplete(() => {
                    // Then scale down to zero
                    new Tween(this.activePopup!.scale, Globals.SceneManager?.tweenGroup)
                        .to({ x: 0, y: 0 }, scaleOutDuration)
                        .easing(Easing.Quadratic.In) // Smoother scale down
                        .start();
                    
                    // Add a slight fade out as well
                    new Tween(this.activePopup!, Globals.SceneManager?.tweenGroup)
                        .to({ alpha: 0 }, scaleOutDuration)
                        .easing(Easing.Quadratic.In)
                        .start();
                    
                    // Add a very subtle rotation
                    new Tween(this.activePopup!, Globals.SceneManager?.tweenGroup)
                        .to({ rotation: Math.PI * 0.1 }, scaleOutDuration) // Just a slight rotation
                        .easing(Easing.Quadratic.In)
                        .start();
                })
                .start();
        }
        
        // Animate overlay fade out
        new Tween(this.overlay, Globals.SceneManager?.tweenGroup)
            .to({ alpha: 0 }, fadeOutDuration)
            .easing(Easing.Quadratic.Out) // Smoother fade out
            .start();
        
        // Also animate the shadow with the same pattern
        if (this.popupShadow) {
            // Get current scale
            const currentShadowScale = this.popupShadow.scale.x;
            
            // First slightly scale up
            new Tween(this.popupShadow.scale, Globals.SceneManager?.tweenGroup)
                .to({ x: currentShadowScale * 1.05, y: currentShadowScale * 1.05 }, 120)
                .easing(Easing.Quadratic.Out)
                .onComplete(() => {
                    // Then scale down to zero
                    new Tween(this.popupShadow!.scale, Globals.SceneManager?.tweenGroup)
                        .to({ x: 0, y: 0 }, scaleOutDuration)
                        .easing(Easing.Quadratic.In)
                        .start();
                    
                    // Add a slight fade out as well
                    new Tween(this.popupShadow!, Globals.SceneManager?.tweenGroup)
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
            new Tween(this.activePopup, Globals.SceneManager?.tweenGroup)
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
        // Clean up popup
        if (this.activePopup) {
            console.log("Removing popup from container");
            this.popupContainer.removeChild(this.activePopup);
            this.activePopup = null;
        }
        
        // Clean up shadow
        if (this.popupShadow) {
            this.popupContainer.removeChild(this.popupShadow);
            this.popupShadow = null;
        }
        
        // Reset state
        this.visible = false;
        this.isShowing = false;
        this.targetPopupScale = null;
        console.log("Popup hidden completely");
        
        // Call callback if provided
        if (callback) {
            console.log("Calling hidePopup callback");
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
} 