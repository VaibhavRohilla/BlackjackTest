import { Graphics, Sprite, Texture, Container } from "pixi.js";
import { config } from "./appConfig";
import { Globals } from "./Globals";
import * as TWEEN from "@tweenjs/tween.js";
import { log } from "node:console";
import { TextLabel } from "./TextLabel";
import { Easing, Tween } from "@tweenjs/tween.js";

export class Table extends Sprite {
    chipsContainer: Container = new Container();
    chips: Chips[] = [];
    private readonly totalChips = 6;
    private readonly premiumChips = 3; // 2K, 5K, 10K chips
    private currentRotation = 0;
    private RADIUS = 200; // Keep the same radius
    private readonly START_ANGLE = Math.PI * 1.18; // Adjusted to start more from bottom-left
    private readonly ARC_LENGTH = Math.PI * 0.8; // Reduced arc length for a tighter curve
    private showingAllChips: boolean = false;
    private toggleButton: Sprite = new Sprite();
    private buttonLabel: TextLabel = new TextLabel(0, 0, 0.5, "+", 36, 0xFFFFFF);
    
    // Store original positions for animation
    private chipOriginalPositions: Map<Chips, {x: number, y: number}> = new Map();
    private toggleButtonOriginalPosition: {x: number, y: number} | null = null;
    
    // Track whether chips are currently animated down
    private chipsAnimatedDown: boolean = false;
    
    // Callback for opening the shop popup
    private onShopButtonClick: (() => void) | null = null;

    constructor(texture: Texture) {
        super(texture);
        this.anchor.set(0.5);
        
        // Create toggle button
        
        this.setupChipsContainer();
        this.makeChips();
        this.createToggleButton();

        this.resize();
    }
    
    /**
     * Set a callback function to be executed when the shop button is clicked
     * @param callback - The function to call when the shop button is clicked
     */
    public setShopButtonCallback(callback: () => void): void {
        this.onShopButtonClick = callback;
    }
    
    private createToggleButton() {
        // Create toggle button using center zone chip sprite
        this.toggleButton = new Sprite(Globals.resources.chips_zone);
        this.toggleButton.anchor.set(0.5);
        this.toggleButton.scale.set(1*config.scaleFactor); // Increased scale
        this.toggleButton.alpha = 0.9;
        this.toggleButton.interactive = true;
        this.toggleButton.cursor = 'pointer';
        this.toggleButton.position.set(this.width/2, this.chips[0].position.y);
        this.toggleButton.on('pointerdown', this.toggleChipsVisibility.bind(this));
        
        // Set anchor for the label
        this.buttonLabel.anchor.set(0.5);
        
        // Add label to button
        this.toggleButton.addChild(this.buttonLabel);
        
        this.chipsContainer.addChild(this.toggleButton);
    }
    
