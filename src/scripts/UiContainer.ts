import { extname } from "node:path";
import { Container, Sprite, Texture, FederatedPointerEvent } from "pixi.js";
import { Button, ButtonOptions } from "./Button";
import { Globals, formatNumber } from "./Globals";
import { TextLabel } from "./TextLabel";
import { config } from "./appConfig";
import { MenuPopup } from "./MenuPopup";
import { Easing, Tween } from "@tweenjs/tween.js";

/**
 * Custom menu button with hover/press animations and texture changes
 */
class MenuButton extends Container {
    /** Button sprite */
    private sprite: Sprite;
    
    /** Original scale */
    private originalScale = { x: 1, y: 1 };
    
    /** Normal texture */
    private normalTexture: Texture;
    
    /** Pressed texture */
    private pressedTexture: Texture;
    
    /** Callback function */
    private callback: () => void;
    
    /** Animation duration in milliseconds */
    private animationDuration = 200;
    
    /** Current animation tween */
    private currentTween?: Tween<any>;
    
    /** Whether the button is currently pressed */
    private isPressed = false;
    
    /**
     * Create a new menu button
     * @param normalTexture - Normal state texture
     * @param pressedTexture - Pressed state texture
     * @param callback - Function to call when button is clicked
     */
    constructor(normalTexture: Texture, pressedTexture: Texture, callback: () => void) {
        super();
        
        this.normalTexture = normalTexture;
        this.pressedTexture = pressedTexture;
        this.callback = callback;
        
        // Create button sprite
        this.sprite = new Sprite(normalTexture);
        this.sprite.anchor.set(0.5);
        this.addChild(this.sprite);
        
        // Make interactive
        this.eventMode = 'static';
        this.cursor = 'pointer';
        
        // Set up event listeners
        this.on('pointerover', this.onPointerOver.bind(this));
        this.on('pointerout', this.onPointerOut.bind(this));
        this.on('pointerdown', this.onPointerDown.bind(this));
        this.on('pointerup', this.onPointerUp.bind(this));
        this.on('pointerupoutside', this.onPointerUpOutside.bind(this));
    }
    
    /**
     * Set the original scale of the button
     * @param x - X scale
     * @param y - Y scale
     */
    public setOriginalScale(x: number, y: number): void {
        this.originalScale = { x, y };
        this.scale.set(x, y);
    }
    
    /**
     * Handle pointer over event
     */
    private onPointerOver(): void {
        if (this.isPressed) return;
        
        // Stop any current animation
        this.cancelActiveTween();
        
        // Scale up animation
        this.currentTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: this.originalScale.x * 1.1, 
                y: this.originalScale.y * 1.1 
            }, this.animationDuration)
            .easing(Easing.Back.Out)
            .start();
    }
    
    /**
     * Handle pointer out event
     */
    private onPointerOut(): void {
        if (this.isPressed) return;
        
        // Stop any current animation
        this.cancelActiveTween();
        
        // Scale back to original
        this.currentTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: this.originalScale.x, 
                y: this.originalScale.y 
            }, this.animationDuration)
            .easing(Easing.Back.Out)
            .start();
    }
    
    /**
     * Handle pointer down event
     */
    private onPointerDown(): void {
        this.isPressed = true;
        
        // Change texture
        this.sprite.texture = this.pressedTexture;
        
        // Stop any current animation
        this.cancelActiveTween();
        
        // Scale down animation
        this.currentTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: this.originalScale.x * 0.9, 
                y: this.originalScale.y * 0.9 
            }, this.animationDuration / 2)
            .easing(Easing.Cubic.Out)
            .start();
    }
    
    /**
     * Handle pointer up event
     */
    private onPointerUp(): void {
        this.isPressed = false;
        
        // Execute callback
        if (this.callback) {
            this.callback();
        }
        
        // Stop any current animation
        this.cancelActiveTween();
        
        // Scale up animation (hover effect)
        this.currentTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: this.originalScale.x * 1.1, 
                y: this.originalScale.y * 1.1 
            }, this.animationDuration)
            .easing(Easing.Back.Out)
            .start();
    }
    
    /**
     * Handle pointer up outside event
     */
    private onPointerUpOutside(): void {
        this.isPressed = false;
        
        // Change texture back to normal
        this.sprite.texture = this.normalTexture;
        
        // Stop any current animation
        this.cancelActiveTween();
        
        // Scale back to original
        this.currentTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: this.originalScale.x, 
                y: this.originalScale.y 
            }, this.animationDuration)
            .easing(Easing.Back.Out)
            .start();
    }
    
    /**
     * Cancel any active tween
     */
    private cancelActiveTween(): void {
        if (this.currentTween) {
            this.currentTween.stop();
            this.currentTween = undefined;
        }
    }
    
    /**
     * Set the button texture
     * @param texture - New texture
     */
    public setTexture(texture: Texture): void {
        this.sprite.texture = texture;
    }
    
    /**
     * Set the normal texture
     * @param texture - New normal texture
     */
    public setNormalTexture(texture: Texture): void {
        this.normalTexture = texture;
        if (!this.isPressed) {
            this.sprite.texture = texture;
        }
    }
    
    /**
     * Set the pressed texture
     * @param texture - New pressed texture
     */
    public setPressedTexture(texture: Texture): void {
        this.pressedTexture = texture;
        if (this.isPressed) {
            this.sprite.texture = texture;
        }
    }
    
    /**
     * Clean up resources when button is destroyed
     */
    public destroy(options?: any): void {
        // Cancel any active tweens
        this.cancelActiveTween();
        
        // Remove event listeners
        this.off('pointerover');
        this.off('pointerout');
        this.off('pointerdown');
        this.off('pointerup');
        this.off('pointerupoutside');
        
        // Call parent destroy method
        super.destroy(options);
    }
}

