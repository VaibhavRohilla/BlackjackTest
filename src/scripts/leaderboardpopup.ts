import { Container, Graphics, Sprite, Texture, Text } from "pixi.js";
import { Globals, formatNumber } from "./globals";
import { Easing, Tween } from "@tweenjs/tween.js";
import { TextLabel } from "./textlabel";
import { Z_INDEX } from "./popupmanager";
import { LeaderboardService, LeaderboardEntry } from "./services/leaderboardservice";

/**
 * Player data for the leaderboard
 */
interface LeaderboardPlayer {
    rank: number;
    name: string;
    avatar: string | Texture;
    payout: number;
    prize: number;
    country?: string;
}

/**
 * Leaderboard popup component that displays player rankings
 */
export class LeaderboardPopup extends Container {
    private leaderboardService: LeaderboardService;
    
    /** Background overlay */
    private overlay: Graphics;
    
    /** Popup container */
    private popupContainer: Container;
    
    /** Popup background */
    private background: Sprite;
    
    /** Close button container */
    private closeButtonContainer: Container;
    
    /** Close button sprite */
    private closeButton: Sprite;
    
    /** Title text */
    private titleText: TextLabel;
    
    /** Prize pool text - not used in current implementation */
    private prizePoolText: TextLabel = new TextLabel(0, 0, 0.5, "", 16, 0xFFFFFF);
    
    /** Prize amount text */
    private prizeAmountText: TextLabel;
    
    /** Tab buttons container */
    private tabsContainer: Container;
    
    /** Tab buttons */
    private tabButtons: { [key: string]: Container } = {};
    
    /** Active tab */
    private activeTab: string = 'DAILY';
    
    /** Tab background */
    private tabBackground: Graphics = new Graphics();
    
    /** Tab indicator that slides to the selected tab */
    private tabIndicator: Graphics = new Graphics();
    
    /** Player entries container */
    private entriesContainer: Container;
    
    /** Header row */
    private headerRow: Container = new Container();
    
    /** Player rows */
    private playerRows: Container[] = [];
    
    /** Current player row */
    private currentPlayerRow: Container | null = null;
    
    /** Whether the popup is currently open */
    private isOpen: boolean = false;
    
    /** Animation tweens */
    private tweens: Tween<any>[] = [];
    
    /** Sample player data */
    private samplePlayers: LeaderboardPlayer[] = [
        { rank: 1, name: "Player_4564_88df5...", avatar: Globals.resources.avatar, payout: 314000, prize: 9350000, country: "US" },
        { rank: 2, name: "Darrell Steward", avatar: Globals.resources.avatar, payout: 186000, prize: 4540300, country: "UK" },
        { rank: 3, name: "Ralph Edwards", avatar: Globals.resources.avatar, payout: 131000, prize: 910840, country: "ID" },
        { rank: 4, name: "Floyd Miles", avatar: Globals.resources.avatar, payout: 101000, prize: 200000, country: "US" },
        { rank: 5, name: "Bessie Cooper", avatar: Globals.resources.avatar, payout: 64000, prize: 500, country: "US" },
        { rank: 6, name: "Brooklyn Simmons", avatar: Globals.resources.avatar, payout: 50000, prize: 500, country: "UK" },
        { rank: 7, name: "Leslie Alexander", avatar: Globals.resources.avatar, payout: 22500, prize: 500, country: "US" },
        { rank: 8, name: "Robert Fox", avatar: Globals.resources.avatar, payout: 22000, prize: 500, country: "US" },
        { rank: 9, name: "Marvin McKinney", avatar: Globals.resources.avatar, payout: 18850, prize: 500, country: "US" },
        { rank: 10, name: "Kristin Watson", avatar: Globals.resources.avatar, payout: 17600, prize: 500, country: "US" }
    ];
    
    /** Current user data */
    private currentUser: LeaderboardPlayer = {
        rank: 0,
        name: "Builder",
        avatar: Globals.resources.avatar,
        payout: 0,
        prize: 0
    };
    