    private toggleChipsVisibility() {
        // If we have a shop button callback, call it to open the shop popup
        if (this.onShopButtonClick) {
            // Animate the button
            new TWEEN.Tween(this.toggleButton, Globals.SceneManager?.tweenGroup)
                .to({ alpha: 0.5 }, 150)
                .yoyo(true)
                .repeat(1)
                .onComplete(() => {
                    // Call the shop button callback to open the popup
                    if (this.onShopButtonClick) {
                        this.onShopButtonClick();
                    }
                })
                .start();
            return;
        }
        
        // If no shop button callback, use the original behavior
        // Toggle the state
        this.showingAllChips = !this.showingAllChips;
        
        // Determine which chips to show/hide
        const visibleChips = this.showingAllChips ? 
            this.totalChips + this.premiumChips : // Show all chips including premium
            this.totalChips - 1; // Show basic chips except the last one
        
        // Animate the button
        new TWEEN.Tween(this.toggleButton, Globals.SceneManager?.tweenGroup)
            .to({ alpha: 0.5 }, 150)
            .yoyo(true)
            .repeat(1)
            .onComplete(() => {
                // Update the label text
                this.buttonLabel.updateLabelText(this.showingAllChips ? "-" : "+");
                
                // Hide the button completely if showing all chips
                if (this.showingAllChips) {
                    // Fade out the button
                    new Tween(this.toggleButton, Globals.SceneManager?.tweenGroup)
                        .to({ alpha: 0 }, 300)
                        .easing(Easing.Cubic.Out)
                        .onComplete(() => {
                            this.toggleButton.visible = false;
                        })
                        .start();
                }
            })
            .start();
        
        // Animate chips appearing/disappearing
        this.chips.forEach((chip, i) => {
            if (this.showingAllChips) {
                // Show all chips
                if (i < visibleChips) {
                    chip.visible = true;
                    
                    // If it's a premium chip, animate it appearing
                    if (i >= this.totalChips - 1) {
                        chip.alpha = 0;
                        chip.scale.set(0.2);
                        
                        // Animate fade in
                        new Tween(chip, Globals.SceneManager?.tweenGroup)
                            .to({ alpha: 1 }, 500)
                            .easing(Easing.Cubic.Out)
                            .start();
                        
                        // Animate scale up
                        new Tween(chip.scale, Globals.SceneManager?.tweenGroup)
                            .to({ x: 0.3, y: 0.3 }, 500)
                            .easing(Easing.Back.Out)
                            .start();
                    }
                }
            } else {
                // Show the toggle button when hiding chips
                this.toggleButton.visible = true;
                this.toggleButton.alpha = 0;
                
                // Fade in the button
                new Tween(this.toggleButton, Globals.SceneManager?.tweenGroup)
                    .to({ alpha: 0.9 }, 300)
                    .easing(Easing.Cubic.Out)
                    .start();
                    
                // Hide premium chips
                if (i >= visibleChips) {
                    // Animate fade out
                    new Tween(chip, Globals.SceneManager?.tweenGroup)
                        .to({ alpha: 0 }, 300)
                        .easing(Easing.Cubic.In)
                        .onComplete(() => {
                            chip.visible = false;
                        })
                        .start();
                }
            }
        });
        
        // Reposition chips to show/hide the premium chips
        this.positionChips(false, true);
    }
    
    /**
     * Unlock premium chips (2K, 5K, 10K)
     * This is called from the ShopPopup when the user clicks "Unlock"
     */
    public unlockPremiumChips(): void {
        // Set state to show all chips
        this.showingAllChips = true;
        
        // Update button label
        this.buttonLabel.updateLabelText("-");
        
        // Hide the toggle button
        new Tween(this.toggleButton, Globals.SceneManager?.tweenGroup)
            .to({ alpha: 0 }, 300)
            .easing(Easing.Cubic.Out)
            .onComplete(() => {
                this.toggleButton.visible = false;
            })
            .start();
        
        // Show all chips
        const visibleChips = this.totalChips + this.premiumChips;
        
        // Make all chips visible
        this.chips.forEach((chip, i) => {
            if (i < visibleChips) {
                chip.visible = true;
                
                // If it's a premium chip, animate it appearing
                if (i >= this.totalChips - 1) {
                    chip.alpha = 0;
                    chip.scale.set(0.2);
                    
                    // Animate fade in
                    new Tween(chip, Globals.SceneManager?.tweenGroup)
                        .to({ alpha: 1 }, 500)
                        .easing(Easing.Cubic.Out)
                        .start();
                    
                    // Animate scale up
                    new Tween(chip.scale, Globals.SceneManager?.tweenGroup)
                        .to({ x: 0.3, y: 0.3 }, 500)
                        .easing(Easing.Back.Out)
                        .start();
                }
            }
        });
        
        // Reposition chips
        this.positionChips(false, true);
    }

    private setupChipsContainer() {
        // Position container relative to table center
        this.chipsContainer.position.set(0, this.height * 0.8); // Position at 80% of table height
       
    }

