import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import sampleTicketPayload from '../sample/sample.json';
import { ticketTypes } from './ticketTypes';
import { eventNameDic } from './pavilions';

type GateType = 1 | 2;

type UseStateType = 0 | 1 | 2 | 3 | 4 | 9;

interface BaseSchedule {
  id?: number;
  schedule_name?: string;
  entrance_date?: string;
  start_time?: string;
  end_time?: string;
  use_state?: UseStateType;
  admission_time?: string;
  on_the_day?: boolean;
}

interface EntranceSchedule extends BaseSchedule {
  user_visiting_reservation_id?: number;
  gate_type?: GateType;
}

interface EventSchedule extends BaseSchedule {
  program_code?: string;
  event_name?: string;
  event_summary?: string;
  virtual_url?: string;
  virtual_url_desc?: string;
  portal_url?: string;
  portal_url_desc?: string;
  registered_channel?: number;
}

interface Ticket {
  id?: number;
  ticket_id?: string;
  item_name?: string;
  item_group_name?: string;
  item_summary?: string | null;
  image_large_path?: string | null;
  schedules?: EntranceSchedule[] | null;
  event_schedules?: EventSchedule[] | null;
  ticket_type_id?: string;
}

interface TicketPayload {
  list: Ticket[];
}

const gateLabels: Record<GateType, string> = {
  1: '東ゲート',
  2: '西ゲート'
};

const gateBadgeClasses: Record<GateType, string> = {
  1: 'bg-emerald-100 text-emerald-700',
  2: 'bg-indigo-100 text-indigo-700'
};

const useStateLabels: Record<UseStateType, string> = {
  0: '未使用',
  1: '利用済み',
  2: 'キャンセル済み',
  3: 'キャンセル手続き中',
  4: '変更手続き中',
  9: 'その他'
};

const useStateBadgeClasses: Record<UseStateType, string> = {
  0: 'bg-amber-100 text-amber-700',
  1: 'bg-emerald-100 text-emerald-700',
  2: 'bg-rose-100 text-rose-700',
  3: 'bg-orange-100 text-orange-700',
  4: 'bg-indigo-100 text-indigo-700',
  9: 'bg-slate-200 text-slate-700'
};

function resolveUseState(value?: number): { label: string; className: string } {
  if (value === undefined || value === null) {
    return { label: '状態不明', className: 'bg-slate-200 text-slate-700' };
  }
  const key = value as UseStateType;
  const label = useStateLabels[key];
  const className = useStateBadgeClasses[key];
  if (label && className) {
    return { label, className };
  }
  return { label: `状態不明（${value}）`, className: 'bg-slate-200 text-slate-700' };
}

const registeredChannelLabels: Record<number, string> = {
  0: '当日登録端末',
  1: '超早割特別抽選',
  2: '2ヶ月前抽選',
  3: '7日前抽選',
  4: '3日前先着',
  5: '当日予約'
};

function resolveRegisteredChannel(channel?: number): string {
  if (channel === undefined || channel === null) {
    return '不明';
  }
  const label = registeredChannelLabels[channel];
  return label ? `${label}（${channel}）` : `不明（${channel}）`;
}

function resolveTicketName(ticket: Ticket): string {
  return ticketTypes[ticket.ticket_type_id ?? ''] || ticket.item_name || '不明なチケット';
}

function resolvePavilionName(code: string): string | null {
  return eventNameDic[code] || null;
}

function formatDate(value?: string | null): string {
  if (!value) return '未設定';
  if (value.includes('-')) return value;
  if (value.length !== 8) return value;
  return `${value.slice(0, 4)}年${value.slice(4, 6)}月${value.slice(6, 8)}日`;
}

function formatTime(value?: string | null): string {
  if (!value) return '未設定';
  if (value.includes(':')) return value;
  if (value.length === 4) return `${value.slice(0, 2)}:${value.slice(2)}`;
  if (value.length === 6) {
    return `${value.slice(0, 2)}:${value.slice(2, 4)}:${value.slice(4)}`;
  }
  return value;
}

function isTicketPayload(value: unknown): value is TicketPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { list?: unknown };
  return Array.isArray(record.list);
}

function tryParseTickets(text: string): TicketPayload | null {
  try {
    const parsed = JSON.parse(text);
    if (isTicketPayload(parsed)) {
      return parsed;
    }
    return null;
  } catch (error) {
    return null;
  }
}

