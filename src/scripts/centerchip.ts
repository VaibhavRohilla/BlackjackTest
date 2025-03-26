import { Sprite } from "pixi.js";
import { Chips } from "./table";
import { Globals } from "./globals";
import { config } from "./appconfig";
import { TextLabel } from "./textlabel";
import { Easing, Tween } from "@tweenjs/tween.js";

/**
 * Manages the center chip area where bets are placed
 */
export class CenterChip extends Sprite {
    /** Array of chips that have been bet */
    investedChips: Chips[] = [];

    /** Array of chips to be removed */
    removeChips: Chips[] = [];
    
    /** Holder for displaying the current bet amount */
    betHolder: CenterChipHolder = new CenterChipHolder();
    
    /** Flag to prevent multiple animations from running simultaneously */
    public isAnimating: boolean = false;

    /** Active tweens for cleanup */
    private activeTweens: Tween<any>[] = [];

    /**
     * Create a new center chip area
     */
    constructor() {
        super(Globals.resources.chips_zone);
        this.anchor.set(0.5);
        this.addChild(this.betHolder);
        this.betHolder.anchor.set(0.5);
    }

    /**
     * Resize the center chip area and all its components
     */
    resize(): void {
        // Resize main container
        this.scale.set(1 * config.scaleFactor);
        this.position.set(window.innerWidth/2, window.innerHeight/2);

        // Calculate position based on orientation
        let isPortrait = -this.height - this.betHolder.height/2;
        if(window.innerWidth > window.innerHeight) {
            isPortrait = -this.height/2 - this.betHolder.height;
        }
        this.betHolder.position.set(0, isPortrait);
        
        // Resize all invested chips
        this.investedChips.forEach(chip => {
            chip.scale.set(0.3 * config.scaleFactor);
            chip.updateOriginalScale();
            chip.position.set(this.position.x, this.position.y);
        });
    }