    private makeChips() {
        const chipTextures =  [
            {value: 10, texture: Globals.resources.chip10},
            {value: 50, texture: Globals.resources.chip50}, 
            {value: 100, texture: Globals.resources.chip100},
            {value: 500, texture: Globals.resources.chip500},
            {value: 1000, texture: Globals.resources.chip1k},
            {value: 2000, texture: Globals.resources.chip2k},
            {value: 5000, texture: Globals.resources.chip5k},
            {value: 10000, texture: Globals.resources.chip10k}
        ]
        
        // Clear existing chips
        this.chips = [];
        this.chipsContainer.removeChildren();

        // Determine how many chips to show based on showingAllChips flag
        const chipsToShow = this.showingAllChips ? 
            this.totalChips + this.premiumChips : // Show all chips including premium
            this.totalChips - 1; // Show basic chips except the last one
        
        // Create new chips
        for (let i = 0; i < chipTextures.length; i++) {
            const chip = new Chips(chipTextures[i].texture, chipTextures[i].value);
            
            // Set initial visibility
            if (i >= chipsToShow) {
                chip.visible = false;
            }
            
            this.chips.push(chip);
            this.chipsContainer.addChild(chip);
        }
        
        // Create toggle button after clearing chips container
        this.createToggleButton();
        
        // Initial positioning
        this.positionChips(true);
    }

    private positionChips(immediate: boolean = false, animate: boolean = false) {
        if (!this.chips.length) return;

        // Determine how many chips to show based on showingAllChips flag
        const visibleChips = this.showingAllChips ? 
            this.totalChips + this.premiumChips : // Show all chips including premium
            this.totalChips - 1; // Show basic chips except the last one
        
        // Skip chips that should be hidden
        this.chips.forEach((chip, i) => {
            if (i >= visibleChips) {
                chip.visible = false;
            } else {
                chip.visible = true;
            }
        });
        
        // Adjust radius based on screen orientation
        const isPortrait = window.innerWidth < window.innerHeight;
        const baseRadius = isPortrait ? this.RADIUS * 0.8 : this.RADIUS;
        
        if (this.showingAllChips) {
            // CUSTOM FORMATION FOR ALL CHIPS
            // Define specific positions for each chip value
            const positions = [
                // First row - top
                { x: 0, y: baseRadius },                  // 10
                
                // Second row
                { x: -baseRadius*1.1     , y: -baseRadius * 0.3 },  // 50
                { x: -baseRadius * 0.65, y: -baseRadius * 0.65 },   // 100
                
                // Third row
                { x: 0, y: -baseRadius * 0.8 },  // 500

                { x: baseRadius  * 0.65    , y:  -baseRadius * 0.65  },               // 1K
                {x: baseRadius*1.1     , y: -baseRadius * 0.3 },   // 2K
                
                // Bottom row - 5K and 10K at the bottom
                { x: -baseRadius * 0.3, y:  -baseRadius * 0.3 },   // 5K
                { x: baseRadius * 0.3, y:  -baseRadius * 0.3}     // 10K
            ];
            
            // Position each visible chip
            for (let i = 0; i < visibleChips && i < positions.length; i++) {
                const chip = this.chips[i];
                if (!chip) continue;
                
                const targetX = positions[i].x;
                const targetY = positions[i].y;
                
                if (immediate) {
                    // Immediate positioning
                    chip.position.set(targetX, targetY);
                } else if (animate) {
                    // Animated positioning with proper easing
                    new TWEEN.Tween(chip.position, Globals.SceneManager?.tweenGroup)
                        .to({ x: targetX, y: targetY }, 500)
                        .easing(TWEEN.Easing.Back.Out)
                        .start();

                    new TWEEN.Tween(chip, Globals.SceneManager?.tweenGroup)
                        .to({ rotation: Math.PI * 2 }, 400)
                        .easing(TWEEN.Easing.Quadratic.Out)
                        .start();
                } else {
                    // Animated positioning with proper easing
                    new TWEEN.Tween(chip.position, Globals.SceneManager?.tweenGroup)
                        .to({ x: targetX, y: targetY }, 500)
                        .easing(TWEEN.Easing.Back.Out)
                        .start();

                    new TWEEN.Tween(chip, Globals.SceneManager?.tweenGroup)
                        .to({ rotation: Math.PI * 2 }, 400)
                        .easing(TWEEN.Easing.Quadratic.Out)
                        .start();
                }
            }
        } else {
            // ORIGINAL ARC FORMATION FOR BASIC CHIPS
            // Calculate angle step between chips with gaps
            const angleStep = this.ARC_LENGTH / (visibleChips - 1) * 0.85; // 0.85 factor creates gaps

            this.chips.forEach((chip, i) => {
                if (!chip || i >= visibleChips) return;
                
                // Calculate final position on arc
                const startAngle = this.START_ANGLE;
                const finalAngle = startAngle + (i * angleStep);
                const targetX = Math.cos(finalAngle) * baseRadius;
                const targetY = Math.sin(finalAngle) * baseRadius * 0.6; // Flatten the arc vertically
                
                if (immediate) {
                    // Immediate positioning
                    chip.position.set(targetX, targetY);
                } else if (animate) {
                    // Animated positioning with proper easing
                    new TWEEN.Tween(chip.position, Globals.SceneManager?.tweenGroup)
                        .to({ x: targetX, y: targetY }, 500)
                        .easing(TWEEN.Easing.Back.Out)
                        .start();

                    new TWEEN.Tween(chip, Globals.SceneManager?.tweenGroup)
                        .to({ rotation: Math.PI * 2 }, 400)
                        .easing(TWEEN.Easing.Quadratic.Out)
                        .start();
                } else {
                    // Animated positioning with proper easing
                    new TWEEN.Tween(chip.position, Globals.SceneManager?.tweenGroup)
                        .to({ x: targetX, y: targetY }, 500)
                        .easing(TWEEN.Easing.Back.Out)
                        .start();

                    new TWEEN.Tween(chip, Globals.SceneManager?.tweenGroup)
                        .to({ rotation: Math.PI * 2 }, 400)
                        .easing(TWEEN.Easing.Quadratic.Out)
                        .start();
                }
            });
        }
    }
 
