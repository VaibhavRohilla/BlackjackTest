import { Container, Graphics, Sprite } from "pixi.js";
import { Globals } from "./globals";
import { Easing, Tween } from "@tweenjs/tween.js";
import { TextLabel } from "./textlabel";
import { Z_INDEX } from "./popupmanager";
import { config } from "./appconfig";

/**
 * Manages the shop popup for unlocking premium chips
 */
export class ShopPopup extends Container {
    /** Black overlay for background dimming */
    private overlay: Graphics = new Graphics();
    
    /** Popup background sprite */
    private popup: Sprite = new Sprite();
    
    /** Shop button to unlock chips */
    private shopButton: Sprite = new Sprite();
    
    /** Cancel button to close popup */
    private cancelButton: Sprite = new Sprite();
    
    /** Close button in the corner */
    private closeButton: Sprite = new Sprite();
    
    /** Title text for the popup */
    private titleText: TextLabel = new TextLabel(0, 0, 0.5, "The Highest Bets", 36, 0xFFFFFF);
    
    /** Description text for the popup */
    private descriptionText: TextLabel = new TextLabel(0, 0, 0.5, "To unlock the highest bets you need to buy a VIP card", 24, 0xFFFFFF);
    
    /** Whether the popup is currently visible */
    private isVisible: boolean = false;
    
    /** Callback function to unlock premium chips */
    private unlockCallback: () => void;
    
    /** Callback function for cancel button */
    private cancelCallback: (() => void) | null = null;
    
    /**
     * Create a new shop popup
     * @param unlockCallback - Function to call when premium chips are unlocked
     * @param cancelCallback - Optional function to call when cancel is clicked
     */
    constructor(unlockCallback: () => void, cancelCallback?: () => void) {
        super();
        
        // Set z-index for the popup
        this.zIndex = Z_INDEX.POPUPS;
        
        // Enable sortable children to respect zIndex
        this.sortableChildren = true;
        
        // Store the callbacks
        this.unlockCallback = unlockCallback;
        this.cancelCallback = cancelCallback || null;
        
        // Create black overlay with transparency
        this.createOverlay();
        
        // Create popup background
        this.createPopup();
        
        // Create text elements
        this.createTextElements();
        
        // Create buttons
        this.createButtons();
        
        // Initial resize
        this.resize();
        
        // Hide initially
        this.visible = false;
    }
    
    /**
     * Create the black overlay
     */
    private createOverlay(): void {
        this.overlay = new Graphics();
        this.overlay.rect(-window.innerWidth, -window.innerHeight, window.innerWidth * 2, window.innerHeight * 2);
        this.overlay.fill({color: 0x000000, alpha: 0.7});
        this.overlay.interactive = true; // Make it interactive to block clicks
        this.overlay.cursor = 'pointer';
        this.overlay.on('pointerdown', this.close.bind(this));
        this.overlay.zIndex = Z_INDEX.POPUP_OVERLAY;
        this.addChild(this.overlay);
    }
    
    /**
     * Create the popup background
     */
    private createPopup(): void {
        this.popup = new Sprite(Globals.resources.ExtraCoinsPopup);
        this.popup.anchor.set(0.5);
        this.popup.zIndex = Z_INDEX.POPUPS;
        this.addChild(this.popup);
    }
    
    /**
     * Create text elements for the popup
     */
    private createTextElements(): void {
        // Title text
        this.titleText.anchor.set(0.5);
        this.titleText.position.set(0, -this.popup.height * 0.3);
        this.titleText.zIndex = Z_INDEX.POPUPS + 1;
        this.addChild(this.titleText);
        
        // Description text
        this.descriptionText.anchor.set(0.5);
        this.descriptionText.position.set(0, -this.popup.height * 0.15);
        this.descriptionText.zIndex = Z_INDEX.POPUPS + 500;
        this.addChild(this.descriptionText);
    }
    
