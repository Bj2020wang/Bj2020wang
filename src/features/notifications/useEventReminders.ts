import { useEffect, useRef } from 'react';
import type { CalendarEvent } from '@/types';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

const DEFAULT_REMINDER_MINUTES = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5];
const CHECK_INTERVAL_MS = 30_000;
const TRIGGER_WINDOW_MS = 30_000;
const FALLBACK_IMMINENT_WINDOW_MS = 5 * 60_000;

function parseEventStart(event: CalendarEvent): Date | null {
  if (!event.startTime) return null;
  const [y, m, d] = event.startDate.split('-').map(Number);
  const [hh, mm] = event.startTime.split(':').map(Number);
  if ([y, m, d, hh, mm].some((v) => Number.isNaN(v))) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    const result = await requestPermission();
    return result === 'granted';
  } catch {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
}

async function pushNotification(title: string, body: string) {
  try {
    await sendNotification({ title, body });
  } catch {
    if (typeof Notification !== 'undefined') {
      new Notification(title, { body });
    }
  }
}

export function useEventReminders(events: CalendarEvent[]) {
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const checkAndNotify = async () => {
      if (cancelled) return;
      const hasPermission = await ensureNotificationPermission();
      if (!hasPermission) return;

      const now = Date.now();
      for (const event of events) {
        if (event.completed) continue;
        const startAt = parseEventStart(event);
        if (!startAt) continue;

        const reminderMinutes = event.reminderMinutes?.length
          ? event.reminderMinutes
          : DEFAULT_REMINDER_MINUTES;

        for (const minutes of reminderMinutes) {
          const targetMs = startAt.getTime() - minutes * 60_000;
          const distance = targetMs - now;
          const fireKey = `${event.id}:${startAt.toISOString()}:${minutes}`;
          if (firedRef.current.has(fireKey)) continue;

          if (distance <= TRIGGER_WINDOW_MS && distance > -TRIGGER_WINDOW_MS) {
            firedRef.current.add(fireKey);
            await pushNotification(
              `待办提醒：${event.title}`,
              `还有 ${minutes} 分钟开始（${event.startDate} ${event.startTime}）`
            );
          }
        }

        // Fallback: if this event just got a time and all standard reminder
        // points are already missed, still send one imminent reminder.
        const fallbackKey = `${event.id}:${startAt.toISOString()}:imminent`;
        const msUntilStart = startAt.getTime() - now;
        if (
          !firedRef.current.has(fallbackKey) &&
          msUntilStart > 0 &&
          msUntilStart <= FALLBACK_IMMINENT_WINDOW_MS
        ) {
          const alreadyPastAllPoints = reminderMinutes.every(
            (minutes) => now > startAt.getTime() - minutes * 60_000
          );
          if (alreadyPastAllPoints) {
            firedRef.current.add(fallbackKey);
            const minsLeft = Math.max(1, Math.ceil(msUntilStart / 60_000));
            await pushNotification(
              `即将开始：${event.title}`,
              `还有约 ${minsLeft} 分钟开始（${event.startDate} ${event.startTime}）`
            );
          }
        }
      }
    };

    checkAndNotify();
    timerId = setInterval(checkAndNotify, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timerId) clearInterval(timerId);
    };
  }, [events]);
}
