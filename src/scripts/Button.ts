import { Easing, Tween } from "@tweenjs/tween.js";
import { Graphics, Sprite, Texture } from "pixi.js";
import { Globals } from "./Globals";

/**
 * Button options interface for customizing button behavior
 */
export interface ButtonOptions {
    /** Optional texture for hover state */
    hoverTexture?: Texture;
    /** Optional texture for disabled state */
    disabledTexture?: Texture;
    /** Scale factor on hover (default: 1.05) */
    hoverScale?: number;
    /** Scale factor when pressed (default: 0.95) */
    pressScale?: number;
    /** Duration of animations in ms (default: 150) */
    animationDuration?: number;
    /** Color tint on hover (default: no tint) */
    hoverTint?: number;
    /** Optional sound effect name to play on click */
    soundEffect?: string;
}

/**
 * Enhanced interactive button with animations and state management
 */
export class Button extends Sprite {
    private normalTexture: Texture;
    private hoverTexture?: Texture;
    private disabledTexture?: Texture;
    private isHovering: boolean = false;
    private isPressed: boolean = false;
    private originalScale = { x: 1, y: 1 };
    protected options: ButtonOptions;
    private activeTween?: Tween<any>;

    /**
     * Create a new interactive button
     * @param texture - Base texture for the button
     * @param callback - Function to call when button is clicked
     * @param options - Button customization options
     */
    constructor(texture: Texture, public callback: () => void, options: ButtonOptions = {}) {
        super(texture);
        
        // Store textures
        this.normalTexture = texture;
        this.hoverTexture = options.hoverTexture;
        this.disabledTexture = options.disabledTexture;
        
        // Set default options with sensible defaults
        this.options = {
            hoverScale: options.hoverScale || 1.05,
            pressScale: options.pressScale || 0.95,
            animationDuration: options.animationDuration || 150,
            hoverTint: options.hoverTint || 0xFFFFFF, // Default to no tint
            soundEffect: options.soundEffect,
            ...options
        };
        
        // Set anchor to center for consistent scaling
        this.anchor.set(0.5);
        
        // Store original scale for animations
        this.originalScale = { x: this.scale.x, y: this.scale.y };
        
        // Set up interactivity
        this.setActive(true);
        
        // Set up event listeners
        this.setupEventListeners();
    }
    
    /**
     * Set up all event listeners for the button
     */
    private setupEventListeners(): void {
        // Set up event listeners for button interactions
        this.on('pointerdown', this.onPointerDown, this);
        this.on('pointerup', this.onPointerUp, this);
        this.on('pointerupoutside', this.onPointerUpOutside, this);
        this.on('pointerover', this.onPointerOver, this);
        this.on('pointerout', this.onPointerOut, this);
        
        // Make sure button is interactive
        this.interactive = true;
        this.cursor = 'pointer';
    }
    
    /**
     * Handle pointer down event
     */
    private onPointerDown(): void {
        if (!this.interactive) return;
        
        this.isPressed = true;
        
        // Cancel any active tween
        this.cancelActiveTween();
        
        // Scale down effect
        if (this.options.pressScale !== undefined) {
            this.activeTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
                .to({
                    x: this.originalScale.x * this.options.pressScale,
                    y: this.originalScale.y * this.options.pressScale
                }, this.options.animationDuration)
                .easing(Easing.Cubic.Out)
                .start();
        }
    }
    
    /**
     * Handle pointer up event
     */
    private onPointerUp(): void {
        if (!this.interactive) return;
        
        // Execute callback when button is released
        if (this.isPressed) {
            // Play sound effect if specified
            this.playSound();
            
            // Execute the callback
            if (this.callback) {
                this.callback();
            }
        }
        
        this.isPressed = false;
        
        // Cancel any active tween
        this.cancelActiveTween();
        
        // Return to hover scale if still hovering
        if (this.isHovering && this.options.hoverScale !== undefined) {
            this.activeTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
                .to({
                    x: this.originalScale.x * this.options.hoverScale,
                    y: this.originalScale.y * this.options.hoverScale
                }, this.options.animationDuration)
                .easing(Easing.Back.Out)
                .start();
        } else {
            // Return to original scale
            this.activeTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
                .to({
                    x: this.originalScale.x,
                    y: this.originalScale.y
                }, this.options.animationDuration)
                .easing(Easing.Back.Out)
                .start();
        }
    }
    