    /**
     * Create buttons for the popup
     */
    private createButtons(): void {
        // Create shop button
        this.shopButton = new Sprite(Globals.resources.ShopButton);
        this.shopButton.anchor.set(0.5);
        this.shopButton.position.set(0, this.popup.height * 0.2);
        this.shopButton.interactive = true;
        this.shopButton.cursor = 'pointer';
        this.shopButton.on('pointerover', this.onButtonHover.bind(this, this.shopButton));
        this.shopButton.on('pointerout', this.onButtonOut.bind(this, this.shopButton));
        this.shopButton.on('pointerdown', this.unlockPremiumChips.bind(this));
        const shopButtonText = new TextLabel(0, 0, 0.5, "Unlock", 100, 0xFFFFFF);
        shopButtonText.anchor.set(0.5);
        this.shopButton.addChild(shopButtonText);
        this.shopButton.zIndex = Z_INDEX.BUTTONS;
        this.addChild(this.shopButton);
        
        // Create cancel button
        this.cancelButton = new Sprite(Globals.resources.CancelButton);
        this.cancelButton.anchor.set(0.5);
        this.cancelButton.position.set(0, this.popup.height * 0.4);
        this.cancelButton.interactive = true;
        this.cancelButton.cursor = 'pointer';
        this.cancelButton.on('pointerover', this.onButtonHover.bind(this, this.cancelButton));
        this.cancelButton.on('pointerout', this.onButtonOut.bind(this, this.cancelButton));
        this.cancelButton.on('pointerdown', this.cancelAndClose.bind(this));
        const cancelText = new TextLabel(0, 0, 0.5, "Cancel", 100, 0xFFFFFF);
        cancelText.anchor.set(0.5);
        this.cancelButton.addChild(cancelText);
        this.cancelButton.zIndex = Z_INDEX.BUTTONS;
        this.addChild(this.cancelButton);
        
        // Create close button
        this.closeButton = new Sprite(Globals.resources.CloseButton);
        this.closeButton.anchor.set(0.5);
        this.closeButton.position.set(this.popup.width * 0.45, -this.popup.height * 0.45);
        this.closeButton.interactive = true;
        this.closeButton.cursor = 'pointer';
        this.closeButton.on('pointerover', this.onButtonHover.bind(this, this.closeButton));
        this.closeButton.on('pointerout', this.onButtonOut.bind(this, this.closeButton));
        this.closeButton.on('pointerdown', this.close.bind(this));
        this.closeButton.zIndex = Z_INDEX.BUTTONS;
        this.addChild(this.closeButton);
    }
    
    /**
     * Handle button hover effect
     * @param button - The button being hovered
     */
    private onButtonHover(button: Sprite): void {
        new Tween(button.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: button.scale.x * 1.1, y: button.scale.y * 1.1 }, 200)
            .easing(Easing.Back.Out)
            .start();
            
