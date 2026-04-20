import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import { useNavigate } from 'react-router-dom';

type TrendData = {
  text: string;
  direction: 'UP' | 'DOWN' | 'NO_CHANGE';
  sentiment: 'GOOD' | 'BAD' | 'NEUTRAL';
};

type StoreRow = {
  store_code: string;
  store_id: number;
  name: string;
  state: string;
  total_orders: string;
  avg_packing_time: string;
  cancelled_orders: string;
  found_rate: string;
  substituted_orders: string;
  removal_rate: string;
  total_orders_trend: TrendData;
  avg_packing_time_trend: TrendData;
  cancelled_orders_trend: TrendData;
  found_rate_trend: TrendData;
  substituted_orders_trend: TrendData;
  removal_rate_trend: TrendData;
};

type WindowOption = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_7DAY';

type SortKey =
  | 'store_code'
  | 'total_orders'
  | 'avg_packing_time'
  | 'cancelled_orders'
  | 'found_rate'
  | 'substituted_orders'
  | 'removal_rate'
  | null;

const TIPPLE_API_BASE = process.env.REACT_APP_TIPPLE_API_BASE_URL || 'https://tipple.com.au';
const PERF_API_TOKEN = process.env.REACT_APP_STORE_PERFORMANCE_TOKEN || '';
const STORES_API_URL = 'https://5jy6w3zatafifkvkoy64b66ntm0vlirq.lambda-url.ap-southeast-2.on.aws/';
const CACHE_KEY_PREFIX = 'store_performance_cache_v3';
const STORES_CACHE_TTL_MS = 30 * 60 * 1000;

const STATE_STORE_IDS: { state: string; id: number }[] = [
  { state: 'VIC', id: 167 },
  { state: 'NSW', id: 814 },
  { state: 'QLD', id: 815 },
  { state: 'WA', id: 816 },
];

const WINDOW_LABELS: Record<WindowOption, string> = {
  THIS_MONTH: 'This Month',
  LAST_MONTH: 'Last Month',
  LAST_7DAY: 'Last 7 Days',
};

function parseMetrics(metrics: any[]): Omit<StoreRow, 'store_code' | 'store_id' | 'name' | 'state'> {
  const find = (title: string) => metrics?.find((m: any) => m.title === title);
  const mkTrend = (m: any): TrendData => ({
    text: m?.trend?.text ?? '',
    direction: (m?.trend?.direction ?? 'NO_CHANGE') as TrendData['direction'],
    sentiment: (m?.trend?.sentiment ?? 'NEUTRAL') as TrendData['sentiment'],
  });

  const totalOrders = find('Total Orders');
  const avgPackingTime = find('Average Packing Time');
  const cancelledOrders = find('Cancelled Orders');
  const foundRate = find('Found Rate');
  const substitutedOrders = find('Substituted Orders');
  const removalRate = find('Removal Rate');

  return {
    total_orders: totalOrders?.value ?? '-',
    avg_packing_time: avgPackingTime?.value ?? '-',
    cancelled_orders: cancelledOrders?.value ?? '-',
    found_rate: foundRate?.value ?? '-',
    substituted_orders: substitutedOrders?.value ?? '-',
    removal_rate: removalRate?.value ?? '-',
    total_orders_trend: mkTrend(totalOrders),
    avg_packing_time_trend: mkTrend(avgPackingTime),
    cancelled_orders_trend: mkTrend(cancelledOrders),
    found_rate_trend: mkTrend(foundRate),
    substituted_orders_trend: mkTrend(substitutedOrders),
    removal_rate_trend: mkTrend(removalRate),
  };
}

function toSortableNumber(value: string): number {
  if (!value || value === '-') return -1;
  const num = parseFloat(value.replace('%', '').trim());
  return Number.isNaN(num) ? -1 : num;
}

function extractTrendLabel(text: string): string {
  if (!text) return '–';
  const pctMatch = text.match(/^(\d+\.?\d*%)/);
  if (pctMatch) return pctMatch[1];
  const ptsMatch = text.match(/^(\d+\.?\d*)\s+points/);
  if (ptsMatch) return `${ptsMatch[1]} pts`;
  return '–';
}