    /**
     * Create a new leaderboard popup
     */
    constructor() {
        super();
        
        this.leaderboardService = LeaderboardService.getInstance();
        
        // Set high z-index to ensure it's on top
        this.zIndex = Z_INDEX.POPUPS + 20;
        
        // Create semi-transparent overlay
        this.overlay = new Graphics();
        this.overlay.interactive = true;
        this.addChild(this.overlay);
        
        // Create popup container
        this.popupContainer = new Container();
        this.popupContainer.sortableChildren = true;
        this.addChild(this.popupContainer);
        
        // Create popup background
        this.background = new Sprite(Globals.resources.LeaderBoardBG);
        this.background.anchor.set(0.5);
        this.popupContainer.addChild(this.background);
        
        // Create close button with background for better visibility
        this.closeButtonContainer = new Container();
        this.closeButtonContainer.zIndex = 10;
        
        
        // Create the close button sprite
        this.closeButton = new Sprite(Globals.resources.CloseButton);
        this.closeButton.anchor.set(0.5);
        this.closeButton.scale.set(0.3); // Larger for better visibility
        this.closeButtonContainer.addChild(this.closeButton);
        
        // Set up interactivity for the container
        this.closeButtonContainer.eventMode = 'static';
        this.closeButtonContainer.cursor = 'pointer';
        this.closeButtonContainer.on('pointerdown', this.close.bind(this));
        this.closeButtonContainer.on('pointerover', () => {
        
            this.closeButton.scale.set(0.35);
        });
        this.closeButtonContainer.on('pointerout', () => {
            this.closeButton.scale.set(0.3);
        });
        
        this.popupContainer.addChild(this.closeButtonContainer);
        
        // Create title text with improved sharpness
        this.titleText = new TextLabel(0, 0, 0.5, "Prize pool", 15, 0xFFFFFF);
        this.titleText.anchor.set(0.5, 0);
        this.titleText.style.fontWeight = "bold";
        this.titleText.resolution = 2; // Higher resolution for sharper text
        this.titleText.zIndex = 1;
        this.popupContainer.addChild(this.titleText);
        
        // Create prize pool amount text with improved sharpness
        this.prizeAmountText = new TextLabel(0, 0, 0.5, "500 000 Chips", 15, 0xFFFF00);
        this.prizeAmountText.anchor.set(1, 0);
        this.prizeAmountText.style.fontWeight = "bold";
        this.prizeAmountText.resolution = 2; // Higher resolution for sharper text
        this.prizeAmountText.zIndex = 1;
        this.popupContainer.addChild(this.prizeAmountText);
        
        // Create tabs container
        this.tabsContainer = new Container();
        this.tabsContainer.zIndex = 1;
        this.popupContainer.addChild(this.tabsContainer);
        
        // Set initial width for proper calculations
        this.popupContainer.width = Math.min(500, window.innerWidth * 0.9);
        
        // Create tab buttons
        this.createTabButtons();
        
        // Create entries container
        this.entriesContainer = new Container();
        this.entriesContainer.zIndex = 1;
        this.popupContainer.addChild(this.entriesContainer);
        
        // Create header row
        this.createHeaderRow();
        
        // Initially hide the popup
        this.visible = false;
        
    }
    
