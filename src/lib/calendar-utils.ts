import { Lunar } from 'lunar-javascript';
import type { DayInfo, HolidayInfo, CalendarEvent } from '@/types';

// 2024年节假日数据
const holidayData2024: HolidayInfo = {
  '2024-01-01': { isRest: true, name: '元旦' },
  '2024-02-09': { isWork: true },
  '2024-02-10': { isRest: true, name: '春节' },
  '2024-02-11': { isRest: true },
  '2024-02-12': { isRest: true },
  '2024-02-13': { isRest: true },
  '2024-02-14': { isRest: true },
  '2024-02-15': { isRest: true },
  '2024-02-16': { isRest: true },
  '2024-02-17': { isRest: true },
  '2024-04-04': { isRest: true, name: '清明' },
  '2024-04-05': { isRest: true },
  '2024-04-06': { isRest: true },
  '2024-04-07': { isWork: true },
  '2024-05-01': { isRest: true, name: '劳动节' },
  '2024-05-02': { isRest: true },
  '2024-05-03': { isRest: true },
  '2024-05-04': { isRest: true },
  '2024-05-05': { isRest: true },
  '2024-05-11': { isWork: true },
  '2024-06-10': { isRest: true, name: '端午' },
  '2024-09-14': { isWork: true },
  '2024-09-15': { isRest: true, name: '中秋' },
  '2024-09-16': { isRest: true },
  '2024-09-17': { isRest: true },
  '2024-10-01': { isRest: true, name: '国庆节' },
  '2024-10-02': { isRest: true },
  '2024-10-03': { isRest: true },
  '2024-10-04': { isRest: true },
  '2024-10-05': { isRest: true },
  '2024-10-06': { isRest: true },
  '2024-10-07': { isRest: true },
  '2024-10-12': { isWork: true },
};

export function getHolidayInfo(dateStr: string) {
  return holidayData2024[dateStr] || null;
}

export function getLunarDate(date: Date): string {
  const solar = Lunar.fromDate(date);
  const lunar = solar.getDayInChinese();
  return lunar;
}

export function getLunarMonthDay(date: Date): string {
  const solar = Lunar.fromDate(date);
  return solar.getMonthInChinese() + '月' + solar.getDayInChinese();
}

export function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getMonthDays(year: number, month: number): DayInfo[] {
  const days: DayInfo[] = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const firstDayOfWeek = firstDay.getDay();
  
  // 调整周一为第一天 (0=周日, 1=周一)
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  
  // 上个月的日期
  const prevMonth = new Date(year, month - 1, 0);
  const prevMonthDays = prevMonth.getDate();
  
  for (let i = startOffset - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const date = new Date(year, month - 2, day);
    const dateStr = formatDateKey(date.getFullYear(), date.getMonth() + 1, day);
    days.push({
      date: day,
      fullDate: dateStr,
      lunarDate: getLunarDate(date),
      isCurrentMonth: false,
      isRestDay: false,
      isWorkDay: false,
      events: [],
    });
  }
  
  // 当月日期
  const today = new Date();
  const todayStr = formatDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
  
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dateStr = formatDateKey(year, month, day);
    const date = new Date(year, month - 1, day);
    const holiday = getHolidayInfo(dateStr);
    
    days.push({
      date: day,
      fullDate: dateStr,
      lunarDate: getLunarDate(date),
      isCurrentMonth: true,
      isRestDay: holiday?.isRest || false,
      isWorkDay: holiday?.isWork || false,
      isToday: dateStr === todayStr,
      events: [],
    });
  }
  
  // 下个月的日期
  const remainingCells = 42 - days.length;
  for (let day = 1; day <= remainingCells; day++) {
    const date = new Date(year, month, day);
    const dateStr = formatDateKey(date.getFullYear(), date.getMonth() + 1, day);
    days.push({
      date: day,
      fullDate: dateStr,
      lunarDate: getLunarDate(date),
      isCurrentMonth: false,
      isRestDay: false,
      isWorkDay: false,
      events: [],
    });
  }
  
  return days;
}

export function assignEventsToDays(days: DayInfo[], events: CalendarEvent[]): DayInfo[] {
  return days.map(day => {
    const dayEvents = events.filter(event => {
      if (event.endDate) {
        return day.fullDate >= event.startDate && day.fullDate <= event.endDate;
      }
      return day.fullDate === event.startDate;
    });
    return { ...day, events: dayEvents };
  });
}

export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

// Get the week containing the given date (Monday-based)
export function getWeekDays(date: Date): { date: number; fullDate: string; lunarDate: string; isToday: boolean; dayOfWeek: string }[] {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
  const monday = new Date(date.setDate(diff));
  
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = formatDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const today = new Date();
    const todayStr = formatDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
    days.push({
      date: d.getDate(),
      fullDate: dateStr,
      lunarDate: getLunarDate(d),
      isToday: dateStr === todayStr,
      dayOfWeek: WEEKDAYS[i],
    });
  }
  return days;
}

// Check if a date string is in the week of the given reference date
export function isDateInWeek(dateStr: string, weekDays: { fullDate: string }[]): boolean {
  return weekDays.some(d => d.fullDate === dateStr);
}

// Get week range label for display
export function getWeekRangeLabel(weekDays: { date: number; fullDate: string }[]): string {
  const start = weekDays[0];
  const end = weekDays[6];
  const startParts = start.fullDate.split('-');
  const endParts = end.fullDate.split('-');
  return `${startParts[1]}月${start.date}日 - ${endParts[1]}月${end.date}日`;
}