    rotateChips() {
        // Store current positions and rotations
        const positions = this.chips.map(chip => ({
            x: chip.position.x,
            y: chip.position.y,
            rotation: chip.rotation
        }));

        // Rotate positions
        this.chips.forEach((chip, i) => {
            const nextIndex = (i + 1) % this.totalChips;
            const nextPos = positions[nextIndex];

            new TWEEN.Tween(chip.position, Globals.SceneManager?.tweenGroup)
                .to({ x: nextPos.x, y: nextPos.y }, 500)
                .easing(TWEEN.Easing.Quadratic.InOut)
                .start();

            new TWEEN.Tween(chip, Globals.SceneManager?.tweenGroup)
                .to({ rotation: nextPos.rotation }, 500)
                .easing(TWEEN.Easing.Quadratic.InOut)
                .start();
        });

        this.currentRotation++;
    }

    resize() {
        // Calculate scale based on screen size
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const baseScale = config.scaleFactor;
        
        const isPortrait = screenWidth < screenHeight;
        // Adjust scale based on aspect ratio
        let scale = isPortrait ? 
            baseScale * 0.3 : // Portrait
            baseScale * 0.4;  // Landscape

        // Update table position and scale
        this.scale.set(scale);
        this.height = screenHeight*1.6;

        if(isPortrait)
        this.width = screenWidth*1.05;
    
        this.position.set(window.innerWidth/2, screenHeight/2);

        // Position the chip container at the bottom of the table
        // This matches the screenshot where chips are in an arc at the bottom
        this.chipsContainer.position.set(
            0, // Center horizontally
            this.height * 0.5 // Position at 80% of table height
        );
        
        // Update all chips with consistent scaling
        this.chips.forEach(chip => {
            chip.scale.set(0.3);
            chip.updateOriginalScale();
        });
        
        // Position the toggle button
        const buttonY = this.height * 0.6; // Position lower at 50% of table height
        this.toggleButton.position.set(0, buttonY);
        
        // Scale the toggle button
        this.toggleButton.scale.set(0.5 * config.scaleFactor);
        this.toggleButton.position.set(this.toggleButton.width/4, -this.toggleButton.height*0.7);
        
        this.chipsContainer.scale.set(config.scaleFactor);
        this.chipsContainer.position.set(this.position.x, window.innerHeight);
        
        // Only reposition chips if they're not animated down
        if (!this.chipsAnimatedDown) {
            // Reposition chips normally
            this.positionChips(true); // Force immediate repositioning
        } else {
            // If chips are animated down, maintain their down position
            // We need to update the positions while keeping them down
            this.maintainChipsDownPosition();
        }
    }
    