    /**
     * Show the bet display with the specified amount
     * @param amount - The bet amount to display
     */
    showBetDisplay(amount: number): void {
        console.log("Showing bet display with amount:", amount);
        
        // Stop any active tweens to avoid conflicts
        this.stopActiveTweens();
        
        // Format the amount for display
        const formattedAmount = this.formatBetAmount(amount);
        
        // Update the text
        this.betHolder.middleChipsCountTxt.updateLabelText(`${formattedAmount} Chips`);
        
        // Make sure it's visible and reset alpha/scale
        this.betHolder.isVisible(true);
        this.betHolder.alpha = 1;
        this.betHolder.scale.set(1 * config.scaleFactor);
        
        // Ensure proper positioning
        this.resize();
        
        // Log visibility state for debugging
        console.log("Bet holder visibility:", this.betHolder.visible, "Alpha:", this.betHolder.alpha);
        
        // Add a small animation to draw attention
        const originalScale = this.betHolder.scale.clone();
        
        // Create a pulse animation
        new Tween(this.betHolder.scale, Globals.sceneManager?.tweenGroup)
            .to({ 
                x: originalScale.x * 1.2, 
                y: originalScale.y * 1.2 
            }, 200)
            .easing(Easing.Cubic.Out)
            .yoyo(true)
            .repeat(1)
            .onComplete(() => {
                // Reset to original scale
                this.betHolder.scale.copyFrom(originalScale);
                
                // Double-check visibility after animation
                if (!this.betHolder.visible) {
                    console.log("Bet holder not visible after animation, forcing visibility");
                    this.betHolder.isVisible(true);
                    this.betHolder.alpha = 1;
                }
            })
            .start();
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
     * Stop all active tweens
     */
    public stopActiveTweens(): void {
        this.activeTweens.forEach(tween => {
            if (tween) tween.stop();
        });
        this.activeTweens = [];
    }

    /**
     * Animate chips flying out of the canvas when clearing
     * @param onComplete - Callback to execute when animation completes
     * @param hideBetHolder - Whether to hide the bet holder after animation (default: true)
     */
    tweenChipsOut(onComplete: () => void = () => {}, hideBetHolder: boolean = true): void {
        // Edge case: If already animating, don't start another animation
        if (this.isAnimating) {
            console.log("Already animating chips out, queueing callback");
            // Still call the callback to ensure the flow continues
            setTimeout(() => onComplete(), 200);
            return;
        }
        
        // Edge case: If no chips, just call the callback immediately
        if (this.removeChips.length === 0) {
            console.log("No chips to animate out");
            
            // Still animate the bet holder if requested
            if (hideBetHolder) {
                this.animateBetHolder(true);
            }
            
            // Call completion callback immediately
            onComplete();
            return;
        }
        
        // Set animating flag
        this.isAnimating = true;
        
        // Stop any active tweens
        this.stopActiveTweens();
        
        // Animate the bet holder if requested - do this first for smoother UX
        if (hideBetHolder) {
            this.animateBetHolder(true);
        }
        
        // Set up animation tracking
        let completedAnimations = 0;
        const totalAnimations = this.removeChips.length;
        
        // Limit to max 5 animations to avoid overwhelming with many chips
        const chipsToAnimate = [...this.removeChips].slice(0, 5);
        
        // Target position for all chips
        const targetY = window.innerHeight * 0.7;
        
        // Animate each chip with a slight delay between them
        chipsToAnimate.forEach((chip, index) => {
            // Skip any destroyed chips
            if (chip.destroyed) {
                completedAnimations++;
                if (completedAnimations >= chipsToAnimate.length) {
                    // Reset animating flag and call completion callback
                    this.finishChipAnimation(onComplete);
                }
                return;
            }
            
            // Fast animation for better responsiveness
            this.animateChip(chip, index, targetY, () => {
                // Track completed animations
                completedAnimations++;
                if (completedAnimations >= chipsToAnimate.length) {
                    // Reset animating flag and call completion callback with all chips
                    this.finishChipAnimation(onComplete);
                }
            });
        });
        
        // Safety timeout to ensure callback is called even if animations fail
        setTimeout(() => {
            if (this.isAnimating) {
                this.finishChipAnimation(onComplete);
            }
        }, 1000);
    }
    
    /**
     * Finish chip animation and clean up remaining chips
     */
    private finishChipAnimation(onComplete: () => void): void {
        console.log("Finishing chip animation");
        this.isAnimating = false;
        
        // Clean up any remaining chips
        this.removeChips.forEach(chip => {
            if (chip && !chip.destroyed) {
                chip.destroy();
            }
        });
        this.removeChips = [];
        
        // Call completion callback
        onComplete();
    }
    
    /**
     * Animate the bet holder when clearing
     * @param hideAfterAnimation - Whether to hide the bet holder after animation (default: true)
     */
    private animateBetHolder(hideAfterAnimation: boolean = true): void {
        if (!this.betHolder.visible) {
            console.log("Bet holder not visible, skipping animation");
            return;
        }
        
        // If hiding is requested, make it quick
        if (hideAfterAnimation) {
            // Create a quick fade out animation
            const fadeTween = new Tween(this.betHolder, Globals.sceneManager?.tweenGroup)
                .to({ 
                    alpha: 0,
                    scale: { x: this.betHolder.scale.x * 1.1, y: this.betHolder.scale.y * 1.1 }
                }, 200)
                .onComplete(() => {
                    // Ensure visibility is set to false after fade out
                    this.betHolder.isVisible(false);
                    
                    // Reset properties for next use
                    this.betHolder.alpha = 1;
                    this.betHolder.scale.set(1 * config.scaleFactor);
                    
                    console.log("Hiding bet holder");
                })
                .easing(Easing.Quadratic.In)
                .start();
            
            this.activeTweens.push(fadeTween);
        } else {
            // Light pulse if we're not hiding
            const pulseTween = new Tween(this.betHolder.scale, Globals.sceneManager?.tweenGroup)
                .to({ 
                    x: this.betHolder.scale.x * 1.1, 
                    y: this.betHolder.scale.y * 1.1 
                }, 100)
                .easing(Easing.Quadratic.Out)
                .yoyo(true)
                .repeat(1)
                .start();
            
            this.activeTweens.push(pulseTween);
        }
        
        // Add safety timeout to ensure bet holder is hidden if animation fails
        if (hideAfterAnimation) {
            setTimeout(() => {
                if (this.betHolder.visible && this.betHolder.alpha !== 1) {
                    console.log("Safety timeout triggered for bet holder animation");
                    this.betHolder.isVisible(false);
                    this.betHolder.alpha = 1;
                    this.betHolder.scale.set(1 * config.scaleFactor);
                }
            }, 500);
        }
    }
    
    /**
     * Animate a single chip flying out
     * @param chip - The chip to animate
     * @param index - Index for staggered delay
     * @param targetY - Target Y position
     * @param onComplete - Callback when animation completes
     */
    private animateChip(chip: Chips, index: number, targetY: number, onComplete: () => void): void {
        // Add slight random horizontal offset for natural movement
        const randomOffsetX = (Math.random() - 0.5) * 30;
        
        // Faster animation for better responsiveness - immediate animation
        const positionTween = new Tween(chip.position, Globals.sceneManager?.tweenGroup)
            .to({
                x: chip.position.x + randomOffsetX,
                y: targetY
            }, 200)
            .delay(index * 2) // Very small delay between chips
            .easing(Easing.Cubic.In)
            .start();
            
        // Create rotation and fade out tween
        const targetRotation = (Math.random() - 0.5) * Math.PI * 0.3;
        const rotationTween = new Tween(chip, Globals.sceneManager?.tweenGroup)
            .to({ 
                rotation: targetRotation,
                alpha: 0 // Fade out
            }, 200)
            .delay(index * 2)
            .easing(Easing.Cubic.In)
            .onComplete(() => {
                // Find and remove the chip from removeChips array
                const chipIndex = this.removeChips.indexOf(chip);
                if (chipIndex > -1) {
                    this.removeChips.splice(chipIndex, 1);
                    chip.destroy();
                }
                onComplete();
            })
            .start();
        
        this.activeTweens.push(positionTween, rotationTween);
    }
    
    /**
     * Add a chip to the center area
     * @param chip - The chip to add
     */
    addChip(chip: Chips): void {
        this.investedChips.push(chip);
        this.addChild(chip);
    }
    
    /**
     * Clear all chips from the center area
     */
    clearChips(): void {
        console.log("Clearing all chips from center area");
        
        // Stop any active tweens
        this.stopActiveTweens();
        
        // Destroy all chips in removeChips array
        this.removeChips.forEach(chip => {
            if (chip && !chip.destroyed) {
                chip.destroy();
            }
        });
        this.removeChips = [];
        
        // Also destroy any chips still in investedChips array
        this.investedChips.forEach(chip => {
            if (chip && !chip.destroyed) {
                chip.destroy();
            }
        });
        this.investedChips = [];
        
        console.log("All chips cleared from center area");
    }
    
    /**
     * Clean up resources when destroyed
     */
    public destroy(options?: any): void {
        // Stop any active tweens
        this.stopActiveTweens();
        
        // Clear all chips
        this.clearChips();
        
        // Destroy bet holder
        if (this.betHolder) {
            this.betHolder.destroy();
        }
        
        // Call parent destroy method
        super.destroy(options);
    }
}

/**
 * Displays the current bet amount in the center of the table
 */
export class CenterChipHolder extends Sprite {
    /** Text label for displaying the bet amount */
    middleChipsCountTxt: TextLabel;
    