function extractEmbeddedTicketJson(source: string): string | null {
  const cleaned = source.replace(/\u0000/g, '');
  const startIndex = cleaned.indexOf('{"list"');
  if (startIndex === -1) {
    return null;
  }

  let depth = 0;
  for (let index = startIndex; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return cleaned.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function extractDigits(value?: string | null): string {
  return value ? value.replace(/\D/g, '') : '';
}

function scheduleSortKey(schedule: EntranceSchedule | EventSchedule): string {
  const date = schedule.entrance_date && /\d{8}/.test(schedule.entrance_date)
    ? schedule.entrance_date
    : '99999999';
  const startFromField = schedule.start_time && /\d{4}/.test(schedule.start_time)
    ? schedule.start_time
    : '';
  const startFromName = extractDigits(schedule.schedule_name).slice(0, 4);
  const time = (startFromField || startFromName || '9999').padEnd(4, '9');
  return `${date}${time}`;
}

function parseTicketJson(rawText: string): TicketPayload {
  const trimmed = rawText.trim();
  if (!trimmed) {
    const embedded = extractEmbeddedTicketJson(rawText);
    if (embedded) {
      const fallback = tryParseTickets(embedded);
      if (fallback) {
        return fallback;
      }
    }
    throw new Error('JSONが空です。');
  }

  if (/"message"\s*:\s*"Unauthorized"/i.test(trimmed)) {
    throw new Error('マイチケットにログインできていません。ログインしてからコード(JSON)の取得をやり直してください。');
  }

  const direct = tryParseTickets(trimmed);
  if (direct) {
    return direct;
  }

  const embedded = extractEmbeddedTicketJson(rawText);
  if (embedded) {
    const fallback = tryParseTickets(embedded);
    if (fallback) {
      return fallback;
    }
  }

  throw new Error('JSONの解析に失敗しました。ファイルの形式を確認してください。');
}

function buildImageUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `https://ticket.expo2025.or.jp${path}`;
}

interface TicketSchedulesProps {
  title: string;
  schedules?: (EntranceSchedule | EventSchedule)[] | null;
  type: 'entrance' | 'event';
}

function TicketSchedules({ title, schedules, type }: TicketSchedulesProps) {
  const orderedSchedules = useMemo(() => {
    if (!Array.isArray(schedules) || schedules.length === 0) {
      return [] as (EntranceSchedule | EventSchedule)[];
    }
    if (type === 'event') {
      return [...schedules].sort((a, b) => {
        const keyA = scheduleSortKey(a);
        const keyB = scheduleSortKey(b);
        if (keyA < keyB) return -1;
        if (keyA > keyB) return 1;
        return 0;
      });
    }
    return [...schedules];
  }, [schedules, type]);

  if (orderedSchedules.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white/40 p-4 text-sm text-slate-500">
        {title}は見つかりませんでした。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orderedSchedules.map((schedule, index) => {
        const keySource =
          'user_visiting_reservation_id' in schedule && schedule.user_visiting_reservation_id
            ? schedule.user_visiting_reservation_id
            : schedule.id;
        const key = `${type}-${keySource ?? `schedule-${index}`}`;
        const stateDisplay = resolveUseState(schedule.use_state);
        const isEvent = type === 'event';
        const dateLabel = formatDate(schedule.entrance_date);
        const timeLabel = schedule.schedule_name || (schedule.start_time ? formatTime(schedule.start_time) : '');
        const entranceTitle = dateLabel !== '未設定' ? dateLabel : '日付未設定';
        const titleText = isEvent
          ? resolvePavilionName((schedule as EventSchedule).program_code ?? '') || (schedule as EventSchedule).event_name || timeLabel || '名称未登録'
          : entranceTitle;
        const gateLabel = !isEvent && (schedule as EntranceSchedule).gate_type !== undefined
          ? gateLabels[(schedule as EntranceSchedule).gate_type as GateType] ??
            `ゲート種別: ${(schedule as EntranceSchedule).gate_type}`
          : '';
        const gateBadgeClass = !isEvent && (schedule as EntranceSchedule).gate_type !== undefined
          ? gateBadgeClasses[(schedule as EntranceSchedule).gate_type as GateType] ??
            'bg-slate-200 text-slate-700'
          : 'bg-slate-200 text-slate-700';

        return (
          <div key={key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-slate-900">{titleText}</span>
              {isEvent && dateLabel !== '未設定' && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {dateLabel}
                </span>
              )}
              {timeLabel && (
                <span className="rounded-full bg-blue-100/80 px-3 py-1 text-xs font-medium text-blue-800">
                  {timeLabel}
                </span>
              )}
              {!isEvent && gateLabel && (
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${gateBadgeClass}`}>
                  {gateLabel}
                </span>
              )}
              {schedule.use_state !== undefined && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${stateDisplay.className}`}>
                  {stateDisplay.label}
                </span>
              )}
              {schedule.on_the_day && (
                <span className="rounded-full bg-fuchsia-100 px-3 py-1 text-xs font-semibold text-fuchsia-700">
                  当日予約
                </span>
              )}
            </div>

            {isEvent && (schedule as EventSchedule).program_code && (
              <div className="mt-2 text-sm text-slate-600">
                プログラムコード: {(schedule as EventSchedule).program_code}
              </div>
            )}

            <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              {schedule.admission_time && (
                <div>
                  <dt className="font-medium text-slate-500">入場時刻</dt>
                  <dd>{formatTime(schedule.admission_time)}</dd>
                </div>
              )}
              {isEvent && (schedule as EventSchedule).registered_channel !== undefined && (
                <div>
                  <dt className="font-medium text-slate-500">予約方法</dt>
                  <dd>{resolveRegisteredChannel((schedule as EventSchedule).registered_channel)}</dd>
                </div>
              )}
              {isEvent && schedule.start_time && (
                <div>
                  <dt className="font-medium text-slate-500">開始時刻</dt>
                  <dd>{formatTime(schedule.start_time)}</dd>
                </div>
              )}
              {isEvent && schedule.end_time && (
                <div>
                  <dt className="font-medium text-slate-500">終了時刻</dt>
                  <dd>{formatTime(schedule.end_time)}</dd>
                </div>
              )}
              {isEvent && (schedule as EventSchedule).portal_url && (
                <div>
                  <dt className="font-medium text-slate-500">詳細ページ</dt>
                  <dd>
                    <a
                      href={(schedule as EventSchedule).portal_url as string}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {(schedule as EventSchedule).portal_url_desc || '詳細を確認'}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

interface TicketCardProps {
  ticket: Ticket;
}

function TicketCard({ ticket }: TicketCardProps) {
  const imageUrl = useMemo(() => buildImageUrl(ticket.image_large_path), [ticket.image_large_path]);
  const [isTicketIdVisible, setIsTicketIdVisible] = useState(false);

  return (
    <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-900">{resolveTicketName(ticket)}</h2>
          <p className="text-sm text-slate-600">
            {ticket.item_summary?.replace(/\\n/g, '\n') || '説明がありません。'}
          </p>
          <div className="flex flex-wrap gap-2 text-sm text-slate-600">
            <button
              type="button"
              onClick={() => setIsTicketIdVisible((prev) => !prev)}
              className="rounded-full bg-slate-100 px-3 py-1 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300"
              aria-pressed={isTicketIdVisible}
            >
              {isTicketIdVisible
                ? `チケットID: ${ticket.ticket_id ?? '未登録'}`
                : 'チケットID: タップで表示'}
            </button>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              種別: {ticket.item_group_name ?? '未登録'}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              予約回数: {ticket.schedules?.length ?? 0}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              パビリオン予約: {ticket.event_schedules?.length ?? 0}
            </span>
          </div>
        </div>
        {imageUrl && (
          <div><img
            src={imageUrl}
            alt={ticket.item_name || 'チケット画像'}
            className="h-24 max-w-48 rounded-xl border border-slate-100 object-contain shadow-sm"
            referrerPolicy="no-referrer"
            style={{ backgroundColor: '#f1f5f9' }}
          /></div>
        )}
      </header>

      <section>
        <h3 className="text-lg font-semibold text-slate-800">入場予約</h3>
        <TicketSchedules title="入場予約" schedules={ticket.schedules ?? []} type="entrance" />
      </section>

      <section>
        <h3 className="text-lg font-semibold text-slate-800">パビリオン予約</h3>
        <TicketSchedules title="パビリオン予約" schedules={ticket.event_schedules ?? []} type="event" />
      </section>
    </article>
  );
}

interface ShareableSummaryCanvasProps {
  tickets: Ticket[];
  entranceCount: number;
  eventCount: number;
}

function ShareableSummaryCanvas({ tickets, entranceCount, eventCount }: ShareableSummaryCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string>('');

  const summary = useMemo(() => {
    if (!Array.isArray(tickets) || tickets.length === 0) {
      return null;
    }

    const width = 1080;
    const paddingTop = 96;
    const paddingBottom = 96;
    const lineHeight = 44;
    const blankSpacing = Math.round(lineHeight * 0.7);
    const chartHeight = 240;
    const chartTopMargin = 16;
    const chartLabelArea = 80;
    const chartBottomMargin = 32;
    const innerPaddingX = 120;
    const beforeStatsSpacing = 8;
    const afterStatsSpacing = 12;

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const indexToLabel = (index: number) => {
      let value = index;
      let label = '';
      do {
        label = alphabet[value % alphabet.length] + label;
        value = Math.floor(value / alphabet.length) - 1;
      } while (value >= 0);
      return label;
    };

    const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
    const formatDateForCanvas = (raw?: string | null) => {
      if (!raw || !/^\d{8}$/.test(raw)) {
        return { label: raw ?? '日付未設定', month: null };
      }
      const year = Number(raw.slice(0, 4));
      const month = Number(raw.slice(4, 6));
      const day = Number(raw.slice(6, 8));
      const date = new Date(year, month - 1, day);
      const weekday = weekdayLabels[date.getDay()];
      const label = `${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}(${weekday})`;
      return { label, month };
    };

    const formatGateLabel = (gate?: GateType) => {
      if (!gate) return '';
      return gateLabels[gate] ?? `ゲート${gate}`;
    };

    const ticketEntries = tickets.map((ticket, index) => ({
      label: indexToLabel(index),
      ticket
    }));

    const scheduleSort = (schedule: EntranceSchedule | EventSchedule) => scheduleSortKey(schedule);

    const eventsByKey = new Map<string, EventSchedule[]>();
    ticketEntries.forEach(({ label, ticket }, ticketIndex) => {
      const ticketKey = ticket.ticket_id ?? `ticket-${ticket.id ?? ticketIndex}`;
      (ticket.event_schedules ?? []).forEach((event) => {
        const dateKey = event.entrance_date ?? 'unknown';
        const mapKey = `${ticketKey}-${dateKey}`;
        const list = eventsByKey.get(mapKey) ?? [];
        list.push(event);
        eventsByKey.set(mapKey, list);
      });
    });

    eventsByKey.forEach((list, mapKey) => {
      eventsByKey.set(
        mapKey,
        [...list].sort((a, b) => {
          const keyA = scheduleSort(a);
          const keyB = scheduleSort(b);
          if (keyA < keyB) return -1;
          if (keyA > keyB) return 1;
          return 0;
        })
      );
    });

    const ticketLines = ticketEntries.map(({ label, ticket }) => {
      const entranceTotal = ticket.schedules?.length ?? 0;
      const eventTotal = ticket.event_schedules?.length ?? 0;
      return `${label}. ${resolveTicketName(ticket)} ｜ 入場:${entranceTotal} ｜ パビリオン:${eventTotal}`;
    });

    interface EntranceLine {
      key: string;
      text: string;
      events: { left: string; right: string }[];
      month: number | null;
    }

    const entranceLines: EntranceLine[] = [];
    const monthCountMap = new Map<number, number>();

    ticketEntries.forEach(({ label, ticket }, ticketIndex) => {
      const ticketKey = ticket.ticket_id ?? `ticket-${ticket.id ?? ticketIndex}`;
      (ticket.schedules ?? []).forEach((schedule, scheduleIndex) => {
        const dateInfo = formatDateForCanvas(schedule.entrance_date);
        const timeLabel = schedule.schedule_name || formatTime(schedule.start_time);
        const gateLabel = formatGateLabel(schedule.gate_type as GateType | undefined);
        const useStateInfo = schedule.use_state !== undefined ? resolveUseState(schedule.use_state) : null;
        const useStateLabel = useStateInfo?.label;
        const isStateUnknown = !!useStateLabel && useStateLabel.includes('状態不明');
        let statusText = '';
        if (schedule.use_state === 1) {
          statusText = schedule.admission_time ? formatTime(schedule.admission_time) : '入場済み';
        } else if (useStateInfo && !isStateUnknown && useStateLabel) {
          statusText = useStateLabel;
        }
        const parts = [
          dateInfo.label,
          label,
          timeLabel && timeLabel !== '未設定' ? timeLabel : '',
          gateLabel,
          statusText
        ].filter(Boolean);
        const lineText = parts.join(' ｜ ');

        if (dateInfo.month) {
          monthCountMap.set(dateInfo.month, (monthCountMap.get(dateInfo.month) ?? 0) + 1);
        }

        const mapKey = `${ticketKey}-${schedule.entrance_date ?? 'unknown'}`;
        const relatedEvents = eventsByKey.get(mapKey) ?? [];
        eventsByKey.delete(mapKey);

        const eventLines = relatedEvents.map((event) => {
          const pavilionTime = event.schedule_name || formatTime(event.start_time);
          const channelLabel =
            event.registered_channel !== undefined ? resolveRegisteredChannel(event.registered_channel) : '';
          const useStateInfo = event.use_state !== undefined ? resolveUseState(event.use_state) : null;
          const useStateLabel = useStateInfo?.label;
          const isStateUnknown = !!useStateLabel && useStateLabel.includes('状態不明');
          let usageText = '';
          if (event.use_state === 1) {
            usageText = event.admission_time ? formatTime(event.admission_time) : '入場済み';
          } else if (useStateInfo && !isStateUnknown && useStateLabel) {
            usageText = useStateLabel;
          }

          const channelWithoutCode = channelLabel.replace(/（\d+）$/, '');
          const leftParts = [
            pavilionTime && pavilionTime !== '未設定' ? pavilionTime : '',
            channelWithoutCode && channelWithoutCode !== '不明' ? channelWithoutCode : '',
            usageText
          ].filter(Boolean);
          const leftText = leftParts.length > 0 ? `- ${leftParts.join(' ｜ ')}` : '-';
          const rightText = resolvePavilionName(event.program_code ?? '') || '名称未登録';
          return { left: leftText, right: rightText };
        });

        entranceLines.push({
          key: `entrance-${label}-${schedule.user_visiting_reservation_id ?? schedule.id ?? scheduleIndex}`,
          text: lineText,
          events: eventLines,
          month: dateInfo.month
        });
      });
    });

    entranceLines.sort((a, b) => {
      const findSchedule = (line: EntranceLine) => {
        const [datePart] = line.text.split(' ｜ ');
        return datePart ?? '';
      };
      const scheduleA = findSchedule(a);
      const scheduleB = findSchedule(b);
      if (scheduleA < scheduleB) return -1;
      if (scheduleA > scheduleB) return 1;
      return 0;
    });

    const leftoverEvents = Array.from(eventsByKey.values())
      .flat()
      .sort((a, b) => {
        const keyA = scheduleSort(a);
        const keyB = scheduleSort(b);
        if (keyA < keyB) return -1;
        if (keyA > keyB) return 1;
        return 0;
      })
      .map((event, index) => {
        const dateInfo = formatDateForCanvas(event.entrance_date);
        const pavilionTime = event.schedule_name || formatTime(event.start_time);
        const parts = [
          dateInfo.label,
          event.event_name ?? '名称未登録',
          pavilionTime && pavilionTime !== '未設定' ? pavilionTime : ''
        ].filter(Boolean);
        return {
          key: `unassigned-${event.id ?? event.program_code ?? index}`,
          text: parts.join(' ｜ ')
        };
      });

    const months = [4, 5, 6, 7, 8, 9, 10];
    const monthlyCounts = months.map((month) => ({
      month,
      label: `${month}月`,
      count: monthCountMap.get(month) ?? 0
    }));

    const totalEventCount = entranceLines.reduce((acc, line) => acc + line.events.length, 0);
    const leftoverCount = leftoverEvents.length;

    let cursorHeight = paddingTop;
    cursorHeight += lineHeight; // title
    cursorHeight += beforeStatsSpacing;
    cursorHeight += lineHeight; // stats
    cursorHeight += afterStatsSpacing;
    cursorHeight += blankSpacing; // gap
    cursorHeight += lineHeight; // ticket heading
    cursorHeight += ticketLines.length * lineHeight;
    cursorHeight += blankSpacing; // gap
    cursorHeight += lineHeight; // schedule heading
    cursorHeight += entranceLines.length * lineHeight;
    cursorHeight += totalEventCount * lineHeight;

    if (leftoverCount > 0) {
      cursorHeight += blankSpacing;
      cursorHeight += lineHeight; // leftover heading
      cursorHeight += leftoverCount * lineHeight;
    }

    cursorHeight += blankSpacing;
    cursorHeight += lineHeight; // chart heading
    cursorHeight += chartTopMargin;
    cursorHeight += chartHeight;
    cursorHeight += chartLabelArea;
    cursorHeight += chartBottomMargin;
    cursorHeight += lineHeight; // footer note

    const height = cursorHeight + paddingBottom;

    return {
      width,
      height,
      paddingTop,
      paddingBottom,
      lineHeight,
      blankSpacing,
      chartHeight,
      innerPaddingX,
      chartTopMargin,
      chartLabelArea,
      chartBottomMargin,
      beforeStatsSpacing,
      afterStatsSpacing,
      title: 'Expo 2025 来場まとめ',
      summaryLabel: `入場予約 ${entranceCount}回 ｜ パビリオン予約 ${eventCount}回`,
      ticketLines,
      entranceLines,
      leftoverEvents,
      monthlyCounts
    };
  }, [tickets, entranceCount, eventCount]);

  const shareText = useMemo(
    () => `Expo 2025 万博予約入場履歴\n入場予約 ${entranceCount}回 ｜ パビリオン予約 ${eventCount}回\nhttps://www.nakayuki.net/expo-history-viewer/`,
    [entranceCount, eventCount]
  );

  const canUseWebShare = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
      return false;
    }
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (!nav.share) {
      return false;
    }
    if (typeof File === 'undefined' || !nav.canShare) {
      return false;
    }
    try {
      const dummyFile = new File([''], 'preview.png', { type: 'image/png' });
      return nav.canShare({ files: [dummyFile], text: 'test' });
    } catch {
      return false;
    }
  }, []);

  const getCanvasBlob = async (): Promise<Blob> =>
    await new Promise<Blob>((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        reject(new Error('画像を取得できませんでした。'));
        return;
      }
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('画像の生成に失敗しました。'));
        }
      });
    });

  const handleSaveImage = async () => {
    if (isSavingImage) return;
    setActionMessage('');
    setIsSavingImage(true);
    try {
      const blob = await getCanvasBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
        now.getDate()
      ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      link.href = url;
      link.download = `expo-visit-summary_${timestamp}.png`;
      link.click();
      URL.revokeObjectURL(url);
      setActionMessage('画像をダウンロードしました。');
    } catch (error) {
      console.error(error);
      setActionMessage(error instanceof Error ? error.message : '画像の保存に失敗しました。');
    } finally {
      setIsSavingImage(false);
    }
  };

  const handleShareImage = async () => {
    if (!canUseWebShare || isSharing) return;
    setActionMessage('');
    setIsSharing(true);
    try {
      const blob = await getCanvasBlob();
      if (typeof File === 'undefined') {
        throw new Error('このブラウザでは共有に対応していません。');
      }
      const file = new File([blob], 'expo-visit-summary.png', { type: 'image/png' });
      const data: ShareData = {
        title: 'Expo 2025 万博来場履歴',
        text: shareText,
        files: [file]
      };
      const nav = navigator as Navigator & { canShare?: (payload: ShareData) => boolean };
      if (nav.canShare && !nav.canShare({ files: data.files })) {
        throw new Error('このデバイスは画像共有に対応していません。');
      }
      await navigator.share(data);
      setActionMessage('共有メニューを開きました。');
    } catch (error) {
      console.error(error);
      setActionMessage(error instanceof Error ? error.message : '共有に失敗しました。');
    } finally {
      setIsSharing(false);
    }
  };

  useEffect(() => {
    if (!summary || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = summary.width * devicePixelRatio;
    canvas.height = summary.height * devicePixelRatio;
    // canvas.style.width = `${summary.width}px`;
    // canvas.style.height = `${summary.height}px`;

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, summary.width, summary.height);
    context.textBaseline = 'top';

    // Background
    context.fillStyle = '#f1f5f9';
    context.fillRect(0, 0, summary.width, summary.height);

    const cardX = 40;
    const cardY = 40;
    const cardWidth = summary.width - cardX * 2;
    const cardHeight = summary.height - cardY * 2;

    context.fillStyle = '#ffffff';
    context.shadowColor = 'rgba(15, 23, 42, 0.08)';
    context.shadowBlur = 32;
    context.shadowOffsetY = 24;
    context.fillRect(cardX, cardY, cardWidth, cardHeight);

    context.shadowColor = 'transparent';

    let cursorY = summary.paddingTop;
    const startX = summary.innerPaddingX;
    const sectionWidth = summary.width - summary.innerPaddingX * 2;

    const drawText = (
      text: string,
      options?: { font?: string; color?: string; xOffset?: number; maxWidth?: number }
    ) => {
      if (!text) return;
      const xOffset = options?.xOffset ?? 0;
      context.font = options?.font ?? '28px "Noto Sans JP", "Yu Gothic", sans-serif';
      context.fillStyle = options?.color ?? '#1f2937';
      context.textAlign = 'left';
      const maxWidth = options?.maxWidth ?? Math.max(0, sectionWidth - xOffset);
      context.fillText(text, startX + xOffset, cursorY, maxWidth || undefined);
      cursorY += summary.lineHeight;
    };

    const drawSplitLine = (
      left: string,
      right: string,
      options?: { font?: string; xOffset?: number; leftColor?: string; rightColor?: string }
    ) => {
      const xOffset = options?.xOffset ?? 0;
      const totalAvailable = Math.max(0, sectionWidth - xOffset);
      const gap = 24;
      const leftWidth = Math.floor((totalAvailable - gap) / 2);
      const rightWidth = totalAvailable - gap - leftWidth;
      const baseFont = options?.font ?? '26px "Noto Sans JP", "Yu Gothic", sans-serif';
      const halfFont = baseFont.replace(/(\d+(\.\d+)?)px/, (_, value: string) => {
        const numeric = Number.parseFloat(value);
        return `${Math.max(10, Math.round((numeric / 2) * 10) / 10)}px`;
      });
      const halfLineHeight = summary.lineHeight / 2;

      context.font = baseFont;
      context.textAlign = 'left';

      context.fillStyle = options?.leftColor ?? '#475569';
      if (left) {
        context.fillText(left, startX + xOffset, cursorY, leftWidth || undefined);
      }

      context.fillStyle = options?.rightColor ?? '#1f2937';
      if (right) {
        context.font = baseFont;
        const fits = context.measureText(right).width <= rightWidth;
        if (fits) {
          context.fillText(right, startX + xOffset + leftWidth + gap, cursorY, rightWidth || undefined);
        } else {
          context.font = halfFont;
          const wrapRightText = (text: string): [string, string] => {
            const findMidSpaceSplit = (value: string): [string, string] | null => {
              const indices: number[] = [];
              for (let i = 0; i < value.length; i += 1) {
                const char = value[i];
                if (char === ' ' || char === '　') {
                  indices.push(i);
                }
              }
              if (indices.length === 0) {
                return null;
              }
              const middle = (value.length - 1) / 2;
              let bestIndex = indices[0];
              let bestDistance = Math.abs(indices[0] - middle);
              indices.forEach((index) => {
                const distance = Math.abs(index - middle);
                if (distance < bestDistance) {
                  bestDistance = distance;
                  bestIndex = index;
                }
              });
              const first = value.slice(0, bestIndex).trimEnd();
              const second = value.slice(bestIndex + 1).trimStart();
              if (!first || !second) {
                return null;
              }
              return [first, second];
            };

            const lines: string[] = [''];
            for (const char of text) {
              const currentIndex = lines.length - 1;
              const candidate = lines[currentIndex] + char;
              const candidateWidth = context.measureText(candidate).width;
              if (candidateWidth <= rightWidth || lines[currentIndex] === '') {
                lines[currentIndex] = candidate;
              } else if (lines.length < 2) {
                lines.push(char);
              } else {
                let truncated = lines[1];
                while (truncated.length > 0 && context.measureText(`${truncated}…`).width > rightWidth) {
                  truncated = truncated.slice(0, -1);
                }
                lines[1] = truncated.length > 0 ? `${truncated}…` : '…';
                return [lines[0], lines[1]];
              }
            }
            if (lines.length === 1) {
              const original = lines[0];
              const splitBySpace = findMidSpaceSplit(original);
              if (splitBySpace) {
                const [first, second] = splitBySpace;
                if (
                  context.measureText(first).width <= rightWidth &&
                  context.measureText(second).width <= rightWidth
                ) {
                  return [first, second];
                }
              }
              for (let index = original.length - 1; index > 0; index -= 1) {
                const first = original.slice(0, index);
                const second = original.slice(index);
                if (context.measureText(first).width <= rightWidth && context.measureText(second).width <= rightWidth) {
                  return [first, second];
                }
              }
              return [original, ''];
            }
            return [lines[0], lines[1] ?? ''];
          };

          const [firstLine, secondLine] = wrapRightText(right);
          if (firstLine) {
            context.fillText(firstLine, startX + xOffset + leftWidth + gap, cursorY, rightWidth || undefined);
          }
          if (secondLine) {
            context.fillText(
              secondLine,
              startX + xOffset + leftWidth + gap,
              cursorY + halfLineHeight,
              rightWidth || undefined
            );
          }
        }
      }

      cursorY += summary.lineHeight;
    };

    drawText(summary.title, {
      font: 'bold 44px "Noto Sans JP", "Yu Gothic", sans-serif',
      color: '#0f172a'
    });
    cursorY += summary.beforeStatsSpacing;
    drawText(summary.summaryLabel, {
      font: '32px "Noto Sans JP", "Yu Gothic", sans-serif',
      color: '#334155'
    });
    cursorY += summary.afterStatsSpacing;

    cursorY += summary.blankSpacing;

    drawText('チケット一覧', { font: 'bold 34px "Noto Sans JP", "Yu Gothic", sans-serif', color: '#0f172a' });
    summary.ticketLines.forEach((line) => {
      drawText(line, { color: '#1e293b', font: '28px "Noto Sans JP", "Yu Gothic", sans-serif' });
    });

    cursorY += summary.blankSpacing;

    drawText('来場スケジュール', { font: 'bold 34px "Noto Sans JP", "Yu Gothic", sans-serif', color: '#0f172a' });
    summary.entranceLines.forEach((line) => {
      drawText(line.text, { color: '#111827', font: '28px "Noto Sans JP", "Yu Gothic", sans-serif' });
      line.events.forEach((eventLine) => {
        drawSplitLine(eventLine.left, eventLine.right, {
          font: '26px "Noto Sans JP", "Yu Gothic", sans-serif',
          xOffset: 36,
          leftColor: '#475569',
          rightColor: '#1f2937'
        });
      });
    });

    if (summary.leftoverEvents.length > 0) {
      cursorY += summary.blankSpacing;
      drawText('その他パビリオン予約', {
        font: 'bold 32px "Noto Sans JP", "Yu Gothic", sans-serif',
        color: '#0f172a'
      });
      summary.leftoverEvents.forEach((event) => {
        drawText(event.text, {
          color: '#475569',
          font: '26px "Noto Sans JP", "Yu Gothic", sans-serif',
          xOffset: 16
        });
      });
    }

    cursorY += summary.blankSpacing;

    drawText('月別来場回数', { font: 'bold 34px "Noto Sans JP", "Yu Gothic", sans-serif', color: '#0f172a' });

    const chartTop = cursorY + summary.chartTopMargin;
    const chartBottom = chartTop + summary.chartHeight;
    const chartLeft = startX;
    const chartRight = startX + sectionWidth;
    const availableHeight = summary.chartHeight;
    const barCount = summary.monthlyCounts.length;
    const gap = 24;
    const totalGap = gap * (barCount - 1);
    const barWidth = (sectionWidth - totalGap) / barCount;
    const maxCount = Math.max(...summary.monthlyCounts.map((item) => item.count), 1);
    const baselineY = chartBottom;

    context.strokeStyle = '#cbd5f5';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(chartLeft, baselineY);
    context.lineTo(chartRight, baselineY);
    context.stroke();

    summary.monthlyCounts.forEach((item, index) => {
      const barHeight = maxCount === 0 ? 0 : (item.count / maxCount) * availableHeight;
      const barX = chartLeft + index * (barWidth + gap);
      const barY = baselineY - barHeight;

      context.fillStyle = '#38bdf8';
      context.fillRect(barX, barY, barWidth, barHeight);

      context.fillStyle = '#0f172a';
      context.font = '26px "Noto Sans JP", "Yu Gothic", sans-serif';
      context.textAlign = 'center';
      context.fillText(String(item.count), barX + barWidth / 2, barY - 32, barWidth);

      context.fillStyle = '#334155';
      context.font = '28px "Noto Sans JP", "Yu Gothic", sans-serif';
      context.fillText(item.label, barX + barWidth / 2, baselineY + 12, barWidth);
    });

    cursorY = baselineY + summary.chartLabelArea + summary.chartBottomMargin;
    context.textAlign = 'left';
    context.font = '22px "Noto Sans JP", "Yu Gothic", sans-serif';
    context.fillStyle = '#94a3b8';
    context.fillText('作成: 万博予約入場履歴ビューアー（非公式）', startX, cursorY, sectionWidth);
  }, [summary]);

  if (!summary) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800">保存・SNS共有用画像</h3>
      <p className="mt-1 text-sm text-slate-500">
        画像の保存{canUseWebShare ? 'や共有' : ''}は下のボタンから実行できます。
      </p>
      <div className="mt-4 overflow-x-auto">
        <canvas ref={canvasRef} className="max-w-full" />
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSaveImage}
          disabled={isSavingImage}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {isSavingImage ? '保存中…' : '画像を保存'}
        </button>
        {canUseWebShare && (
          <button
            type="button"
            onClick={handleShareImage}
            disabled={isSharing}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-500 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
          >
            {isSharing ? '共有準備中…' : '共有する'}
          </button>
        )}
      </div>
      {actionMessage && <p className="mt-3 text-xs text-slate-500">{actionMessage}</p>}
    </div>
  );
}

