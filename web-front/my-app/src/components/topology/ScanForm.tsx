import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { NodeData } from './Topology';
import axios from 'axios';
import './ScanForm.css';

// API 기본 URL
const API_BASE_URL = '/api';  // 상대 경로 사용

// 서버 상태 확인 URL
const SERVER_HEALTH_URL = `${API_BASE_URL}/`;

// axios 인스턴스 생성 (기본 설정)
const axiosInstance = axios.create({
  timeout: 30000, // 30초 타임아웃으로 증가
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// 요청 인터셉터 설정
axiosInstance.interceptors.request.use(
  config => {
    console.log(`요청 시작: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  error => {
    console.error('요청 인터셉터 오류:', error);
    return Promise.reject(error);
  }
);

// 응답 인터셉터 설정
axiosInstance.interceptors.response.use(
  response => {
    console.log(`응답 성공: ${response.status} ${response.config.url}`);
    console.log('응답 데이터:', response.data); // 응답 데이터 로깅 추가
    return response;
  },
  error => {
    console.error('응답 오류:', error);
    // 오류 세부 정보 로깅
    if (error.response) {
      // 서버가 응답을 반환했지만 2xx 범위를 벗어난 상태 코드
      console.error('응답 데이터:', error.response.data);
      console.error('응답 상태:', error.response.status);
      console.error('응답 헤더:', error.response.headers);
    } else if (error.request) {
      // 요청은 보냈지만 응답을 받지 못함
      console.error('응답 없음:', error.request);
    } else {
      // 요청 설정 중 오류 발생
      console.error('요청 오류:', error.message);
    }
    return Promise.reject(error);
  }
);

// 서버 상태 확인 함수
const checkServerStatus = async (): Promise<boolean> => {
  try {
    console.log('서버 상태 확인 중...');
    // 일반 GET 요청으로 변경
    const response = await axios.get(SERVER_HEALTH_URL, {
      timeout: 10000, // 10초 타임아웃
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log('서버 상태 응답:', {
      status: response.status,
      data: response.data
    });
    
    return response.status === 200;
  } catch (error: any) {
    console.error('서버 연결 확인 실패:', error);
    
    // Axios 오류 세부 정보 로깅
    if (error.response) {
      // 서버가 응답을 반환했지만 2xx 범위를 벗어난 상태 코드
      console.error('서버 응답 오류:', {
        status: error.response.status,
        data: error.response.data
      });
    } else if (error.request) {
      // 요청은 보냈지만 응답을 받지 못함
      console.error('서버 응답 없음 (CORS 또는 서버 다운)');
    } else {
      // 요청 설정 중 오류 발생
      console.error('요청 설정 오류:', error.message);
    }
    
    // 타임아웃 오류 확인
    if (error.code === 'ECONNABORTED') {
      console.error('서버 연결 타임아웃 발생');
    }
    
    return false;
  }
};

// 재시도 로직이 포함된 API 호출 함수
const callApiWithRetry = async (
  method: 'get' | 'post',
  url: string,
  data?: any,
  maxRetries: number = 2
): Promise<any> => {
  let retries = 0;
  
  while (retries <= maxRetries) {
    try {
      if (method === 'get') {
        return await axiosInstance.get(url);
      } else {
        return await axiosInstance.post(url, data);
      }
    } catch (error) {
      console.error(`API 호출 실패 (시도 ${retries + 1}/${maxRetries + 1}):`, error);
      
      // 마지막 시도에서 실패하면 오류 전파
      if (retries === maxRetries) {
        throw error;
      }
      
      // 재시도 전 잠시 대기 (지수 백오프: 1초, 2초, 4초, ...)
      const delay = Math.pow(2, retries) * 1000;
      console.log(`${delay}ms 후 재시도...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      retries++;
    }
  }
  
  // 여기까지 오면 모든 재시도가 실패한 것
  throw new Error('최대 재시도 횟수 초과');
};

interface ScanFormProps {
  onScanComplete?: (results: any) => void;
  // 직접 사용할 경우를 위해 onNodeSelect prop 추가
  onNodeSelect?: (node: NodeData | null) => void;
}

interface ScanData {
  target: string;
  mode: 'quick' | 'full' | 'custom' | 'test';
  ports?: string;
  arguments?: string;
}

interface OutletContextType {
  onNodeSelect: (node: NodeData | null) => void;
}

interface ScanStatus {
  scan_id: string;
  target: string;
  mode: string;
  status: string;
  start_time: number;
  end_time?: number;
  duration?: number;
  result?: any;
  error?: string;
}

const ScanForm: React.FC<ScanFormProps> = ({ onScanComplete, onNodeSelect: propNodeSelect }) => {
  // useOutletContext가 null일 경우를 대비한 안전한 접근
  const outletContext = useOutletContext<OutletContextType | null>();
  
  // props로 전달된 onNodeSelect가 있으면 그것을 사용하고, 없으면 outlet context의 onNodeSelect 사용
  const onNodeSelect = propNodeSelect || outletContext?.onNodeSelect || ((node: NodeData | null) => {
    // 두 가지 방식 모두 없는 경우 빈 함수로 처리
    console.log('Node selected but no handler available:', node);
  });
  
  const [target, setTarget] = useState('');
  const [scanType, setScanType] = useState<'quick' | 'full' | 'custom' | 'test'>('test');
  const [ports, setPorts] = useState('');
  const [customArguments, setCustomArguments] = useState('');
  const [options, setOptions] = useState({
    osDetection: false,
    serviceVersion: false,
    scriptScan: false,
    useTestMode: true,
  });
  
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [serverAvailable, setServerAvailable] = useState<boolean>(true);

  // 스캔 옵션 변경 핸들러
  const handleOptionChange = (option: keyof typeof options) => {
    setOptions(prev => ({
      ...prev,
      [option]: !prev[option],
    }));
  };

  // 커스텀 스캔 인자 생성
  const buildScanArguments = (): string => {
    let args = '-sT'; // 기본 TCP 스캔
    
    if (options.osDetection) args += ' -O';
    if (options.serviceVersion) args += ' -sV';
    if (options.scriptScan) args += ' -sC';
    
    return args;
  };

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // 컴포넌트 마운트 시 서버 상태 확인
  useEffect(() => {
    const checkServer = async () => {
      const isAvailable = await checkServerStatus();
      setServerAvailable(isAvailable);
      
      if (!isAvailable) {
        setError('백엔드 서버에 연결할 수 없습니다. 서버 상태를 확인해주세요.');
      }
    };
    
    checkServer();
    
    // 30초마다 서버 상태 확인 (폴링)
    const serverCheckInterval = setInterval(checkServer, 30000);
    
    return () => {
      clearInterval(serverCheckInterval);
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, []);

  // 스캔 시작 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setScanId(null);
    setScanStatus(null);

    if (!target) {
      setError('대상 주소를 입력해주세요.');
      return;
    }

    // 서버 상태 확인
    if (!serverAvailable) {
      const isAvailable = await checkServerStatus();
      setServerAvailable(isAvailable);
      
      if (!isAvailable) {
        setError('백엔드 서버에 연결할 수 없습니다. 서버 상태를 확인해주세요.');
        return;
      }
    }

    // 사용자 정의 스캔 시 포트 또는 인자 필요
    if (scanType === 'custom' && !ports && !customArguments) {
      setError('사용자 정의 스캔에는 포트 범위 또는 스캔 인자를 지정해야 합니다.');
      return;
    }

    // API 요청 데이터 구성
    let scanData: ScanData;
    
    // 테스트 모드 사용 여부에 따라 mode 설정
    if (options.useTestMode) {
      scanData = {
        target,
        mode: 'test', // 항상 테스트 모드 사용
      };
    } else {
      scanData = {
        target,
        mode: scanType,
      };
      
      // 사용자 정의 스캔 파라미터
      if (scanType === 'custom') {
        if (ports) {
          scanData.ports = ports;
        }
        if (customArguments || Object.values({...options, useTestMode: false}).some(val => val)) {
          scanData.arguments = customArguments || buildScanArguments();
        }
      }
    }

    try {
      setIsLoading(true);
      
      // 적절한 API 엔드포인트 선택
      let endpoint;
      if (options.useTestMode) {
        endpoint = `${API_BASE_URL}/scan/test`; // 테스트 모드 엔드포인트 사용
      } else {
        if (scanType === 'quick') endpoint = `${API_BASE_URL}/scan/quick`;
        else if (scanType === 'full') endpoint = `${API_BASE_URL}/scan/full`;
        else endpoint = `${API_BASE_URL}/scan/custom`;
      }
      
      // 재시도 로직과 함께 API 호출
      console.log(`스캔 요청 전송: ${endpoint}`, scanData);
      const response = await callApiWithRetry('post', endpoint, scanData);
      console.log('스캔 응답 받음:', response.data);
      
      if (response.data && response.data.scan_id) {
        setScanId(response.data.scan_id);
        // 폴링 시작
        startPolling(response.data.scan_id);
      }
    } catch (err) {
      console.error('스캔 요청 실패:', err);
      
      // 직접 서버 상태 확인하여 더 명확한 오류 메시지 제공
      const isAvailable = await checkServerStatus();
      setServerAvailable(isAvailable);
      
      if (!isAvailable) {
        setError('백엔드 서버에 연결할 수 없습니다. 서버 상태를 확인해주세요.');
      } else {
        setError(err instanceof Error ? 
          `스캔 요청 실패: ${err.message}` : 
          '스캔 요청이 실패했습니다. 네트워크 연결 상태를 확인해주세요.');
      }
      
      setIsLoading(false);
    }
  };

  // 스캔 상태 폴링
  const startPolling = (id: string) => {
    // 이전 폴링 인터벌이 있다면 정리
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    
    console.log(`스캔 ID ${id}에 대한 폴링 시작...`);
    
    // 새 폴링 인터벌 설정
    const interval = setInterval(async () => {
      try {
        console.log(`스캔 상태 조회 중: ${id}`);
        // 재시도 로직과 함께 상태 조회
        const response = await callApiWithRetry('get', `${API_BASE_URL}/scan/${id}`);
        console.log('스캔 상태 응답:', response.data);
        setScanStatus(response.data);
        
        // 완료 또는 실패 시 폴링 중지
        if (['completed', 'failed'].includes(response.data.status)) {
          console.log(`스캔 ${id} ${response.data.status} 상태로 폴링 종료`);
          clearInterval(interval);
          setIsLoading(false);
          
          // 성공적으로 스캔이 완료되었고 결과가 있을 경우
          if (response.data.status === 'completed' && response.data.result) {
            console.log('스캔 결과 처리 중...');
            if (onScanComplete) {
              onScanComplete(response.data.result);
            }
            
            // 스캔 결과에서 노드 데이터 추출 및 토폴로지에 추가
            processAndAddToTopology(response.data.result);
          }
        }
      } catch (err) {
        console.error('스캔 상태 조회 실패:', err);
        
        // 서버 상태 확인
        const isAvailable = await checkServerStatus();
        setServerAvailable(isAvailable);
        
        if (!isAvailable) {
          clearInterval(interval);
          setIsLoading(false);
          setError('백엔드 서버와의 연결이 끊어졌습니다. 서버 상태를 확인해주세요.');
        } else {
          // 일시적인 오류일 수 있으므로 폴링 계속 유지
          console.log('폴링 계속 진행 중...');
        }
      }
    }, 2000); // 2초마다 폴링
    
    setPollingInterval(interval);
  };

  // 스캔 결과를 토폴로지 노드로 변환
  const processAndAddToTopology = (scanResult: any) => {
    if (!scanResult?.hosts || !scanResult.hosts.length) {
      return;
    }
    
    // 각 호스트를 토폴로지 노드로 변환
    scanResult.hosts.forEach((host: any) => {
      // NodeData 형식으로 변환
      const nodeData: NodeData = {
        id: `host_${host.ip.replace(/\./g, '_')}`,
        type: determineNodeType(host),
        name: host.hostname || host.ip,
        ip: host.ip,
        nmapData: host,
      };
      
      // 취약점 정보 추가 (있는 경우)
      if (host.ports && host.ports.length > 0) {
        // 열린 포트에 기반한 간단한 취약점 탐지
        const vulnerabilities = detectVulnerabilities(host);
        if (vulnerabilities.length > 0) {
          nodeData.vulnerabilities = vulnerabilities;
        }
      }
      
      // 노드 선택 (상세 정보를 보기 위해)
      onNodeSelect(nodeData);
    });
  };

  // 포트 정보를 기반으로 간단한 취약점 탐지
  const detectVulnerabilities = (host: any) => {
    const vulnerabilities: {
      severity: 'high' | 'medium' | 'low',
      description: string,
      cve?: string
    }[] = [];
    
    // 열린 포트 중 잘 알려진 취약점이 있는 포트 탐지
    if (host.ports) {
      host.ports.forEach((port: any) => {
        if (port.state === 'open') {
          // SSH
          if (port.port === 22) {
            vulnerabilities.push({
              severity: 'medium',
              description: 'SSH 포트(22)가 열려 있습니다. 올바르게 구성되지 않은 경우 무차별 대입 공격에 취약할 수 있습니다.'
            });
          }
          // Telnet
          if (port.port === 23) {
            vulnerabilities.push({
              severity: 'high',
              description: 'Telnet 포트(23)가 열려 있습니다. Telnet은 암호화되지 않아 중간자 공격에 취약합니다.',
              cve: 'CVE-1999-0619'
            });
          }
          // FTP
          if (port.port === 21) {
            vulnerabilities.push({
              severity: 'medium',
              description: 'FTP 포트(21)가 열려 있습니다. FTP는 기본적으로 암호화되지 않아 보안에 취약합니다.'
            });
          }
          // 오래된 서비스 버전
          if (port.product && port.version && 
              (port.product.includes('Apache') || port.product.includes('nginx')) &&
              port.version.match(/^[012]\./)) {
            vulnerabilities.push({
              severity: 'high',
              description: `오래된 ${port.product} 버전(${port.version})이 실행 중입니다. 알려진 취약점이 있을 수 있습니다.`
            });
          }
        }
      });
    }
    
    return vulnerabilities;
  };

  // 노드 유형 결정 (단순 휴리스틱)
  const determineNodeType = (host: any): 'host' | 'router' | 'switch' => {
    if (host.ports) {
      // 특정 포트나 서비스를 기준으로 라우터나 스위치 탐지
      const hasDHCP = host.ports.some((p: any) => p.port === 67 || p.port === 68);
      const hasRouterPorts = host.ports.some((p: any) => [179, 520, 1723, 1812].includes(p.port));
      
      if (hasRouterPorts) return 'router';
      if (hasDHCP) return 'switch';
    }
    
    // 기본값은 host
    return 'host';
  };

  return (
    <div className="scan-form-container">
      {!serverAvailable && (
        <div className="server-status-alert">
          <h3>서버 연결 문제</h3>
          <p>백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.</p>
          <button onClick={async () => {
            const isAvailable = await checkServerStatus();
            setServerAvailable(isAvailable);
            if (isAvailable) {
              setError('');
            }
          }}>
            서버 상태 확인
          </button>
        </div>
      )}
      
      {isLoading || scanStatus ? (
        <div className="scan-status-container">
          <h2>스캔 상태</h2>
          
          {isLoading && !scanStatus && (
            <div className="loading-indicator">
              <div className="spinner"></div>
              <p>스캔 요청 처리 중...</p>
            </div>
          )}
          
          {scanStatus && (
            <>
              <div className="status-card">
                <div className="status-header">
                  <div className={`status-indicator ${scanStatus.status}`}></div>
                  <span className="status-label">{getStatusLabel(scanStatus.status)}</span>
                </div>
                
                <div className="status-details">
                  <p><strong>대상:</strong> {scanStatus.target || '정보 없음'}</p>
                  <p><strong>모드:</strong> {getScanTypeLabel(scanStatus.mode) || '정보 없음'}</p>
                  <p><strong>스캔 ID:</strong> {scanStatus.scan_id || '정보 없음'}</p>
                  
                  {scanStatus.end_time && (
                    <p><strong>소요 시간:</strong> {Math.round(scanStatus.duration || 0)}초</p>
                  )}
                  
                  {scanStatus.status === 'completed' && scanStatus.result && (
                    <div className="scan-result-summary">
                      <p><strong>스캔 결과:</strong></p>
                      <p>{scanStatus.result.hosts?.length || 0}개의 호스트 발견</p>
                      <p>
                        {scanStatus.result.hosts?.reduce((total: number, host: any) => 
                          total + (host.ports?.length || 0), 0) || 0}개의 포트 스캔됨
                      </p>
                    </div>
                  )}
                  
                  {scanStatus.status === 'failed' && scanStatus.error && (
                    <div className="error-message">
                      <p><strong>오류:</strong> {scanStatus.error}</p>
                    </div>
                  )}
                </div>
              </div>
              
              {scanStatus.status === 'running' && (
                <div className="loading-indicator">
                  <div className="spinner"></div>
                  <p>스캔 진행 중...</p>
                </div>
              )}
              
              {['completed', 'failed'].includes(scanStatus.status) && (
                <button 
                  className="new-scan-button" 
                  onClick={() => {
                    setScanId(null);
                    setScanStatus(null);
                    setIsLoading(false);
                  }}
                >
                  새 스캔 시작
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="scan-form">
          <h2>네트워크 스캔</h2>
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="target">대상 IP 주소/범위/도메인</label>
            <input
              type="text"
              id="target"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="예: 192.168.1.1, 192.168.1.0/24, example.com"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label>스캔 유형</label>
            <div className="scan-type-options">
              <label className={`scan-type-option ${scanType === 'quick' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="scanType"
                  value="quick"
                  checked={scanType === 'quick'}
                  onChange={() => setScanType('quick')}
                  disabled={isLoading}
                />
                <span>빠른 스캔: </span>
                <small>일반적인 포트만 빠르게 스캔</small>
              </label>
              
              <label className={`scan-type-option ${scanType === 'full' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="scanType"
                  value="full"
                  checked={scanType === 'full'}
                  onChange={() => setScanType('full')}
                  disabled={isLoading}
                />
                <span>전체 스캔: </span>
                <small>모든 포트와 OS 정보 스캔 (시간 소요)</small>
              </label>
              
              <label className={`scan-type-option ${scanType === 'custom' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="scanType"
                  value="custom"
                  checked={scanType === 'custom'}
                  onChange={() => setScanType('custom')}
                  disabled={isLoading}
                />
                <span>사용자 정의: </span>
                <small>스캔 설정 직접 지정</small>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="scan-option">
              <input
                type="checkbox"
                checked={options.useTestMode}
                onChange={() => handleOptionChange('useTestMode')}
                disabled={isLoading}
              />
              <span>테스트 모드 사용 (실제 nmap 실행 없이 테스트 데이터 사용)</span>
            </label>
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
                  placeholder="예: 22,80,443 또는 1-1024"
                />
                <div className="hint">쉼표로 구분하거나 범위 지정 (예: 1-1024)</div>
              </div>

              <div className="form-group">
                <label>스캔 옵션</label>
                <div className="scan-options">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={options.osDetection}
                      onChange={() => handleOptionChange('osDetection')}
                    />
                    <div className="checkbox-info">
                      <span className="checkbox-title">OS 감지</span>
                      <span className="checkbox-description">대상의 운영체제 버전을 감지합니다</span>
                    </div>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={options.serviceVersion}
                      onChange={() => handleOptionChange('serviceVersion')}
                    />
                    <div className="checkbox-info">
                      <span className="checkbox-title">서비스 버전 감지</span>
                      <span className="checkbox-description">실행 중인 서비스와 버전을 식별합니다</span>
                    </div>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={options.scriptScan}
                      onChange={() => handleOptionChange('scriptScan')}
                    />
                    <div className="checkbox-info">
                      <span className="checkbox-title">스크립트 스캔</span>
                      <span className="checkbox-description">기본 NSE 스크립트로 추가 정보를 수집합니다</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="customArguments">고급 인자 (선택사항)</label>
                <input
                  type="text"
                  id="customArguments"
                  value={customArguments}
                  onChange={(e) => setCustomArguments(e.target.value)}
                  placeholder="예: -sT -sV -p 1-1024"
                />
                <div className="hint">직접 nmap 옵션을 지정할 수 있습니다</div>
              </div>
            </>
          )}

          <button type="submit" disabled={isLoading} className="scan-button">
            {isLoading ? '스캔 중...' : '스캔 시작'}
          </button>
        </form>
      )}
    </div>
  );
};

// 스캔 상태 레이블 변환
function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return '대기 중';
    case 'running': return '실행 중';
    case 'completed': return '완료됨';
    case 'failed': return '실패';
    default: return status;
  }
}

// 스캔 유형 레이블 변환
function getScanTypeLabel(scanType: string): string {
  switch (scanType) {
    case 'quick': return '빠른 스캔';
    case 'full': return '전체 스캔';
    case 'custom': return '사용자 정의 스캔';
    case 'test': return '테스트 모드';
    default: return scanType;
  }
}

export default ScanForm; 