    /**
     * Create tab buttons for different time periods
     */
    private createTabButtons(): void {
        const tabs = ["HOURLY", "DAILY", "WEEKLY"];
        
        // Clear existing tabs
        this.tabsContainer.removeChildren();
        this.tabButtons = {};
        
        // Calculate responsive dimensions
        const containerWidth = this.popupContainer.width || 500;
        const isSmallScreen = containerWidth < 400;
        
        // Adjust dimensions for mobile view
        const tabWidth = isSmallScreen ? Math.floor((containerWidth * 0.9) / 3) - 10 : 143;
        const tabHeight = isSmallScreen ? 30 : 40;
        const spacing = isSmallScreen ? 5 : 10;
        const fontSize = isSmallScreen ? 9 : 12;
        const totalWidth = tabs.length * tabWidth + (tabs.length - 1) * spacing;
        
        // Create a single background for all tabs
        this.tabBackground = new Graphics();
        this.tabBackground.roundRect(0, 0, totalWidth, tabHeight, 20);
        this.tabBackground.fill(0x000000);
        this.tabBackground.alpha = 0.2;
        this.tabsContainer.addChild(this.tabBackground);
        
        // Create sliding indicator
        this.tabIndicator = new Graphics();
        this.tabIndicator.roundRect(0, 0, tabWidth, tabHeight, 20);
        this.tabIndicator.fill(0x00AA00);
        this.tabIndicator.alpha = 0.8;
        this.tabsContainer.addChild(this.tabIndicator);
        
        // Position indicator at the active tab initially
        const activeIndex = tabs.indexOf(this.activeTab);
        if (activeIndex >= 0) {
            this.tabIndicator.position.x = activeIndex * (tabWidth + spacing);
        }
        
        tabs.forEach((tab, index) => {
            // Create tab container
            const tabContainer = new Container();
            tabContainer.eventMode = 'static';
            tabContainer.cursor = 'pointer';
            
            // Create tab text with improved sharpness
            const tabText = new TextLabel(tabWidth / 2, tabHeight / 2, 0.5, tab, fontSize, 0xFFFFFF);
            tabText.style.fontWeight = "bold";
            tabText.resolution = 2; // Higher resolution for sharper text
            tabContainer.addChild(tabText);
            
            // Position tab
            tabContainer.position.set(index * (tabWidth + spacing), 0);
            
            // Add event listener
            tabContainer.on('pointerdown', () => this.setActiveTab(tab, tabWidth, spacing));
            
            // Store reference
            this.tabButtons[tab] = tabContainer;
            this.tabsContainer.addChild(tabContainer);
        });
    }
    
    /**
     * Set the active tab
     * @param tab - Tab name
     * @param tabWidth - Width of each tab
     * @param spacing - Spacing between tabs
     */
    private setActiveTab(tab: string, tabWidth?: number, spacing?: number): void {
        if (tab === this.activeTab) return;
        
        // Get the old and new tab indices
        const tabs = ["HOURLY", "DAILY", "WEEKLY"];
        const oldIndex = tabs.indexOf(this.activeTab);
        const newIndex = tabs.indexOf(tab);
        
        // Update active tab
        this.activeTab = tab;
        
        // Use provided dimensions or calculate based on container size
        const containerWidth = this.popupContainer.width || 500;
        const isSmallScreen = containerWidth < 400;
        
        // Adjust dimensions for mobile view
        const tw = tabWidth || (isSmallScreen ? Math.floor((containerWidth * 0.9) / 3) - 10 : 143);
        const sp = spacing || (isSmallScreen ? 5 : 10);
        
        // Animate the indicator to the new position
        const targetX = newIndex * (tw + sp);
        
        new Tween(this.tabIndicator.position, Globals.sceneManager?.tweenGroup)
            .to({ x: targetX }, 300)
            .easing(Easing.Cubic.Out)
            .start();
        
        // Refresh leaderboard data
        this.refreshLeaderboard();
    }
    
    /**
     * Create the header row for the leaderboard
     */
    private createHeaderRow(): void {
        // Clear existing content
        this.headerRow.removeChildren();
        
        // Calculate responsive dimensions
        const containerWidth = this.popupContainer.width || 500;
        const isSmallScreen = containerWidth < 400;
        const contentWidth = Math.min(400, containerWidth * 0.9);
        const rowHeight = isSmallScreen ? 35 : 40;
        const fontSize = isSmallScreen ? 10 : 12;
        
        // Create header labels with improved sharpness
        const columns = [
            { text: "USER", x: contentWidth * 0.2, width: contentWidth * 0.3 },
            { text: "PAYOUT", x: contentWidth * 0.55, width: contentWidth * 0.2 },
            { text: "PRIZE", x: contentWidth * 0.8, width: contentWidth * 0.2 }
        ];
        
        columns.forEach(column => {
            const label = new TextLabel(column.x, rowHeight / 2, 0.5, column.text, fontSize, 0xFFFFFF);
            label.style.fontWeight = "lighter";
            label.resolution = 2; // Higher resolution for sharper text
            this.headerRow.addChild(label);
        });
        
        this.entriesContainer.addChild(this.headerRow);
    }
    
