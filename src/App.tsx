import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  is_sample?: boolean;
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
  is_sample?: boolean;
}

const gateLabels: Record<GateType, string> = {
  1: '東ゲート',
  2: '西ゲート'
};

const gateBadgeClasses: Record<GateType, string> = {
  1: 'bg-[#E60012]/10 text-[#E60012]',
  2: 'bg-[#0068B7]/10 text-[#0068B7]'
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
  0: 'bg-[#D2D7DA] text-[#0B1F3B]',
  1: 'bg-[#0068B7]/10 text-[#0068B7]',
  2: 'bg-[#E60012]/10 text-[#E60012]',
  3: 'bg-[#E60012]/20 text-[#E60012]',
  4: 'bg-[#0068B7]/20 text-[#0068B7]',
  9: 'bg-[#D2D7DA] text-[#0B1F3B]'
};

const themeColors = {
  red: '#E60012',
  blue: '#0068B7',
  gray: '#D2D7DA',
  darkBlue: '#0B1F3B',
  textGray: '#4B5563'
};

const MAX_CANVAS_PIXELS = 16777216; // 4096 x 4096

function resolveUseState(value?: number): { label: string; className: string } {
  if (value === undefined || value === null) {
    return { label: '状態不明', className: 'bg-[#D2D7DA] text-[#0B1F3B]' };
  }
  const key = value as UseStateType;
  const label = useStateLabels[key];
  const className = useStateBadgeClasses[key];
  if (label && className) {
    return { label, className };
  }
  return { label: `状態不明（${value}）`, className: 'bg-[#D2D7DA] text-[#0B1F3B]' };
}