    /**
     * Maintain the chips in their down position after resize
     */
    private maintainChipsDownPosition(): void {
        // First position chips normally to get their base positions
        this.positionChips(true);
        
        // Then immediately move them to their down position
        this.chips.forEach(chip => {
            // Move chip down while keeping its horizontal position
            chip.position.y = 20;
            
            // Keep reduced opacity
            chip.alpha = 0.7;
            
            // Keep chip non-interactive
            chip.interactive = false;
            chip.cursor = 'default';
        });
        
        // Also keep toggle button in down position, but only if it's visible (not showing all chips)
        if (this.toggleButton && !this.showingAllChips) {
            // Move toggle button down
            this.toggleButton.position.y = -this.toggleButton.height*0.7 + this.height * 0.3;
            
            // Keep reduced opacity
            this.toggleButton.alpha = 0.5;
            
            // Keep toggle button non-interactive
            this.toggleButton.interactive = false;
            this.toggleButton.cursor = 'default';
        } else if (this.toggleButton && this.showingAllChips) {
            // Keep toggle button hidden when showing all chips
            this.toggleButton.visible = false;
        }
    }
    makeButtonsActive(active: boolean) {
        this.chips.forEach(element => {
            element.interactive = active;
            element.cursor = active ? 'pointer' : 'default';
        });
    }
    
    /**
     * Animate chips down and out of the way when game starts
     */
    animateChipsDown(): void {
        // Set the state flag to indicate chips are animated down
        this.chipsAnimatedDown = true;
        
        // Store original positions for later restoration
        this.chips.forEach(chip => {
            // Store original position if not already stored
            if (!this.chipOriginalPositions.has(chip)) {
                this.chipOriginalPositions.set(chip, {
                    x: chip.position.x,
                    y: chip.position.y
                });
            }
            console.log(chip.position.y);
            
            // Calculate target position (move down and slightly to the side)
            const targetY = 20; // Move down by 30% of table height
            const targetX = chip.position.x; // Move slightly toward center
            
            // Animate chip moving down
            new Tween(chip.position, Globals.SceneManager?.tweenGroup)
                .to({ x: targetX, y: targetY }, 500)
                .easing(Easing.Back.In)
                .start();
            
            // Reduce opacity slightly
            new Tween(chip, Globals.SceneManager?.tweenGroup)
                .to({ alpha: 0.7 }, 500)
                .easing(Easing.Cubic.Out)
                .start();
            
            // Make chip non-interactive
            chip.interactive = false;
            chip.cursor = 'default';
        });
        
        // Also animate the toggle button down, but only if it's visible (not showing all chips)
        if (this.toggleButton && !this.showingAllChips) {
            // Store original position if not already stored
            if (!this.toggleButtonOriginalPosition) {
                this.toggleButtonOriginalPosition = {
                    x: this.toggleButton.position.x,
                    y: this.toggleButton.position.y
                };
            }
            
            // Calculate target position
            const targetY = this.toggleButton.position.y + this.height * 0.3;
            
            // Animate toggle button moving down
            new Tween(this.toggleButton.position, Globals.SceneManager?.tweenGroup)
                .to({ y: targetY }, 500)
                .easing(Easing.Back.In)
                .start();
            
            // Reduce opacity
            new Tween(this.toggleButton, Globals.SceneManager?.tweenGroup)
                .to({ alpha: 0.5 }, 500)
                .easing(Easing.Cubic.Out)
                .start();
            
            // Make toggle button non-interactive
            this.toggleButton.interactive = false;
            this.toggleButton.cursor = 'default';
        }
    }
    