export default function App() {
  const [rawInput, setRawInput] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [data, setData] = useState<TicketPayload | null>(null);
  const [error, setError] = useState<string>('');
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);

  const ticketCount = data?.list.length ?? 0;
  const entranceCount = data?.list.reduce((acc, ticket) => acc + (ticket.schedules?.length ?? 0), 0) ?? 0;
  const eventCount = data?.list.reduce((acc, ticket) => acc + (ticket.event_schedules?.length ?? 0), 0) ?? 0;

  const parseAndSet = (raw: string, options?: { fileName?: string }) => {
    setRawInput(raw);
    if (options?.fileName !== undefined) {
      setFileName(options.fileName);
    }

    try {
      const parsed = parseTicketJson(raw);
      if (!parsed.list || !Array.isArray(parsed.list)) {
        throw new Error('list配列が見つかりませんでした。チケット一覧APIのデータか確認してください。');
      }
      setData(parsed);
      setError('');
    } catch (parsingError) {
      setData(null);
      setError(parsingError instanceof Error ? parsingError.message : '未知のエラーが発生しました。');
    }
  };

  const handleParse = () => {
    parseAndSet(rawInput);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const inputEl = event.target;
    const file = inputEl.files?.[0];
    if (!file) return;
    setIsLoadingFile(true);
    setFileName(file.name);

    const isWebArchive = /\.webarchive$/i.test(file.name) || file.type.includes('webarchive');

    if (isWebArchive) {
      const reader = new FileReader();
      reader.onload = (loadEvent: ProgressEvent<FileReader>) => {
        const result = loadEvent.target?.result;
        if (!(result instanceof ArrayBuffer)) {
          setIsLoadingFile(false);
          setError('WebArchiveファイルの読み込みに失敗しました。');
          setData(null);
          inputEl.value = '';
          return;
        }

        try {
          const decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(result));
          const embeddedJson = extractEmbeddedTicketJson(decoded);
          if (!embeddedJson) {
            throw new Error('WebArchive内にチケットJSONが見つかりませんでした。');
          }

          const parsed = parseTicketJson(embeddedJson);
          parseAndSet(JSON.stringify(parsed, null, 2));
        } catch (parseError) {
          setData(null);
          setError(
            parseError instanceof Error
              ? parseError.message
              : 'WebArchiveの解析中に未知のエラーが発生しました。'
          );
        } finally {
          setIsLoadingFile(false);
          inputEl.value = '';
        }
      };
      reader.onerror = () => {
        setIsLoadingFile(false);
        setError('ファイルの読み込みに失敗しました。別のファイルでお試しください。');
        inputEl.value = '';
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent: ProgressEvent<FileReader>) => {
      const result = loadEvent.target?.result;
      const text = typeof result === 'string' ? result : '';
      setIsLoadingFile(false);
      parseAndSet(text);
      inputEl.value = '';
    };
    reader.onerror = () => {
      setIsLoadingFile(false);
      setError('ファイルの読み込みに失敗しました。別のファイルでお試しください。');
      inputEl.value = '';
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleSample = () => {
    parseAndSet(JSON.stringify(sampleTicketPayload, null, 2));
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pt-10 sm:px-6">
        <header className="space-y-4 rounded-3xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 p-8 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">万博予約入場履歴ビューアー</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/90">
                マイチケットのチケット一覧APIから取得したJSONを読み込み、入場予約やパビリオン予約を見やすく整理して表示します。過去の入場履歴の確認に便利です。データはブラウザ内でのみ処理され、外部に送信されることはありません。
              </p>
              <p className="mt-2 text-xs text-white/80">
                本ツールはCodexが一から実装し、Codexへの指示・修正依頼と主要な機能以外の修正のみ製作者が行いました。
              </p>
            </div>
            <div className="text-right text-sm text-white/90">
              <p>最終更新: 2024年10月16日</p>
              {/* <p>バージョン 0.1.0</p> */}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300" />
              <span>データはローカル処理のみ</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-300" />
              <span>JSON貼り付けとファイル読み込みに対応</span>
            </div>
          </div>
        </header>

        <section className="space-y-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            <p className="font-semibold">ご利用にあたっての注意</p>
            <p className="mt-1 leading-relaxed">
              このツールは非公式に個人が作成したものです。ご利用に際していかなる責任も負いかねます。
              また、このツールおよびこのツールで得た情報について公式窓口への問い合わせは絶対に行わないでください。
            </p>
          </div>
          <div className="text-sm">下の方の「JSON貼り付け」欄にある「サンプルを読み込む」ボタンを押すとサンプル表示できます。ちなみに製作者個人の履歴です。</div>

          <div>
            <h2 className="text-xl font-semibold text-slate-900">使い方</h2>
            <ol className="mt-3 list-decimal space-y-1 pl-6 text-sm text-slate-600">
              <li>新しいタブでマイチケットにログインし、タブを開いたままにします。</li>
              <li>次に下の方にある「チケット一覧APIを開く」ボタンを押します。長いコード(JSON)が表示されます。</li>
              <li>表示されたコード(JSON)を最初から最後まで全てコピーするか、そのままファイルとして保存します。<br />iPhoneの場合、Safariの共有メニューを開き、オプションで送信フォーマットをWebアーカイブに選択し、"ファイル"に保存します。</li>
              <li>下のフォームでコード(JSON)を貼り付けるか、ファイルを選択すると内容を解析します。</li>
            </ol>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-slate-600">
              <li><code>{`{"message":"Unauthorized"}`}</code>という短いコード(JSON)が表示された場合、マイチケットからログアウトしていますので再度ログインして開き直してください。</li>
              <li>製作者が確認できていないデータやマイチケットやチケット一覧APIの仕様変更で、本ツールが正しく動作しなくなる場合があります。</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <a
                href="https://ticket.expo2025.or.jp/myticket/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-4 py-2 font-semibold text-white shadow hover:bg-sky-700"
              >
                マイチケットを開く
                <span aria-hidden="true">&gt;</span>
              </a>
              <a
                href="https://ticket.expo2025.or.jp/api/d/my/tickets/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-sky-500 px-4 py-2 font-semibold text-sky-600 hover:bg-sky-50"
              >
                チケット一覧APIを開く
                <span aria-hidden="true">&gt;</span>
              </a>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <label className="flex items-center justify-between text-sm font-medium text-slate-700">
                JSONを貼り付け
                <button
                  type="button"
                  onClick={handleSample}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700"
                >
                  サンプルを読み込む
                </button>
              </label>
              <textarea
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                rows={14}
                placeholder="チケット一覧APIのJSONをここに貼り付けてください"
                className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <button
                type="button"
                onClick={handleParse}
                className="w-full rounded-full bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
              >
                この内容で解析する
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-700">ファイルから読み込む（JSON / HTML）</label>
              <label className="flex w-full min-h-[12rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 transition hover:border-sky-400 hover:text-sky-600">
                <input type="file" accept=".json,.txt,.html,.htm,.webarchive" className="hidden" onChange={handleFileChange} />
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-600">クリックまたはドラッグ＆ドロップ</span>
                <p>保存したJSONファイル、またはiPhoneのWeb Archiveファイルを読み込めます。</p>
                {fileName && <p className="font-medium text-slate-700">選択中: {fileName}</p>}
                {isLoadingFile && <p className="text-sky-600">読み込み中...</p>}
              </label>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
      </section>

        {data && (
          <section className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl bg-white p-5 text-center shadow-sm">
                <p className="text-sm text-slate-500">チケット数</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{ticketCount}</p>
              </div>
              <div className="rounded-3xl bg-white p-5 text-center shadow-sm">
                <p className="text-sm text-slate-500">入場予約</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{entranceCount}</p>
              </div>
              <div className="rounded-3xl bg-white p-5 text-center shadow-sm">
                <p className="text-sm text-slate-500">パビリオン予約</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{eventCount}</p>
              </div>
            </div>

            <div className="space-y-6">
              {data.list.map((ticket, index) => (
                <TicketCard key={ticket.id ?? ticket.ticket_id ?? `ticket-${index}`} ticket={ticket} />
              ))}
              <ShareableSummaryCanvas tickets={data.list} entranceCount={entranceCount} eventCount={eventCount} />
            </div>
          </section>
        )}

        {!data && !error && (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">
            JSONを解析するとここにチケットの一覧が表示されます。
          </section>
        )}
      </div>
      <footer className="mt-6 mx-auto w-full max-w-5xl px-4 text-xs text-slate-500 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4">
          <p className="font-semibold text-slate-600">製作者情報</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span>製作者: Nakayuki</span>
            <span>
              連絡先: <span className="underline decoration-dotted">yuki [at] nakayuki.net</span>
            </span>
            <span>
              X: <a href="https://x.com/nakayuki805" target="_blank" rel="noreferrer" className="text-slate-600 underline">
                @nakayuki805
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
