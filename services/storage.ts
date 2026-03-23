import { Trade, Side, Result, Grade, Bias, AssetType } from '../types';

const STORAGE_KEY = 'precision_trader_journal_data';

export const saveTrades = (trades: Trade[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
};

export const loadTrades = (): Trade[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to parse trade data", e);
    return [];
  }
};

const CSV_COLUMNS = [
  'Date', 'Symbol', 'Side', 'Qty', 'Entry Price', 'Exit Price', 
  'Gross P&L', 'Fees', 'Net P&L', 'Tags', 'Setup Type', 'Result', 
  'Grade', 'RR', 'Narrative'
];

export const exportToCSV = (trades: Trade[]) => {
  if (trades.length === 0) return;
  
  const headers = CSV_COLUMNS.join(',');
  const rows = trades.map(t => {
    // Calculate gross if missing
    const fees = t.total_fees || 0;
    const gross = t.gross_pnl ?? (t.pnl + fees);
    const tagsString = (t.tags || []).join('; ');
    const escapedNarrative = (t.narrative || '').replace(/"/g, '""');

    return [
      t.date,
      t.symbol,
      t.side,
      t.qty,
      t.entryPrice,
      t.exitPrice,
      gross.toFixed(2),
      fees.toFixed(2),
      t.pnl.toFixed(2),
      `"${tagsString.replace(/"/g, '""')}"`,
      t.setupType,
      t.result,
      t.resultGrade,
      t.rr,
      `"${escapedNarrative}"`
    ].join(',');
  });
  
  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(headers + "\n" + rows.join('\n'));
  const link = document.createElement("a");
  const fileNameDate = new Date().toISOString().split('T')[0];
  link.setAttribute("href", csvContent);
  link.setAttribute("download", `trades_${fileNameDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const COLUMN_ALIASES: Record<string, string> = {
  'date': 'date', 'time': 'date', 'trade date': 'date', 'close date': 'date', 'open date': 'date', 'execution time': 'date', 'open time': 'date', 'close time': 'date',
  // Tradovate: use soldTimestamp as the trade date (when position closed)
  'soldtimestamp': 'date', 'boughttimestamp': 'entryTimestamp', 'closedtimestamp': 'date',
  'symbol': 'symbol', 'instrument': 'symbol', 'ticker': 'symbol', 'market': 'symbol', 'contract': 'symbol', 'asset': 'symbol', 'item': 'symbol',
  'side': 'side', 'direction': 'side', 'type': 'side', 'position': 'side', 'action': 'side', 'buy/sell': 'side', 'trans. type': 'side',
  'qty': 'qty', 'quantity': 'qty', 'shares': 'qty', 'size': 'qty', 'contracts': 'qty', 'volume': 'qty', 'units': 'qty',
  'entry price': 'entryPrice', 'entry': 'entryPrice', 'open price': 'entryPrice', 'avg entry': 'entryPrice', 'buy price': 'entryPrice', 'avg. entry price': 'entryPrice', 'trade price': 'entryPrice', 'price': 'entryPrice',
  // Tradovate: buyprice = entry, sellprice = exit
  'buyprice': 'entryPrice', 'sellprice': 'exitPrice',
  'exit price': 'exitPrice', 'exit': 'exitPrice', 'close price': 'exitPrice', 'avg exit': 'exitPrice', 'sell price': 'exitPrice', 'avg. exit price': 'exitPrice', 'closeprice': 'exitPrice',
  'net p&l': 'pnl', 'pnl': 'pnl', 'p&l': 'pnl', 'profit/loss': 'pnl', 'net profit': 'pnl', 'realized p&l': 'pnl', 'net p/l': 'pnl', 'amount': 'pnl', 'gain/loss': 'pnl', 'profit': 'pnl', 'realized p/l': 'pnl',
  'setup type': 'setupType', 'setup': 'setupType', 'strategy': 'setupType',
  'grade': 'resultGrade', 'rating': 'resultGrade', 'score': 'resultGrade',
  'notes': 'narrative', 'narrative': 'narrative', 'comments': 'narrative', 'description': 'narrative',
  'tags': 'tags', 'label': 'tags', 'labels': 'tags',
  'rr': 'rr', 'r:r': 'rr', 'risk/reward': 'rr', 'r multiple': 'rr',
  'fees': 'total_fees', 'commission': 'total_fees', 'fee': 'total_fees', 'commissions': 'total_fees', 'swap': 'total_fees', 'taxes': 'total_fees',
  'asset type': 'assetType', 'asset class': 'assetType', 'security type': 'assetType',
  // Tradovate metadata columns (parsed but not mapped to trade fields — just ignored gracefully)
  '_priceformat': '_ignore', '_priceformattype': '_ignore', '_ticksize': '_ignore',
  'buyfileid': '_ignore', 'sellfileid': '_ignore',
  // Tradovate duration field
  'duration': 'duration',
};

const normalizeSide = (val: string): 'LONG' | 'SHORT' => {
  const v = (val || '').toUpperCase().trim();
  if (['BUY', 'LONG', 'BOT', 'B', 'BOUGHT', 'BUY TO OPEN', 'BUY TO CLOSE', 'ENTRY LONG'].includes(v)) return 'LONG';
  if (['SELL', 'SHORT', 'SLD', 'S', 'SOLD', 'SELL TO OPEN', 'SELL TO CLOSE', 'ENTRY SHORT'].includes(v)) return 'SHORT';
  return 'LONG';
};

const normalizeAssetType = (val: string): AssetType => {
  const v = (val || '').toUpperCase().trim();
  if (v.includes('FOREX') || v.includes('CURRENCY') || v.includes('FX')) return 'FOREX';
  if (v.includes('FUTURE') || v.includes('FUT')) return 'FUTURES';
  return 'STOCKS';
};

export const parseCSV = (csvText: string, accountId: string = ''): Trade[] => {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const rawHeaders = lines[0].split(',').map(h =>
    h.trim().toLowerCase().replace(/^["'\uFEFF]+|["']+$/g, '')
  );

  const colIndex: Record<string, number> = {};
  rawHeaders.forEach((h, i) => {
    const mapped = COLUMN_ALIASES[h];
    if (mapped && !(mapped in colIndex)) {
      colIndex[mapped] = i;
    }
  });

  const required = ['date', 'symbol', 'pnl'];
  const missing = required.filter(r => !(r in colIndex));
  if (missing.length > 0) {
    throw new Error(
      `Could not find required columns: ${missing.join(', ')}.\n` +
      `Found headers: ${rawHeaders.slice(0, 8).join(', ')}...\n` +
      `Your CSV needs at least: Date, Symbol, and P&L (or Net P&L) columns.`
    );
  }

  const getCell = (row: string[], field: string, fallback = ''): string => {
    const idx = colIndex[field];
    if (idx === undefined || idx >= row.length) return fallback;
    return (row[idx] || fallback).trim().replace(/^["']|["']$/g, '');
  };

  const parseNum = (val: string): number => {
    if (!val) return 0;
    let cleaned = val.trim();
    // Tradovate format: $(16.50) = negative, $16.50 = positive
    if (cleaned.startsWith('$(') && cleaned.endsWith(')')) {
      cleaned = '-' + cleaned.slice(2, -1);
    }
    // Standard accounting parens: (100.00) -> -100.00
    else if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      cleaned = '-' + cleaned.slice(1, -1);
    }
    cleaned = cleaned.replace(/[$,\s]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  };

  // Normalize any date string to YYYY-MM-DD
  // Handles: MM/DD/YYYY HH:MM:SS (Tradovate), YYYY-MM-DD, DD.MM.YYYY, YYYY.MM.DD, etc.
  const normalizeDate = (rawDate: string): string => {
    if (!rawDate) return new Date().toISOString().split('T')[0];
    try {
      // Strip time component first for parsing
      const dateOnly = rawDate.split(' ')[0];
      if (dateOnly.includes('/')) {
        const parts = dateOnly.split('/');
        if (parts.length === 3) {
          // MM/DD/YYYY (Tradovate, US brokers)
          if (parts[2].length === 4) {
            return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
          }
          // DD/MM/YYYY
          if (parts[0].length <= 2 && parseInt(parts[0]) > 12) {
            return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
          }
          // YYYY/MM/DD
          if (parts[0].length === 4) {
            return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
          }
          // Default assume MM/DD/YYYY
          return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
        }
      }
      if (dateOnly.includes('.')) {
        const parts = dateOnly.split('.');
        if (parts.length === 3) {
          if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
          return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        }
      }
      // Already YYYY-MM-DD or parseable by Date
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch { /* fall through */ }
    return rawDate;
  };

  // Extract HH:MM time from a full timestamp string like "03/02/2026 09:23:58"
  const extractTime = (timestamp: string): string => {
    if (!timestamp) return '09:30';
    const parts = timestamp.trim().split(' ');
    if (parts.length >= 2) {
      const timePart = parts[1].split(':');
      if (timePart.length >= 2) return `${timePart[0]}:${timePart[1]}`;
    }
    return '09:30';
  };

  const trades: Trade[] = [];
  for (let i = 1; i < lines.length; i++) {
    // Handle quoted CSV fields properly
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === ',' && !inQuotes) { row.push(current); current = ''; }
      else { current += char; }
    }
    row.push(current);
    if (row.length < 3) continue;

    const symbol = getCell(row, 'symbol', '').toUpperCase();
    if (!symbol || symbol.includes('BALANCE') || symbol.includes('DEPOSIT')) continue;

    const pnlRaw = parseNum(getCell(row, 'pnl', '0'));
    if (pnlRaw === 0 && symbol === '') continue;

    // ── Price / quantity fields ─────────────────────────────────────────
    const entryPrice = parseNum(getCell(row, 'entryPrice', '0'));
    const exitPrice  = parseNum(getCell(row, 'exitPrice',  '0'));
    const qty        = parseNum(getCell(row, 'qty', '1')) || 1;
    const rr         = parseNum(getCell(row, 'rr',  '0'));
    const fees       = parseNum(getCell(row, 'total_fees', '0'));

    // ── Asset type — auto-detect Tradovate futures symbols (e.g. MNQH6, ESZ5) ──
    const rawAssetType = getCell(row, 'assetType', '');
    let assetType = normalizeAssetType(rawAssetType);
    if (!rawAssetType) {
      if (/^[A-Z]{1,6}[FGHJKMNQUVXZ]\d{1,2}$/.test(symbol)) assetType = 'FUTURES';
    }

    // ── Side detection ────────────────────────────────────────────────
    // Tradovate has no side column. Infer: if buyPrice < sellPrice → LONG (bought low, sold high)
    const sideRaw = getCell(row, 'side', '');
    let side: 'LONG' | 'SHORT';
    if (sideRaw) {
      side = normalizeSide(sideRaw);
    } else if (entryPrice > 0 && exitPrice > 0) {
      side = entryPrice <= exitPrice ? 'LONG' : 'SHORT';
    } else {
      side = 'LONG';
    }

    // ── Date / time extraction ─────────────────────────────────────────
    // Tradovate: soldTimestamp (close) → date field; boughtTimestamp (open) → entryTimestamp
    const closedRaw = getCell(row, 'date', '');
    const openedRaw = getCell(row, 'entryTimestamp', '');
    const normalizedDate = normalizeDate(closedRaw || openedRaw);
    const entryTime = extractTime(openedRaw || closedRaw);
    const exitTime  = extractTime(closedRaw);

    // Tradovate "duration" column (e.g. "5min 4sec")
    const durationRaw = getCell(row, 'duration', '0m');

    const result: Result = pnlRaw > 0 ? 'WIN' : pnlRaw < 0 ? 'LOSS' : 'BE';

    trades.push({
      id: crypto.randomUUID(),
      accountId,
      timestamp: new Date().toISOString(),
      date: normalizedDate,
      symbol,
      side,
      assetType,
      qty,
      multiplier: 1,
      entryPrice,
      exitPrice,
      stopLossPrice: 0,
      targetPrice: 0,
      entryTime,
      exitTime,
      duration: durationRaw,
      pnl: pnlRaw,
      rr,
      result,
      resultGrade: (getCell(row, 'resultGrade', 'B') as Grade) || 'B',
      setupType: getCell(row, 'setupType', 'A') || 'A',
      weeklyBias: 'SIDEWAYS',
      narrative: getCell(row, 'narrative', ''),
      chartLink: '',
      tags: getCell(row, 'tags') ? getCell(row, 'tags').split(';').map((t: string) => t.trim()).filter(Boolean) : [],
      total_fees: fees,
      gross_pnl: pnlRaw + fees,
      net_pnl: pnlRaw,
      executions: [],
      mistakes: [],
      psychology: { moodBefore: 3, moodAfter: 3, states: [], notes: '' },
      followedPlan: true,
      plan: '',
    });
  }
  return trades;
};
