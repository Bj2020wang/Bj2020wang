declare module 'lunar-javascript' {
  export class Lunar {
    static fromDate(date: Date): Lunar;
    getDayInChinese(): string;
    getMonthInChinese(): string;
  }
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): Lunar;
  }
}
