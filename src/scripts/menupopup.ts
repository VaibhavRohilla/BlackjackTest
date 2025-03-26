import { Container, Graphics, Sprite, Texture, FederatedPointerEvent, Text } from "pixi.js";
import { Easing, Tween } from "@tweenjs/tween.js";
import { config } from "./appconfig";
import { Globals } from "./globals";
import { Z_INDEX } from "./popupmanager";
import { TextLabel } from "./textlabel";

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
    
    /** Button width including icon and text */
    private fullWidth: number = 0;
    
    /** Button height */
    private fullHeight: number = 0;
    
    /** Background padding */
    private bgPadding: number = 10;
    
    /**
     * Create a new menu button
     * @param texture - Button icon texture
     * @param label - Button label text
     * @param callback - Function to call when button is clicked
     */
    constructor(public texture: Texture,public texture2: Texture |undefined, label: string, callback: MenuButtonCallback) {
        super();
        
        this.callback = callback;
        
        // Make the button interactive
        this.eventMode = 'static';
        this.cursor = 'pointer';
        
        // Create button background with rounded corners
        this.background = new Graphics();
        this.addChild(this.background);
        
        // Create icon sprite
        this.icon = new Sprite(texture);
        this.icon.anchor.set(0.5);
        this.icon.scale.set(0.4);
        this.background.addChild(this.icon);
        
        // Create text label with responsive font size
        const fontSize = Math.max(16, Math.min(30, window.innerWidth * 0.02));
        this.text = new TextLabel(0, 0, 0.5, label, fontSize, 0xFFFFFF);
        this.text.anchor.set(0, 0.5); // Align left, center vertically
        this.addChild(this.text);
        
        // Position icon and text
        this.updateLayout();
        
        // Draw initial background
        this.drawBackground(0xFFFFFF, 0.1);
        
        // Set up event listeners
        this.on('pointerover', this.onPointerOver.bind(this));
        this.on('pointerout', this.onPointerOut.bind(this));
        this.on('pointerdown', this.onPointerDown.bind(this));
        this.on('pointerup', this.onPointerUp.bind(this));
        this.on('pointerupoutside', this.onPointerOut.bind(this));
    }
    
    /**
     * Update the layout of the button components
     */
    private updateLayout(): void {
        // Position icon in the center of the circle
        this.icon.position.set(0, 0);
        
        // Position text to the right of the icon with spacing
        const textX = this.icon.width * 0.5 + this.bgPadding * 2;
        this.text.position.set(textX, 0);
        
        // Calculate full dimensions
        this.fullWidth = textX + this.text.width + this.bgPadding;
        this.fullHeight = Math.max(this.icon.height, this.text.height) + this.bgPadding * 2;
    }
    
    /**
     * Draw the button background
     * @param color - Background color
     * @param alpha - Background alpha
     */
    private drawBackground(color: number, alpha: number): void {
        // Update layout to get current dimensions
        this.updateLayout();
        
        // Draw circular background for the icon
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
        
        // Update background after scale change
        this.drawBackground(this.isSelected ? 0x000000 : 0xFFFFFF, this.isSelected ? 0.3 : 0.1);
    }
    
    /**
     * Handle pointer over event
     */
    private onPointerOver(): void {
        // Darken the background on hover
        this.drawBackground(0x000000, 0.3);
    }
    
    /**
     * Handle pointer out event
     */
    private onPointerOut(): void {
        // Reset background color based on selection state
        this.drawBackground(this.isSelected ? 0x000000 : 0xFFFFFF, this.isSelected ? 0.3 : 0.1);
    }
    
    /**
     * Handle pointer down event
     */
    private onPointerDown(): void {
        // Scale down animation
        this.scale.set(
            this.originalScale.x * 0.95, 
            this.originalScale.y * 0.95
        );
        
        // Change background color
        this.drawBackground(0x000000, 0.5);
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
        this.drawBackground(0x000000, 0.3);
        
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
        if(this.texture2){
            this.icon.texture = selected ? this.texture2 : this.texture;
        }
        // Update background color based on selection state
        this.drawBackground(selected ? 0x000000 : 0xFFFFFF, selected ? 0.3 : 0.1);
        
    }
    
    /**
     * Get the width of the button
     */
    public get width(): number {
        return this.fullWidth;
    }
    
    /**
     * Get the height of the button
     */
    public get height(): number {
        return this.fullHeight;
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
    
    /** Click capture overlay for closing the menu when clicking outside */
    private clickCaptureOverlay: Graphics;
    
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
    private padding: number = 0;
    
    /** Spacing between buttons */
    private buttonSpacing: number = 15;
    
    /** Animation tweens */
    private openTweens: Tween<any>[] = [];
    
    /** Callback for when the menu is closed */
    private onCloseCallback: (() => void) | null = null;
    
    /** Info overlay container */
    private infoOverlay: Container;
    
    /** Info overlay background */
    private infoOverlayBg: Graphics;
    
    /** Info text */
    private infoText: TextLabel;
    
    /** Whether the info overlay is currently open */
    private isInfoOpen: boolean = false;
    
    /** Background capture overlay for the info popup */
    private infoCapture: Graphics;
    
    /**
     * Create a new menu popup
     */
    constructor() {
        super();
        
        // Set high z-index to ensure it's on top
        this.zIndex = Z_INDEX.POPUPS + 10;
        
        // Create click capture overlay for closing when clicking outside
        this.clickCaptureOverlay = new Graphics();
        this.clickCaptureOverlay.rect(0, 0, window.innerWidth * 3, window.innerHeight * 3);
        this.clickCaptureOverlay.fill({ color: 0x000000, alpha: 0.01 }); // Nearly invisible
        this.clickCaptureOverlay.eventMode = 'static';
        this.clickCaptureOverlay.cursor = 'default';
        this.clickCaptureOverlay.on('pointerdown', this.onOverlayClick.bind(this));
        this.clickCaptureOverlay.zIndex = Z_INDEX.POPUP_OVERLAY - 1; // Below the popup
        // We'll add this to the stage when the menu opens
        
        // Create background container
        this.background = new Container();
        this.addChild(this.background);
        
        // Create semi-transparent background with rounded corners
        this.bgOverlay = new Graphics();
        this.background.addChild(this.bgOverlay);
        
        // Create info capture overlay (fullscreen overlay to capture clicks for info popup)
        this.infoCapture = new Graphics();
        this.infoCapture.rect(0, 0, window.innerWidth * 3, window.innerHeight * 3);
        this.infoCapture.fill({ color: 0x000000, alpha: 0.5 }); // Semi-transparent black
        this.infoCapture.eventMode = 'static';
        this.infoCapture.cursor = 'pointer';
        this.infoCapture.visible = false;
        this.infoCapture.zIndex = Z_INDEX.POPUPS + 15; // Just below the info overlay
        
        // Initialize info overlay
        this.infoOverlay = new Container();
        this.infoOverlay.visible = false;
        this.infoOverlay.eventMode = 'static';
        this.infoOverlay.cursor = 'pointer';
        this.infoOverlay.zIndex = Z_INDEX.POPUPS + 20;
        
        // Create info overlay background
        this.infoOverlayBg = new Graphics();
        this.infoOverlay.addChild(this.infoOverlayBg);
        
        // Create info text
        const fontSize = Math.max(18, Math.min(24, window.innerWidth * 0.03));
        this.infoText = new TextLabel(0, 0, 0.5, "", fontSize, 0xFFFFFF);
        this.infoText.style.wordWrap = true;
        this.infoText.style.wordWrapWidth = window.innerWidth * 0.8;
        this.infoText.style.align = 'center';
        this.infoText.anchor.set(0.5);
        this.infoOverlay.addChild(this.infoText);
        
        // Initially hide the popup
        this.visible = false;
        this.alpha = 0;
        
        // Set initial scale to 0 for animation
        this.scale.set(0);
        
        // Set the pivot point to top-left for proper scaling
        this.pivot.set(0, 0);
        
        // Add default buttons
        this.addButton({1: 'Home', 2: undefined}, 'Home', () => this.onButtonClicked('Home'));
        this.addButton({1: 'Info', 2: undefined}, 'Info', () => this.onButtonClicked('Info'));
        this.addButton({1: 'Sound', 2: 'Sound_Off'}, 'Sound', () => this.onButtonClicked('Sound'));
        this.addButton({1: 'Music', 2: 'Music_Off'}, 'Music', () => this.onButtonClicked('Music'));
        
        // Position buttons and update size
        this.updateLayout();
    }
    
    /**
     * Set a callback to be called when the menu is closed
     * @param callback - Function to call when menu is closed
     */
    public setOnCloseCallback(callback: () => void): void {
        this.onCloseCallback = callback;
    }
    
    /**
     * Handle click on the overlay (outside the menu)
     * @param event - The pointer event
     */
    private onOverlayClick(event: FederatedPointerEvent): void {
        // Close the menu when clicking outside
        if (this.isOpen) {
            // Get the tap position
            const tapX = event.global.x;
            const tapY = event.global.y;
            
            // Get the bounds of the menu background
            const bounds = this.background.getBounds();
            
            // Check if the tap is outside the menu bounds
            const isOutside = 
                tapX < bounds.x || 
                tapX > bounds.x + bounds.width || 
                tapY < bounds.y || 
                tapY > bounds.y + bounds.height;
            
            if (isOutside) {
                // Stop event propagation to prevent it from reaching elements below
                event.stopPropagation();
                console.log("Tap outside menu bounds, closing menu");
                this.close();
            } else {
                console.log("Tap inside menu bounds, keeping menu open");
            }
        }
    }

    /**
     * Resize the click capture overlay to match the screen size
     */
    private resizeClickCaptureOverlay(): void {
        this.clickCaptureOverlay.clear();
        // Make it much larger than the screen to ensure it covers everything
        this.clickCaptureOverlay.rect(0, 0, window.innerWidth * 3, window.innerHeight * 3);
        this.clickCaptureOverlay.fill({ color: 0x000000, alpha: 0.01 }); // Nearly invisible
        
        // Position it at the top-left corner of the screen
        this.clickCaptureOverlay.position.set(-window.innerWidth, -window.innerHeight);
    }
    
    /**
     * Add a button to the popup
     * @param iconName - Button icon name (used for texture)
     * @param label - Button label text
     * @param callback - Button callback
     * @returns The created button
     */
    public addButton(iconName: {1: string, 2 : string | undefined}, label: string, callback: MenuButtonCallback): MenuButton {
        const button = this.createButton(iconName, label, callback);
        this.buttons.push(button);
        this.buttonNames.push(iconName[1]);
        this.buttonCallbacks.set(iconName[1], callback);
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
        if (this.buttons.length === 0) return;
        
        // Calculate responsive padding based on screen size
        const responsivePadding = this.padding * config.scaleFactor;
        
        // Calculate the actual size needed based on button positions and dimensions
        let minLeft = Number.MAX_VALUE;
        let minTop = Number.MAX_VALUE;
        let maxRight = 0;
        let maxBottom = 0;
        
        // Find the boundaries of all buttons
        this.buttons.forEach(button => {
            const buttonLeft = button.position.x;
            const buttonTop = button.position.y;
            const buttonRight = buttonLeft + button.width * button.scale.x;
            const buttonBottom = buttonTop + button.height * button.scale.y;
            
            minLeft = Math.min(minLeft, buttonLeft);
            minTop = Math.min(minTop, buttonTop);
            maxRight = Math.max(maxRight, buttonRight);
            maxBottom = Math.max(maxBottom, buttonBottom);
        });
        
        // Ensure there's padding on all sides
        // The left and top padding should already be included in button positions
        // Add padding for right and bottom
        this.popupWidth = maxRight + responsivePadding - minLeft;
        this.popupHeight = maxBottom + responsivePadding - minTop;
        
        // Ensure minimum size
        this.popupWidth = Math.max(200 * config.scaleFactor, this.popupWidth);
        this.popupHeight = Math.max(200 * config.scaleFactor, this.popupHeight);
        
        // Apply rounded corners with responsive radius
        const cornerRadius = Math.min(15 * config.scaleFactor, Math.min(this.popupWidth, this.popupHeight) * 0.1);
        
        // Draw the background
        this.bgOverlay.clear();
        this.bgOverlay.roundRect(0, 0, this.popupWidth, this.popupHeight, cornerRadius);
        this.bgOverlay.fill({color: 0x093028, alpha: 0.9});
    }
    
    /**
     * Update the layout of the popup and its buttons
     */
    private updateLayout(): void {
        if (this.buttons.length === 0) return;
        
        // Calculate responsive button scale based on screen size
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const isPortrait = screenHeight > screenWidth;
        
        // Adjust scale based on device orientation and screen size
        let buttonScale =isPortrait ? 0.8 * config.scaleFactor : 0.7 * config.scaleFactor;
        
        // For smaller screens, reduce button scale further
        if (screenWidth < 768) {
            buttonScale *= 0.9;
        }
        
        // For very small screens, reduce even more
        if (screenWidth < 480) {
            buttonScale *= 0.9;
        }
        
        // Set button scales
        this.buttons.forEach(button => {
            button.setOriginalScale(buttonScale, buttonScale);
        });
        
        // Position buttons first
        this.positionButtons();
        
        // Then update background size based on button positions
        this.updateBackgroundSize();
        
        // Ensure the popup stays within screen bounds
        this.constrainToScreen(screenWidth, screenHeight);
    }
    
    /**
     * Ensure the popup stays within screen bounds
     * @param screenWidth - Screen width
     * @param screenHeight - Screen height
     */
    private constrainToScreen(screenWidth: number, screenHeight: number): void {
        // Check if popup extends beyond right edge of screen
        if (this.position.x + this.popupWidth > screenWidth) {
            // Adjust X position to fit within screen
            this.position.x = 0;
        }
        
        // Check if popup extends beyond bottom edge of screen
        if (this.position.y + this.popupHeight > screenHeight) {
            // Adjust Y position to fit within screen
            this.position.y = Math.max(this.background.height, screenHeight - this.popupHeight);
        }
        
        // Check if popup extends beyond left edge of screen
        if (this.position.x < 0) {
            this.position.x = this.background.width;
        }
        
        // Check if popup extends beyond top edge of screen
        if (this.position.y < 0) {
            this.position.y = this.background.height;
        }
    }
    
    /**
     * Position buttons in the popup
     */
    private positionButtons(): void {
        if (this.buttons.length === 0) return;
        
        // Calculate responsive padding and spacing based on screen size
        const responsivePadding = this.padding * config.scaleFactor;
        const responsiveSpacing = this.buttonSpacing * config.scaleFactor;
        
        // Vertical layout with proper top margin
        const startY = responsivePadding + this.buttons[0].height * this.buttons[0].scale.y*0.6;
        const startX = responsivePadding + this.buttons[0].width/2 * this.buttons[0].scale.x;
        
        let currentY = startY;
        
        // Position each button with proper margins
        this.buttons.forEach((button) => {
            // Position button with proper left and top margins
            button.position.set(startX, currentY);
            
            // Calculate next button position with responsive spacing
           
            currentY += responsiveSpacing*3.2;
        }); 
    }
    
    /**
     * Create a button with the given name and options
     * @param iconName - Button icon name (used for texture)
     * @param label - Button label text
     * @param callback - Button callback
     * @returns The created button
     */
    private createButton(iconName: {1: string, 2 : string | undefined}, label: string, callback: () => void): MenuButton {
        const texture = Globals.resources[iconName[1]];
        if(iconName[2]){
            const texture2 = Globals.resources[iconName[2]];
            return new MenuButton(texture, texture2, label, callback);
        }
        else{
            return new MenuButton(texture, undefined, label, callback);
        }
    }
    
    /**
     * Handle button click
     * @param buttonName - Name of the clicked button
     */
    private onButtonClicked(buttonName: string): void {
        // Handle info button specially
        if (buttonName === "Info") {
            this.showInfoOverlay();
            return; // Return early to prevent other callbacks
        }
        
        // Call the appropriate callback for other buttons
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
        // Get screen dimensions
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const isPortrait = screenHeight > screenWidth;
        
        // Update layout first to get correct dimensions
        this.updateLayout();
        
        // Calculate initial position (centered below the menu button)
        // The menuButtonX is already adjusted to center the popup in UiContainer
        let posX = menuButtonX;
        let posY = menuButtonY; // This already includes spacing from the button
        
        // Ensure the popup stays within screen bounds
        
        // // Check if popup would extend beyond right edge
        // if (posX + this.popupWidth > screenWidth) {
        //     posX = screenWidth - this.popupWidth - 10 * config.scaleFactor;
        // }
        
        // // Check if popup would extend beyond left edge
        // if (posX < 10 * config.scaleFactor) {
        //     posX = 10 * config.scaleFactor;
        // }
        
        // // Check if popup would extend beyond bottom edge
        // if (posY + this.popupHeight > screenHeight) {
        //     // If it would extend beyond bottom, position above the button instead
        //     posY = menuButtonY - this.popupHeight - 10 * config.scaleFactor;
            
        //     // If that would push it above the top edge, just position at top with margin
        //     if (posY < 10 * config.scaleFactor) {
        //         posY = 10 * config.scaleFactor;
        //     }
        // }
        
        // Set the position
        this.position.set(posX, posY);
        
        // Set the origin point for the popup (important for scaling animations)
        this.pivot.set(0, 0);
        
        // // For very small screens in portrait mode, consider centering the popup
        // if (isPortrait && screenWidth < 480) {
        //     this.position.set(
        //         (screenWidth - this.popupWidth) / 2,
        //         Math.min(posY, (screenHeight - this.popupHeight) / 2)
        //     );
        // }
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
            
            // Add the click capture overlay to the stage (parent)
            // This ensures it covers the entire screen
            if (!this.clickCaptureOverlay.parent) {
                this.parent.addChildAt(this.clickCaptureOverlay, 0); // Add at bottom of display list
            }
        }
        
        // Reset scale and alpha before animation
        this.scale.set(0);
        this.alpha = 0;
        
        // Make sure the click capture overlay is properly sized
        this.resizeClickCaptureOverlay();
        this.clickCaptureOverlay.visible = true;
        
        // Stop any active tweens
        this.stopActiveTweens();
        
        // Simple animation for opening
        const alphaTween = new Tween(this, Globals.sceneManager?.tweenGroup)
            .to({ alpha: 1 }, 300)
            .easing(Easing.Cubic.Out)
            .start();
            
        const scaleTween = new Tween(this.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: 1.3, y: 1.3 }, 300)
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
        const alphaTween = new Tween(this, Globals.sceneManager?.tweenGroup)
            .to({ alpha: 0 }, 300)
            .easing(Easing.Cubic.In)
            .start();
            
        const scaleTween = new Tween(this.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: 0, y: 0 }, 300)
            .easing(Easing.Back.In)
            .onComplete(() => {
                this.visible = false;
                
                // Remove the click capture overlay from the stage
                if (this.clickCaptureOverlay.parent) {
                    this.clickCaptureOverlay.parent.removeChild(this.clickCaptureOverlay);
                }
                
                // Call the close callback if it exists
                if (this.onCloseCallback) {
                    this.onCloseCallback();
                }
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
        // Update layout to recalculate dimensions based on content and screen size
        this.updateLayout();
        
        // Ensure the popup doesn't exceed screen dimensions with some margin
        const maxWidth = screenWidth * 0.9;
        const maxHeight = screenHeight * 0.9;
        
        // Reset scale if not constrained
        this.scale.set(1.3);
        
        // Ensure the popup stays within screen bounds
        this.constrainToScreen(screenWidth, screenHeight);
        
        // Resize the click capture overlay
        this.resizeClickCaptureOverlay();
        
        // Update info overlay if it's open
        if (this.isInfoOpen) {
            this.updateInfoOverlaySize();
            this.infoOverlay.position.set(screenWidth / 2, screenHeight / 2);
        }
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
     * Show the info overlay with game instructions
     */
    public showInfoOverlay(): void {
        if (this.isInfoOpen) return;
        
        console.log("Showing info overlay");
        
        // Set info overlay text content
        this.infoText.text = "Welcome to Blackjack!\n\n" +
            "Goal: Get closer to 21 than the dealer without going over.\n\n" +
            "Card Values:\n" +
            "• Number cards (2-10): Face value\n" +
            "• Face cards (J, Q, K): 10 points\n" +
            "• Ace: 1 or 11 points\n\n" +
            "Actions:\n" +
            "• Hit: Take another card\n" +
            "• Stand: End your turn\n" +
            "• Double Down: Double your bet and take one more card\n" +
            "• Split: With matching cards, split into two hands\n" +
            "• Insurance: When dealer shows Ace\n\n" +
            "Tap anywhere to close";
        
        // Update info overlay background size
        this.updateInfoOverlaySize();
        
        // Position info overlay in center of screen
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        this.infoOverlay.position.set(screenWidth / 2, screenHeight / 2);
        
        // Close the menu popup to prevent conflicts
        this.close();
        
        // Create a delay to prevent immediate closure
        setTimeout(() => {
            // Make sure we're still in a good state
            if (this.isInfoOpen) return;
            
            // Show the info capture overlay first
            this.infoCapture.position.set(-screenWidth, -screenHeight);
            this.infoCapture.visible = true;
            this.infoCapture.removeAllListeners();
            this.infoCapture.on('pointerdown', (event) => {
                event.stopPropagation();
                this.closeInfoOverlay();
            });
            
            // Add info overlay and capture to the stage (parent of menu popup)
            if (this.parent) {
                // Remove from menu popup if it's there
                if (this.infoOverlay.parent) {
                    this.infoOverlay.parent.removeChild(this.infoOverlay);
                }
                if (this.infoCapture.parent) {
                    this.infoCapture.parent.removeChild(this.infoCapture);
                }
                
                // Add to stage
                this.parent.addChild(this.infoCapture);
                this.parent.addChild(this.infoOverlay);
            }
            
            // Prepare for animation
            this.infoOverlay.visible = true;
            this.infoOverlay.alpha = 0;
            this.infoOverlay.scale.set(0.5);
            
            // Make sure the info overlay has the highest z-index
            this.infoOverlay.removeAllListeners();
            this.infoOverlay.on('pointerdown', (event) => {
                event.stopPropagation();
                this.closeInfoOverlay();
            });
            
            // Animate in
            new Tween(this.infoOverlay, Globals.sceneManager?.tweenGroup)
                .to({ alpha: 1, scale: { x: 1, y: 1 } }, 300)
                .easing(Easing.Back.Out)
                .start();
            
            this.isInfoOpen = true;
            console.log("Info overlay now visible and showing");
            
        }, 100); // Small delay to ensure menu closes first
    }
    
    /**
     * Close the info overlay
     */
    public closeInfoOverlay(): void {
        if (!this.isInfoOpen) {
            console.log("Info overlay not open, nothing to close");
            return;
        }
        
        console.log("Closing info overlay");
        
        // Set flag first to prevent race conditions
        this.isInfoOpen = false;
        
        // Remove all listeners to prevent memory leaks
        this.infoOverlay.removeAllListeners();
        this.infoCapture.removeAllListeners();
        
        // Hide the capture overlay
        this.infoCapture.visible = false;
        
        // Animate out
        new Tween(this.infoOverlay,Globals.sceneManager?.tweenGroup)
            .to({ alpha: 0, scale: { x: 0.5, y: 0.5 } }, 200)
            .easing(Easing.Back.In)
            .onComplete(() => {
                this.infoOverlay.visible = false;
                console.log("Info overlay closed and hidden");
            })
            .start();
    }
    
    /**
     * Update the info overlay size based on content
     */
    private updateInfoOverlaySize(): void {
        // Calculate info overlay dimensions
        const margin = 40 * config.scaleFactor;
        const textWidth = Math.min(window.innerWidth * 0.8, 600);
        this.infoText.style.wordWrapWidth = textWidth;
        
        // Position text in center
        this.infoText.position.set(0, 0);
        
        // Size background with padding around text
        const bgWidth = textWidth + margin * 2;
        const bgHeight = this.infoText.height + margin * 2;
        
        // Draw background with semi-transparent dark color and rounded corners
        this.infoOverlayBg.clear();
        this.infoOverlayBg.roundRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 15);
        this.infoOverlayBg.fill({ color: 0x000000, alpha: 0.9 });
        
        // Resize the info capture overlay
        this.infoCapture.clear();
        this.infoCapture.rect(0, 0, window.innerWidth * 3, window.innerHeight * 3);
        this.infoCapture.fill({ color: 0x000000, alpha: 0.5 });
        this.infoCapture.position.set(-window.innerWidth, -window.innerHeight);
    }
    
    /**
     * Clean up resources when popup is destroyed
     */
    public destroy(options?: any): void {
        // Stop any active tweens
        this.stopActiveTweens();
        
        // Remove event listeners
        this.clickCaptureOverlay.off('pointerdown');
        this.infoOverlay.off('pointerdown');
        this.infoCapture.off('pointerdown');
        
        // Remove the click capture overlay from its parent
        if (this.clickCaptureOverlay.parent) {
            this.clickCaptureOverlay.parent.removeChild(this.clickCaptureOverlay);
        }
        
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