    /**
     * Animate chips back up to their original positions when game ends
     */
    animateChipsUp(): void {
        // Reset the state flag to indicate chips are no longer animated down
        this.chipsAnimatedDown = false;
        
        // Animate chips back to their original positions
        this.chips.forEach(chip => {
            // Skip if original position wasn't stored
            if (!this.chipOriginalPositions.has(chip)) return;
            
            // Get original position
            const originalPosition = this.chipOriginalPositions.get(chip)!;
            
            // Animate chip moving back up
            new Tween(chip.position, Globals.SceneManager?.tweenGroup)
                .to({ x: originalPosition.x, y: originalPosition.y }, 500)
                .easing(Easing.Back.Out)
                .start();
            
            // Restore full opacity
            new Tween(chip, Globals.SceneManager?.tweenGroup)
                .to({ alpha: 1 }, 500)
                .easing(Easing.Cubic.Out)
                .start();
        });
        
        // Also animate the toggle button back up, but only if not showing all chips
        if (this.toggleButton && this.toggleButtonOriginalPosition) {
            // Only show the toggle button if not showing all chips
            if (!this.showingAllChips) {
                this.toggleButton.visible = true;
                
                // Animate toggle button moving back up
                new Tween(this.toggleButton.position, Globals.SceneManager?.tweenGroup)
                    .to({ 
                        x: this.toggleButtonOriginalPosition.x, 
                        y: this.toggleButtonOriginalPosition.y 
                    }, 500)
                    .easing(Easing.Back.Out)
                    .start();
                
                // Restore full opacity
                new Tween(this.toggleButton, Globals.SceneManager?.tweenGroup)
                    .to({ alpha: 0.9 }, 500)
                    .easing(Easing.Cubic.Out)
                    .start();
                
                // Make toggle button interactive again
                this.toggleButton.interactive = true;
                this.toggleButton.cursor = 'pointer';
            }
        }
    }
}

/**
 * Represents a chip on the table
 */
export class Chips extends Sprite {
    /** The value of the chip */
    value: number;
    
    /** Original scale of the chip */
    originalScale: { x: number, y: number } = { x: 1, y: 1 };
    
    /** Whether the chip is currently being hovered */
    isHovered: boolean = false;
    
    /** Whether the chip is currently active */
    isActive: boolean = true;
    
    /** Glow effect for the chip */
    glow: Graphics;
    
    /** Active animation tween */
    private activeTween?: Tween<any>;
    
    /**
     * Create a new chip
     * @param texture - The texture for the chip
     * @param value - The value of the chip
     */
    constructor(texture: Texture, value: number) {
        super(texture);
        this.value = value;
        this.anchor.set(0.5);
        
        // Create glow effect
        this.glow = new Graphics();
        this.glow.beginFill(0xFFFFFF, 0.3);
        this.glow.drawCircle(0, 0, this.width * 0.6);
        this.glow.endFill();
        this.glow.alpha = 0;
        this.glow.visible = false;
        this.addChild(this.glow);
        
        // Set up interactivity
        this.interactive = true;
        this.cursor = 'pointer';
        
        // Store original scale
        this.originalScale = { x: this.scale.x, y: this.scale.y };
        
        // Set up event listeners
        this.on('pointerover', this.onHover.bind(this));
        this.on('pointerout', this.onHoverEnd.bind(this));
        this.on('pointerdown', this.onClick.bind(this));
        this.on('pointerup', this.onRelease.bind(this));
    }
    
