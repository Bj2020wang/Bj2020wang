export type TodoCategory = 'work' | 'life' | 'study' | 'health';
export type TodoScopeType = 'day' | 'week' | 'month' | 'year';

export interface TodoItem {
  id: string;
  text: string;
  color: string;
  category: TodoCategory;
  month: number;
  date?: string;
  scopeType?: TodoScopeType;
  scopeStart?: string; // used for week-scope todos (week start date)
  /** 月范围 / 年范围任务所属公历年；缺省时月任务仅在「月份数字」匹配各年（兼容旧数据） */
  scopeYear?: number;
  count: number | null; // null means empty (not started yet)
  updatedAt?: number;
  /** 协作云：任务归属邮箱；未标时视为创建者 ownerEmail */
  collabOwnerEmail?: string;
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
  /** 协作云：无 sourceTodoId 时的归属；有 sourceTodoId 时以任务归属为准 */
  collabOwnerEmail?: string;
}

export type ViewType = 'today' | 'week' | 'month' | 'year';

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
