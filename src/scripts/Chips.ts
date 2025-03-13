import { Sprite, Texture } from "pixi.js";
import { Globals } from "./Globals";
import { Easing, Tween } from "@tweenjs/tween.js";

/**
 * Represents a chip in the game with value and animation capabilities
 */
export class Chips extends Sprite {
    /** The value of this chip */
    public value: number;
    
    /** Original scale of the chip for reference */
    private originalScale: number = 0.3;
    
    /** Active tweens for cleanup */
    private activeTweens: Tween<any>[] = [];
    
    /**
     * Create a new chip with the specified value
     * @param value - The value of the chip
     */
    constructor(value: number) {
        super();
        this.value = value;
        this.anchor.set(0.5);
        this.interactive = true;
        this.cursor = 'pointer'; // Modern replacement for buttonMode
        
        // Set the appropriate texture based on chip value
        this.setChipTexture();
        
        // Set initial scale
        this.scale.set(this.originalScale);
    }
    
    /**
     * Set the appropriate texture based on chip value
     */
    private setChipTexture(): void {
        let texture: Texture;
        
        // Select texture based on chip value
        switch (this.value) {
            case 1:
                texture = Globals.resources.chip_1;
                break;
            case 5:
                texture = Globals.resources.chip_5;
                break;
            case 10:
                texture = Globals.resources.chip_10;
                break;
            case 25:
                texture = Globals.resources.chip_25;
                break;
            case 50:
                texture = Globals.resources.chip_50;
                break;
            case 100:
                texture = Globals.resources.chip_100;
                break;
            default:
                // Default to chip_1 if value doesn't match
                texture = Globals.resources.chip_1;
                break;
        }
        
        this.texture = texture;
    }
    
    /**
     * Update the original scale reference
     */
    updateOriginalScale(): void {
        this.originalScale = this.scale.x;
    }
    
    /**
     * Stop all active tweens
     */
    private stopActiveTweens(): void {
        this.activeTweens.forEach(tween => {
            if (tween) tween.stop();
        });
        this.activeTweens = [];
    }
    
    /**
     * Animate the chip flying to a target position
     * @param targetX - Target X position
     * @param targetY - Target Y position
     * @param onComplete - Callback to execute when animation completes
     */
    tweenTo(targetX: number, targetY: number, onComplete: () => void = () => {}): void {
        // Stop any active tweens
        this.stopActiveTweens();
        
        // Create a slight arc effect by using two tweens
        
        // First tween: Move up slightly with a bounce effect
        const upTween = new Tween(this.position, Globals.SceneManager?.tweenGroup)
            .to({
                x: (this.position.x + targetX) / 2,
                y: Math.min(this.position.y, targetY) - 50 // Move up by 50px
            }, 200)
            .easing(Easing.Cubic.Out)
            .onComplete(() => {
                // Second tween: Move to final position
                const finalTween = new Tween(this.position, Globals.SceneManager?.tweenGroup)
                    .to({
                        x: targetX,
                        y: targetY
                    }, 200)
                    .easing(Easing.Cubic.In)
                    .onComplete(() => {
                        onComplete();
                    })
                    .start();
                
                this.activeTweens.push(finalTween);
            })
            .start();
        
        this.activeTweens.push(upTween);
        
        // Add a slight rotation for visual interest
        const rotationAmount = (Math.random() - 0.5) * Math.PI * 0.5; // Random rotation between -π/4 and π/4
        const rotationTween = new Tween(this, Globals.SceneManager?.tweenGroup)
            .to({
                rotation: rotationAmount
            }, 400) // Match the total duration of both position tweens
            .easing(Easing.Sinusoidal.InOut)
            .start();
        
        this.activeTweens.push(rotationTween);
    }
    
    /**
     * Animate the chip with a bounce effect
     */
    tweenBounce(): void {
        // Stop any active tweens
        this.stopActiveTweens();
        
        // Store original position for reference
        const originalX = this.position.x;
        const originalY = this.position.y;
        
        // Create bounce effect
        const bounceTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
            .to({
                x: this.originalScale * 1.2,
                y: this.originalScale * 1.2
            }, 150)
            .easing(Easing.Cubic.Out)
            .yoyo(true)
            .repeat(1)
            .start();
        
        this.activeTweens.push(bounceTween);
        
        // Add slight position shift for more natural bounce
        const positionTween = new Tween(this.position, Globals.SceneManager?.tweenGroup)
            .to({
                y: originalY - 10
            }, 150)
            .easing(Easing.Cubic.Out)
            .yoyo(true)
            .repeat(1)
            .start();
        
        this.activeTweens.push(positionTween);
    }
    
    /**
     * Clean up resources when destroyed
     */
    public destroy(options?: any): void {
        // Stop any active tweens
        this.stopActiveTweens();
        
        // Remove event listeners
        this.interactive = false;
        this.cursor = 'default'; // Reset cursor style
        
        // Call parent destroy method
        super.destroy(options);
    }
} 