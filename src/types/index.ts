export type TodoCategory = 'work' | 'life' | 'study' | 'health';
export type TodoScopeType = 'day' | 'week' | 'month';

export interface TodoItem {
  id: string;
  text: string;
  color: string;
  category: TodoCategory;
  month: number;
  date?: string;
  scopeType?: TodoScopeType;
  scopeStart?: string; // used for week-scope todos (week start date)
  count: number | null; // null means empty (not started yet)
  updatedAt?: number;
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
  reminderMinutes?: number[];
  updatedAt?: number;
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