    /**
     * Refresh the leaderboard with current data
     */
    private refreshLeaderboard(): void {
        // Clear existing player rows
        this.playerRows.forEach(row => {
            row.destroy();
        });
        this.playerRows = [];
        
        if (this.currentPlayerRow) {
            this.currentPlayerRow.destroy();
            this.currentPlayerRow = null;
        }
        
        // Get current data
        const leaderboardData = this.leaderboardService.getLeaderboardData();
        const currentUser = this.leaderboardService.getCurrentUserEntry();
        
        // Calculate responsive dimensions
        const containerWidth = this.popupContainer.width || 500;
        const isSmallScreen = containerWidth < 400;
        const contentWidth = Math.min(400, containerWidth * 0.9);
        const rowHeight = isSmallScreen ? 35 : 40;
        const fontSize = isSmallScreen ? 10 : 12;
        
        // Create player rows from actual data
        leaderboardData.forEach((player, index) => {
            const row = this.createPlayerRow({
                rank: player.rank,
                name: player.username,
                avatar: player.avatar,
                payout: player.chips,
                prize: player.chips,
                country: player.country
            }, index);
            this.playerRows.push(row);
            this.entriesContainer.addChild(row);
        });
        
        // Create current player row if available
        if (currentUser) {
            this.currentPlayerRow = this.createPlayerRow({
                rank: currentUser.rank,
                name: currentUser.username,
                avatar: currentUser.avatar,
                payout: currentUser.chips,
                prize: currentUser.chips,
                country: currentUser.country
            }, -1, true);
            this.entriesContainer.addChild(this.currentPlayerRow);
        }
        
        // Position rows
        this.positionRows();
        
        // Apply responsive formatting
        this.updateRowDimensions(contentWidth, rowHeight, fontSize);
    }
    