        new Tween(button, Globals.sceneManager?.tweenGroup)
            .to({ alpha: 0.8 }, 200)
            .easing(Easing.Cubic.Out)
            .start();
    }
    
    /**
     * Handle button hover end effect
     * @param button - The button hover ending
     */
    private onButtonOut(button: Sprite): void {
        new Tween(button.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: button.scale.x / 1.1, y: button.scale.y / 1.1 }, 200)
            .easing(Easing.Back.Out)
            .start();
            
        new Tween(button, Globals.sceneManager?.tweenGroup)
            .to({ alpha: 1 }, 200)
            .easing(Easing.Cubic.Out)
            .start();
    }
    
    /**
     * Cancel and close the popup
     */
    private cancelAndClose(): void {
        // Close the popup
        this.close();
        
        // Call the cancel callback if provided
        if (this.cancelCallback) {
            this.cancelCallback();
        }
    }
    
    /**
     * Open the shop popup with animation
     */
    public open(): void {
        // Make popup visible
        this.visible = true;
        this.isVisible = true;
        
        // Position the popup in the center of the screen
        this.position.set(window.innerWidth / 2, window.innerHeight / 2);
        
        // Set initial state for animation
        this.popup.scale.set(0);
        this.popup.alpha = 0;
        this.overlay.alpha = 0;
        this.shopButton.alpha = 0;
        this.cancelButton.alpha = 0;
        this.closeButton.alpha = 0;
        this.titleText.alpha = 0;
        this.descriptionText.alpha = 0;
        
        // Animate overlay fade in
        new Tween(this.overlay, Globals.sceneManager?.tweenGroup)
            .to({ alpha: 1 }, 300)
            .easing(Easing.Cubic.Out)
            .start();
        
        // Animate popup scaling up
        const isPortrait = window.innerWidth < window.innerHeight;
        const popupScale = this.getPopupScale();
        new Tween(this.popup.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: popupScale, y: popupScale }, 500)
            .easing(Easing.Back.Out)
            .start();
        
        // Animate popup fade in
        new Tween(this.popup, Globals.sceneManager?.tweenGroup)
            .to({ alpha: 1 }, 300)
            .easing(Easing.Cubic.Out)
            .start();
        
        // Animate text elements with staggered delay
        new Tween(this.titleText, Globals.sceneManager?.tweenGroup)
            .delay(100)
            .to({ alpha: 1 }, 300)
            .easing(Easing.Cubic.Out)
            .start();
            
        new Tween(this.descriptionText, Globals.sceneManager?.tweenGroup)
            .delay(200)
            .to({ alpha: 1 }, 300)
            .easing(Easing.Cubic.Out)
            .start();
        
        // Animate buttons with staggered delay
        new Tween(this.shopButton, Globals.sceneManager?.tweenGroup)
            .delay(300)
            .to({ alpha: 1 }, 300)
            .easing(Easing.Cubic.Out)
            .start();
            
        new Tween(this.cancelButton, Globals.sceneManager?.tweenGroup)
            .delay(400)
            .to({ alpha: 1 }, 300)
            .easing(Easing.Cubic.Out)
            .start();
            
        new Tween(this.closeButton, Globals.sceneManager?.tweenGroup)
            .delay(500)
            .to({ alpha: 1 }, 300)
            .easing(Easing.Cubic.Out)
            .start();
    }
    
    /**
     * Close the shop popup with animation
     */
    public close(): void {
        if (!this.isVisible) return;
        
        // Animate overlay fade out
        new Tween(this.overlay, Globals.sceneManager?.tweenGroup)
            .to({ alpha: 0 }, 300)
            .easing(Easing.Cubic.In)
            .start();
        
        // Animate popup scaling down
        new Tween(this.popup.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: 0.1, y: 0.1 }, 300)
            .easing(Easing.Back.In)
            .start();
        
        // Animate popup fade out
        new Tween(this.popup, Globals.sceneManager?.tweenGroup)
            .to({ alpha: 0 }, 300)
            .easing(Easing.Cubic.In)
            .onComplete(() => {
                // Hide popup when animation completes
                this.visible = false;
                this.isVisible = false;
            })
            .start();
            
        // Fade out all other elements
        [this.shopButton, this.cancelButton, this.closeButton, this.titleText, this.descriptionText].forEach(element => {
            new Tween(element, Globals.sceneManager?.tweenGroup)
                .to({ alpha: 0 }, 200)
                .easing(Easing.Cubic.In)
                .start();
        });
    }
    
    /**
     * Create a particle burst effect when unlocking chips
     */
    private createUnlockEffect(): void {
        // Create a container for particles
        const particleContainer = new Container();
        particleContainer.zIndex = Z_INDEX.POPUPS + 2;
        this.addChild(particleContainer);
        
        // Create 20 particles
        for (let i = 0; i < 20; i++) {
            const particle = new Graphics();
            particle.beginFill(0xFFD700); // Gold color
            particle.drawCircle(0, 0, 5);
            particle.endFill();
            
            // Random position around the shop button
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 20;
            particle.position.set(
                this.shopButton.position.x + Math.cos(angle) * distance,
                this.shopButton.position.y + Math.sin(angle) * distance
            );
            
            particleContainer.addChild(particle);
            
            // Animate particle
            const targetX = particle.position.x + Math.cos(angle) * 100;
            const targetY = particle.position.y + Math.sin(angle) * 100;
            
            new Tween(particle.position, Globals.sceneManager?.tweenGroup)
                .to({ x: targetX, y: targetY }, 500 + Math.random() * 500)
                .easing(Easing.Cubic.Out)
                .start();
                
            new Tween(particle, Globals.sceneManager?.tweenGroup)
                .to({ alpha: 0 }, 500 + Math.random() * 500)
                .easing(Easing.Cubic.Out)
                .onComplete(() => {
                    particleContainer.removeChild(particle);
                    
                    // Remove container when all particles are gone
                    if (particleContainer.children.length === 0) {
                        this.removeChild(particleContainer);
                    }
                })
                .start();
        }
    }
    
    /**
     * Handle the unlock button click - will unlock premium chips
     */
    private unlockPremiumChips(): void {
        console.log("ShopPopup: unlockPremiumChips called");
        
        // Create unlock effect
        this.createUnlockEffect();
        
        // Animate the shop button
        new Tween(this.shopButton.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: this.shopButton.scale.x * 1.2, y: this.shopButton.scale.y * 1.2 }, 200)
            .easing(Easing.Back.Out)
            .yoyo(true)
            .repeat(1)
            .start();
        
        // Call the unlock callback directly - don't wait for popup to close
        try {
            console.log("ShopPopup: Calling unlock callback");
            if (this.unlockCallback) {
                this.unlockCallback();
            } else {
                console.error("ShopPopup: No unlock callback provided");
            }
        } catch (e) {
            console.error("ShopPopup: Error calling unlock callback", e);
        }
        
        // Close the popup with a slight delay
        setTimeout(() => {
            console.log("ShopPopup: Closing popup after unlock");
            this.close();
        }, 1500); // Longer delay to see the animation
    }
    
    /**
     * Get the appropriate popup scale based on screen size
     * @returns The scale factor for the popup
     */
    private getPopupScale(): number {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const isPortrait = screenWidth < screenHeight;
        
        // Base scale factor
        let popupScale =   0.2 * config.scaleFactor;;
        
        // if (isPortrait) {
        //     // For portrait mode (mobile)
        //     if (screenWidth < 400) {
        //         // Very small screens
        //         popupScale = 0.25 * config.scaleFactor;
        //     } else if (screenWidth < 600) {
        //         // Small screens
        //         popupScale = 0.3 * config.scaleFactor;
        //     } else {
        //         // Medium screens
        //         popupScale = 0.35 * config.scaleFactor;
        //     }
        // } else {
        //     // For landscape mode
        //     if (screenWidth < 800) {
        //         // Small landscape
        //         popupScale = 0.25 * config.scaleFactor;
        //     } else if (screenWidth < 1200) {
        //         // Medium landscape
        //         popupScale = 0.3 * config.scaleFactor;
        //     } else {
        //         // Large landscape
        //         popupScale = 0.35 * config.scaleFactor;
        //     }
        // }
        
        return popupScale;
    }
    
    /**
     * Resize the popup based on screen dimensions
     */
    public resize(): void {
        // Calculate scale based on screen size
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const isPortrait = screenWidth < screenHeight;
        
        // Position the popup in the center of the screen
        this.position.set(screenWidth / 2, screenHeight / 2);
        
        // Get appropriate popup scale
        const popupScale = this.getPopupScale();
        
        // Scale popup based on screen size
        this.popup.scale.set(popupScale);
        
        // Scale buttons - make them larger on mobile for better touch targets
        const buttonScale = isPortrait ? 
            popupScale  : // Slightly larger on mobile
            popupScale;
            
        this.shopButton.scale.set(buttonScale);
        this.cancelButton.scale.set(buttonScale);
        this.closeButton.scale.set(buttonScale * 0.8);
        
        // Position overlay to cover the entire screen
        this.overlay.clear();
        this.overlay.rect(-screenWidth, -screenHeight, screenWidth * 2, screenHeight * 2);
        this.overlay.fill({color: 0x000000, alpha: 0.7});
        
        this.shopButton.position.set(this.popup.width * 0.2, this.popup.height * 0.25);
        this.cancelButton.position.set(-this.popup.width * 0.2, this.popup.height * 0.25);
        // Always position close button in the top-right corner
        this.closeButton.position.set(this.popup.width * 0.45, -this.popup.height * 0.45);
        
        // Scale text based on screen size
        const textScale = isPortrait ? 0.7 :   1.0;
            
        // Apply text scaling
        console.log("SCALE : " + textScale*config.scaleFactor);
        
        this.titleText.scale.set(textScale*config.scaleFactor);
        this.descriptionText.scale.set(textScale * config.scaleFactor); // Description slightly smaller
        
        // Reposition text
        this.titleText.position.set(0, -this.popup.height * 0.3);
        this.descriptionText.position.set(0, -this.popup.height * 0.1);
    }
} 