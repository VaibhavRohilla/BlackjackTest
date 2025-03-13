import { Container, Graphics, Sprite, Texture, FederatedPointerEvent, Text } from "pixi.js";
import { Button, ButtonOptions } from "./Button";
import { Globals } from "./Globals";
import { Easing, Tween } from "@tweenjs/tween.js";
import { config } from "./appConfig";
import { Z_INDEX } from "./PopupManager";
import { TextLabel } from "./TextLabel";

/**
 * Callback type for menu button actions
 */
export type MenuButtonCallback = () => void;

/**
 * Simple button class for menu items with basic animations
 */
class MenuButton extends Container {
    /** Button background */
    private background: Graphics;
    
    /** Button icon */
    icon: Sprite;
    
    /** Button text */
    private text: Text;
    
    /** Original scale of the button */
    private originalScale: { x: number, y: number } = { x: 1, y: 1 };
    
    /** Whether the button is currently selected */
    private isSelected: boolean = false;
    
    /** Callback function to execute when button is clicked */
    private callback: MenuButtonCallback;
    
    /**
     * Create a new menu button
     * @param texture - Button icon texture
     * @param label - Button label text
     * @param callback - Function to call when button is clicked
     */
    constructor(texture: Texture, label: string, callback: MenuButtonCallback) {
        super();
        
        this.callback = callback;
        
        // Make the button interactive
        this.eventMode = 'static';
        this.cursor = 'pointer';
        
        this.icon = new Sprite(texture);
        this.icon.anchor.set(0.5);
        this.icon.scale.set(0.4);
        this.addChild(this.icon);
        
        // Create button background with rounded corners
        this.background = new Graphics();
        this.drawBackground(0xFFFFFF, 0.1, this.icon.width/2);
        this.addChild(this.background);
        
        // Create text label
        this.text = new TextLabel(0, 0, 0.5, label, 30, 0xFFFFFF);
        this.text.anchor.set(0.5);
        this.text.position.set(this.background.position.x + this.background.width*2, 0);
        this.addChild(this.text);
        
        // Set up event listeners
        this.on('pointerover', this.onPointerOver.bind(this));
        this.on('pointerout', this.onPointerOut.bind(this));
        this.on('pointerdown', this.onPointerDown.bind(this));
        this.on('pointerup', this.onPointerUp.bind(this));
        this.on('pointerupoutside', this.onPointerOut.bind(this));
    }
    
    /**
     * Draw the button background
     * @param color - Background color
     * @param alpha - Background alpha
     * @param radius - Background radius
     */
    private drawBackground(color: number, alpha: number, radius: number): void {
        this.background.clear();
        this.background.circle(0, 0, 30);
        this.background.fill({color: color, alpha: alpha});
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
        // Just darken the background on hover, no scale change
        this.drawBackground(0x000000, 0.3, this.icon.width/2);
    }
    
    /**
     * Handle pointer out event
     */
    private onPointerOut(): void {
        // Reset background color
        this.drawBackground(0xFFFFFF, 0.1, this.icon.width/2);
    }
    
    /**
     * Handle pointer down event
     */
    private onPointerDown(): void {
        // Scale down animation
        this.scale.set(
            this.originalScale.x * 0.9, 
            this.originalScale.y * 0.9
        );
        
        // Change background color
        this.drawBackground(0x000000, 0.5, this.icon.width/2);
    }
    
    /**
     * Handle pointer up event
     */
    private onPointerUp(): void {
        // Reset scale
        this.scale.set(
            this.originalScale.x,
            this.originalScale.y
        );
        
        // Reset background color
        this.drawBackground(0x000000, 0.3, this.icon.width/2);
        
        // Execute callback
        if (this.callback) {
            this.callback();
        }
    }
    
    /**
     * Set the selected state of the button
     * @param selected - Whether the button is selected
     */
    public setSelected(selected: boolean): void {
        this.isSelected = selected;
        
        // Update background color (no change for selection)
        this.drawBackground(0xFFFFFF, 0.1, this.icon.width/2);
        
        // Update icon and text tint
        const tintColor = selected ? 0xFFFF00 : 0xFFFFFF;
        this.icon.tint = tintColor;
        this.text.style.fill = tintColor;
    }
    