    /**
     * Create a player row
     * @param player - Player data
     * @param index - Row index
     * @param isCurrentUser - Whether this is the current user
     * @returns The created row container
     */
    private createPlayerRow(player: LeaderboardPlayer, index: number, isCurrentUser: boolean = false): Container {
        const row = new Container();
        const rowHeight = 40;
        
        // Calculate responsive dimensions
        const containerWidth = this.popupContainer.width || 500;
        const isSmallScreen = containerWidth < 400;
        const contentWidth = Math.min(400, containerWidth * 0.9);
        const fontSize = isSmallScreen ? 10 : 12;
        
        // Create row background
        const rowBg = new Graphics();
        rowBg.roundRect(0, 0, contentWidth, rowHeight, 10);
        rowBg.fill(0x000000);
        // Different background color for current user
        if (isCurrentUser) {
            rowBg.fill(0x093028);
            rowBg.alpha = 0.5;
        } else {
            rowBg.alpha = index % 2 === 0 ? 0.2 : 0;
        }
        
        row.addChild(rowBg);
        
        // Create rank number with improved sharpness
        const rankText = new TextLabel(contentWidth * 0.075, rowHeight / 2, 0.5, player.rank.toString(), fontSize, 0xFFFFFF);
        rankText.resolution = 2; // Higher resolution for sharper text
        row.addChild(rankText);
        
        // Create avatar placeholder
        let avatarTexture: Texture;
        if (typeof player.avatar === 'string') {
            // Try to get texture from resources
            avatarTexture = Globals.resources[player.avatar] || Texture.WHITE;
        } else {
            avatarTexture = player.avatar;
        }
        
        const avatar = new Sprite(avatarTexture);
        avatar.anchor.set(0.5);
        avatar.width = avatar.height = rowHeight * 0.6;
        avatar.position.set(contentWidth * 0.15, rowHeight / 2);
        row.addChild(avatar);
        
        // Create player name with improved sharpness
        const nameText = new TextLabel(contentWidth * 0.25, rowHeight / 2, 0, player.name, fontSize, 0xFFFFFF);
        nameText.anchor.set(0, 0.5);
        nameText.resolution = 2; // Higher resolution for sharper text
        
        // Truncate long names based on available width
        const maxNameWidth = contentWidth * 0.25; // Limit name width
        if (nameText.width > maxNameWidth) {
            // Calculate how many characters can fit
            const charWidth = nameText.width / nameText.text.length;
            const maxChars = Math.floor(maxNameWidth / charWidth) - 3; // -3 for "..."
            nameText.text = player.name.substring(0, maxChars) + "...";
        }
        
        row.addChild(nameText);
        
        // Create payout amount with improved sharpness
        let payoutDisplay = formatNumber(player.payout);
        // Format and truncate payout for small screens
        if (isSmallScreen && player.payout >= 1000) {
            payoutDisplay = this.abbreviateNumber(player.payout);
        }
        
        const payoutText = new TextLabel(contentWidth * 0.55, rowHeight / 2, 0.5, payoutDisplay, fontSize, 0xFFFFFF);
        payoutText.resolution = 2; // Higher resolution for sharper text
        row.addChild(payoutText);
        
        // Create prize amount with improved sharpness
        let prizeDisplay = formatNumber(player.prize);
        // Format and truncate prize for small screens
        if (isSmallScreen && player.prize >= 1000) {
            prizeDisplay = this.abbreviateNumber(player.prize);
        }
        
        const prizeText = new TextLabel(contentWidth * 0.8, rowHeight / 2, 0.5, prizeDisplay, fontSize, 0xFFFFFF);
        prizeText.resolution = 2; // Higher resolution for sharper text
        row.addChild(prizeText);
        
        return row;
    }
    
    /**
     * Position all rows in the leaderboard
     */
    private positionRows(): void {
        // Calculate responsive dimensions
        const containerWidth = this.popupContainer.width || 500;
        const isSmallScreen = containerWidth < 400;
        const rowHeight = isSmallScreen ? 35 : 40;
        
        // Position header row
        this.headerRow.position.set(0, 0);
        
        // Position player rows
        this.playerRows.forEach((row, index) => {
            row.position.set(0, rowHeight + index * rowHeight);
        });
        
        // Position current player row at the bottom
        if (this.currentPlayerRow) {
            this.currentPlayerRow.position.set(0, rowHeight + this.playerRows.length * rowHeight + 10);
        }
    }
    
    /**
     * Draw the popup background
     * @param width - Popup width
     * @param height - Popup height
     */
    private drawBackground(width: number, height: number): void {
        // Draw semi-transparent overlay
        this.overlay.clear();
        this.overlay.rect(0, 0, window.innerWidth, window.innerHeight);
        this.overlay.fill({color:0x000000, alpha: 0.7});
        
        // Adjust background size for mobile
        const isSmallScreen = width < 400;
        const bgHeight = isSmallScreen ? height * 0.9 : height * 1.1;
        
        this.background.width = width;
        this.background.height = bgHeight;
        this.background.position.set(width/2, height/2);
    }
    
