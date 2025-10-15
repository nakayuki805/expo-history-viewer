import { ChangeEvent, useMemo, useState } from 'react';
import sampleTicketPayload from '../sample/sample.json';

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
          ? (schedule as EventSchedule).event_name || timeLabel || '名称未登録'
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
          <h2 className="text-2xl font-semibold text-slate-900">{ticket.item_name || '名称未登録'}</h2>
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
                本ツールはCodexが一から実装し、Codexへの指示・修正依頼と機能面に影響のない軽微な手直しのみ製作者が行いました。
              </p>
            </div>
            <div className="text-right text-sm text-white/90">
              <p>最終更新: 2024年10月14日</p>
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
              <li>上記の方法でJSONを取得した場合、言語の指定ができず英語になるため、チケット名やパビリオン情報が英語表記になります。ご了承ください。</li>
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
