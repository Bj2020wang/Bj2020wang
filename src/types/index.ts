export type TodoCategory = 'work' | 'life' | 'study' | 'health';

export interface TodoItem {
  id: string;
  text: string;
  color: string;
  category: TodoCategory;
  month: number;
  date?: string;
  count: number | null; // null means empty (not started yet)
}

export interface CalendarEvent {
  id: string;
  title: string;
  color: string;
  startDate: string;
  endDate?: string;
  completed?: boolean;
  sourceTodoId?: string;
  startTime?: string;
  endTime?: string;
}

export type ViewType = 'today' | 'week' | 'month';

export interface DayInfo {
  date: number;
  fullDate: string;
  lunarDate: string;
  isCurrentMonth: boolean;
  isRestDay?: boolean;
  isWorkDay?: boolean;
  isToday?: boolean;
  events: CalendarEvent[];
}

export interface HolidayInfo {
  [key: string]: {
    isRest?: boolean;
    isWork?: boolean;
    name?: string;
  };
}
