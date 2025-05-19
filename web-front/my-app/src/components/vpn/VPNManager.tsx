import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { RootState } from '../../store';
import './VPNManager.css';

// API 기본 URL - 프록시 설정을 통해 상대 경로로 사용
const API_BASE_URL = '/api';

// API_BASE_URL 로그 확인 (디버깅용)
console.log('API_BASE_URL:', API_BASE_URL);

// 파일 업로드 전용 URL
const uploadUrl = `${API_BASE_URL}/openvpn/upload`;
console.log('파일 업로드 URL:', uploadUrl);

// 커스텀 타입 정의
interface ProgressEvent {
  loaded: number;
  total?: number;
}

interface AxiosCustomError extends Error {
  response?: {
    data?: any;
    status?: number;
  };
}

// 응답 데이터 인터페이스 정의
interface OpenVPNUploadResponse {
  message: string;
  connection_id: string;
  name: string;
  status: string;
  user_id: string | null;
}

interface VPNConnection {
  id: string;
  name: string;
  status: string;
  uploaded_at: string;
  started_at?: string;
  disconnected_at?: string;
  last_error?: string;
  user_id?: string;
  description?: string;
  last_connected?: string;
}

// API 응답 인터페이스 정의
interface OpenVPNStatusResponse {
  connections: VPNConnection[];
}

interface UploadStatusResponse {
  status: string;
  progress: number;
  filename: string;
  user_id: string | null;
  uploaded_at?: string;
  completed_at?: string;
  error?: string;
}