    /**
     * Position all elements in the popup
     * @param width - Popup width
     * @param height - Popup height
     */
    private positionElements(width: number, height: number): void {
        // Calculate responsive dimensions
        const isSmallScreen = width < 400;
        const contentWidth = Math.min(400, width * 0.9);
        const rowHeight = isSmallScreen ? 35 : 40;
        const fontSize = isSmallScreen ? 10 : 12;
        const headerFontSize = isSmallScreen ? 12 : 15;
        
        // Position close button in top-right corner with padding
        this.closeButtonContainer.position.set(width - this.closeButtonContainer.width/2 , 0);
        
        // Position title text
        this.titleText.position.set(width * 0.1, 50);
        this.titleText.style.fontSize = headerFontSize;
        
        // Position prize amount text
        this.prizeAmountText.position.set(width * 0.9, 50);
        this.prizeAmountText.style.fontSize = headerFontSize;
        
        // Position tabs container - centered
        const tabsWidth = this.tabsContainer.width;
        this.tabsContainer.position.set(
            Math.max((width - tabsWidth) / 2, width * 0.05), // Ensure minimum left margin
            isSmallScreen ? 70 : 75
        );
        
        // Position entries container
        this.entriesContainer.position.set((width - contentWidth) / 2, isSmallScreen ? 110 : 120);
        
        // Update row dimensions if needed
        this.updateRowDimensions(contentWidth, rowHeight, fontSize);
    }
    
