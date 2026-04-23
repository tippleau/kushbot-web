import React, { useState } from 'react';
import './App.css';
import { useNavigate } from 'react-router-dom';

function RangeRefresh() {
  const navigate = useNavigate();
  const [blueYonderFile, setBlueYonderFile] = useState<File | null>(null);
  const [ecommerceFile, setEcommerceFile] = useState<File | null>(null);
  // const [salesOrderFile, setSalesOrderFile] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [uploading, setUploading] = useState<{
    blueYonder: boolean;
    ecommerce: boolean;
    // salesOrder: boolean;
  }>({ blueYonder: false, ecommerce: false /*, salesOrder: false*/ });
  const [completed, setCompleted] = useState<{
    blueYonder: boolean;
    ecommerce: boolean;
    // salesOrder: boolean;
  }>({ blueYonder: false, ecommerce: false /*, salesOrder: false*/ });
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const [uploadedBytes, setUploadedBytes] = useState<number>(0);
  const [totalBytes, setTotalBytes] = useState<number>(0);
  const [funMessage, setFunMessage] = useState<string>('');
  const blueYonderInputRef = React.useRef<HTMLInputElement>(null);
  const ecommerceInputRef = React.useRef<HTMLInputElement>(null);
  // const salesOrderInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, fileType: 'blueYonder' | 'ecommerce' /*| 'salesOrder'*/) => {
    setError('');
    setSuccess('');

    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const validTypes = ['text/csv', 'application/csv'];
      const validExtensions = ['.csv'];
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

      if (validTypes.includes(file.type) || validExtensions.includes(fileExtension)) {
        if (fileType === 'blueYonder') setBlueYonderFile(file);
        else if (fileType === 'ecommerce') setEcommerceFile(file);
        // else if (fileType === 'salesOrder') setSalesOrderFile(file);
      } else {
        setError('Please upload only CSV files (.csv)');
        event.target.value = '';
      }
    }
  };

  const funMessages = [
    "📦 Packing your data with care...",
    "🚀 Launching files to the cloud...",
    "☁️ Your data is traveling at lightspeed!",
    "🎯 Almost there! Organizing your files...",
    "💪 Working hard on this upload...",
    "🌟 Your patience is appreciated!",
    "🎨 Making your data look pretty...",
    "🔐 Securing your files...",
    "🙋🏽‍♂️ A wave from Kush...",
    "✨ Adding some magic to your data...",
  ];

  const uploadToS3 = async (file: File, fileName: string, fileType: 'blueYonder' | 'ecommerce' /*| 'salesOrder'*/) => {
    try {
      setTotalBytes(file.size);
      setUploadedBytes(0);
      setUploadProgress(0);

      // Rotate fun messages during upload
      const messageInterval = setInterval(() => {
        const randomMessage = funMessages[Math.floor(Math.random() * funMessages.length)];
        setFunMessage(randomMessage);
      }, 3000);

      // Step 1: Get presigned URL from Lambda
      const lambdaResponse = await fetch('https://gt3yxk0ak5.execute-api.ap-southeast-2.amazonaws.com/get-upload-url', {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: fileName
        })
      });

      if (!lambdaResponse.ok) {
        clearInterval(messageInterval);
        const errorText = await lambdaResponse.text();
        throw new Error(`Failed to get upload URL: ${errorText || lambdaResponse.statusText}`);
      }

      const responseData = await lambdaResponse.json();
      const { url } = responseData;

      // Step 2: Upload file to S3 using XMLHttpRequest for progress tracking
      const contentType = file.type || 'text/csv';

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const startTime = Date.now();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            setUploadProgress(percentComplete);
            setUploadedBytes(e.loaded);

            // Calculate upload speed
            const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
            const speed = e.loaded / elapsedTime; // bytes per second
            setUploadSpeed(speed);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Failed to upload file to S3: ${xhr.status} ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.send(file);
      });

      clearInterval(messageInterval);
      setFunMessage('');
      setSuccess((prev) => prev + `${fileName} uploaded successfully!\n`);

      // Mark as completed and clear the specific file
      setCompleted((prev) => ({ ...prev, [fileType]: true }));

      if (fileType === 'blueYonder') {
        setBlueYonderFile(null);
        if (blueYonderInputRef.current) blueYonderInputRef.current.value = '';
      } else if (fileType === 'ecommerce') {
        setEcommerceFile(null);
        if (ecommerceInputRef.current) ecommerceInputRef.current.value = '';
      }
      // else if (fileType === 'salesOrder') {
      //   setSalesOrderFile(null);
      //   if (salesOrderInputRef.current) salesOrderInputRef.current.value = '';
      // }

      setUploading((prev) => ({ ...prev, [fileType]: false }));
      setUploadProgress(0);
      setUploadedBytes(0);
      setTotalBytes(0);
      setUploadSpeed(0);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(`Upload failed for ${fileName}: ${err.message || 'Unknown error occurred'}`);
      setUploading((prev) => ({ ...prev, [fileType]: false }));
      setUploadProgress(0);
      setUploadedBytes(0);
      setTotalBytes(0);
      setUploadSpeed(0);
      setFunMessage('');
    }
  };

  const handleUpload = (file: File, fileName: string, fileType: 'blueYonder' | 'ecommerce' /*| 'salesOrder'*/) => {
    setError('');
    setSuccess('');
    setUploading((prev) => ({ ...prev, [fileType]: true }));
    setFunMessage(funMessages[0]);

    // For CSV files, skip validation and upload directly
    uploadToS3(file, fileName, fileType);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const calculateETA = (): string => {
    if (uploadSpeed === 0 || uploadedBytes === 0) return 'Calculating...';
    const remainingBytes = totalBytes - uploadedBytes;
    const secondsRemaining = remainingBytes / uploadSpeed;

    if (secondsRemaining < 60) {
      return `${Math.ceil(secondsRemaining)}s`;
    } else if (secondsRemaining < 3600) {
      const minutes = Math.ceil(secondsRemaining / 60);
      return `${minutes}m`;
    } else {
      const hours = Math.floor(secondsRemaining / 3600);
      const minutes = Math.ceil((secondsRemaining % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  return (
    <div className="App">
      <div className="background-images-wrapper">
        <div className="background-image left" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/7eleven_svg.svg)` }}></div>
        <div className="background-image right" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/tipple_svg.svg)` }}></div>
      </div>
      <main className="content range-refresh-content">
        <button onClick={() => navigate('/')} className="back-button">← Home</button>
        <h1>Upload Range Refresh Files</h1>
        <p style={{ marginBottom: '0.5rem' }}>Select and upload your CSV files below</p>
        <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0' }}>All files must be in CSV format</p>

        {error && (
          <div className="message-box error-box">
            <strong>Error:</strong>
            <pre>{error}</pre>
          </div>
        )}

        {success && (
          <div className="message-box success-box">
            <strong>Success:</strong>
            <pre>{success}</pre>
          </div>
        )}

        {/* Upload Progress Overlay */}
        {(uploading.blueYonder || uploading.ecommerce /*|| uploading.salesOrder*/) && uploadProgress > 0 && (
          <div className="upload-progress-overlay">
            <div className="upload-progress-container">
              <h2 className="upload-title">Uploading Your Files</h2>

              {/* Animated Characters */}
              <div className="character-animation">
                <span className="character-file">📄</span>
                <div className="dots-container">
                  <span className="dot dot-1"></span>
                  <span className="dot dot-2"></span>
                  <span className="dot dot-3"></span>
                  <span className="dot dot-4"></span>
                  <span className="dot dot-5"></span>
                </div>
                <span className="character-cloud">☁️</span>
              </div>

              {/* Fun Message */}
              {funMessage && <p className="fun-message">{funMessage}</p>}

              {/* Progress Bar */}
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${uploadProgress}%` }}>
                  <span className="progress-text">{Math.round(uploadProgress)}%</span>
                </div>
              </div>

              {/* Upload Stats */}
              <div className="upload-stats">
                <div className="stat-item">
                  <span className="stat-label">Uploaded:</span>
                  <span className="stat-value">{formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Speed:</span>
                  <span className="stat-value">{formatSpeed(uploadSpeed)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">ETA:</span>
                  <span className="stat-value">{calculateETA()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="file-upload-grid">
          {/* Step 1: Blue Yonder File */}
          <div className={`file-card ${completed.blueYonder ? 'completed' : ''}`}>
            <div className="step-number">Step 1</div>
            <div className="file-card-icon">📊</div>
            <h3 className="file-card-title">Blue Yonder File</h3>
            <p className="file-card-description">Upload your Blue Yonder file</p>

            {!completed.blueYonder ? (
              <>
                <input
                  type="file"
                  id="blue-yonder-upload"
                  ref={blueYonderInputRef}
                  onChange={(e) => handleFileChange(e, 'blueYonder')}
                  accept=".csv"
                  className="file-input"
                />
                <label htmlFor="blue-yonder-upload" className="file-label-card">
                  <span className="file-icon">📁</span>
                  <span className="file-text">{blueYonderFile ? blueYonderFile.name : 'Choose file'}</span>
                </label>

                {blueYonderFile && (
                  <button
                    onClick={() => handleUpload(blueYonderFile, 'blue_yonda_range.csv', 'blueYonder')}
                    className="upload-button-card"
                    disabled={uploading.blueYonder}
                  >
                    {uploading.blueYonder ? (
                      <>
                        <span className="spinner"></span>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <span>⬆️</span> Upload
                      </>
                    )}
                  </button>
                )}
              </>
            ) : (
              <div className="completed-badge">
                <span className="check-icon">✓</span>
                <span>Completed</span>
              </div>
            )}
          </div>

          {/* Step 2: eCommerce Price File */}
          <div className={`file-card ${!completed.blueYonder ? 'disabled' : ''} ${completed.ecommerce ? 'completed' : ''}`}>
            <div className="step-number">Step 2</div>
            <div className="file-card-icon">💰</div>
            <h3 className="file-card-title">eCommerce Price File</h3>
            <p className="file-card-description">
              {!completed.blueYonder ? 'Complete Step 1 first' : 'Upload your eCommerce pricing file'}
            </p>

            {!completed.ecommerce ? (
              <>
                <input
                  type="file"
                  id="ecommerce-upload"
                  ref={ecommerceInputRef}
                  onChange={(e) => handleFileChange(e, 'ecommerce')}
                  accept=".csv"
                  className="file-input"
                  disabled={!completed.blueYonder}
                />
                <label
                  htmlFor="ecommerce-upload"
                  className={`file-label-card ${!completed.blueYonder ? 'disabled' : ''}`}
                >
                  <span className="file-icon">📁</span>
                  <span className="file-text">{ecommerceFile ? ecommerceFile.name : 'Choose file'}</span>
                </label>

                {ecommerceFile && completed.blueYonder && (
                  <button
                    onClick={() => handleUpload(ecommerceFile, 'ecommerce_file.csv', 'ecommerce')}
                    className="upload-button-card"
                    disabled={uploading.ecommerce}
                  >
                    {uploading.ecommerce ? (
                      <>
                        <span className="spinner"></span>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <span>⬆️</span> Upload
                      </>
                    )}
                  </button>
                )}
              </>
            ) : (
              <div className="completed-badge">
                <span className="check-icon">✓</span>
                <span>Completed</span>
              </div>
            )}
          </div>

          {/* Step 3: Sales & Order File */}
          {/* <div className={`file-card ${!completed.ecommerce ? 'disabled' : ''} ${completed.salesOrder ? 'completed' : ''}`}>
            <div className="step-number">Step 3</div>
            <div className="file-card-icon">📦</div>
            <h3 className="file-card-title">Sales & Order File</h3>
            <p className="file-card-description">
              {!completed.ecommerce ? 'Complete Step 2 first' : 'Upload your sales and order file'}
            </p>

            {!completed.salesOrder ? (
              <>
                <input
                  type="file"
                  id="sales-order-upload"
                  ref={salesOrderInputRef}
                  onChange={(e) => handleFileChange(e, 'salesOrder')}
                  accept=".csv"
                  className="file-input"
                  disabled={!completed.ecommerce}
                />
                <label
                  htmlFor="sales-order-upload"
                  className={`file-label-card ${!completed.ecommerce ? 'disabled' : ''}`}
                >
                  <span className="file-icon">📁</span>
                  <span className="file-text">{salesOrderFile ? salesOrderFile.name : 'Choose file'}</span>
                </label>

                {salesOrderFile && completed.ecommerce && (
                  <button
                    onClick={() => handleUpload(salesOrderFile, 'sevs_sales_orders.csv', 'salesOrder')}
                    className="upload-button-card"
                    disabled={uploading.salesOrder}
                  >
                    {uploading.salesOrder ? (
                      <>
                        <span className="spinner"></span>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <span>⬆️</span> Upload
                      </>
                    )}
                  </button>
                )}
              </>
            ) : (
              <div className="completed-badge">
                <span className="check-icon">✓</span>
                <span>Completed</span>
              </div>
            )}
          </div> */}
        </div>
      </main>
    </div>
  );
}

export default RangeRefresh;