    /**
     * Clean up resources when button is destroyed
     */
    public destroy(options?: any): void {
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
 * Menu popup component with animated buttons
 */
export class MenuPopup extends Container {
    /** Background container */
    private background: Container;
    
    /** Background overlay */
    bgOverlay: Graphics;
    
    /** All menu buttons */
    private buttons: MenuButton[] = [];
    
    /** Button names for reference */
    private buttonNames: string[] = [];
    
    /** Whether the popup is currently open */
    private isOpen: boolean = false;
    
    /** Callbacks for buttons */
    private buttonCallbacks: Map<string, MenuButtonCallback> = new Map();
    
    /** Currently selected button (highlighted in yellow) */
    private selectedButton: string | null = null;
    
    /** Popup width and height */
    private popupWidth: number = 200;
    private popupHeight: number = 200;
    
    /** Padding inside the popup */
    private padding: number = 20;
    
    /** Spacing between buttons */
    private buttonSpacing: number = 15;
    
    /** Animation tweens */
    private openTweens: Tween<any>[] = [];
    
    /**
     * Create a new menu popup
     */
    constructor() {
        super();
        
        // Set high z-index to ensure it's on top
        this.zIndex = Z_INDEX.POPUPS + 10;
        
        // Create background container
        this.background = new Container();
        this.addChild(this.background);
        
        // Create semi-transparent background with rounded corners
        this.bgOverlay = new Graphics();
        this.background.addChild(this.bgOverlay);
        
        // Initially hide the popup
        this.visible = false;
        this.alpha = 0;
        
        // Set initial scale to 0 for animation
        this.scale.set(0);
        
        // Set the pivot point to top-left for proper scaling
        this.pivot.set(0, 0);
        
        // Add default buttons
        this.addButton('Sound', 'Sound', () => this.onButtonClicked('Sound'));
        this.addButton('Home', 'Home', () => this.onButtonClicked('Home'));
        this.addButton('Info', 'Info', () => this.onButtonClicked('Info'));
        this.addButton('Music', 'Music', () => this.onButtonClicked('Music'));
        
        // Position buttons and update size
        this.updateLayout();
    }
    
    /**
     * Add a button to the popup
     * @param iconName - Button icon name (used for texture)
     * @param label - Button label text
     * @param callback - Button callback
     * @returns The created button
     */
    public addButton(iconName: string, label: string, callback: MenuButtonCallback): MenuButton {
        const button = this.createButton(iconName, label, callback);
        this.buttons.push(button);
        this.buttonNames.push(iconName);
        this.buttonCallbacks.set(iconName, callback);
        this.background.addChild(button);
        
        // Update layout after adding a button
        this.updateLayout();
        
        return button;
    }
    
    /**
     * Remove a button from the popup
     * @param iconName - Name of the button to remove
     */
    public removeButton(iconName: string): void {
        const index = this.buttonNames.indexOf(iconName);
        if (index !== -1) {
            const button = this.buttons[index];
            this.background.removeChild(button);
            this.buttons.splice(index, 1);
            this.buttonNames.splice(index, 1);
            this.buttonCallbacks.delete(iconName);
            
            // Update layout after removing a button
            this.updateLayout();
        }
    }
    
    /**
     * Update the background size and appearance
     */
    private updateBackgroundSize(): void {
        const cornerRadius = 15;
        
        this.bgOverlay.clear();
        this.bgOverlay.roundRect(0, 0, this.popupWidth, this.popupHeight, cornerRadius);
        this.bgOverlay.fill({color: 0x093028, alpha: 0.9});
    }
    
    /**
     * Update the layout of the popup and its buttons
     */
    private updateLayout(): void {
        if (this.buttons.length === 0) return;
        
        // Calculate button scale based on popup size
        const buttonScale = 0.8 * config.scaleFactor;
        
        // Set button scales
        this.buttons.forEach(button => {
            button.setOriginalScale(buttonScale, buttonScale);
        });
        
        // Calculate the maximum width needed for buttons
        let maxButtonWidth = 0;
        let totalButtonHeight = 0;
        
        this.buttons.forEach(button => {
            // Get the width of the button including icon and text
            const buttonWidth = button.width;
            maxButtonWidth = Math.max(maxButtonWidth, buttonWidth);
            
            // Add to total height
            totalButtonHeight += button.height + this.buttonSpacing;
        });
        
        // Calculate popup dimensions based on content
        this.popupWidth = Math.max(200, maxButtonWidth + this.padding * 2);
        this.popupHeight = Math.max(200, totalButtonHeight + this.padding * 2);
        
        // Update background size
        this.updateBackgroundSize();
        
        // Position buttons
        this.positionButtons();
    }
    
    /**
     * Position buttons in the popup
     */
    private positionButtons(): void {
        if (this.buttons.length === 0) return;
        
        // Vertical layout
        const startY = this.padding + 20;
        const startX = this.padding + 20;
        
        let currentY = startY;
        
        this.buttons.forEach((button) => {
            button.position.set(startX, currentY);
            currentY += button.height * button.scale.y + this.buttonSpacing;
        });
    }
    
    /**
     * Create a button with the given name and options
     * @param iconName - Button icon name (used for texture)
     * @param label - Button label text
     * @param callback - Button callback
     * @returns The created button
     */
    private createButton(iconName: string, label: string, callback: () => void): MenuButton {
        const texture = Globals.resources[iconName];
        if (!texture) {
            console.error(`Texture for ${iconName} button not found`);
            // Use a simple white texture as fallback
            return new MenuButton(Texture.WHITE, label, callback);
        }
        
        return new MenuButton(texture, label, callback);
    }
    
    /**
     * Handle button click
     * @param buttonName - Name of the clicked button
     */
    private onButtonClicked(buttonName: string): void {
        // Toggle selection state
        if (this.selectedButton === buttonName) {
            // Deselect if already selected
            this.selectedButton = null;
            this.updateButtonSelection();
        } else {
            // Select the new button
            this.selectedButton = buttonName;
            this.updateButtonSelection();
        }
        
        // Call the appropriate callback
        const callback = this.buttonCallbacks.get(buttonName);
        if (callback) {
            callback();
        }
    }
    
    /**
     * Update button selection states
     */
    private updateButtonSelection(): void {
        // Update each button's selected state
        this.buttons.forEach((button, index) => {
            const buttonName = this.buttonNames[index];
            button.setSelected(this.selectedButton === buttonName);
        });
    }
    
    /**
     * Set callback for a specific button
     * @param buttonName - Name of the button
     * @param callback - Function to call when button is clicked
     */
    public setButtonCallback(buttonName: string, callback: MenuButtonCallback): void {
        this.buttonCallbacks.set(buttonName, callback);
    }
    
    /**
     * Position the popup next to the menu button
     * @param menuButtonX - X position of the menu button
     * @param menuButtonY - Y position of the menu button
     * @param menuButtonWidth - Width of the menu button
     * @param menuButtonHeight - Height of the menu button
     */
    public positionNextToMenuButton(menuButtonX: number, menuButtonY: number, menuButtonWidth: number, menuButtonHeight: number): void {
        // Position the popup to the right of the menu button
        this.position.set(
            menuButtonX + menuButtonWidth + 10, 
            menuButtonY
        );
        
        // Ensure the popup stays within the screen bounds
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Check if popup extends beyond right edge of screen
        if (this.position.x + this.popupWidth > screenWidth) {
            // Position to the left of the menu button instead
            this.position.x = menuButtonX - this.popupWidth - 10;
        }
        
        // Check if popup extends beyond bottom edge of screen
        if (this.position.y + this.popupHeight > screenHeight) {
            // Adjust Y position to fit within screen
            this.position.y = Math.max(0, screenHeight - this.popupHeight);
        }
        
        // Set the origin point for the popup (important for scaling animations)
        this.pivot.set(0, 0);
    }
    
    /**
     * Stop all active tweens
     */
    private stopActiveTweens(): void {
        this.openTweens.forEach(tween => {
            if (tween) tween.stop();
        });
        this.openTweens = [];
    }
    
    /**
     * Open the menu popup with animation
     */
    public open(): void {
        if (this.isOpen) return;
        
        this.isOpen = true;
        this.visible = true;
        
        // Ensure the popup is on top
        if (this.parent) {
            this.parent.addChild(this); // Move to top of display list
        }
        
        // Reset scale and alpha before animation
        this.scale.set(0);
        this.alpha = 0;
        
        // Stop any active tweens
        this.stopActiveTweens();
        
        // Simple animation for opening
        const alphaTween = new Tween(this, Globals.SceneManager?.tweenGroup)
            .to({ alpha: 1 }, 300)
            .easing(Easing.Cubic.Out)
            .start();
            
        const scaleTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
            .to({ x: 1, y: 1 }, 300)
            .easing(Easing.Back.Out)
            .start();
            
        this.openTweens.push(alphaTween, scaleTween);
    }
    
    /**
     * Close the menu popup with animation
     */
    public close(): void {
        if (!this.isOpen) return;
        
        this.isOpen = false;
        
        // Stop any active tweens
        this.stopActiveTweens();
        
        // Simple animation for closing
        const alphaTween = new Tween(this, Globals.SceneManager?.tweenGroup)
            .to({ alpha: 0 }, 300)
            .easing(Easing.Cubic.In)
            .start();
            
        const scaleTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
            .to({ x: 0, y: 0 }, 300)
            .easing(Easing.Back.In)
            .onComplete(() => {
                this.visible = false;
            })
            .start();
            
        this.openTweens.push(alphaTween, scaleTween);
    }
    
    /**
     * Toggle the menu popup (open if closed, close if open)
     */
    public toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    /**
     * Check if the menu is currently open
     * @returns True if the menu is open
     */
    public isMenuOpen(): boolean {
        return this.isOpen;
    }
    
    /**
     * Resize and position the menu popup
     * @param screenWidth - Screen width
     * @param screenHeight - Screen height
     */
    public resize(screenWidth: number, screenHeight: number): void {
        // Update layout to recalculate dimensions based on content
        this.updateLayout();
        
        // Ensure the popup doesn't exceed screen dimensions
        this.popupWidth = Math.min(this.popupWidth, screenWidth * 0.8);
        this.popupHeight = Math.min(this.popupHeight, screenHeight * 0.8);
        
        // Update background size
        this.updateBackgroundSize();
        
        // Reposition buttons
        this.positionButtons();
    }
    
    /**
     * Get a button by name
     * @param buttonName - Name of the button to get
     * @returns The button or undefined if not found
     */
    public getButton(buttonName: string): MenuButton | undefined {
        const index = this.buttonNames.indexOf(buttonName);
        return index !== -1 ? this.buttons[index] : undefined;
    }
    
    /**
     * Set the padding inside the popup
     * @param padding - Padding value in pixels
     */
    public setPadding(padding: number): void {
        this.padding = padding;
        this.updateLayout();
    }
    
    /**
     * Set the spacing between buttons
     * @param spacing - Spacing value in pixels
     */
    public setButtonSpacing(spacing: number): void {
        this.buttonSpacing = spacing;
        this.updateLayout();
    }
    
    /**
     * Clean up resources when popup is destroyed
     */
    public destroy(options?: any): void {
        // Stop any active tweens
        this.stopActiveTweens();
        
        // Clean up buttons
        this.buttons.forEach(button => {
            button.destroy();
        });
        this.buttons = [];
        this.buttonNames = [];
        this.buttonCallbacks.clear();
        
        // Call parent destroy method
        super.destroy(options);
    }
}