    /**
     * Update row dimensions for responsive layout
     * @param contentWidth - Width of content area
     * @param rowHeight - Height of each row
     * @param fontSize - Font size for text
     */
    private updateRowDimensions(contentWidth: number, rowHeight: number, fontSize: number): void {
        // Update header row
        if (this.headerRow.children.length > 0) {
            // Update header labels with better spacing to prevent overlap
            const columns = [
                { text: "USER", x: contentWidth * 0.2, width: contentWidth * 0.3 },
                { text: "PAYOUT", x: contentWidth * 0.55, width: contentWidth * 0.2 },
                { text: "PRIZE", x: contentWidth * 0.8, width: contentWidth * 0.2 }
            ];
            
            // Make sure we have the right number of labels
            while (this.headerRow.children.length < columns.length) {
                const label = new TextLabel(0, 0, 0.5, "", fontSize, 0xFFFFFF);
                label.style.fontWeight = "lighter";
                label.resolution = 2;
                this.headerRow.addChild(label);
            }
            
            // Update each label
            for (let i = 0; i < columns.length; i++) {
                const label = this.headerRow.getChildAt(i) as TextLabel;
                label.text = columns[i].text;
                label.position.x = columns[i].x;
                label.position.y = rowHeight / 2;
                label.style.fontSize = fontSize;
            }
        }
        
        // Update player rows
        this.playerRows.forEach((row, index) => {
            if (row.children.length > 0) {
                // Update background
                const rowBg = row.getChildAt(0) as Graphics;
                rowBg.clear();
                rowBg.roundRect(0, 0, contentWidth, rowHeight, 10);
                rowBg.fill(0x000000);
                rowBg.alpha = index % 2 === 0 ? 0.2 : 0;
                
                // Update text elements
                for (let i = 1; i < row.children.length; i++) {
                    const child = row.getChildAt(i);
                    if (child instanceof TextLabel) {
                        child.style.fontSize = fontSize;
                        child.position.y = rowHeight / 2;
                    } else if (child instanceof Sprite) {
                        // Avatar
                        child.width = child.height = rowHeight * 0.6;
                        child.position.y = rowHeight / 2;
                    }
                }
                
                // Position elements
                if (row.children.length >= 5) {
                    // Rank (keep it but don't show in header)
                    const rankText = row.getChildAt(1) as TextLabel;
                    rankText.position.x = contentWidth * 0.075;
                    
                    // Avatar
                    const avatar = row.getChildAt(2) as Sprite;
                    avatar.position.x = contentWidth * 0.15;
                    
                    // Name
                    const nameText = row.getChildAt(3) as TextLabel;
                    nameText.position.x = contentWidth * 0.2;
                    // Truncate long names based on available width
                    const maxNameWidth = contentWidth * 0.3; // Limit name width
                    if (nameText.width > maxNameWidth) {
                        // Calculate how many characters can fit
                        const charWidth = nameText.width / nameText.text.length;
                        const maxChars = Math.floor(maxNameWidth / charWidth) - 3; // -3 for "..."
                        nameText.text = nameText.text.substring(0, maxChars) + "...";
                    }
                    
                    // Payout
                    const payoutText = row.getChildAt(4) as TextLabel;
                    payoutText.position.x = contentWidth * 0.55;
                    // Format and truncate payout for small screens
                    if (contentWidth < 350) {
                        const payoutValue = parseInt(payoutText.text.replace(/[^\d]/g, ''));
                        if (payoutValue >= 1000) {
                            payoutText.text = this.abbreviateNumber(payoutValue);
                        }
                    }
                    
                    // Prize
                    const prizeText = row.getChildAt(5) as TextLabel;
                    prizeText.position.x = contentWidth * 0.8;
                    // Format and truncate prize for small screens
                    if (contentWidth < 350) {
                        const prizeValue = parseInt(prizeText.text.replace(/[^\d]/g, ''));
                        if (prizeValue >= 1000) {
                            prizeText.text = this.abbreviateNumber(prizeValue);
                        }
                    }
                }
                
                // Position row
                row.position.y = rowHeight + index * rowHeight;
            }
        });
        
        // Update current player row
        if (this.currentPlayerRow) {
            const rowBg = this.currentPlayerRow.getChildAt(0) as Graphics;
            rowBg.clear();
            rowBg.roundRect(0, 0, contentWidth, rowHeight, 10);
            rowBg.fill(0x093028);
            rowBg.alpha = 0.5;
            
            // Update text elements
            for (let i = 1; i < this.currentPlayerRow.children.length; i++) {
                const child = this.currentPlayerRow.getChildAt(i);
                if (child instanceof TextLabel) {
                    child.style.fontSize = fontSize;
                    child.position.y = rowHeight / 2;
                } else if (child instanceof Sprite) {
                    // Avatar
                    child.width = child.height = rowHeight * 0.6;
                    child.position.y = rowHeight / 2;
                }
            }
            
            // Position elements
            if (this.currentPlayerRow.children.length >= 5) {
                // Rank (keep it but don't show in header)
                const rankText = this.currentPlayerRow.getChildAt(1) as TextLabel;
                rankText.position.x = contentWidth * 0.075;
                
                // Avatar
                const avatar = this.currentPlayerRow.getChildAt(2) as Sprite;
                avatar.position.x = contentWidth * 0.15;
                
                // Name
                const nameText = this.currentPlayerRow.getChildAt(3) as TextLabel;
                nameText.position.x = contentWidth * 0.2;
                // Truncate long names based on available width
                const maxNameWidth = contentWidth * 0.3; // Limit name width
                if (nameText.width > maxNameWidth) {
                    // Calculate how many characters can fit
                    const charWidth = nameText.width / nameText.text.length;
                    const maxChars = Math.floor(maxNameWidth / charWidth) - 3; // -3 for "..."
                    nameText.text = nameText.text.substring(0, maxChars) + "...";
                }
                
                // Payout
                const payoutText = this.currentPlayerRow.getChildAt(4) as TextLabel;
                payoutText.position.x = contentWidth * 0.55;
                // Format and truncate payout for small screens
                if (contentWidth < 350) {
                    const payoutValue = parseInt(payoutText.text.replace(/[^\d]/g, ''));
                    if (payoutValue >= 1000) {
                        payoutText.text = this.abbreviateNumber(payoutValue);
                    }
                }
                
                // Prize
                const prizeText = this.currentPlayerRow.getChildAt(5) as TextLabel;
                prizeText.position.x = contentWidth * 0.8;
                // Format and truncate prize for small screens
                if (contentWidth < 350) {
                    const prizeValue = parseInt(prizeText.text.replace(/[^\d]/g, ''));
                    if (prizeValue >= 1000) {
                        prizeText.text = this.abbreviateNumber(prizeValue);
                    }
                }
            }
            
            // Position row
            this.currentPlayerRow.position.y = rowHeight + this.playerRows.length * rowHeight + 10;
        }
    }
    