    /**
     * Create a new center chip holder
     */
    constructor() {
        super(Globals.resources.BetHolder);
        this.anchor.set(0.5);
        
        // Create and position the text label
        this.middleChipsCountTxt = new TextLabel(
            this.width * 0.4, 
            0, 
            0.5, 
            `${Globals.currentBet} Chips`, 
            17, 
            0xFFFFFF, 
            "Lato"
        );
        this.middleChipsCountTxt.anchor.set(1, 0.5);
        
        this.addChild(this.middleChipsCountTxt);
        this.isVisible(false);
    }

    /**
     * Set the visibility of the holder
     * @param check - Whether the holder should be visible
     */
    isVisible(check: boolean): void {
        this.visible = check;
    }

    /**
     * Update the displayed bet amount
     * @param bet - Amount to add to the current bet (or 0 to reset)
     */
    updateMiddleChipsCount(bet: number): void {
        // If bet is 0, reset the current bet instead of adding
        if (bet === 0) {
            Globals.currentBet = 0;
        } else {
            Globals.currentBet += bet;
        }
        
        // Format the bet amount for display
        const formattedBet = this.formatBetAmount(Globals.currentBet);
        this.middleChipsCountTxt.updateLabelText(`${formattedBet} Chips`);
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
     * Clean up resources when destroyed
     */
    public destroy(options?: any): void {
        // Destroy text label
        if (this.middleChipsCountTxt) {
            this.middleChipsCountTxt.destroy();
        }
        
        // Call parent destroy method
        super.destroy(options);
    }
}