    /**
     * Handle pointer up outside event
     */
    private onPointerUpOutside(): void {
        if (!this.interactive) return;
        
        this.isPressed = false;
        this.isHovering = false;
        
        // Cancel any active tweens
        this.cancelActiveTween();
        
        // Reset scale animation
        this.activeTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
            .to({
                x: this.originalScale.x,
                y: this.originalScale.y
            }, this.options.animationDuration!)
            .easing(Easing.Back.Out)
            .start();
            
        // Reset texture and tint
        this.texture = this.normalTexture;
        this.tint = 0xFFFFFF;
    }
    
    /**
     * Handle pointer over event
     */
    private onPointerOver(): void {
        if (!this.interactive) return;
        
        this.isHovering = true;
        
        // Set hover texture if available, otherwise just apply tint/scale
        if (this.hoverTexture) {
            this.texture = this.hoverTexture;
        } else if (this.options.hoverTint && this.options.hoverTint !== 0xFFFFFF) {
            // Only apply tint if it's different from white (no tint)
            this.tint = this.options.hoverTint;
        }
        
        // Cancel any active tweens if not pressed
        if (!this.isPressed) {
            this.cancelActiveTween();
        }
        
        // Scale up animation if not pressed
        if (!this.isPressed) {
            this.activeTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
                .to({
                    x: this.originalScale.x * this.options.hoverScale!,
                    y: this.originalScale.y * this.options.hoverScale!
                }, this.options.animationDuration!)
                .easing(Easing.Back.Out)
                .start();
        }
    }
    
    /**
     * Handle pointer out event
     */
    private onPointerOut(): void {
        if (!this.interactive) return;
        
        this.isHovering = false;
        
        // Reset texture and tint
        this.texture = this.normalTexture;
        this.tint = 0xFFFFFF;
        
        // Cancel any active tweens if not pressed
        if (!this.isPressed) {
            this.cancelActiveTween();
        }
        
        // Reset scale animation if not pressed
        if (!this.isPressed) {
            this.activeTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
                .to({
                    x: this.originalScale.x,
                    y: this.originalScale.y
                }, this.options.animationDuration!)
                .easing(Easing.Back.Out)
                .start();
        }
    }
    
    /**
     * Cancel any active tween
     */
    private cancelActiveTween(): void {
        if (this.activeTween) {
            this.activeTween.stop();
            this.activeTween = undefined;
        }
    }
    
    /**
     * Play the button's sound effect if specified
     */
    private playSound(): void {
        if (this.options.soundEffect && Globals.soundResources[this.options.soundEffect]) {
            Globals.soundResources[this.options.soundEffect].play();
        }
    }
    
    /**
     * Set the button's active state
     * @param active - Whether the button should be interactive
     */
    public setActive(active: boolean): void {
        this.interactive = active;
        this.cursor = active ? 'pointer' : 'default';
        
        if (active) {
            this.alpha = 1;
            this.texture = this.normalTexture;
        } else {
            this.alpha = 0.6;
            if (this.disabledTexture) {
                this.texture = this.disabledTexture;
            }
        }
        
        // Reset states
        this.isHovering = false;
        this.isPressed = false;
        
        // Reset scale
        this.scale.set(this.originalScale.x, this.originalScale.y);
    }
    
    /**
     * Update the button's callback function
     * @param newCallback - New callback function
     */
    public updateCallback(newCallback: () => void): void {
        this.callback = newCallback;
    }
    
    /**
     * Set the button's original scale
     * @param x - X scale
     * @param y - Y scale
     */
    public setOriginalScale(x: number, y: number): void {
        this.originalScale = { x, y };
        this.scale.set(x, y);
    }
    
    /**
     * Clean up resources when button is destroyed
     * @override
     */
    public destroy(options?: any): void {
        // Cancel any active tweens
        this.cancelActiveTween();
        
        // Remove event listeners
        this.off('pointerdown', this.onPointerDown, this);
        this.off('pointerup', this.onPointerUp, this);
        this.off('pointerupoutside', this.onPointerUpOutside, this);
        this.off('pointerover', this.onPointerOver, this);
        this.off('pointerout', this.onPointerOut, this);
        
        // Call parent destroy method
        super.destroy(options);
    }
}