    /**
     * Abbreviate large numbers for display in small spaces
     * @param num - Number to abbreviate
     * @returns Abbreviated number string
     */
    private abbreviateNumber(num: number): string {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
    
    /**
     * Open the leaderboard popup
     */
    public open(): void {
        if (this.isOpen) return;
        
        // Set flag
        this.isOpen = true;
        
        // Make visible
        this.visible = true;
             // Refresh leaderboard data
        this.refreshLeaderboard();
        
                // Calculate popup dimensions based on screen size
        const width = Math.min(500, window.innerWidth * 0.9);
        const height = Math.min(600, window.innerHeight * 0.9);
        
        // Set popup container width for tab button calculations
        this.popupContainer.width = width;
        
        
        // Center popup on screen
        this.popupContainer.position.set(
            (window.innerWidth - width) / 2,
            (window.innerHeight - height) / 2
        );
        this.popupContainer.scale.set(0);
        

        
        // Stop any active tweens
        this.stopTweens();
        
        // Animate opening
        const scaleTween = new Tween(this.popupContainer.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: 1, y: 1 }, 300)
            .easing(Easing.Back.Out)
            .onComplete(() => {
                this.createTabButtons();
            })
            .start();
            
        this.tweens.push(scaleTween);
        
        // Add window resize listener
        window.addEventListener('resize', this.onResize);
              // Draw background
        this.drawBackground(width, height);
        
        // Recreate tab buttons for responsive sizing
  
        
        // Position elements
        this.positionElements(width, height);
        
    }
    
    /**
     * Close the leaderboard popup
     */
    public close(): void {
        if (!this.isOpen) return;
        
        // Set flag
        this.isOpen = false;
        
        // Stop any active tweens
        this.stopTweens();
        
        // Remove window resize listener
        window.removeEventListener('resize', this.onResize);
        
        // Animate closing
        const scaleTween = new Tween(this.popupContainer.scale, Globals.sceneManager?.tweenGroup)
            .to({ x: 0, y: 0 }, 300)
            .easing(Easing.Back.In)
            .onComplete(() => {
                this.visible = false;
            })
            .start();
            
        this.tweens.push(scaleTween);
    }
    
    /**
     * Handle window resize event
     */
    private onResize = (): void => {
        if (this.isOpen) {
            this.resize();
        }
    }
    
    /**
     * Toggle the leaderboard popup
     */
    public toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    /**
     * Check if the leaderboard is currently open
     * @returns True if the leaderboard is open
     */
    public isMenuOpen(): boolean {
        return this.isOpen;
    }
    
    /**
     * Resize the leaderboard popup
     */
    public resize(): void {
        if (!this.isOpen) return;
        
        // Calculate popup dimensions based on screen size
        const width = Math.min(500, window.innerWidth * 0.9);
        const height = Math.min(600, window.innerHeight * 0.9);
        
        // Update popup container width
        this.popupContainer.width = width;
        
        // Draw background
        this.drawBackground(width, height);
        
        // Recreate tab buttons for responsive sizing
        this.createTabButtons();
        
        // Position elements
        this.positionElements(width, height);
        
        // Center popup on screen
        this.popupContainer.position.set(
            (window.innerWidth - width) / 2,
            (window.innerHeight - height) / 2
        );
        
        // Refresh leaderboard data to ensure proper layout
        this.refreshLeaderboard();
    }
    
    /**
     * Stop all active tweens
     */
    private stopTweens(): void {
        this.tweens.forEach(tween => {
            if (tween) tween.stop();
        });
        this.tweens = [];
    }
    
    /**
     * Clean up resources when destroyed
     */
    public destroy(options?: any): void {
        // Remove window resize listener
        window.removeEventListener('resize', this.onResize);
        
        // Stop all tweens
        this.stopTweens();
        
        // Remove event listeners
        if (this.closeButtonContainer) {
            this.closeButtonContainer.off('pointerdown');
            this.closeButtonContainer.off('pointerover');
            this.closeButtonContainer.off('pointerout');
        }
        
        Object.values(this.tabButtons).forEach(button => {
            button.off('pointerdown');
        });
        
        // Call parent destroy method
        super.destroy(options);
    }
}