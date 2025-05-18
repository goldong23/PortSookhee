import React, { useState } from 'react';
import './ScanForm.css';

interface ScanFormProps {
  onSubmit?: (scanData: ScanData) => void;
}

interface ScanData {
  target: string;
  scanType: 'quick' | 'full' | 'custom';
  ports?: string;
  options?: {
    [key: string]: boolean;
  };
}

const ScanForm: React.FC<ScanFormProps> = ({ onSubmit }) => {
  const [target, setTarget] = useState('');
  const [scanType, setScanType] = useState<'quick' | 'full' | 'custom'>('quick');
  const [ports, setPorts] = useState('');
  const [options, setOptions] = useState({
    verbose: false,
    aggressive: false,
    stealth: false,
  });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!target) {
      setError('대상 주소를 입력해주세요.');
      return;
    }

    const scanData: ScanData = {
      target,
      scanType,
      ports: scanType === 'custom' ? ports : undefined,
      options: scanType === 'custom' ? options : undefined,
    };

    onSubmit?.(scanData);
  };

  const handleOptionChange = (option: keyof typeof options) => {
    setOptions(prev => ({
      ...prev,
      [option]: !prev[option],
    }));
  };

  return (
    <div className="scan-form-container">
      <form onSubmit={handleSubmit} className="scan-form">
        <h2>네트워크 스캔</h2>
        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label htmlFor="target">대상 주소</label>
          <input
            type="text"
            id="target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="예: 192.168.1.1 또는 example.com"
            required
          />
        </div>

        <div className="form-group">
          <label>스캔 유형</label>
          <div className="scan-type-options">
            <label className="radio-label">
              <input
                type="radio"
                name="scanType"
                value="quick"
                checked={scanType === 'quick'}
                onChange={() => setScanType('quick')}
              />
              빠른 스캔
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="scanType"
                value="full"
                checked={scanType === 'full'}
                onChange={() => setScanType('full')}
              />
              전체 스캔
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="scanType"
                value="custom"
                checked={scanType === 'custom'}
                onChange={() => setScanType('custom')}
              />
              사용자 정의
            </label>
          </div>
        </div>

        {scanType === 'custom' && (
          <>
            <div className="form-group">
              <label htmlFor="ports">포트 범위</label>
              <input
                type="text"
                id="ports"
                value={ports}
                onChange={(e) => setPorts(e.target.value)}
                placeholder="예: 80,443,8000-8080"
              />
            </div>

            <div className="form-group">
              <label>스캔 옵션</label>
              <div className="scan-options">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={options.verbose}
                    onChange={() => handleOptionChange('verbose')}
                  />
                  상세 출력
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={options.aggressive}
                    onChange={() => handleOptionChange('aggressive')}
                  />
                  공격적 스캔
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={options.stealth}
                    onChange={() => handleOptionChange('stealth')}
                  />
                  스텔스 모드
                </label>
              </div>
            </div>
          </>
        )}

        <button type="submit">스캔 시작</button>
      </form>
    </div>
  );
};

export default ScanForm; 