/**
 * Container for UI elements like balance display and menu button
 */
export class UiContainer extends Container {
    /** Menu button */
    menuBtn!: MenuButton;
    
    /** Balance label */
    balanceTxt: TextLabel = new TextLabel(0, 0, 0.5, "Balance", 50, 0xFFFFFF);
    
    /** Current balance amount display */
    currentBalanceTxt: TextLabel = new TextLabel(0, 0, 0.5, `${formatNumber(Globals.Balance)} Chips`, 50, 0xFFFFFF);
    
    /** Menu popup */
    menuPopup!: MenuPopup;
    
    /** Track if menu is open to maintain correct button texture */
    private isMenuOpen: boolean = false;
    
    /**
     * Create a new UI container
     */
    constructor() {
        super();
        
        this.createMenuButton();
        this.setupBalanceDisplay();
        this.createMenuPopup();
        this.addChildren();
    }
    
    /**
     * Create the menu button with enhanced options
     */
    private createMenuButton(): void {
        // Get textures
        const normalTexture = Globals.resources.menu || Texture.WHITE;
        const pressedTexture = Globals.resources.MenuCloseBtn || normalTexture;
        
        if (!Globals.resources.menu) {
            console.error("Menu button texture not found!");
        }
        
        // Create custom menu button
        this.menuBtn = new MenuButton(
            normalTexture,
            pressedTexture,
            this.onMenuClicked.bind(this)
        );
        
        // Set initial scale
        this.menuBtn.setOriginalScale(0.3 * config.scaleFactor, 0.3 * config.scaleFactor);
    }
    
    /**
     * Set up the balance display labels
     */
    private setupBalanceDisplay(): void {
        this.balanceTxt.alpha = 0.5;
        this.currentBalanceTxt.anchor.set(1, 0.5);
    }
    
    /**
     * Create and configure the menu popup
     */
    private createMenuPopup(): void {
        this.menuPopup = new MenuPopup();
        
        // Set callbacks for menu buttons
        this.menuPopup.setButtonCallback('Sound', () => {
            // Toggle sound on/off
            // You can implement sound toggling logic here
            // For example: Globals.sound.mute = !Globals.sound.mute;
        });
        
        this.menuPopup.setButtonCallback('Home', () => {
            // Navigate to home/main menu
            if (Globals.SceneManager) {
                // You can implement scene switching logic here
                // For example: Globals.SceneManager.goToScene('MainMenu');
            }
        });
        
        this.menuPopup.setButtonCallback('Info', () => {
            // Show game info/rules
            // You can implement showing game rules here
        });
        
        this.menuPopup.setButtonCallback('Music', () => {
            // Toggle music on/off
            // You can implement music toggling logic here
            // For example: 
            // if (Globals.music) {
            //     Globals.music.mute = !Globals.music.mute;
            // }
        });
    }
    
