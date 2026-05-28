import React from 'react';
import './App.css';
import { useNavigate } from 'react-router-dom';

function ProductEnrichment() {
  const navigate = useNavigate();

  return (
    <div className="App">
      <div className="background-images-wrapper">
        <div className="background-image left" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/7eleven_svg.svg)` }}></div>
        <div className="background-image right" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/tipple_svg.svg)` }}></div>
      </div>
      <main className="content">
        <button onClick={() => navigate('/')} className="back-button">← Home</button>
        <h1>Product Enrichment</h1>
        <p>Download the latest enriched product catalogues.</p>
        <div className="enrichment-cards">
          <div className="enrichment-card">
            <div className="enrichment-card-icon">🤖</div>
            <div className="enrichment-card-body">
              <p className="enrichment-card-title">
                AI Enriched Catalogue
                <span className="enrichment-card-badge badge-xlsx">XLSX</span>
              </p>
              <p className="enrichment-card-desc">Latest AI-enriched product catalogue with additional product enhancement data</p>
            </div>
            <a
              href="https://content.tipple.com.au/tipple/ai-catalogue-enrichment/master/ai_enriched_catalogue_publish_latest.xlsx"
              download
              className="enrichment-download-btn"
            >
              ⬇︎ Download
            </a>
          </div>
          <div className="enrichment-card">
            <div className="enrichment-card-icon">🏷️</div>
            <div className="enrichment-card-body">
              <p className="enrichment-card-title">
                Brand Catalogue
                <span className="enrichment-card-badge">CSV</span>
              </p>
              <p className="enrichment-card-desc">Latest AI-defined brand data across the product catalogue</p>
            </div>
            <a
              href="https://content.tipple.com.au/tipple/ai-catalogue-enrichment/master/ai_brand_catalogue_latest.csv"
              download
              className="enrichment-download-btn"
            >
              ⬇︎ Download
            </a>
          </div>
          <div className="enrichment-card">
            <div className="enrichment-card-icon">📐</div>
            <div className="enrichment-card-body">
              <p className="enrichment-card-title">
                Master File with Size Data
                <span className="enrichment-card-badge">CSV</span>
              </p>
              <p className="enrichment-card-desc">Full product catalogue including size and unit of measurement attributes</p>
            </div>
            <a
              href="https://content.tipple.com.au/tipple/ai-catalogue-enrichment/master/tipz_master_file_with_size.csv"
              download
              className="enrichment-download-btn"
            >
              ⬇︎ Download
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ProductEnrichment;
