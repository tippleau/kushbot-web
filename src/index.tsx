import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import BonusBuy from './BonusBuy';
import Summit from './Summit';
import MonthlyPromoPlan from './MonthlyPromoPlan';
import RangeRefresh from './RangeRefresh';
import StockInvoiceUpload from './StockInvoiceUpload';
import StorePerformance from './StorePerformance';
import ErrorBoundary from './ErrorBoundary';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/bonus-buy" element={<BonusBuy />} />
          <Route path="/summit" element={<Summit />} />
          <Route path="/monthly-promo-plan" element={<MonthlyPromoPlan />} />
          <Route path="/range-refresh" element={<RangeRefresh />} />
          <Route path="/stock-invoice-upload" element={<StockInvoiceUpload />} />
          <Route path="/store-performance" element={<StorePerformance />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