const VPNManager: React.FC = () => {
  // 현재 로그인한 사용자 정보 가져오기
  const { user, token } = useSelector((state: RootState) => state.auth);
  
  const [file, setFile] = useState<File | null>(null);
  const [fileDescription, setFileDescription] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [connections, setConnections] = useState<VPNConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [uploadId, setUploadId] = useState<string | null>(null);

  // API 요청에 사용할 헤더 설정
  const getRequestConfig = () => {
    return {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      }
    };
  };

  // 연결 상태 가져오기
  const fetchConnections = async () => {
    try {
      const userId = user?.id;
      if (!userId) {
        setConnections([]);
        return;
      }
      
      const response = await axios.get<OpenVPNStatusResponse>(
        `${API_BASE_URL}/openvpn/status?user_id=${userId}`,
        getRequestConfig()
      );
      
      if (response.data && response.data.connections) {
        setConnections(response.data.connections);
        
        // 활성 연결 확인
        const activeConn = response.data.connections.find(
          (conn: VPNConnection) => conn.status === 'connecting' || conn.status === 'connected'
        );
        if (activeConn) {
          setActiveConnectionId(activeConn.id);
        }
      }
    } catch (err) {
      console.error('VPN 연결 정보 가져오기 오류:', err);
    }
  };

  // 업로드 상태 확인
  const checkUploadStatus = async (connectionId: string) => {
    try {
      const response = await axios.get<UploadStatusResponse>(
        `${API_BASE_URL}/openvpn/upload-status/${connectionId}`,
        getRequestConfig()
      );
      
      setUploadStatus(response.data.status);
      setUploadProgress(response.data.progress);
      
      if (response.data.status === 'completed') {
        setMessage('VPN 설정 파일이 성공적으로 업로드되었습니다.');
        fetchConnections();
        setUploadId(null);
      } else if (response.data.status === 'failed') {
        setError(`업로드 실패: ${response.data.error || '알 수 없는 오류'}`);
        setUploadId(null);
      } else if (response.data.status === 'uploading') {
        // 계속 상태 확인
        setTimeout(() => checkUploadStatus(connectionId), 1000);
      }
    } catch (err) {
      console.error('업로드 상태 확인 오류:', err);
      setUploadId(null);
    }
  };

  // 초기 로딩 시 연결 상태 확인
  useEffect(() => {
    fetchConnections();
  }, [user?.id]);

  // 파일 선택 핸들러
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  // 설정 파일 업로드 핸들러
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('OpenVPN 설정 파일(.ovpn)을 선택해주세요.');
      return;
    }
    
    if (!file.name.endsWith('.ovpn')) {
      setError('.ovpn 확장자 파일만 업로드할 수 있습니다.');
      return;
    }
    
    try {
      setIsLoading(true);
      setMessage('');
      setError('');
      setUploadStatus('uploading');
      setUploadProgress(0);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('description', fileDescription); // 파일 설명 추가
      
      if (user?.id) {
        formData.append('user_id', user.id); // 사용자 ID 추가
      }
      
      console.log('파일 업로드 시작...', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        userId: user?.id
      });
      
      // 헤더 설정
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // 구성 객체 확인
      const axiosConfig = {
        headers: headers,
        onUploadProgress: (progressEvent: any) => {
          const total = progressEvent.total || 100;
          const percentCompleted = Math.round((progressEvent.loaded * 100) / total);
          setUploadProgress(percentCompleted);
          console.log(`업로드 진행률: ${percentCompleted}%`);
        },
        timeout: 60000, // 60초 타임아웃
      };
      
      // 단순화된 axios 요청 (타입 에러 방지)
      try {
        const response = await axios.post(uploadUrl, formData, axiosConfig as any);
        
        // 응답 데이터에 타입 단언 적용
        const responseData = response.data as OpenVPNUploadResponse;
        console.log('서버 응답:', responseData);
        
        setMessage(responseData.message || '파일이 성공적으로 업로드되었습니다.');
        
        if (responseData.connection_id) {
          setUploadId(responseData.connection_id);
          
          // 업로드 상태 주기적으로 확인
          checkUploadStatus(responseData.connection_id);
        }
        
        // 파일 입력 필드 초기화
        setFile(null);
        setFileDescription('');
        
        const fileInput = document.getElementById('ovpn-file') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
        
        setUploadStatus('completed');
        setUploadProgress(100);
        
        // 연결 목록 새로고침
        fetchConnections();
      } catch (axiosError: any) {
        console.error('Axios 업로드 오류:', axiosError);
        
        let errorMessage = '설정 파일 업로드에 실패했습니다';
        
        if (axiosError.response) {
          // 서버에서 응답이 왔으나 오류 상태 코드인 경우
          errorMessage += `: ${axiosError.response.status} ${axiosError.response.statusText}`;
          
          if (axiosError.response.data && axiosError.response.data.message) {
            errorMessage += ` - ${axiosError.response.data.message}`;
          }
        } else if (axiosError.request) {
          // 요청은 전송되었으나 응답이 없는 경우
          errorMessage += ': 서버에 연결할 수 없습니다. 다음을 확인해보세요: 1. 백엔드 서버가 실행 중인지 2. CORS 설정이 올바른지 3. API 엔드포인트 주소가 올바른지';
        } else {
          // 요청 설정 중 오류 발생
          errorMessage += `: ${axiosError.message}`;
        }
        
        setError(errorMessage);
        setUploadStatus('failed');
      }
    } catch (err) {
      console.error('파일 업로드 처리 중 예상치 못한 오류:', err);
      
      let errorMessage = '파일 업로드 중 알 수 없는 오류가 발생했습니다';
      
      if (err instanceof Error) {
        errorMessage += `: ${err.message}`;
      }
      
      setError(errorMessage);
      setUploadStatus('failed');
    } finally {
      setIsLoading(false);
    }
  };

  // VPN 연결 삭제 핸들러
  const handleDelete = async (connectionId: string) => {
    if (window.confirm('정말로 이 VPN 설정 파일을 삭제하시겠습니까?')) {
      try {
        setIsLoading(true);
        
        await axios.delete(`${API_BASE_URL}/openvpn/connection/${connectionId}`, getRequestConfig());
        
        setMessage('VPN 설정 파일이 삭제되었습니다.');
        setConnections(prevConnections => 
          prevConnections.filter(conn => conn.id !== connectionId)
        );
        
      } catch (err) {
        console.error('VPN 설정 삭제 오류:', err);
        setError('VPN 설정 파일 삭제에 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // VPN 연결 핸들러
  const handleConnect = async (connectionId: string) => {
    try {
      setIsLoading(true);
      setError('');
      
      const data: any = { connection_id: connectionId };
      
      // 사용자 이름과 비밀번호가 있는 경우 추가
      if (username && password) {
        data.username = username;
        data.password = password;
      }
      
      await axios.post(`${API_BASE_URL}/openvpn/connect`, data, getRequestConfig());
      
      setMessage('VPN 연결이 시작되었습니다...');
      setActiveConnectionId(connectionId);
      
      // 상태 업데이트
      setConnections(prevConnections => 
        prevConnections.map(conn => 
          conn.id === connectionId 
            ? { ...conn, status: 'connecting' } 
            : conn
        )
      );
      
      // 몇 초 후 상태 다시 확인
      setTimeout(() => fetchConnections(), 2000);
      
    } catch (err) {
      console.error('VPN 연결 오류:', err);
      setError('VPN 연결에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // VPN 연결 해제 핸들러
  const handleDisconnect = async (connectionId: string) => {
    try {
      setIsLoading(true);
      
      await axios.post(`${API_BASE_URL}/openvpn/disconnect`, 
        { connection_id: connectionId },
        getRequestConfig()
      );
      
      setMessage('VPN 연결이 종료되었습니다.');
      setActiveConnectionId(null);
      
      // 상태 업데이트
      setConnections(prevConnections => 
        prevConnections.map(conn => 
          conn.id === connectionId 
            ? { ...conn, status: 'disconnected' } 
            : conn
        )
      );
      
      // 몇 초 후 상태 다시 확인
      setTimeout(() => fetchConnections(), 2000);
      
    } catch (err) {
      console.error('VPN 연결 해제 오류:', err);
      setError('VPN 연결 해제에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 연결 상태에 따른 스타일 클래스
  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'connected': return 'status-connected';
      case 'connecting': return 'status-connecting';
      case 'disconnected': return 'status-disconnected';
      case 'failed': return 'status-failed';
      default: return 'status-uploaded';
    }
  };

  // 연결 상태 텍스트 변환
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'connected': return '연결됨';
      case 'connecting': return '연결 중...';
      case 'disconnected': return '연결 해제됨';
      case 'failed': return '연결 실패';
      case 'uploaded': return '업로드됨';
      default: return status;
    }
  };

  return (
    <div className="vpn-manager">
      <div className="vpn-header">
        <h2>TryHackMe VPN 관리자</h2>
        <div className="user-vpn-info">
          <p>로그인 사용자: <strong>{user?.username}</strong></p>
        </div>
      </div>

      <div className="vpn-guide-container">
        <div className="vpn-guide">
          <h3>VPN 사용 방법</h3>
          <p>
            TryHackMe나 HackTheBox 등의 VPN 설정 파일(.ovpn)을 업로드하면 서버에서 VPN 연결을 관리합니다.
            사용자는 VPN 클라이언트를 직접 설치할 필요가 없습니다.
          </p>
          <ol>
            <li>TryHackMe나 HackTheBox에서 VPN 설정 파일(.ovpn)을 다운로드하세요.</li>
            <li>아래 폼을 통해 설정 파일을 업로드하세요.</li>
            <li>필요한 경우 VPN 인증 정보(사용자 이름/비밀번호)를 입력하세요.</li>
            <li>'연결' 버튼을 클릭하여 VPN을 활성화하세요.</li>
          </ol>
        </div>
      </div>

      <div className="vpn-config-uploader">
        <h3>OpenVPN 설정 파일 업로드</h3>
        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label htmlFor="ovpn-file">OpenVPN 설정 파일 (.ovpn)</label>
            <input
              type="file"
              id="ovpn-file"
              accept=".ovpn"
              onChange={handleFileChange}
            />
          </div>
          <div className="form-group">
            <label htmlFor="file-description">파일 설명 (선택사항)</label>
            <input
              type="text"
              id="file-description"
              value={fileDescription}
              onChange={(e) => setFileDescription(e.target.value)}
              placeholder="예: TryHackMe 기본 설정"
            />
          </div>
          <button type="submit" disabled={isLoading || !file}>
            {isLoading ? '업로드 중...' : '업로드'}
          </button>
        </form>
        
        {uploadStatus === 'uploading' && (
          <div className="upload-progress">
            <div className="progress-bar">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <div className="progress-text">
              업로드 중... {uploadProgress}%
            </div>
          </div>
        )}
      </div>

      {connections.length > 0 && (
        <div className="vpn-connections">
          <h3>내 VPN 설정 파일 관리</h3>
          <p className="vpn-info-text">
            백엔드 서버가 VPN 연결을 관리합니다. 연결 시 모든 트래픽이 VPN을 통해 전송됩니다.
          </p>
          <ul>
            {connections.map((connection) => (
              <li key={connection.id} className={`connection-item ${getStatusClass(connection.status)}`}>
                <div className="connection-info">
                  <div className="connection-name">{connection.name}</div>
                  {connection.description && (
                    <div className="connection-description">{connection.description}</div>
                  )}
                  <div className="connection-status">
                    상태: <span className="status-indicator">{getStatusText(connection.status)}</span>
                  </div>
                  <div className="connection-metadata">
                    <span>업로드: {new Date(connection.uploaded_at).toLocaleString()}</span>
                    {connection.last_connected && (
                      <span> | 마지막 연결: {new Date(connection.last_connected).toLocaleString()}</span>
                    )}
                  </div>
                  {connection.last_error && (
                    <div className="connection-error">오류: {connection.last_error}</div>
                  )}
                </div>
                <div className="connection-actions">
                  {(connection.status === 'uploaded' || connection.status === 'disconnected' || connection.status === 'failed') ? (
                    <>
                      <div className="credentials-input">
                        <input
                          type="text"
                          placeholder="사용자 이름"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                        />
                        <input
                          type="password"
                          placeholder="비밀번호"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                      <div className="action-buttons">
                        <button
                          onClick={() => handleConnect(connection.id)}
                          disabled={isLoading || activeConnectionId !== null}
                          className="connect-btn"
                        >
                          연결
                        </button>
                        <button
                          onClick={() => handleDelete(connection.id)}
                          disabled={isLoading}
                          className="delete-btn"
                        >
                          삭제
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => handleDisconnect(connection.id)}
                      disabled={isLoading || connection.status === 'disconnected'}
                      className="disconnect-btn"
                    >
                      연결 해제
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {connections.length === 0 && (
        <div className="no-connections">
          <p>아직 등록된 VPN 설정 파일이 없습니다. 위 폼을 통해 업로드해주세요.</p>
        </div>
      )}

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default VPNManager; 