const registeredChannelLabels: Record<number, string> = {
  0: '当日登録端末・他',
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

function resolvePavilionName(code: string, name: string|null|undefined): string {
  const eventName = eventNameDic[code] || name || "不明なパビリオン";
  return eventName
    .trim()
    .replace(/^シグネチャーパビリオン\s+/,'')
    .replace(/\*車いす使用者は下記専用回にご予約下さい$/,'')
    .replace(/\/年齢に関わらず全員予約が必要$/,'')
    .replace(/※.+$/,'');
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

function getTicketKey(ticket: Ticket, index: number): string {
  if (ticket.id !== undefined) {
    return `id-${ticket.id}`;
  }
  if (ticket.ticket_id) {
    return `ticket-${ticket.ticket_id}`;
  }
  return `index-${index}`;
}

function mergeTicketPayloads(existing: TicketPayload | null, incoming: TicketPayload): TicketPayload {
  const merged: Ticket[] = [];
  const seenIds = new Set<string>();
  const isNotSample = incoming.is_sample !== true;

  const addTicket = (ticket: Ticket) => {
    if (isNotSample && ticket.is_sample === true) {
      return;
    }
    const ticketId = ticket.ticket_id?.trim();
    if (ticketId) {
      if (seenIds.has(ticketId)) {
        return;
      }
      seenIds.add(ticketId);
    }
    merged.push(ticket);
  };

  if (existing) {
    existing.list.forEach(addTicket);
  }

  incoming.list.forEach(addTicket);

  return { list: merged };
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
  ticketId?: string;
}

function TicketSchedules({ title, schedules, type, ticketId }: TicketSchedulesProps) {
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
      <div className="rounded-lg border border-dashed border-[#0068B7]/30 bg-white/70 p-4 text-sm text-[#0B1F3B]">
        {title}は見つかりませんでした。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orderedSchedules.map((schedule, index) => {
        const user_visiting_reservation_id = 'user_visiting_reservation_id' in schedule ? schedule.user_visiting_reservation_id : undefined;
        const keySource = user_visiting_reservation_id || schedule.id;
        const key = `${type}-${keySource ?? `schedule-${index}`}`;
        const stateDisplay = resolveUseState(schedule.use_state);
        const isEvent = type === 'event';
        const entrance_date = schedule.entrance_date;
        const dateLabel = formatDate(entrance_date);
        const timeLabel = schedule.schedule_name || (schedule.start_time ? formatTime(schedule.start_time) : '');
        const entranceTitle = dateLabel !== '未設定' ? dateLabel : '日付未設定';
        const titleText = isEvent
          ? (resolvePavilionName((schedule as EventSchedule).program_code ?? '', (schedule as EventSchedule).event_name) || timeLabel)
          : entranceTitle;
        const qrCodeUrl = (!isEvent && user_visiting_reservation_id && entrance_date) ? `https://ticket.expo2025.or.jp/publish_qrcode/?id=${ticketId}&reserve_id=${user_visiting_reservation_id}&entrance_date=${entrance_date}` : undefined;
        const gateLabel = !isEvent && (schedule as EntranceSchedule).gate_type !== undefined
          ? gateLabels[(schedule as EntranceSchedule).gate_type as GateType] ??
            `ゲート種別: ${(schedule as EntranceSchedule).gate_type}`
          : '';
        const gateBadgeClass = !isEvent && (schedule as EntranceSchedule).gate_type !== undefined
          ? gateBadgeClasses[(schedule as EntranceSchedule).gate_type as GateType] ??
            'bg-[#D2D7DA] text-[#0068B7]'
          : 'bg-[#D2D7DA] text-[#0068B7]';

        return (
          <div key={key} className="rounded-lg border border-[#C5CCD0] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-[#0068B7]">{titleText}</span>
              {isEvent && dateLabel !== '未設定' && (
                <span className="rounded-full bg-[#D2D7DA] px-3 py-1 text-xs font-medium text-[#0068B7]">
                  {dateLabel}
                </span>
              )}
              {timeLabel && (
                <span className="rounded-full bg-[#0068B7]/10 px-3 py-1 text-xs font-medium text-[#0068B7]">
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
                <span className="rounded-full bg-[#E60012]/10 px-3 py-1 text-xs font-semibold text-[#E60012]">
                  当日予約
                </span>
              )}
            </div>

            {isEvent && (schedule as EventSchedule).program_code && (
              <div className="mt-2 text-sm text-[#0B1F3B]">
                プログラムコード: {(schedule as EventSchedule).program_code}
              </div>
            )}

            <dl className="mt-3 grid gap-2 text-sm text-[#0B1F3B] grid-cols-2">
              {schedule.admission_time && (
                <div>
                  <dt className="font-medium text-[#0068B7]">入場時刻</dt>
                  <dd>{formatTime(schedule.admission_time)}</dd>
                </div>
              )}
              {isEvent && (schedule as EventSchedule).registered_channel !== undefined && (
                <div>
                  <dt className="font-medium text-[#0068B7]">予約方法</dt>
                  <dd>{resolveRegisteredChannel((schedule as EventSchedule).registered_channel)}</dd>
                </div>
              )}
              {isEvent && schedule.start_time && (
                <div className='col-start-1'>
                  <dt className="font-medium text-[#0068B7]">開始時刻</dt>
                  <dd>{formatTime(schedule.start_time)}</dd>
                </div>
              )}
              {isEvent && schedule.end_time && (
                <div>
                  <dt className="font-medium text-[#0068B7]">終了時刻</dt>
                  <dd>{formatTime(schedule.end_time)}</dd>
                </div>
              )}
              {isEvent && (schedule as EventSchedule).portal_url && (
                <div>
                  <dt className="font-medium text-[#0068B7]">詳細ページ</dt>
                  <dd>
                    <a
                      href={(schedule as EventSchedule).portal_url as string}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#4B5563] hover:underline"
                    >
                      {(schedule as EventSchedule).portal_url_desc || '詳細を確認'}
                    </a>
                  </dd>
                </div>
              )}
              {qrCodeUrl && (
                <div>
                  <dt className="font-medium text-[#0068B7]">QRコード印刷</dt>
                  <dd>
                    <a
                      href={qrCodeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#4B5563] hover:underline"
                    >
                      印刷ページ
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
  ticketKey: string;
  isIncluded: boolean;
  onIncludedChange: (nextValue: boolean) => void;
}

function TicketCard({ ticket, ticketKey, isIncluded, onIncludedChange }: TicketCardProps) {
  const imageUrl = useMemo(() => buildImageUrl(ticket.image_large_path), [ticket.image_large_path]);
  const [isTicketIdVisible, setIsTicketIdVisible] = useState(false);
  const checkboxId = useMemo(
    () => `include-${ticketKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    [ticketKey]
  );

  return (
    <article className="space-y-4 rounded-2xl border border-[#C5CCD0] bg-white p-6 shadow-sm transition hover:shadow-md">
      <header className="flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-[#0068B7]">{resolveTicketName(ticket)}</h2>
          <p className="text-sm text-[#0B1F3B]">
            {ticket.item_summary?.replace(/\\n/g, '\n') || '説明がありません。'}
          </p>
          <div className="flex flex-wrap gap-2 text-sm text-[#0B1F3B]">
            <button
              type="button"
              onClick={() => setIsTicketIdVisible((prev) => !prev)}
              className="rounded-full bg-[#D2D7DA] px-3 py-1 text-left text-xs font-semibold text-[#0068B7] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#0068B7]/40"
              aria-pressed={isTicketIdVisible}
            >
              {isTicketIdVisible
                ? `チケットID: ${ticket.ticket_id ?? '未登録'}`
                : 'チケットID: タップで表示'}
            </button>
            <span className="rounded-full bg-[#D2D7DA] px-3 py-1 font-medium text-[#0068B7]">
              種別: {ticket.item_group_name ?? '未登録'}
            </span>
            <span className="rounded-full bg-[#D2D7DA] px-3 py-1 font-medium text-[#0068B7]">
              予約回数: {ticket.schedules?.length ?? 0}
            </span>
            <span className="rounded-full bg-[#D2D7DA] px-3 py-1 font-medium text-[#0068B7]">
              パビリオン予約: {ticket.event_schedules?.length ?? 0}
            </span>
            {ticket.is_sample && <span className="rounded-full bg-[#D2D7DA] px-3 py-1 font-medium text-[#E60012]">
              サンプルデータ
            </span>}
          </div>
        </div>
        <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:items-end">
          <label htmlFor={checkboxId} className="flex items-center gap-2 text-sm text-[#0B1F3B]">
            <input
              id={checkboxId}
              type="checkbox"
              checked={isIncluded}
              onChange={(event) => onIncludedChange(event.target.checked)}
              className="h-4 w-4 rounded border-[#C5CCD0] focus:outline-none focus:ring-2 focus:ring-[#0068B7]/40"
              style={{ accentColor: themeColors.blue }}
            />
            <span>集計する</span>
          </label>
          {imageUrl && (
            <div className="self-center sm:self-end">
              <img
                src={imageUrl}
                alt={ticket.item_name || 'チケット画像'}
                className="h-24 max-w-48 rounded-xl border border-[#D2D7DA] object-contain shadow-sm"
                referrerPolicy="no-referrer"
                style={{ backgroundColor: themeColors.gray }}
              />
            </div>
          )}
        </div>
      </header>

      {isIncluded ? (
        <>
          <section>
            <h3 className="text-lg font-semibold text-[#0068B7]">入場予約</h3>
            <TicketSchedules title="入場予約" schedules={ticket.schedules ?? []} type="entrance" ticketId={ticket.ticket_id} />
          </section>

          <section>
            <h3 className="text-lg font-semibold text-[#0068B7]">パビリオン予約</h3>
            <TicketSchedules title="パビリオン予約" schedules={ticket.event_schedules ?? []} type="event" ticketId={ticket.ticket_id} />
          </section>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-[#0068B7]/30 bg-white/70 p-4 text-sm text-[#0B1F3B]">
          このチケットは集計対象外です。チェックを入れると一覧が再表示されます。
        </div>
      )}
    </article>
  );
}

interface ShareableSummaryCanvasProps {
  tickets: Ticket[];
  entranceCount: number;
  eventCount: number;
}

interface SummaryEventLine {
  left: string;
  right: string;
}

interface SummaryEntranceLine {
  key: string;
  text: string;
  baseText: string;
  gateLabel?: string;
  gateColor?: string;
  events: SummaryEventLine[];
  month: number | null;
}

interface SummaryEntranceTableRow {
  label: string;
  east: number;
  west: number;
  total: number;
}

interface SummaryEntranceTable {
  columns: string[];
  rows: SummaryEntranceTableRow[];
}

interface SummaryLeftoverEvent {
  key: string;
  text: string;
}

interface SummarySections {
  headerEnd: number;
  listStart: number;
  listEnd: number;
  summaryStart: number;
}

interface SummaryData {
  width: number;
  height: number;
  paddingTop: number;
  paddingBottom: number;
  lineHeight: number;
  blankSpacing: number;
  chartHeight: number;
  innerPaddingX: number;
  chartTopMargin: number;
  chartLabelArea: number;
  chartBottomMargin: number;
  beforeStatsSpacing: number;
  afterStatsSpacing: number;
  title: string;
  summaryLabel: string;
  ticketLines: string[];
  entranceLines: SummaryEntranceLine[];
  leftoverEvents: SummaryLeftoverEvent[];
  monthlyCounts: { month: number; label: string; count: number }[];
  showDetailed: boolean;
  entranceTable: SummaryEntranceTable;
  sections: SummarySections;
}

interface CanvasSegment {
  id: string;
  start: number;
  height: number;
}

function renderSummaryContent(context: CanvasRenderingContext2D, summary: SummaryData) {
  context.save();
  context.textBaseline = 'top';
  context.fillStyle = themeColors.gray;
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
    context.fillStyle = options?.color ?? themeColors.darkBlue;
    context.textAlign = 'left';
    const maxWidth = options?.maxWidth ?? Math.max(0, sectionWidth - xOffset);
    context.fillText(text, startX + xOffset, cursorY, maxWidth || undefined);
    cursorY += summary.lineHeight;
  };

  const drawEntranceLine = (line: SummaryEntranceLine) => {
    const baseText = line.baseText || '';
    const gateText = line.gateLabel || '';
    const gateColor = line.gateColor ?? themeColors.red;

    context.font = '28px "Noto Sans JP", "Yu Gothic", sans-serif';
    context.textAlign = 'left';
    context.fillStyle = themeColors.darkBlue;

    const measuredBaseWidth = baseText ? context.measureText(baseText).width : 0;
    const baseWidth = baseText ? Math.min(measuredBaseWidth, sectionWidth) : 0;

    if (baseText) {
      context.fillText(baseText, startX, cursorY, sectionWidth);
    }

    let currentX = startX + baseWidth;
    const maxX = startX + sectionWidth;
    if (currentX > maxX) {
      currentX = maxX;
    }

    if (baseText && gateText) {
      const delimiter = ' ｜ ';
      context.fillStyle = themeColors.darkBlue;
      context.fillText(delimiter, currentX, cursorY);
      currentX += context.measureText(delimiter).width;
    }

    if (gateText) {
      context.fillStyle = gateColor;
      context.fillText(gateText, currentX, cursorY);
    }

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
    const fontSizeRegex = /(\d+(?:\.\d+)?)px/;
    const baseFontMatch = baseFont.match(fontSizeRegex);
    const baseFontSize = baseFontMatch ? Number.parseFloat(baseFontMatch[1]) : 26;
    const minFontSize = Math.max(10, Math.round((baseFontSize / 2) * 10) / 10);
    const createFont = (size: number) =>
      baseFont.replace(fontSizeRegex, `${Math.max(10, Math.round(size * 10) / 10)}px`);
    const twoLineFont = createFont(minFontSize);
    const halfLineHeight = summary.lineHeight / 2;

    context.font = baseFont;
    context.textAlign = 'left';

    context.fillStyle = options?.leftColor ?? themeColors.textGray;
    if (left) {
      context.fillText(left, startX + xOffset, cursorY, leftWidth || undefined);
    }

    context.fillStyle = options?.rightColor ?? themeColors.textGray;
    if (right) {
      let singleLineFont: string | null = null;
      context.font = baseFont;
      let measuredWidth = context.measureText(right).width;
      if (measuredWidth <= rightWidth) {
        singleLineFont = baseFont;
      } else {
        for (let size = Math.floor(baseFontSize) - 1; size >= minFontSize; size -= 1) {
          const candidateFont = createFont(size);
          context.font = candidateFont;
          measuredWidth = context.measureText(right).width;
          if (measuredWidth <= rightWidth) {
            singleLineFont = candidateFont;
            break;
          }
        }
      }

      if (singleLineFont) {
        context.font = singleLineFont;
        context.fillText(right, startX + xOffset + leftWidth + gap, cursorY, rightWidth || undefined);
      } else {
        context.font = twoLineFont;
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
              if (
                context.measureText(first).width <= rightWidth &&
                context.measureText(second).width <= rightWidth
              ) {
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
    color: themeColors.blue
  });
  cursorY += summary.beforeStatsSpacing;
  drawText(summary.summaryLabel, {
    font: '32px "Noto Sans JP", "Yu Gothic", sans-serif',
    color: themeColors.red
  });
  cursorY += summary.afterStatsSpacing;

  cursorY += summary.blankSpacing;

  if (summary.showDetailed) {
    drawText('チケット一覧', { font: 'bold 34px "Noto Sans JP", "Yu Gothic", sans-serif', color: themeColors.blue });
    summary.ticketLines.forEach((line) => {
      drawText(line, { color: themeColors.darkBlue, font: '28px "Noto Sans JP", "Yu Gothic", sans-serif' });
    });

    cursorY += summary.blankSpacing;

    drawText('来場スケジュール', { font: 'bold 34px "Noto Sans JP", "Yu Gothic", sans-serif', color: themeColors.blue });
    summary.entranceLines.forEach((line) => {
      drawEntranceLine(line);
      line.events.forEach((eventLine) => {
        drawSplitLine(eventLine.left, eventLine.right, {
          font: '26px "Noto Sans JP", "Yu Gothic", sans-serif',
          xOffset: 36,
          leftColor: themeColors.textGray,
          rightColor: themeColors.textGray
        });
      });
    });

    if (summary.leftoverEvents.length > 0) {
      cursorY += summary.blankSpacing;
      drawText('その他パビリオン予約', {
        font: 'bold 32px "Noto Sans JP", "Yu Gothic", sans-serif',
        color: themeColors.blue
      });
      summary.leftoverEvents.forEach((event) => {
        drawText(event.text, {
          color: themeColors.textGray,
          font: '26px "Noto Sans JP", "Yu Gothic", sans-serif',
          xOffset: 16
        });
      });
    }

    cursorY += summary.blankSpacing;
  }

  cursorY += summary.blankSpacing;
  drawText('月別来場回数', { font: 'bold 34px "Noto Sans JP", "Yu Gothic", sans-serif', color: themeColors.blue });

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

  context.strokeStyle = themeColors.gray;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(chartLeft, baselineY);
  context.lineTo(chartRight, baselineY);
  context.stroke();

  summary.monthlyCounts.forEach((item, index) => {
    const barHeight = maxCount === 0 ? 0 : (item.count / maxCount) * availableHeight;
    const barX = chartLeft + index * (barWidth + gap);
    const barY = baselineY - barHeight;

    context.fillStyle = themeColors.blue;
    context.fillRect(barX, barY, barWidth, barHeight);

    context.fillStyle = themeColors.textGray;
    context.font = '26px "Noto Sans JP", "Yu Gothic", sans-serif';
    context.textAlign = 'center';
    context.fillText(String(item.count), barX + barWidth / 2, barY - 32, barWidth);

    context.fillStyle = themeColors.darkBlue;
    context.font = '28px "Noto Sans JP", "Yu Gothic", sans-serif';
    context.fillText(item.label, barX + barWidth / 2, baselineY + 12, barWidth);
  });

  const tableHeaderY = baselineY + summary.chartLabelArea + summary.chartBottomMargin + summary.blankSpacing / 2;
  context.textAlign = 'left';
  context.font = 'bold 34px "Noto Sans JP", "Yu Gothic", sans-serif';
  context.fillStyle = themeColors.blue;
  context.fillText('入場予約集計表', startX, tableHeaderY, sectionWidth);

  const columnCount = summary.entranceTable.columns.length + 1;
  const columnWidth = sectionWidth / columnCount;
  const rowHeight = summary.lineHeight;
  const totalRows = summary.entranceTable.rows.length + 1;
  const tableStartX = startX;
  const tableTop = tableHeaderY + rowHeight;
  const tableHeight = totalRows * rowHeight;
  let tableRowY = tableTop;

  context.strokeStyle = themeColors.gray;
  context.lineWidth = 1;

  context.strokeRect(tableStartX, tableTop, sectionWidth, tableHeight);

  for (let rowIndex = 1; rowIndex < totalRows; rowIndex += 1) {
    const y = tableTop + rowIndex * rowHeight;
    context.beginPath();
    context.moveTo(tableStartX, y);
    context.lineTo(tableStartX + sectionWidth, y);
    context.stroke();
  }

  for (let colIndex = 1; colIndex < columnCount; colIndex += 1) {
    const x = tableStartX + colIndex * columnWidth;
    context.beginPath();
    context.moveTo(x, tableTop);
    context.lineTo(x, tableTop + tableHeight);
    context.stroke();
  }

  context.font = '26px "Noto Sans JP", "Yu Gothic", sans-serif';
  context.fillStyle = themeColors.darkBlue;
  context.textAlign = 'left';
  context.fillText('時間', startX + columnWidth * 0.1, tableRowY + rowHeight * 0.2, columnWidth);

  context.textAlign = 'center';
  summary.entranceTable.columns.forEach((columnLabel, index) => {
    const cellCenterX = startX + columnWidth * (index + 1) + columnWidth / 2;
    context.fillText(columnLabel, cellCenterX, tableRowY + rowHeight * 0.2, columnWidth);
  });

  tableRowY += rowHeight;

  summary.entranceTable.rows.forEach((row) => {
    context.textAlign = 'left';
    context.fillStyle = themeColors.darkBlue;
    context.fillText(row.label, startX + columnWidth * 0.1, tableRowY + rowHeight * 0.2, columnWidth);

    const values = [row.east, row.west, row.total];
    context.textAlign = 'center';
    context.fillStyle = themeColors.textGray;
    values.forEach((value, index) => {
      const cellCenterX = startX + columnWidth * (index + 1) + columnWidth / 2;
      context.fillText(String(value), cellCenterX, tableRowY + rowHeight * 0.2, columnWidth);
    });

    tableRowY += rowHeight;
  });

  cursorY = tableRowY + summary.blankSpacing;
  context.textAlign = 'left';
  context.font = '22px "Noto Sans JP", "Yu Gothic", sans-serif';
  context.fillStyle = themeColors.blue;
  context.fillText('作成: 万博予約入場履歴ビューアー（非公式）', startX, cursorY, sectionWidth);

  context.restore();
}

function ShareableSummaryCanvas({ tickets, entranceCount, eventCount }: ShareableSummaryCanvasProps) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [segments, setSegments] = useState<CanvasSegment[]>([]);
  const [displayPixelRatio, setDisplayPixelRatio] = useState<number>(1);
  const [isDetailedView, setIsDetailedView] = useState<boolean>(true);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string>('');

  const summary = useMemo<SummaryData | null>(() => {
    if (!Array.isArray(tickets) || tickets.length === 0) {
      return null;
    }

    const width = 1080;
    const paddingTop = 96;
    const paddingBottom = 96;
    const lineHeight = 44;
    const blankSpacing = Math.round(lineHeight * 0.7);
    const chartHeight = 240;
    const chartTopMargin = 24;
    const chartLabelArea = 80;
    const chartBottomMargin = 0;
    const innerPaddingX = 120;
    const beforeStatsSpacing = 8;
    const afterStatsSpacing = 12;
    const showDetailed = isDetailedView;

    const bucketDefinitions = [
      { key: '09', label: '9時' },
      { key: '10', label: '10時' },
      { key: '11', label: '11時' },
      { key: '12', label: '12時' },
      { key: '17', label: '17時' }
    ];

    const bucketCounts: Record<string, { east: number; west: number }> = {};
    bucketDefinitions.forEach(({ key }) => {
      bucketCounts[key] = { east: 0, west: 0 };
    });
    let totalEast = 0;
    let totalWest = 0;

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

    const determineBucket = (schedule: EntranceSchedule): string | null => {
      const name = schedule.schedule_name;
      if (!name) return null;
      const match = name.match(/(\d{1,2})[:：]/);
      if (!match) {
        return null;
      }
      const hour = match[1].padStart(2, '0');
      return bucketCounts[hour] ? hour : null;
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

    const entranceLines: SummaryEntranceLine[] = [];
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
        const bucketKey = determineBucket(schedule as EntranceSchedule);
        const gateType = (schedule as EntranceSchedule).gate_type;
        if (gateType === 1) {
          totalEast += 1;
          if (bucketKey && bucketCounts[bucketKey]) {
            bucketCounts[bucketKey].east += 1;
          }
        } else if (gateType === 2) {
          totalWest += 1;
          if (bucketKey && bucketCounts[bucketKey]) {
            bucketCounts[bucketKey].west += 1;
          }
        }

        const parts = [
          dateInfo.label,
          label,
          timeLabel && timeLabel !== '未設定' ? timeLabel : '',
          gateLabel,
          statusText
        ].filter(Boolean);
        const gateIndex = gateLabel ? parts.indexOf(gateLabel) : -1;
        const baseParts = gateIndex >= 0
          ? [...parts.slice(0, gateIndex), ...parts.slice(gateIndex + 1)]
          : [...parts];
        const baseText = baseParts.join(' ｜ ');
        const lineText = (gateLabel ? [...baseParts, gateLabel] : baseParts).join(' ｜ ');
        const gateColor = gateLabel
          ? ((schedule as EntranceSchedule).gate_type === 1 ? themeColors.red : themeColors.blue)
          : undefined;

        if (dateInfo.month) {
          monthCountMap.set(dateInfo.month, (monthCountMap.get(dateInfo.month) ?? 0) + 1);
        }

        const mapKey = `${ticketKey}-${schedule.entrance_date ?? 'unknown'}`;
        const relatedEvents = eventsByKey.get(mapKey) ?? [];
        eventsByKey.delete(mapKey);

        const eventLines: SummaryEventLine[] = relatedEvents.map((event) => {
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
          const rightText = resolvePavilionName(event.program_code ?? '', event.event_name);
          return { left: leftText, right: rightText };
        });

        entranceLines.push({
          key: `entrance-${label}-${schedule.user_visiting_reservation_id ?? schedule.id ?? scheduleIndex}`,
          text: lineText,
          baseText,
          gateLabel: gateLabel || undefined,
          gateColor,
          events: eventLines,
          month: dateInfo.month
        });
      });
    });

    entranceLines.sort((a, b) => {
      const findSchedule = (line: SummaryEntranceLine) => {
        const [datePart] = line.text.split(' ｜ ');
        return datePart ?? '';
      };
      const scheduleA = findSchedule(a);
      const scheduleB = findSchedule(b);
      if (scheduleA < scheduleB) return -1;
      if (scheduleA > scheduleB) return 1;
      return 0;
    });

    const entranceTableRows: SummaryEntranceTableRow[] = bucketDefinitions.map(({ key, label }) => {
      const counts = bucketCounts[key];
      const east = counts?.east ?? 0;
      const west = counts?.west ?? 0;
      return {
        label,
        east,
        west,
        total: east + west
      };
    });
    entranceTableRows.push({
      label: '合計',
      east: totalEast,
      west: totalWest,
      total: totalEast + totalWest
    });

    const entranceTable: SummaryEntranceTable = {
      columns: ['東', '西', '合計'],
      rows: entranceTableRows
    };

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
    const tableRowCount = entranceTable.rows.length + 1;

    let cursorHeight = paddingTop;
    cursorHeight += lineHeight; // title
    cursorHeight += beforeStatsSpacing;
    cursorHeight += lineHeight; // stats
    cursorHeight += afterStatsSpacing;

    const headerEnd = cursorHeight;

    let listStart = headerEnd;
    let listEnd = headerEnd;

    if (showDetailed) {
      cursorHeight += blankSpacing; // gap before tickets
      listStart = cursorHeight;
      cursorHeight += lineHeight; // ticket heading
      cursorHeight += ticketLines.length * lineHeight;
      cursorHeight += blankSpacing; // gap before schedules
      cursorHeight += lineHeight; // schedule heading
      cursorHeight += entranceLines.length * lineHeight;
      cursorHeight += totalEventCount * lineHeight;

      if (leftoverCount > 0) {
        cursorHeight += blankSpacing;
        cursorHeight += lineHeight; // leftover heading
        cursorHeight += leftoverCount * lineHeight;
      }

      listEnd = cursorHeight;
    }

    cursorHeight += blankSpacing;
    const summaryStart = cursorHeight;

    cursorHeight += lineHeight; // chart heading
    cursorHeight += chartTopMargin;
    cursorHeight += chartHeight;
    cursorHeight += chartLabelArea;
    cursorHeight += chartBottomMargin;

    cursorHeight += blankSpacing;
    cursorHeight += lineHeight; // table heading
    cursorHeight += tableRowCount * lineHeight;

    cursorHeight += blankSpacing;
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
      monthlyCounts,
      showDetailed,
      entranceTable,
      sections: {
        headerEnd,
        listStart,
        listEnd,
        summaryStart
      }
    };
  }, [tickets, entranceCount, eventCount, isDetailedView]);

  useEffect(() => {
    if (!summary) {
      setSegments([]);
      return;
    }

    const ratio = 1;//Math.min(window.devicePixelRatio || 1, 2);
    let maxSegmentHeight = Math.floor(MAX_CANVAS_PIXELS / (summary.width * ratio));
    if (!Number.isFinite(maxSegmentHeight) || maxSegmentHeight < summary.lineHeight) {
      maxSegmentHeight = summary.lineHeight;
    }
    const effectiveMaxHeight = Math.max(summary.lineHeight, maxSegmentHeight);

    const newSegments: CanvasSegment[] = [];
    const addSegment = (start: number, end: number, alignToLine: boolean) => {
      if (end <= start) {
        return;
      }
      let current = start;
      while (current < end) {
        const remaining = end - current;
        let height = Math.min(remaining, effectiveMaxHeight);
        if (alignToLine && height < remaining) {
          const maxLines = Math.max(1, Math.floor(height / summary.lineHeight));
          height = maxLines * summary.lineHeight;
        }
        if (height <= 0) {
          height = Math.min(remaining, summary.lineHeight);
        }
        height = Math.min(height, remaining);
        newSegments.push({
          id: `segment-${newSegments.length}`,
          start: current,
          height
        });
        current += height;
      }
    };

    addSegment(0, summary.sections.headerEnd, false);
    if (summary.showDetailed && summary.sections.listEnd > summary.sections.listStart) {
      addSegment(summary.sections.listStart, summary.sections.listEnd, true);
    }
    addSegment(summary.sections.summaryStart, summary.height, false);

    setDisplayPixelRatio(ratio);
    setSegments(newSegments);
  }, [summary]);

  useEffect(() => {
    if (!summary || segments.length === 0) {
      return;
    }

    canvasRefs.current.length = segments.length;

    segments.forEach((segment, index) => {
      const canvas = canvasRefs.current[index];
      if (!canvas) {
        return;
      }
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      const ratio = displayPixelRatio;
      const width = summary.width;
      const height = segment.height;
      const pixelWidth = Math.max(1, Math.floor(width * ratio));
      const pixelHeight = Math.max(1, Math.floor(height * ratio));

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      canvas.style.width = `${width}px`;
      // canvas.style.height = `${height}px`;

      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, pixelWidth, pixelHeight);
      context.restore();

      context.save();
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.beginPath();
      context.rect(0, 0, width, height);
      context.clip();
      context.translate(0, -segment.start);
      renderSummaryContent(context, summary);
      context.restore();
    });
  }, [summary, segments, displayPixelRatio]);

  const shareText = useMemo(
    () => `Expo 2025 万博予約入場履歴まとめ\n入場予約 ${entranceCount}回 ｜ パビリオン予約 ${eventCount}回\nhttps://www.nakayuki.net/expo-history-viewer/`,
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

  const getCanvasBlob = async (): Promise<Blob> => {
    if (!summary) {
      throw new Error('画像が生成されていません。');
    }

    const ratio = displayPixelRatio || 1;
    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(1, Math.floor(summary.width * ratio));
    offscreen.height = Math.max(1, Math.floor(summary.height * ratio));
    const context = offscreen.getContext('2d');
    if (!context) {
      throw new Error('画像の生成に失敗しました。');
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    renderSummaryContent(context, summary);

    return await new Promise<Blob>((resolve, reject) => {
      offscreen.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('画像の生成に失敗しました。'));
        }
      }, 'image/png');
    });
  };

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
        title: 'Expo 2025 万博予約入場履歴まとめ',
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


  if (!summary) {
    return null;
  }

  canvasRefs.current.length = segments.length;

  return (
    <div className="rounded-3xl border border-[#C5CCD0] bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-[#0068B7]">保存・SNS共有用画像</h3>
      <p className="mt-1 text-sm text-[#0B1F3B]">
        画像の保存{canUseWebShare ? 'や共有' : ''}は下のボタンから実行できます。
      </p>
      <div className="mt-4 flex items-center justify-end">
        <label className="flex items-center gap-3 text-sm text-[#0B1F3B]">
          <span>チケット・来場予約一覧を表示</span>
          <button
            type="button"
            role="switch"
            aria-checked={isDetailedView}
            onClick={() => setIsDetailedView((prev) => !prev)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              isDetailedView ? 'bg-[#0068B7]' : 'bg-[#C5CCD0]'
            }`}
          >
            <span className="sr-only">チケット・来場予約一覧を表示</span>
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white transition ${
                isDetailedView ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="flex flex-col">
          {segments.map((segment, index) => (
            <canvas
              key={segment.id}
              ref={(element) => {
                canvasRefs.current[index] = element;
              }}
              className="max-w-full"
              style={{ display: 'block' }}
            />
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSaveImage}
          disabled={isSavingImage}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0068B7] px-4 py-2 text-sm font-semibold text-white shadow transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-[#0068B7]/40"
        >
          {isSavingImage ? '保存中…' : '画像を保存'}
        </button>
        {canUseWebShare && (
          <button
            type="button"
            onClick={handleShareImage}
            disabled={isSharing}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[#E60012] px-4 py-2 text-sm font-semibold text-[#E60012] transition hover:bg-[#E60012]/10 disabled:cursor-not-allowed disabled:border-[#D2D7DA] disabled:text-[#D2D7DA]"
          >
            {isSharing ? '共有準備中…' : '共有する'}
          </button>
        )}
      </div>
      {actionMessage && <p className="mt-3 text-xs text-[#0B1F3B]">{actionMessage}</p>}
      {canUseWebShare && <p className="mt-1 text-sm text-[#0B1F3B]">
        iPhoneに画像を保存する場合、共有ボタンから保存できます。
      </p>}
    </div>
  );
}

export default function App() {
  const [rawInput, setRawInput] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [data, setData] = useState<TicketPayload | null>(null);
  const [error, setError] = useState<string>('');
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [includedTicketMap, setIncludedTicketMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!data) {
      setIncludedTicketMap({});
      return;
    }
    setIncludedTicketMap((previous) => {
      const next: Record<string, boolean> = {};
      data.list.forEach((ticket, index) => {
        const key = getTicketKey(ticket, index);
        next[key] = previous[key] ?? true;
      });
      return next;
    });
  }, [data]);

  const includedTickets = useMemo(() => {
    if (!data) {
      return [] as Ticket[];
    }
    return data.list.filter((ticket, index) => {
      const key = getTicketKey(ticket, index);
      const value = includedTicketMap[key];
      return value !== false;
    });
  }, [data, includedTicketMap]);

  const ticketCount = includedTickets.length;
  const entranceCount = includedTickets.reduce(
    (accumulator, ticket) => accumulator + (ticket.schedules?.length ?? 0),
    0
  );
  const eventCount = includedTickets.reduce(
    (accumulator, ticket) => accumulator + (ticket.event_schedules?.length ?? 0),
    0
  );

  const handleTicketIncludedChange = useCallback((ticketKey: string, nextValue: boolean) => {
    setIncludedTicketMap((previous) => ({
      ...previous,
      [ticketKey]: nextValue
    }));
  }, []);

  const handleClearInput = useCallback(() => {
    setRawInput('');
  }, []);

  const handleClearData = useCallback(() => {
    setData(null);
    setIncludedTicketMap({});
    setFileName('');
    setError('');
  }, []);

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
      setData((previous) => mergeTicketPayloads(previous, parsed));
      setError('');
    } catch (parsingError) {
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
    <div className="min-h-screen bg-[#D2D7DA] pb-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pt-10 sm:px-6">
        <header className="space-y-4 rounded-3xl bg-[#0068B7] p-8 text-white shadow-lg">
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
              <p>最終更新: 2024年10月21日</p>
              {/* <p>バージョン 0.1.0</p> */}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#D2D7DA]" />
              <span>データはローカル処理のみ</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#E60012]" />
              <span>JSON貼り付けとファイル読み込みに対応</span>
            </div>
          </div>
        </header>

        <section className="space-y-6 rounded-3xl border border-[#C5CCD0] bg-white/95 p-6 shadow-sm">
          <div className="rounded-2xl border border-[#E60012]/40 bg-[#E60012]/10 px-4 py-4 text-sm text-[#E60012]">
            <p className="font-semibold">ご利用にあたっての注意</p>
            <p className="mt-1 leading-relaxed">
              このツールは非公式に個人が作成したものです。ご利用に際していかなる責任も負いかねます。
              また、このツールおよびこのツールで得た情報について公式窓口への問い合わせは絶対に行わないでください。
            </p>
          </div>
          <div className="text-sm text-[#0B1F3B]">下の方の「JSON貼り付け」欄にある「サンプルを読み込む」ボタンを押すとサンプル表示できます。ちなみに製作者個人の履歴です。</div>

          <div>
            <h2 className="text-xl font-semibold text-[#0068B7]">使い方</h2>
            <ol className="mt-3 list-decimal space-y-1 pl-6 text-sm text-[#0B1F3B]">
              <li>新しいタブでマイチケットにログインし、タブを開いたままにします。</li>
              <li>次に下の方にある「チケット一覧APIを開く」ボタンを押します。とても長い記号やアルファベットの羅列によるコード(JSON)が表示されます。</li>
              <li>
                PC・Androidの場合、表示されたコード(JSON)を最初から最後まで全て選択(Ctrl-A/Cmd-A)しコピーするか、そのままファイルとして保存します。<br />
                iPhoneの場合、表示されたコードの画面でSafariの共有メニューを開き、オプションで送信フォーマットを「Webアーカイブ」に選択し、「"ファイル"に保存」します。<br />
                <span className="text-xs text-[#0B1F3B]/70">Androidでデータが大きい場合、コピーが途中で切れて読み込めないことがあります。より確実な方法を追加する予定です。</span>
              </li>
              <li>下のフォームでコード(JSON)を貼り付けるか、先ほど保存したファイルを選択すると内容を解析します。</li>
            </ol>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-[#0B1F3B]">
              <li>アプリ内ブラウザで開いているときは、外部ブラウザで開いてください。</li>
              <li><code>{`{"message":"Unauthorized"}`}</code>という短いコード(JSON)が表示された場合、マイチケットからログアウトしていますので再度ログインして開き直してください。</li>
              <li>上記の方法でJSONを取得した場合、言語の指定ができず英語になるため、一部の情報が英語表記になります。ご了承ください。</li>
              <li>保存やSNSの共有に便利な1枚にまとめた画像も一番下に生成されます。</li>
              <li>自分以外のチケットが含まれている場合は「集計する」チェックボックスを外して集計対象外にできます。</li>
              <li>通期パス・夏パスの併用等で複数のIDがある場合は、1つのIDでログインして取得したデータの読み込み後、マイチケットをログアウト→ 別のIDでログインして手順を繰り返してください。データを読み込むと既に読み込んだデータと統合され、まとめて集計可能です。</li>
              <li>製作者が確認できていないデータやマイチケットやチケット一覧APIの仕様変更で、本ツールが正しく動作しなくなる場合があります。</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <a
                href="https://ticket.expo2025.or.jp/myticket/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-[#E60012] px-4 py-2 font-semibold text-white shadow hover:brightness-110"
              >
                マイチケットを開く
                <span aria-hidden="true">&gt;</span>
              </a>
              <a
                href="https://ticket.expo2025.or.jp/api/d/my/tickets/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-[#0068B7] px-4 py-2 font-semibold text-[#0068B7] hover:bg-[#0068B7]/10"
              >
                チケット一覧APIを開く
                <span aria-hidden="true">&gt;</span>
              </a>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="ticket-json-input" className="text-sm font-medium text-[#0B1F3B]">
                  JSONを貼り付け
                </label>
                <div className="flex flex-wrap gap-2">
                  {(!data || data.list.length == 0) &&<button
                    type="button"
                    onClick={handleSample}
                    className="rounded-full border border-[#0068B7] px-3 py-1 text-xs font-semibold text-[#0068B7] transition hover:brightness-110"
                  >
                    サンプルを読み込む
                  </button>}
                  <button
                    type="button"
                    onClick={handleClearInput}
                    className="rounded-full border border-[#C5CCD0] px-3 py-1 text-xs font-semibold text-[#0B1F3B] transition hover:brightness-110"
                  >
                    貼り付け欄をクリア
                  </button>
                </div>
              </div>
              <textarea
                id="ticket-json-input"
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                rows={14}
                placeholder="チケット一覧APIのJSONをここに貼り付けてください"
                className="w-full resize-y rounded-2xl border border-[#C5CCD0] bg-white px-4 py-3 text-sm text-[#0B1F3B] shadow-inner focus:border-[#0068B7] focus:outline-none focus:ring-2 focus:ring-[#0068B7]/40"
              />
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleParse}
                  className="w-full rounded-full bg-[#0068B7] px-4 py-3 text-sm font-semibold text-white shadow transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#0068B7]/50"
                >
                  この内容で解析する
                </button>
                {data && data.list.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearData}
                    className="w-full rounded-full border border-[#E60012] px-4 py-3 text-sm font-semibold text-[#E60012] transition hover:bg-[#E60012]/10 focus:outline-none focus:ring-2 focus:ring-[#E60012]/40"
                  >
                    データをクリアする
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-[#0B1F3B]">ファイルから読み込む（JSON / HTML / WEBARCHIVE）</label>
              <label className="flex w-full min-h-[12rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#0068B7]/40 bg-white p-6 text-center text-sm text-[#0B1F3B] transition hover:border-[#0068B7] hover:text-[#0068B7]">
                <input type="file" accept=".json,.txt,.html,.htm,.webarchive" className="hidden" onChange={handleFileChange} />
                <span className="rounded-full bg-[#0068B7]/10 px-3 py-1 text-xs font-semibold text-[#0068B7]">クリック{/*またはドラッグ＆ドロップ*/}</span>
                <p>保存したJSONファイル、またはiPhoneのWeb Archiveファイルを読み込めます。</p>
                {fileName && <p className="font-medium text-[#0068B7]">選択中: {fileName}</p>}
                {isLoadingFile && <p className="text-[#E60012]">読み込み中...</p>}
              </label>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-[#E60012]/40 bg-[#E60012]/10 px-4 py-3 text-sm text-[#E60012]">
              {error}
            </div>
          )}
      </section>

        {data && (
          <section className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-[#0068B7]/15 bg-white p-5 text-center shadow-sm">
                <p className="text-sm font-medium text-[#0068B7]">チケット数</p>
                <p className="mt-2 text-3xl font-semibold text-[#E60012]">{ticketCount}</p>
              </div>
              <div className="rounded-3xl border border-[#0068B7]/15 bg-white p-5 text-center shadow-sm">
                <p className="text-sm font-medium text-[#0068B7]">入場予約</p>
                <p className="mt-2 text-3xl font-semibold text-[#E60012]">{entranceCount}</p>
              </div>
              <div className="rounded-3xl border border-[#0068B7]/15 bg-white p-5 text-center shadow-sm">
                <p className="text-sm font-medium text-[#0068B7]">パビリオン予約</p>
                <p className="mt-2 text-3xl font-semibold text-[#E60012]">{eventCount}</p>
              </div>
            </div>

            <div className="space-y-6">
              {data.list.map((ticket, index) => {
                const ticketKey = getTicketKey(ticket, index);
                const isIncluded = includedTicketMap[ticketKey] !== false;
                return (
                  <TicketCard
                    key={ticketKey}
                    ticket={ticket}
                    ticketKey={ticketKey}
                    isIncluded={isIncluded}
                    onIncludedChange={(nextValue) => handleTicketIncludedChange(ticketKey, nextValue)}
                  />
                );
              })}
              {includedTickets.length > 0 && (
                <ShareableSummaryCanvas
                  tickets={includedTickets}
                  entranceCount={entranceCount}
                  eventCount={eventCount}
                />
              )}
              {includedTickets.length === 0 && (
                <div className="rounded-3xl border border-dashed border-[#0068B7]/30 bg-white/80 p-6 text-center text-sm text-[#0B1F3B]">
                  現在、集計対象のチケットがありません。カードの「集計する」にチェックを入れてください。
                </div>
              )}
            </div>
          </section>
        )}

        {!data && !error && (
          <section className="rounded-3xl border border-dashed border-[#0068B7]/30 bg-white/80 p-6 text-center text-sm text-[#0B1F3B]">
            JSONを解析するとここにチケットの一覧が表示されます。
          </section>
        )}
      </div>
      <footer className="mt-6 mx-auto w-full max-w-5xl px-4 text-xs text-[#0B1F3B] sm:px-6">
        <div className="rounded-2xl border border-[#C5CCD0] bg-white/90 px-4 py-4">
          <p className="font-semibold text-[#0068B7]">製作者情報</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span>製作者: Nakayuki</span>
            <span>
              連絡先: <span className="underline decoration-dotted">yuki [at] nakayuki.net</span>
            </span>
            <span>
              X: <a href="https://x.com/nakayuki805" target="_blank" rel="noreferrer" className="text-[#0068B7] underline">
                @nakayuki805
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
