import { Text, TextStyle } from "pixi.js";

/**
 * Enhanced TextLabel class that extends PIXI.Text with simplified creation and updating
 */
export class TextLabel extends Text {
    /**
     * Create a new text label with common properties
     * @param x - X position
     * @param y - Y position
     * @param anchor - Anchor point (0-1)
     * @param textToShow - Initial text content
     * @param size - Font size
     * @param defaultColor - Text color (hex)
     * @param font - Font family
     */
    constructor(
        x: number, 
        y: number, 
        anchor: number, 
        textToShow: string, 
        size: number, 
        public defaultColor: number = 0xff7f50, 
        font: string = "Lato"
    ) {
        const style = new TextStyle({
            fontFamily: font,
            fontSize: size,
            fill: defaultColor,
            align: 'center',
            wordWrap: true,
            wordWrapWidth: 440
        });
        
        super({text: textToShow, style});
        
        this.x = x;
        this.y = y;
        this.anchor.set(anchor);
    }

    /**
     * Update the text content
     * @param text - New text content
     */
    updateLabelText(text: string): void {
        this.text = text;
    }
    
    /**
     * Update the text color
     * @param color - New color (hex)
     */
    updateColor(color: number): void {
        this.style.fill = color;
    }
}