    /**
     * Add all UI elements to the container
     */
    private addChildren(): void {
        this.addChild(this.menuBtn);
        this.addChild(this.balanceTxt);
        this.addChild(this.currentBalanceTxt);
        this.addChild(this.menuPopup);
    }
    
    /**
     * Handle menu button click
     */
    private onMenuClicked(): void {
        // Check if menuPopup exists
        if (!this.menuPopup) {
            console.error("Menu popup is not initialized!");
            return;
        }
        
        // Get global position of menu button for accurate positioning
        const globalPos = this.toGlobal(this.menuBtn.position);
        
        // Position the popup next to the menu button using global coordinates
        this.menuPopup.positionNextToMenuButton(
            globalPos.x,
            globalPos.y,
            this.menuBtn.width,
            this.menuBtn.height
        );
        
        // Toggle menu popup
        this.menuPopup.toggle();
        
        // Update menu state
        this.isMenuOpen = this.menuPopup.isMenuOpen();
        
        // Update button textures based on menu state
        this.updateMenuButtonTextures();
    }
    
    /**
     * Update the menu button textures based on menu state
     */
    private updateMenuButtonTextures(): void {
        const normalTexture = Globals.resources.menu;
        const closeTexture = Globals.resources.MenuCloseBtn;
        
        if (!normalTexture || !closeTexture) {
            console.error("Menu button textures not found!");
            return;
        }
        
        if (this.isMenuOpen) {
            // Set normal texture to close button
            this.menuBtn.setNormalTexture(closeTexture);
        } else {
            // Set normal texture to menu button
            this.menuBtn.setNormalTexture(normalTexture);
        }
    }
    
    /**
     * Update the balance display
     */
    public updateBalance(): void {
        this.currentBalanceTxt.updateLabelText(`${formatNumber(Globals.Balance)} Chips`);
    }

    /**
     * Resize and position UI elements
     * @param ref - Reference sprite for positioning
     */
    resize(ref: Sprite): void {
        // Set original scale for the button
        this.menuBtn.setOriginalScale(0.3 * config.scaleFactor, 0.3 * config.scaleFactor);
        this.currentBalanceTxt.scale.set(0.5 * config.scaleFactor, 0.5 * config.scaleFactor);
        this.balanceTxt.scale.set(0.5 * config.scaleFactor, 0.5 * config.scaleFactor);
        
        // Position elements
        this.positionElements(ref);
        
        // Resize menu popup
        if (this.menuPopup) {
            this.menuPopup.resize(window.innerWidth, window.innerHeight);
            
            // If the popup is open, reposition it next to the menu button
            if (this.menuPopup.isMenuOpen()) {
                // Get global position of menu button for accurate positioning
                const globalPos = this.toGlobal(this.menuBtn.position);
                
                this.menuPopup.positionNextToMenuButton(
                    globalPos.x,
                    globalPos.y,
                    this.menuBtn.width,
                    this.menuBtn.height
                );
                
                // Ensure the button texture is correct
                this.isMenuOpen = true;
                this.updateMenuButtonTextures();
            }
        }
    }
    
    /**
     * Position UI elements relative to the reference sprite
     * @param ref - Reference sprite for positioning
     */
    private positionElements(ref: Sprite): void {
        // Position menu button
        this.menuBtn.position.set(
            ref.position.x - ref.width*0.3, 
            this.menuBtn.height
        );
        
        // Position balance label
        this.balanceTxt.position.set(
            ref.position.x + ref.width*0.3, 
            this.menuBtn.y - this.balanceTxt.height/2
        );
        
        // Position balance amount
        this.currentBalanceTxt.position.set(
            this.balanceTxt.position.x + this.balanceTxt.width/2, 
            this.balanceTxt.position.y + this.balanceTxt.height
        );
    }
    
    /**
     * Clean up resources when container is destroyed
     */
    public destroy(options?: any): void {
        // Clean up menu button
        if (this.menuBtn) {
            this.menuBtn.destroy();
        }
        
        // Clean up menu popup
        if (this.menuPopup) {
            this.menuPopup.destroy();
        }
        
        // Call parent destroy method
        super.destroy(options);
    }
}