    /**
     * Handle pointer over event
     */
    private onHover(): void {
        if (!this.isActive) return;
        
        this.isHovered = true;
        
        // Show glow effect
        this.glow.visible = true;
        new Tween(this.glow, Globals.SceneManager?.tweenGroup)
            .to({ alpha: 0.5 }, 200)
            .easing(Easing.Cubic.Out)
            .start();
        
        // Scale up slightly
        new Tween(this.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: this.originalScale.x * 1.1, 
                y: this.originalScale.y * 1.1 
            }, 200)
            .easing(Easing.Back.Out)
            .start();
    }
    
    /**
     * Handle pointer out event
     */
    private onHoverEnd(): void {
        this.isHovered = false;
        
        // Hide glow effect
        new Tween(this.glow, Globals.SceneManager?.tweenGroup)
            .to({ alpha: 0 }, 200)
            .easing(Easing.Cubic.Out)
            .onComplete(() => {
                this.glow.visible = false;
            })
            .start();
        
        // Scale back to normal if not being clicked
        if (!this.isActive) return;
        
        new Tween(this.scale, Globals.SceneManager?.tweenGroup)
            .to({ 
                x: this.originalScale.x, 
                y: this.originalScale.y 
            }, 200)
            .easing(Easing.Back.Out)
            .start();
    }
    
    /**
     * Handle pointer down event
     */
    private onClick(): void {
        // Cancel any active animations first
        if (this.activeTween) {
            this.activeTween.stop();
            this.activeTween = undefined;
        }
        
        if (!this.isActive) return;
        
        if (this.value > Globals.Balance) {
            this.isActive = false;
            
            // Simple, elegant animation for insufficient balance
            const originalX = this.position.x;
            
            // Single smooth shake with subtle movement
            this.activeTween = new Tween(this.position, Globals.SceneManager?.tweenGroup)
                .to({ x: originalX - 4 }, 150)
                .easing(Easing.Sinusoidal.InOut)
                .yoyo(true)
                .repeat(1)
                .onComplete(() => {
                    this.position.x = originalX;
                    this.isActive = true;
                    this.activeTween = undefined;
                })
                .start();
            
            return;
        } else {
            Globals.Balance -= this.value;
            
            // Create scale animation
            this.activeTween = new Tween(this.scale, Globals.SceneManager?.tweenGroup)
                .to({ 
                    x: this.originalScale.x * 0.9, 
                    y: this.originalScale.y * 0.9 
                }, 100) // Scale down on click
                .easing(Easing.Cubic.Out)
                .start();
                
            Globals.emitter?.Call('CallChip', this);
        }
        
        console.log('Chip clicked');
    }
    
    /**
     * Handle pointer up event
     */
    private onRelease(): void {
        if (!this.isActive) return;
        
        // Scale back to hover size if still being hovered
        if (this.isHovered) {
            new Tween(this.scale, Globals.SceneManager?.tweenGroup)
                .to({ 
                    x: this.originalScale.x * 1.1, 
                    y: this.originalScale.y * 1.1 
                }, 200)
                .easing(Easing.Back.Out)
                .start();
        } else {
            // Otherwise scale back to normal
            new Tween(this.scale, Globals.SceneManager?.tweenGroup)
                .to({ 
                    x: this.originalScale.x, 
                    y: this.originalScale.y 
                }, 200)
                .easing(Easing.Back.Out)
                .start();
        }
    }
    
    /**
     * Update the original scale reference
     */
    updateOriginalScale(): void {
        this.originalScale = { x: this.scale.x, y: this.scale.y };
    }
} 