function StorePerformance() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [failedStates, setFailedStates] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState<string>('All');
  const [selectedWindow, setSelectedWindow] = useState<WindowOption>('THIS_MONTH');
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    const fetchStores = async () => {
      try {
        setLoading(true);
        setError('');

        const cacheKey = `${CACHE_KEY_PREFIX}_${selectedWindow}`;
        const cachedRaw = localStorage.getItem(cacheKey);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw) as { fetchedAt: number; data: StoreRow[] };
            if (cached?.fetchedAt && Array.isArray(cached?.data)) {
              if (Date.now() - cached.fetchedAt < STORES_CACHE_TTL_MS) {
                setStores(cached.data);
                setLoading(false);
                return;
              }
            }
          } catch {
            // ignore cache parse errors
          }
        }

        // Fetch performance data for all states in parallel — partial failures are tolerated
        const perfResults = await Promise.allSettled(
          STATE_STORE_IDS.map(({ state, id }) =>
            fetch(
              `${TIPPLE_API_BASE}/api/partner/webhook/store-performance?primaryStoreId=${id}&window=${selectedWindow}`,
              { method: 'GET', headers: { Authorization: `Bearer ${PERF_API_TOKEN}` } }
            )
              .then((r) => {
                if (!r.ok) throw new Error(`Performance API error for ${state}: ${r.status}`);
                return r.json();
              })
              .then((json) => ({ state, stores: (json?.data ?? []) as any[] }))
          )
        );

        const perfResponses = perfResults
          .filter((r): r is PromiseFulfilledResult<{ state: string; stores: any[] }> => r.status === 'fulfilled')
          .map((r) => r.value);

        const failedStates = perfResults
          .map((r, i) => ({ r, state: STATE_STORE_IDS[i].state }))
          .filter(({ r }) => r.status === 'rejected')
          .map(({ r, state }) => `${state}: ${(r as PromiseRejectedResult).reason?.message ?? 'unknown error'}`);

        setFailedStates(failedStates);
        if (failedStates.length > 0) {
          console.warn('Failed to load data for some states:', failedStates);
        }

        // Fetch old store list for store_code mapping by name
        const storeCodeMap = new Map<string, { store_code: string; store_id: number }>();
        try {
          const storeListResp = await fetch(STORES_API_URL);
          if (storeListResp.ok) {
            const storeList = await storeListResp.json();
            if (Array.isArray(storeList)) {
              for (const s of storeList) {
                if (s?.name) {
                  storeCodeMap.set(String(s.name).toLowerCase(), {
                    store_code: String(s.store_code ?? '-'),
                    store_id: Number(s.store_id ?? 0),
                  });
                }
              }
            }
          }
        } catch {
          // store codes will show as '-' if this fails
        }

        const merged: StoreRow[] = perfResponses.flatMap(({ state, stores: perfStores }) =>
          perfStores.map((perf: any) => {
            const match = storeCodeMap.get(String(perf.storeName ?? '').toLowerCase());
            return {
              store_code: match?.store_code ?? '-',
              store_id: match?.store_id ?? 0,
              name: String(perf.storeName ?? ''),
              state,
              ...parseMetrics(perf.metrics ?? []),
            };
          })
        );

        setStores(merged);
        localStorage.setItem(cacheKey, JSON.stringify({ fetchedAt: Date.now(), data: merged }));
      } catch (err: any) {
        setError(err?.message || 'Failed to load stores');
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, [selectedWindow]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedState, selectedWindow, sortKey, sortDirection]);

  const filteredStores = useMemo(
    () => stores.filter((store) => selectedState === 'All' || store.state === selectedState),
    [stores, selectedState]
  );

  const sortedStores = useMemo(() => {
    if (!sortKey) return [...filteredStores];
    return [...filteredStores].sort((a, b) => {
      if (sortKey === 'store_code') {
        const aCode = Number(a.store_code);
        const bCode = Number(b.store_code);
        if (!Number.isNaN(aCode) && !Number.isNaN(bCode)) {
          return sortDirection === 'asc' ? aCode - bCode : bCode - aCode;
        }
        return sortDirection === 'asc'
          ? a.store_code.localeCompare(b.store_code)
          : b.store_code.localeCompare(a.store_code);
      }
      const aVal = toSortableNumber(a[sortKey]);
      const bVal = toSortableNumber(b[sortKey]);
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [filteredStores, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedStores.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageItems = sortedStores.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleDownloadCsv = () => {
    const header = [
      'store_code',
      'store_id',
      'name',
      'state',
      'total_orders',
      'total_orders_trend',
      'total_orders_sentiment',
      'avg_packing_time',
      'avg_packing_time_trend',
      'avg_packing_time_sentiment',
      'cancelled_orders',
      'cancelled_orders_trend',
      'cancelled_orders_sentiment',
      'found_rate',
      'found_rate_trend',
      'found_rate_sentiment',
      'substituted_orders',
      'substituted_orders_trend',
      'substituted_orders_sentiment',
      'removal_rate',
      'removal_rate_trend',
      'removal_rate_sentiment',
    ];

    const rows = sortedStores.map((store) => [
      store.store_code,
      store.store_id,
      store.name,
      store.state,
      store.total_orders,
      store.total_orders_trend.text,
      store.total_orders_trend.sentiment,
      store.avg_packing_time,
      store.avg_packing_time_trend.text,
      store.avg_packing_time_trend.sentiment,
      store.cancelled_orders,
      store.cancelled_orders_trend.text,
      store.cancelled_orders_trend.sentiment,
      store.found_rate,
      store.found_rate_trend.text,
      store.found_rate_trend.sentiment,
      store.substituted_orders,
      store.substituted_orders_trend.text,
      store.substituted_orders_trend.sentiment,
      store.removal_rate,
      store.removal_rate_trend.text,
      store.removal_rate_trend.sentiment,
    ]);

    const escapeCell = (value: string | number) => {
      const str = String(value ?? '');
      if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };

    const csvContent = [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    const unixTime = Math.floor(Date.now() / 1000);
    const stateSuffix = selectedState.toLowerCase().replace(/\s+/g, '-');
    link.href = url;
    link.download = `store-performance-${stateSuffix}-${selectedWindow.toLowerCase()}-${timestamp}-${unixTime}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const renderTrendChip = (trend: TrendData) => {
    const dirClass = trend.direction === 'UP' ? 'up' : trend.direction === 'DOWN' ? 'down' : 'flat';
    const sentClass = trend.sentiment === 'GOOD' ? 'good' : trend.sentiment === 'BAD' ? 'bad' : '';
    const icon = trend.direction === 'UP' ? '▲' : trend.direction === 'DOWN' ? '▼' : '•';
    const label = trend.direction === 'NO_CHANGE' ? '–' : extractTrendLabel(trend.text);
    return (
      <span className={`trend-chip ${dirClass} ${sentClass}`.trim()} title={trend.text || undefined}>
        <span className="trend-icon">{icon}</span>
        {label}
      </span>
    );
  };

  const renderMetricCell = (value: string, trend: TrendData) => (
    <td className="store-table-number">
      <div className="metric-cell">
        <span className="metric-value">{value}</span>
        {renderTrendChip(trend)}
      </div>
    </td>
  );

  const renderSortableHeader = (
    label: string,
    sk: SortKey,
    subtitle?: string,
    defaultDir: 'asc' | 'desc' = 'desc'
  ) => (
    <th>
      <button
        type="button"
        className={`sortable-header ${sortKey === sk ? 'active' : ''}`}
        onClick={() => {
          if (sortKey === sk) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          } else {
            setSortKey(sk);
            setSortDirection(defaultDir);
          }
        }}
      >
        {subtitle ? (
          <span className="header-text">
            <span className="header-title">{label}</span>
            <span className="header-subtitle">{subtitle}</span>
          </span>
        ) : (
          label
        )}
        <span className="sort-indicator">
          {sortKey === sk ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );

  return (
    <div className="App">
      <div className="background-images-wrapper">
        <div className="background-image left" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/7eleven_svg.svg)` }}></div>
        <div className="background-image right" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/tipple_svg.svg)` }}></div>
      </div>
      <main className="content store-performance-content">
        <button onClick={() => navigate('/')} className="back-button">← Home</button>
        <h1>Store Performance</h1>
        <p>View performance of all 7-Eleven stores</p>

        {loading && (
          <div className="store-loading">
            <div className="store-loading-header">
              <div>
                <h3>Loading store performance</h3>
                <p>Fetching the latest data, this can take a moment.</p>
              </div>
              <div className="loading-spinner"></div>
            </div>
            <div className="store-loading-table">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div className="store-loading-row" key={`loading-${idx}`}>
                  <div className="store-loading-cell short"></div>
                  <div className="store-loading-cell long"></div>
                  <div className="store-loading-cell num"></div>
                  <div className="store-loading-cell num"></div>
                  <div className="store-loading-cell num"></div>
                  <div className="store-loading-cell num"></div>
                  <div className="store-loading-cell num"></div>
                  <div className="store-loading-cell num"></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="message-box error-box">
            <strong>Error:</strong>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && stores.length === 0 && (
          <div className="message-box error-box">
            <strong>No data available</strong>
            {failedStates.length > 0 ? (
              <p>Failed to load data for: {failedStates.join(' | ')}</p>
            ) : (
              <p>There is no store performance data to display for the selected period.</p>
            )}
          </div>
        )}

        {!loading && !error && stores.length > 0 && (
          <div className="store-table-wrapper">
            <div className="store-table-header">
              <span>{filteredStores.length} stores</span>
              <div className="store-table-actions">
                <button type="button" className="download-button" onClick={handleDownloadCsv}>
                  <span className="download-icon" aria-hidden="true">⬇︎</span>
                  Download CSV
                </button>
                <label className="store-filter">
                  <span>Period</span>
                  <select
                    value={selectedWindow}
                    onChange={(e) => setSelectedWindow(e.target.value as WindowOption)}
                  >
                    {(Object.keys(WINDOW_LABELS) as WindowOption[]).map((w) => (
                      <option key={w} value={w}>{WINDOW_LABELS[w]}</option>
                    ))}
                  </select>
                </label>
                <label className="store-filter">
                  <span>State</span>
                  <select
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                  >
                    <option value="All">All</option>
                    {Array.from(new Set(stores.map((s) => s.state).filter(Boolean)))
                      .sort()
                      .map((state) => (
                        <option key={state} value={state}>{state}</option>
                      ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="store-table-scroll">
              <table className="store-table">
                <thead>
                  <tr>
                    {renderSortableHeader('Store Code', 'store_code', undefined, 'asc')}
                    <th>Store Name</th>
                    {renderSortableHeader('Total Orders', 'total_orders')}
                    {renderSortableHeader('Avg Packing Time', 'avg_packing_time')}
                    {renderSortableHeader('Cancelled Orders', 'cancelled_orders')}
                    {renderSortableHeader('Found Rate', 'found_rate')}
                    {renderSortableHeader('Substituted Orders', 'substituted_orders')}
                    {renderSortableHeader('Removal Rate', 'removal_rate')}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((store) => (
                    <tr key={`${store.store_code}-${store.name}`}>
                      <td>{store.store_code}</td>
                      <td>{store.name}</td>
                      {renderMetricCell(store.total_orders, store.total_orders_trend)}
                      {renderMetricCell(store.avg_packing_time, store.avg_packing_time_trend)}
                      {renderMetricCell(store.cancelled_orders, store.cancelled_orders_trend)}
                      {renderMetricCell(store.found_rate, store.found_rate_trend)}
                      {renderMetricCell(store.substituted_orders, store.substituted_orders_trend)}
                      {renderMetricCell(store.removal_rate, store.removal_rate_trend)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-pagination">
              <span className="pagination-info">
                Showing {filteredStores.length === 0 ? 0 : pageStart + 1}–{Math.min(filteredStores.length, pageStart + PAGE_SIZE)} of {filteredStores.length}
              </span>
              <div className="pagination-controls">
                <button type="button" onClick={() => setCurrentPage(1)} disabled={safePage === 1}>
                  <span aria-hidden="true">«</span>
                  <span className="sr-only">First</span>
                </button>
                <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>
                  <span aria-hidden="true">‹</span>
                  <span className="sr-only">Previous</span>
                </button>
                <span className="pagination-page">Page {safePage} of {totalPages}</span>
                <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
                  <span aria-hidden="true">›</span>
                  <span className="sr-only">Next</span>
                </button>
                <button type="button" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}>
                  <span aria-hidden="true">»</span>
                  <span className="sr-only">Last</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default StorePerformance;
