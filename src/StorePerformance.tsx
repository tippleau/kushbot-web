import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import { useNavigate } from 'react-router-dom';

type StoreRow = {
  store_code: string;
  store_id: number;
  name: string;
  state: string;
  orders_current_month: number;
  orders_past_month: number;
  cancelled_current_month: number;
  cancelled_last_month: number;
  units_current_month: number;
  units_last_month: number;
  subbed_units_current_month: number;
  subbed_units_last_month: number;
};

const STORES_API_URL = 'https://5jy6w3zatafifkvkoy64b66ntm0vlirq.lambda-url.ap-southeast-2.on.aws/';
const STORES_CACHE_KEY = 'store_performance_cache_v2';
const STORES_CACHE_TTL_MS = 30 * 60 * 1000;

function StorePerformance() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('All');
  const [sortKey, setSortKey] = useState<
    | 'store_code'
    | 'orders_total'
    | 'orders_trend'
    | 'found_rate_total'
    | 'found_rate_trend'
    | 'cancelled_total'
    | 'cancelled_trend'
    | null
  >(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 50;

  const formatTrend = (current: number, previous: number, invertGoodness = false) => {
    if (previous === 0) {
      if (current === 0) {
        return { label: '0%', direction: 'flat' as const, isGood: true, isNew: false, trendPct: 0 };
      }
      return {
        label: 'New',
        direction: 'up' as const,
        isGood: !invertGoodness,
        isNew: true,
        trendPct: Number.POSITIVE_INFINITY
      };
    }
    const diff = ((current - previous) / previous) * 100;
    const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const isGood = invertGoodness ? diff < 0 : diff > 0;
    return { label: `${Math.abs(diff).toFixed(1)}%`, direction, isGood, isNew: false, trendPct: diff };
  };

  const getTrendDecimal = (current: number, previous: number, invertGoodness = false) => {
    if (previous === 0) {
      return current === 0 ? 0 : 'NEW';
    }
    const raw = (current - previous) / previous;
    const value = invertGoodness ? -raw : raw;
    return Number(value.toFixed(4));
  };

  const getFoundRate = (unitsCurrent: number, subbedUnitsCurrent: number) => {
    if (!Number.isFinite(unitsCurrent) || unitsCurrent <= 0) return 0;
    if (!Number.isFinite(subbedUnitsCurrent)) return 0;
    return (unitsCurrent - subbedUnitsCurrent) / unitsCurrent;
  };

  const getFoundRateTrend = (currentRate: number, previousRate: number) => {
    if (previousRate === 0) {
      if (currentRate === 0) {
        return { label: '0%', direction: 'flat' as const, isGood: true, isNew: false };
      }
      return { label: 'New', direction: 'up' as const, isGood: true, isNew: true };
    }
    const diff = ((currentRate - previousRate) / previousRate) * 100;
    const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    return { label: `${Math.abs(diff).toFixed(1)}%`, direction, isGood: diff > 0, isNew: false };
  };

  const getFoundRateTrendDecimal = (currentRate: number, previousRate: number) => {
    if (previousRate === 0) {
      return currentRate === 0 ? 0 : 'NEW';
    }
    const value = (currentRate - previousRate) / previousRate;
    return Number(value.toFixed(4));
  };

  const handleDownloadCsv = () => {
    const header = [
      'store_code',
      'store_id',
      'name',
      'state',
      'orders_current_month',
      'orders_past_month',
      'orders_trend_decimal',
      'cancelled_current_month',
      'cancelled_last_month',
      'cancelled_trend_decimal',
      'found_rate_current_month',
      'found_rate_last_month',
      'found_rate_trend'
    ];

    const rows = sortedStores.map((store) => [
      store.store_code,
      store.store_id,
      store.name,
      store.state,
      store.orders_current_month,
      store.orders_past_month,
      getTrendDecimal(store.orders_current_month, store.orders_past_month),
      store.cancelled_current_month,
      store.cancelled_last_month,
      getTrendDecimal(store.cancelled_current_month, store.cancelled_last_month, true),
      Number(getFoundRate(store.units_current_month, store.subbed_units_current_month).toFixed(4)),
      Number(getFoundRate(store.units_last_month, store.subbed_units_last_month).toFixed(4)),
      getFoundRateTrendDecimal(
        getFoundRate(store.units_current_month, store.subbed_units_current_month),
        getFoundRate(store.units_last_month, store.subbed_units_last_month)
      )
    ]);

    const escapeCell = (value: string | number) => {
      const str = String(value ?? '');
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
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
    link.download = `store-performance-${stateSuffix}-${timestamp}-${unixTime}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const fetchStores = async () => {
      try {
        setLoading(true);
        setError('');

        const cachedRaw = localStorage.getItem(STORES_CACHE_KEY);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw) as { fetchedAt: number; data: StoreRow[] };
            if (cached?.fetchedAt && Array.isArray(cached?.data)) {
              const isFresh = Date.now() - cached.fetchedAt < STORES_CACHE_TTL_MS;
              if (isFresh) {
                setStores(cached.data);
                setLoading(false);
                return;
              }
            }
          } catch {
            // ignore cache parse errors
          }
        }

        const response = await fetch(STORES_API_URL, {
          method: 'GET'
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `Request failed with status ${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error('Unexpected response format');
        }

        const cleaned = data
          .filter((row: any) => row?.store_code && row?.store_id && row?.name)
          .map((row: any) => ({
            store_code: String(row.store_code),
            store_id: Number(row.store_id),
            name: String(row.name),
            state: row?.state ? String(row.state) : '',
            orders_current_month: Number(row?.orders_current_month ?? 0),
            orders_past_month: Number(row?.orders_past_month ?? 0),
            cancelled_current_month: Number(row?.cancelled_current_month ?? 0),
            cancelled_last_month: Number(row?.cancelled_last_month ?? 0),
            units_current_month: Number(row?.units_current_month ?? 0),
            units_last_month: Number(row?.units_last_month ?? 0),
            subbed_units_current_month: Number(row?.subbed_units_current_month ?? 0),
            subbed_units_last_month: Number(row?.subbed_units_last_month ?? 0)
          }));

        setStores(cleaned);
        localStorage.setItem(
          STORES_CACHE_KEY,
          JSON.stringify({ fetchedAt: Date.now(), data: cleaned })
        );
      } catch (err: any) {
        setError(err?.message || 'Failed to load stores');
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedState, sortKey, sortDirection]);

  const filteredStores = useMemo(
    () => stores.filter((store) => selectedState === 'All' || store.state === selectedState),
    [stores, selectedState]
  );

  const sortedStores = useMemo(() => {
    const sorted = [...filteredStores].sort((a, b) => {
      if (!sortKey) return 0;
      const aOrdersTrend = formatTrend(a.orders_current_month, a.orders_past_month).trendPct;
      const bOrdersTrend = formatTrend(b.orders_current_month, b.orders_past_month).trendPct;
      const aCancelledTrend = formatTrend(a.cancelled_current_month, a.cancelled_last_month, true).trendPct;
      const bCancelledTrend = formatTrend(b.cancelled_current_month, b.cancelled_last_month, true).trendPct;
      const aFoundRate = getFoundRate(a.units_current_month, a.subbed_units_current_month);
      const bFoundRate = getFoundRate(b.units_current_month, b.subbed_units_current_month);
      const aFoundRateLast = getFoundRate(a.units_last_month, a.subbed_units_last_month);
      const bFoundRateLast = getFoundRate(b.units_last_month, b.subbed_units_last_month);
      const aFoundRateTrend = getFoundRateTrendDecimal(aFoundRate, aFoundRateLast);
      const bFoundRateTrend = getFoundRateTrendDecimal(bFoundRate, bFoundRateLast);
      if (sortKey === 'store_code') {
        const aCode = Number(a.store_code);
        const bCode = Number(b.store_code);
        const aIsNum = !Number.isNaN(aCode);
        const bIsNum = !Number.isNaN(bCode);
        if (aIsNum && bIsNum) {
          return sortDirection === 'asc' ? aCode - bCode : bCode - aCode;
        }
        return sortDirection === 'asc'
          ? a.store_code.localeCompare(b.store_code)
          : b.store_code.localeCompare(a.store_code);
      }
      const aVal =
        sortKey === 'orders_total'
          ? a.orders_current_month
          : sortKey === 'orders_trend'
          ? aOrdersTrend
          : sortKey === 'found_rate_total'
          ? aFoundRate
          : sortKey === 'found_rate_trend'
          ? (aFoundRateTrend === 'NEW' ? Number.POSITIVE_INFINITY : aFoundRateTrend)
          : sortKey === 'cancelled_total'
          ? a.cancelled_current_month
          : aCancelledTrend;
      const bVal =
        sortKey === 'orders_total'
          ? b.orders_current_month
          : sortKey === 'orders_trend'
          ? bOrdersTrend
          : sortKey === 'found_rate_total'
          ? bFoundRate
          : sortKey === 'found_rate_trend'
          ? (bFoundRateTrend === 'NEW' ? Number.POSITIVE_INFINITY : bFoundRateTrend)
          : sortKey === 'cancelled_total'
          ? b.cancelled_current_month
          : bCancelledTrend;
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [filteredStores, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedStores.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageItems = sortedStores.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
                  <div className="store-loading-cell short"></div>
                  <div className="store-loading-cell long"></div>
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

        {!loading && !error && (
          <div className="store-table-wrapper">
            <div className="store-table-header">
              <span>
                {filteredStores.length} stores
              </span>
              <div className="store-table-actions">
                <button type="button" className="download-button" onClick={handleDownloadCsv}>
                  <span className="download-icon" aria-hidden="true">⬇︎</span>
                  Download CSV
                </button>
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
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="store-table-scroll">
              <table className="store-table">
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        className={`sortable-header ${sortKey === 'store_code' ? 'active' : ''}`}
                        onClick={() => {
                          if (sortKey === 'store_code') {
                            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortKey('store_code');
                            setSortDirection('asc');
                          }
                        }}
                      >
                        Store Code
                        <span className="sort-indicator">
                          {sortKey === 'store_code' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    </th>
                    <th>Store Name</th>
                    <th>
                      <button
                        type="button"
                        className={`sortable-header ${sortKey === 'orders_total' ? 'active' : ''}`}
                        onClick={() => {
                          if (sortKey === 'orders_total') {
                            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortKey('orders_total');
                            setSortDirection('desc');
                          }
                        }}
                      >
                        <span className="header-text">
                          <span className="header-title">Orders</span>
                          <span className="header-subtitle">This Month</span>
                        </span>
                        <span className="sort-indicator">
                          {sortKey === 'orders_total' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`sortable-header ${sortKey === 'orders_trend' ? 'active' : ''}`}
                        onClick={() => {
                          if (sortKey === 'orders_trend') {
                            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortKey('orders_trend');
                            setSortDirection('desc');
                          }
                        }}
                      >
                        Orders Trend
                        <span className="sort-indicator">
                          {sortKey === 'orders_trend' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`sortable-header ${sortKey === 'cancelled_total' ? 'active' : ''}`}
                        onClick={() => {
                          if (sortKey === 'cancelled_total') {
                            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortKey('cancelled_total');
                            setSortDirection('desc');
                          }
                        }}
                      >
                        <span className="header-text">
                          <span className="header-title">Cancelled</span>
                          <span className="header-subtitle">This Month</span>
                        </span>
                        <span className="sort-indicator">
                          {sortKey === 'cancelled_total' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`sortable-header ${sortKey === 'cancelled_trend' ? 'active' : ''}`}
                        onClick={() => {
                          if (sortKey === 'cancelled_trend') {
                            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortKey('cancelled_trend');
                            setSortDirection('desc');
                          }
                        }}
                      >
                        Cancelled Trend
                        <span className="sort-indicator">
                          {sortKey === 'cancelled_trend' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    </th>
                    <th className="found-rate-cell">
                      <button
                        type="button"
                        className={`sortable-header ${sortKey === 'found_rate_total' ? 'active' : ''}`}
                        onClick={() => {
                          if (sortKey === 'found_rate_total') {
                            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortKey('found_rate_total');
                            setSortDirection('desc');
                          }
                        }}
                      >
                        <span className="header-text">
                          <span className="header-title">Found Rate</span>
                          <span className="header-subtitle">This Month</span>
                        </span>
                        <span className="sort-indicator">
                          {sortKey === 'found_rate_total' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`sortable-header ${sortKey === 'found_rate_trend' ? 'active' : ''}`}
                        onClick={() => {
                          if (sortKey === 'found_rate_trend') {
                            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortKey('found_rate_trend');
                            setSortDirection('desc');
                          }
                        }}
                      >
                        Found Rate Trend
                        <span className="sort-indicator">
                          {sortKey === 'found_rate_trend' ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((store) => (
                    (() => {
                    const ordersTrend = formatTrend(
                      store.orders_current_month,
                      store.orders_past_month
                    );
                      const cancelledTrend = formatTrend(
                        store.cancelled_current_month,
                        store.cancelled_last_month,
                        true
                      );
                      return (
                    <tr key={`${store.store_code}-${store.store_id}`}>
                      <td>{store.store_code}</td>
                    <td>{store.name}</td>
                    <td className="store-table-number">
                      <div className="metric-cell">
                        <span className="metric-value">{store.orders_current_month}</span>
                      </div>
                    </td>
                    <td className="store-table-trend">
                      <div className="metric-cell">
                        <span className={`trend-chip ${ordersTrend.direction} ${ordersTrend.isNew ? 'new' : ordersTrend.isGood ? 'good' : 'bad'}`}>
                          <span className="trend-icon">
                            {ordersTrend.direction === 'up' ? '▲' : ordersTrend.direction === 'down' ? '▼' : '•'}
                          </span>
                          {ordersTrend.label}
                        </span>
                        <span className="trend-subtext">Last month: {store.orders_past_month}</span>
                      </div>
                    </td>
                    <td className="store-table-number">
                      <div className="metric-cell">
                        <span className="metric-value">{store.cancelled_current_month}</span>
                      </div>
                    </td>
                    <td className="store-table-trend">
                      <div className="metric-cell">
                        <span className={`trend-chip ${cancelledTrend.direction} ${cancelledTrend.isNew ? 'new' : cancelledTrend.isGood ? 'good' : 'bad'}`}>
                          <span className="trend-icon">
                            {cancelledTrend.direction === 'up' ? '▲' : cancelledTrend.direction === 'down' ? '▼' : '•'}
                          </span>
                          {cancelledTrend.label}
                        </span>
                        <span className="trend-subtext">Last month: {store.cancelled_last_month}</span>
                      </div>
                    </td>
                    <td className="store-table-number found-rate-cell">
                      <div className="metric-cell">
                        <span className="metric-value">
                          {(getFoundRate(store.units_current_month, store.subbed_units_current_month) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="store-table-trend">
                      <div className="metric-cell">
                        {(() => {
                          const currentRate = getFoundRate(
                            store.units_current_month,
                            store.subbed_units_current_month
                          );
                          const lastRate = getFoundRate(
                            store.units_last_month,
                            store.subbed_units_last_month
                          );
                          const foundTrend = getFoundRateTrend(currentRate, lastRate);
                          return (
                            <>
                              <span className={`trend-chip ${foundTrend.direction} ${foundTrend.isNew ? 'new' : foundTrend.isGood ? 'good' : 'bad'}`}>
                                <span className="trend-icon">
                                  {foundTrend.direction === 'up' ? '▲' : foundTrend.direction === 'down' ? '▼' : '•'}
                                </span>
                                {foundTrend.label}
                              </span>
                              <span className="trend-subtext">Last month: {(lastRate * 100).toFixed(1)}%</span>
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    </tr>
                      );
                    })()
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-pagination">
              <span className="pagination-info">
                Showing {filteredStores.length === 0 ? 0 : pageStart + 1}-{Math.min(filteredStores.length, pageStart + PAGE_SIZE)} of {filteredStores.length}
              </span>
              <div className="pagination-controls">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={safePage === 1}
                >
                  <span aria-hidden="true">«</span>
                  <span className="sr-only">First</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                >
                  <span aria-hidden="true">‹</span>
                  <span className="sr-only">Previous</span>
                </button>
                <span className="pagination-page">Page {safePage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                >
                  <span aria-hidden="true">›</span>
                  <span className="sr-only">Next</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safePage === totalPages}
                >
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
