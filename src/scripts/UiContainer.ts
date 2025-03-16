import { extname } from "node:path";
import { Container, Sprite, Texture, FederatedPointerEvent } from "pixi.js";
import { Button, ButtonOptions } from "./Button";
import { Globals, formatNumber } from "./Globals";
import { TextLabel } from "./TextLabel";
import { config } from "./appConfig";
import { MenuPopup } from "./MenuPopup";
import { Easing, Tween } from "@tweenjs/tween.js";
import { LeaderboardPopup } from "./LeaderboardPopup"

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
    
    /** Leaderboard button */
    leaderboardBtn: Sprite = new Sprite(Globals.resources.LeaderBoard);
    
    /** Leaderboard popup */
    leaderboardPopup!: LeaderboardPopup;
    
    /** Track if menu is open to maintain correct button texture */
    private isMenuOpen: boolean = false;
    
    /** Track if leaderboard is open */
    private isLeaderboardOpen: boolean = false;
    
    /** Current animation tween for leaderboard button */
    private leaderboardBtnTween?: Tween<any>;
    
    /**
     * Create a new UI container
     */
    constructor() {
        super();
        
        this.createMenuButton();
        this.setupBalanceDisplay();
        this.createMenuPopup();
        this.setupLeaderboardButton();
        this.createLeaderboardPopup();
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
        
        // Set callback for when the menu is closed by tapping outside
        this.menuPopup.setOnCloseCallback(() => {
            // Update menu state
            this.isMenuOpen = false;
            
            // Update button textures
            this.updateMenuButtonTextures();
        });
        
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
     * Set up the leaderboard button
     */
    private setupLeaderboardButton(): void {
        // Set up leaderboard button
        this.leaderboardBtn.anchor.set(0.5);
        this.leaderboardBtn.scale.set(0.3 * config.scaleFactor);
        this.leaderboardBtn.eventMode = 'static';
        this.leaderboardBtn.cursor = 'pointer';
        
        // Add event listeners
        this.leaderboardBtn.on('pointerover', this.onLeaderboardButtonOver.bind(this));
        this.leaderboardBtn.on('pointerout', this.onLeaderboardButtonOut.bind(this));
        this.leaderboardBtn.on('pointerdown', this.onLeaderboardButtonDown.bind(this));
        this.leaderboardBtn.on('pointerup', this.onLeaderboardButtonUp.bind(this));
        this.leaderboardBtn.on('pointerupoutside', this.onLeaderboardButtonOut.bind(this));
    }
    
    /**
     * Create and configure the leaderboard popup
     */
    private createLeaderboardPopup(): void {
        this.leaderboardPopup = new LeaderboardPopup();
        this.addChild(this.leaderboardPopup);
    }
    
    /**
     * Handle leaderboard button hover
     */
    private onLeaderboardButtonOver(): void {
        if (this.isLeaderboardOpen) return;
        
        // Cancel any active tween
        if (this.leaderboardBtnTween) {
            this.leaderboardBtnTween.stop();
        }
        
        // Scale up animation
        const originalScale = 0.3 * config.scaleFactor;
        this.leaderboardBtnTween = new Tween(this.leaderboardBtn.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: originalScale * 1.1, 
                y: originalScale * 1.1 
            }, 200)
            .easing(Easing.Back.Out)
            .start();
    }
    
    /**
     * Handle leaderboard button out
     */
    private onLeaderboardButtonOut(): void {
        if (this.isLeaderboardOpen) return;
        
        // Cancel any active tween
        if (this.leaderboardBtnTween) {
            this.leaderboardBtnTween.stop();
        }
        
        // Scale back to original
        const originalScale = 0.3 * config.scaleFactor;
        this.leaderboardBtnTween = new Tween(this.leaderboardBtn.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: originalScale, 
                y: originalScale 
            }, 200)
            .easing(Easing.Back.Out)
            .start();
    }
    
    /**
     * Handle leaderboard button down
     */
    private onLeaderboardButtonDown(): void {
        // Cancel any active tween
        if (this.leaderboardBtnTween) {
            this.leaderboardBtnTween.stop();
        }
        
        // Scale down animation
        const originalScale = 0.3 * config.scaleFactor;
        this.leaderboardBtnTween = new Tween(this.leaderboardBtn.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: originalScale * 0.9, 
                y: originalScale * 0.9 
            }, 100)
            .easing(Easing.Cubic.Out)
            .start();
    }
    
    /**
     * Handle leaderboard button up
     */
    private onLeaderboardButtonUp(): void {
        // Toggle leaderboard popup
        this.toggleLeaderboard();
        
        // Cancel any active tween
        if (this.leaderboardBtnTween) {
            this.leaderboardBtnTween.stop();
        }
        
        // Scale back to original or slightly larger if open
        const originalScale = 0.3 * config.scaleFactor;
        const targetScale = this.isLeaderboardOpen ? originalScale * 1.1 : originalScale;
        
        this.leaderboardBtnTween = new Tween(this.leaderboardBtn.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: targetScale, 
                y: targetScale 
            }, 200)
            .easing(Easing.Back.Out)
            .start();
    }
    
    /**
     * Toggle the leaderboard popup
     */
    private toggleLeaderboard(): void {
        if (!this.leaderboardPopup) {
            console.error("Leaderboard popup is not initialized!");
            return;
        }
        
        // Toggle the popup
        this.leaderboardPopup.toggle();
        
        // Update state
        this.isLeaderboardOpen = this.leaderboardPopup.isMenuOpen();
        
        // If opening leaderboard, close menu if it's open
        if (this.isLeaderboardOpen && this.isMenuOpen) {
            this.menuPopup.close();
            this.isMenuOpen = false;
            this.updateMenuButtonTextures();
        }
    }
    
    /**
     * Add all UI elements to the container
     */
    private addChildren(): void {
        this.addChild(this.menuBtn);
        this.addChild(this.balanceTxt);
        this.addChild(this.currentBalanceTxt);
        this.addChild(this.leaderboardBtn);
        this.addChild(this.menuPopup);
        // Note: leaderboardPopup is already added in createLeaderboardPopup
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
        
        // Position the popup relative to the menu button
        this.positionMenuPopup();
        
        // Toggle menu popup
        this.menuPopup.toggle();
        
        // Update menu state
        this.isMenuOpen = this.menuPopup.isMenuOpen();
        
        // Update button textures based on menu state
        this.updateMenuButtonTextures();
        
        // If opening menu, close leaderboard if it's open
        if (!this.isMenuOpen && this.isLeaderboardOpen) {
            this.leaderboardPopup.close();
            this.isLeaderboardOpen = false;
        }
    }
    
    /**
     * Position the menu popup relative to the menu button
     */
    private positionMenuPopup(): void {
        // Get global position of menu button for accurate positioning
        const globalPos = this.toGlobal(this.menuBtn.position);
        
        // Get menu button dimensions
        const menuBtnWidth = this.menuBtn.width * this.menuBtn.scale.x;
        const menuBtnHeight = this.menuBtn.height * this.menuBtn.scale.y;
        
        // Calculate proper spacing based on screen size
        const spacing = 15 * config.scaleFactor;
        
        // Position the popup directly below the menu button
        // This creates a more consistent and predictable position
        this.menuPopup.positionNextToMenuButton(
            globalPos.x + menuBtnWidth/2, // Center horizontally with the button
            globalPos.y + menuBtnHeight + spacing, // Position below the button with proper spacing
            menuBtnWidth,
            menuBtnHeight
        );
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
        this.leaderboardBtn.scale.set(0.3 * config.scaleFactor);
        
        // Position elements
        this.positionElements(ref);
        
        // Resize menu popup
        if (this.menuPopup) {
            this.menuPopup.resize(window.innerWidth, window.innerHeight);
            
            // If the popup is open, reposition it relative to the menu button
            if (this.menuPopup.isMenuOpen()) {
                this.positionMenuPopup();
                
                // Ensure the button texture is correct
                this.isMenuOpen = true;
                this.updateMenuButtonTextures();
            }
        }
        
        // Resize leaderboard popup
        if (this.leaderboardPopup) {
            this.leaderboardPopup.resize();
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
        
        // Position leaderboard button
        this.leaderboardBtn.position.set(
            ref.position.x + ref.width*0.3,
            this.menuBtn.height
        );
        
        // Position balance label
        this.balanceTxt.position.set(
            window.innerWidth/2, 
            this.menuBtn.y - this.balanceTxt.height/2
        );
        
        // Position balance amount
        this.currentBalanceTxt.position.set(
            this.balanceTxt.position.x + this.balanceTxt.width, 
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
        
        // Clean up leaderboard button
        if (this.leaderboardBtn) {
            this.leaderboardBtn.off('pointerover');
            this.leaderboardBtn.off('pointerout');
            this.leaderboardBtn.off('pointerdown');
            this.leaderboardBtn.off('pointerup');
            this.leaderboardBtn.off('pointerupoutside');
            this.leaderboardBtn.destroy();
        }
        
        // Clean up leaderboard popup
        if (this.leaderboardPopup) {
            this.leaderboardPopup.destroy();
        }
        
        // Call parent destroy method
        super.destroy(options);
    }
}