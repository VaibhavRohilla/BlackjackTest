import { Globals } from "../globals";

export interface LeaderboardEntry {
    username: string;
    chips: number;
    rank: number;
    avatar: string;
    country: string;
}

interface LeaderboardPeriod {
    users: LeaderboardEntry[];
    myPoints: number;
    myPrize: number;
    myTokenPrize: number | null;
    timestamp: number;
    prizePool: number;
    tokenPrizePool: number | null;
}

interface LeaderboardData {
    current: {
        hourly: LeaderboardPeriod;
        daily: LeaderboardPeriod;
        weekly: LeaderboardPeriod;
    };
    previous: {
        hourly: LeaderboardPeriod;
        daily: LeaderboardPeriod;
        weekly: LeaderboardPeriod;
    };
}

interface LeaderboardResponse {
    entries: {
        externalLeaderboard: LeaderboardData;
    };
}

export class LeaderboardService {
    private static instance: LeaderboardService;
    private leaderboardData: LeaderboardData | null = null;
    private currentUserEntry: LeaderboardEntry | null = null;
    private lastUpdate: number = 0;
    private updateInterval: number = 30000; // 30 seconds
    private currentPeriod: 'hourly' | 'daily' | 'weekly' = 'daily';

    private constructor() {}

    public static getInstance(): LeaderboardService {
        if (!LeaderboardService.instance) {
            LeaderboardService.instance = new LeaderboardService();
        }
        return LeaderboardService.instance;
    }

    public updateLeaderboardFromGameData(data: LeaderboardResponse): void {
        if (data?.entries?.externalLeaderboard) {
            this.leaderboardData = data.entries.externalLeaderboard;
            // Find current user in the active period
            if (this.leaderboardData) {
                const currentPeriodData = this.leaderboardData.current[this.currentPeriod];
                this.currentUserEntry = currentPeriodData.users.find(entry => entry.username === Globals.userId) || null;
            }
            this.lastUpdate = Date.now();
            console.log('Leaderboard updated from game data');
        }
    }

    public getLeaderboardData(): LeaderboardEntry[] {
        if (!this.leaderboardData) {
            return [];
        }
        return this.leaderboardData.current[this.currentPeriod].users;
    }

    public getCurrentUserEntry(): LeaderboardEntry | null {
        return this.currentUserEntry;
    }

    public shouldUpdate(): boolean {
        return Date.now() - this.lastUpdate > this.updateInterval;
    }

    public setCurrentPeriod(period: 'hourly' | 'daily' | 'weekly'): void {
        this.currentPeriod = period;
        // Update current user entry for the new period
        if (this.leaderboardData) {
            const currentPeriodData = this.leaderboardData.current[this.currentPeriod];
            this.currentUserEntry = currentPeriodData.users.find(entry => entry.username === Globals.userId) || null;
        }
    }

    public getCurrentPeriod(): 'hourly' | 'daily' | 'weekly' {
        return this.currentPeriod;
    }

    public getPrizePool(): number {
        if (!this.leaderboardData) {
            return 0;
        }
        return this.leaderboardData.current[this.currentPeriod].prizePool;
    }
} 