/**
 * Application configuration and scaling utilities
 */

/**
 * Main application configuration object
 */
export const config = {
	/** Logical width of the game (design width) */
	logicalWidth: 1920,
	
	/** Logical height of the game (design height) */
	logicalHeight: 1080,
	
	/** Current scale factor based on screen size */
	scaleFactor: 1,
	
	/** Minimum scale factor to maintain aspect ratio */
	minScaleFactor: 1,
	
	/**
	 * Calculate the top Y position for centered content
	 */
	get topY(): number {
		return (window.innerHeight - (this.logicalHeight * this.scaleFactor)) / 2;
	},
	
	/**
	 * Calculate the bottom Y position for centered content
	 */
	get bottomY(): number {
		return window.innerHeight - this.topY;
	},
	
	/**
	 * Calculate the left X position for centered content
	 */
	get leftX(): number {
		return (window.innerWidth - (this.logicalWidth * this.scaleFactor)) / 2;
	},
	
	/**
	 * Calculate the right X position for centered content
	 */
	get rightX(): number {
		return window.innerWidth - this.leftX;
	},
	
	/**
	 * Calculate the top Y position using minimum scale factor
	 */
	get minTopY(): number {
		return (window.innerHeight - (this.logicalHeight * this.minScaleFactor)) / 2;
	},
	
	/**
	 * Calculate the bottom Y position using minimum scale factor
	 */
	get minBottomY(): number {
		return window.innerHeight - this.minTopY;
	},
	
	/**
	 * Calculate the left X position using minimum scale factor
	 */
	get minLeftX(): number {
		return (window.innerWidth - (this.logicalWidth * this.minScaleFactor)) / 2;
	},
	
	/**
	 * Calculate the right X position using minimum scale factor
	 */
	get minRightX(): number {
		return window.innerWidth - this.minLeftX;
	}
};

/**
 * Calculate and update the scale factors based on current window size
 */
export const calculateScaleFactor = (): void => {
	const maxScaleFactor = Math.max(
		window.innerWidth / config.logicalWidth,
		window.innerHeight / config.logicalHeight
	);

	const minScaleFactor = Math.min(
		window.innerWidth / config.logicalWidth,
		window.innerHeight / config.logicalHeight
	);

	config.scaleFactor = maxScaleFactor;
	config.minScaleFactor = minScaleFactor;
};

/**
 * Get the maximum scale factor based on current window size
 * @returns The maximum scale factor
 */
export const getMaxScaleFactor = (): number => {
	return Math.max(
		window.innerWidth / config.logicalWidth,
		window.innerHeight / config.logicalHeight
	);
};

/**
 * Get the minimum scale factor based on current window size
 * @returns The minimum scale factor
 */
export const getMinScaleFactor = (): number => {
	return Math.min(
		window.innerWidth / config.logicalWidth,
		window.innerHeight / config.logicalHeight
	);
};
