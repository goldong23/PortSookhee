import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { RootState } from '../../store';
import './VPNManager.css';

// API 기본 URL 수정
const API_BASE_URL = '/api';  // 상대 경로로 변경

// 파일 업로드 전용 URL 설정
const uploadUrl = `${API_BASE_URL}/openvpn/upload`;

// axios 인스턴스 생성 (기본 설정)
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30초 타임아웃
  headers: {
    'Accept': 'application/json'
  }
});

// 요청 인터셉터 설정
axiosInstance.interceptors.request.use(
  config => {
    // 로깅 비활성화
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
    // 로깅 비활성화
    return response;
  },
  error => {
    if (error.response) {
      console.error('응답 오류 데이터:', error.response.data);
      console.error('응답 오류 상태:', error.response.status);
    } else if (error.request) {
      console.error('응답 없음 (CORS 문제 가능성):', error.request);
    } else {
      console.error('요청 설정 오류:', error.message);
    }
    return Promise.reject(error);
  }
);

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
  status_text?: string; // 상태 표시 텍스트 추가
}

// API 응답 인터페이스 정의
interface OpenVPNStatusResponse {
  connections: VPNConnection[];
}

// 설치 관련 인터페이스 제거
// interface OpenVPNCheckResponse {
//   installed: boolean;
//   path?: string;
//   version?: string;
//   message?: string;
// }

// interface OpenVPNInstallGuideResponse {
//   title: string;
//   steps: string[];
// }

interface OpenVPNUploadResponse {
  message: string;
  connection_id: string;
  name: string;
  status: string;
  user_id: string | null;
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
  
  // 항상 설치되어 있다고 가정
  const [file, setFile] = useState<File | null>(null);
  const [fileDescription, setFileDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [connections, setConnections] = useState<VPNConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [isApiAvailable, setIsApiAvailable] = useState<boolean>(true);

  // API 요청에 사용할 헤더 설정
  const getRequestConfig = () => {
    return {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
  };

  // 서버 상태 확인
  const checkApiAvailability = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const isAvailable = response.ok;
      setIsApiAvailable(isAvailable);
      
      if (!isAvailable) {
        setError('API 서버에 연결할 수 없습니다. 서버 상태를 확인해주세요.');
      }
      
      return isAvailable;
    } catch (err) {
      console.error('API 서버 연결 확인 실패:', err);
      setIsApiAvailable(false);
      setError('API 서버에 연결할 수 없습니다. 서버 상태를 확인해주세요.');
      return false;
    }
  };

  // 연결 상태 가져오기
  const fetchConnections = async () => {
    try {
      // 먼저 API 서버 상태 확인
      if (!await checkApiAvailability()) {
        return;
      }
      
      const userId = user?.id;
      if (!userId) {
        setConnections([]);
        return;
      }
      
      const response = await axiosInstance.get<OpenVPNStatusResponse>(
        `/openvpn/status?user_id=${userId}`,
        getRequestConfig()
      );
      
      if (response.data && response.data.connections) {
        // 상태 표시 텍스트 추가
        const connectionsWithText = response.data.connections.map(conn => ({
          ...conn,
          status_text: getStatusText(conn.status)
        }));
        
        setConnections(connectionsWithText);
        
        // 활성 연결 확인
        const activeConn = connectionsWithText.find(
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

  // 사용자별 VPN 통계 가져오기
  const fetchUserVPNStats = async () => {
    try {
      const userId = user?.id;
      if (!userId) {
        return;
      }
      
      // 백엔드에서 추가한 사용자 통계 API 호출
      const response = await axiosInstance.get(
        `/openvpn/user-stats/${userId}`,
        getRequestConfig()
      );
      
      // 통계 정보는 필요에 따라 처리
      console.log('사용자 VPN 통계:', response.data);
    } catch (err) {
      console.error('사용자 VPN 통계 가져오기 오류:', err);
    }
  };

  // 업로드 상태 확인
  const checkUploadStatus = async (connectionId: string) => {
    try {
      const response = await axiosInstance.get<UploadStatusResponse>(
        `/openvpn/upload-status/${connectionId}`,
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
    checkApiAvailability().then(isAvailable => {
      if (isAvailable && user?.id) {
        fetchConnections();
        fetchUserVPNStats();
      }
    });
    
    // 30초마다 서버 상태 확인
    const intervalId = setInterval(() => {
      if (user?.id) {
        checkApiAvailability().then(isAvailable => {
          if (isAvailable) {
            fetchConnections();
          }
        });
      }
    }, 30000);
    
    return () => clearInterval(intervalId);
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
      
      console.log('디버깅: 파일 업로드 시작...', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        userId: user?.id
      });
      
      // package.json의 프록시 설정 확인 안내
      console.log('디버깅: 프록시 설정을 확인하세요. package.json에 "proxy": "http://127.0.0.1:5000" 또는 "http://localhost:5000"이 있어야 합니다.');
      
      // FormData 내용 로깅
      console.log('디버깅: FormData 내용:');
      /* 타입스크립트 호환성 문제로 인해 비활성화
      for (const [key, value] of formData.entries()) {
        console.log(`${key}:`, value);
      }
      */
      // 대체 로깅 방식
      console.log('디버깅: 파일 정보:', {
        fileName: file.name,
        fileSize: file.size,
        description: fileDescription,
        userId: user?.id
      });

      // 테스트 목적으로 상대 경로를 사용한 URL로도 시도
      const relativeUploadUrl = `/api/openvpn/upload`;
      console.log('디버깅: 상대 경로 업로드 URL 시도:', relativeUploadUrl);
      
      // 서버 연결 테스트 추가 (axios 요청 전에 fetch로 서버 상태 확인)
      console.log('디버깅: 서버 연결 테스트 시작...');
      try {
        const statusCheckUrl = `${API_BASE_URL}/openvpn/status`; 
        console.log(`디버깅: STATUS API 호출: ${statusCheckUrl}`);
        
        // fetch API로 서버 연결 테스트
        const statusCheckResponse = await fetch(statusCheckUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          // CORS 이슈 방지
          mode: 'cors',
          credentials: 'omit'
        });
        
        console.log('디버깅: 서버 연결 테스트 결과:', {
          status: statusCheckResponse.status,
          statusText: statusCheckResponse.statusText,
          ok: statusCheckResponse.ok
        });
        
        if (!statusCheckResponse.ok) {
          throw new Error(`서버 연결 테스트 실패: ${statusCheckResponse.status} ${statusCheckResponse.statusText}`);
        }
      } catch (testErr) {
        console.error('디버깅: 서버 연결 테스트 오류:', testErr);
        console.warn('디버깅: 서버 연결 테스트에 실패했지만 업로드는 계속 시도합니다.');
        console.error('디버깅: 백엔드 서버가 실행 중인지 확인하세요. 다음 명령어로 확인할 수 있습니다: lsof -i :5000');
      }
      
      // 타입 문제 우회를 위해 axiosConfig 객체를 any로 타입 단언
      const axiosConfig: any = {
        ...getRequestConfig(),
        headers: {
          ...getRequestConfig().headers,
          'Content-Type': 'multipart/form-data',
          'Accept': 'application/json'
        },
        timeout: 60000, // 타임아웃 확장 (60초)
        validateStatus: function (status: number) {
          return status >= 200 && status < 500; // 서버 오류만 예외로 처리
        },
        withCredentials: false, // CORS 관련 설정
        maxContentLength: 100 * 1024 * 1024, // 최대 100MB
        maxBodyLength: 100 * 1024 * 1024 // 최대 100MB
      };
      
      // onUploadProgress 속성 추가
      axiosConfig.onUploadProgress = (progressEvent: any) => {
        const total = progressEvent.total || 100;
        const percentCompleted = Math.round((progressEvent.loaded * 100) / total);
        setUploadProgress(percentCompleted);
        console.log(`디버깅: 업로드 진행률: ${percentCompleted}%`);
      };
      
      // 요청 설정 로깅
      console.log('디버깅: Axios 요청 설정:', {
        url: uploadUrl,
        headers: axiosConfig.headers,
        timeout: axiosConfig.timeout
      });
      
      console.log('디버깅: axios 대신 fetch API로도 시도해봅니다...');
      try {
        // 상대 경로로도 시도해보기
        const fetchResponse = await fetch(relativeUploadUrl, {
          method: 'POST',
          body: formData,
          headers: {
            'Accept': 'application/json',
            // 'Content-Type'은 FormData를 사용할 때 브라우저가 자동으로 설정
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          mode: 'cors',
          credentials: 'omit'
        });
        
        console.log('디버깅: 상대 경로 Fetch API 응답:', {
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          ok: fetchResponse.ok
        });
        
        if (fetchResponse.ok) {
          const data = await fetchResponse.json();
          console.log('디버깅: Fetch API 응답 데이터:', data);
          setMessage(data.message || '파일이 성공적으로 업로드되었습니다.');
          setUploadId(data.connection_id);
          
          // 업로드 상태 주기적으로 확인
          if (data.connection_id) {
            checkUploadStatus(data.connection_id);
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
          return; // fetch가 성공하면 axios는 시도하지 않음
        } else {
          console.error('디버깅: 상대 경로 Fetch API 실패:', fetchResponse.statusText);
        }
      } catch (fetchErr) {
        console.error('디버깅: 상대 경로 Fetch API 오류:', fetchErr);
        console.warn('디버깅: 상대 경로 Fetch API 실패, 절대 경로 URL로도 시도합니다.');
      }

      // 절대 경로 URL로도 시도
      try {
        console.log('디버깅: 절대 경로 URL로 fetch API 시도:', uploadUrl);
        const fetchAbsoluteResponse = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
          headers: {
            'Accept': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          mode: 'cors',
          credentials: 'omit'
        });
        
        console.log('디버깅: 절대 경로 Fetch API 응답:', {
          status: fetchAbsoluteResponse.status,
          statusText: fetchAbsoluteResponse.statusText,
          ok: fetchAbsoluteResponse.ok
        });
        
        if (fetchAbsoluteResponse.ok) {
          const data = await fetchAbsoluteResponse.json();
          console.log('디버깅: 절대 경로 Fetch API 응답 데이터:', data);
          setMessage(data.message || '파일이 성공적으로 업로드되었습니다.');
          setUploadId(data.connection_id);
          
          // 업로드 상태 주기적으로 확인
          if (data.connection_id) {
            checkUploadStatus(data.connection_id);
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
          return; // 성공하면 axios는 시도하지 않음
        } else {
          console.error('디버깅: 절대 경로 Fetch API 실패:', fetchAbsoluteResponse.statusText);
        }
      } catch (fetchErr) {
        console.error('디버깅: 절대 경로 Fetch API 오류:', fetchErr);
        console.warn('디버깅: 모든 Fetch API 시도 실패, axios로 시도합니다.');
      }
      
      // axios를 사용하여 파일 업로드
      try {
        console.log('디버깅: axios로 업로드 시도 (상대 경로):', relativeUploadUrl);
        const response = await axiosInstance.post<OpenVPNUploadResponse>(
          relativeUploadUrl,
          formData, 
          axiosConfig
        );
        
        console.log('디버깅: axios 서버 응답:', response.data);
        setMessage(response.data.message);
        setUploadId(response.data.connection_id);
        
        // 업로드 상태 주기적으로 확인
        checkUploadStatus(response.data.connection_id);
        
        // 파일 입력 필드 초기화
        setFile(null);
        setFileDescription('');
        
        const fileInput = document.getElementById('ovpn-file') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
        
        return; // 성공하면 여기서 종료
      } catch (axiosErr) {
        console.error('디버깅: axios 상대 경로 오류:', axiosErr);
        
        // 상대 경로 실패 시 절대 경로도 시도
        try {
          console.log('디버깅: axios로 업로드 시도 (절대 경로):', uploadUrl);
          const response = await axiosInstance.post<OpenVPNUploadResponse>(
            uploadUrl,
            formData, 
            axiosConfig
          );
          
          console.log('디버깅: axios 절대 경로 서버 응답:', response.data);
          setMessage(response.data.message);
          setUploadId(response.data.connection_id);
          
          // 업로드 상태 주기적으로 확인
          checkUploadStatus(response.data.connection_id);
          
          // 파일 입력 필드 초기화
          setFile(null);
          setFileDescription('');
          
          const fileInput = document.getElementById('ovpn-file') as HTMLInputElement;
          if (fileInput) {
            fileInput.value = '';
          }
        } catch (finalErr) {
          console.error('디버깅: 모든 시도 실패:', finalErr);
          
          // 오류 객체의 전체 구조 로깅
          console.error('디버깅: 오류 객체 구조:', JSON.stringify(finalErr, Object.getOwnPropertyNames(finalErr)));
          
          // 상세한 에러 메시지 표시
          if (finalErr instanceof Error) {
            // Axios 에러인지 확인 (response 속성이 있는지로 판단)
            const axiosError = finalErr as AxiosCustomError;
            if (axiosError.response) {
              const errorMessage = axiosError.response.data?.message || axiosError.message;
              const statusCode = axiosError.response.status;
              console.error(`디버깅: HTTP 에러 (${statusCode}):`, errorMessage);
              setError(`설정 파일 업로드에 실패했습니다 (${statusCode}): ${errorMessage}`);
            } else {
              // 네트워크 오류 처리 개선
              let errorMessage = finalErr.message;
              
              if (errorMessage === 'Network Error') {
                errorMessage = '네트워크 오류: 서버에 연결할 수 없습니다. 다음을 확인해보세요:\n' + 
                  '1. 백엔드 서버가 실행 중인지\n' +
                  '2. CORS 설정이 올바른지\n' +
                  '3. API 엔드포인트 주소가 올바른지';
                
                console.error('디버깅: 네트워크 오류 상세 디버깅:');
                console.error('디버깅: - API URL:', uploadUrl);
                console.error('디버깅: - 상대 경로 API URL:', relativeUploadUrl);
                console.error('디버깅: - 브라우저에서 직접 해당 URL 접근이 가능한지 확인해보세요.');
                console.error('디버깅: - 백엔드 서버가 실행 중이고 해당 포트가 열려있는지 확인해보세요.');
                console.error('디버깅: - package.json의 프록시 설정을 확인하세요:', '"proxy": "http://127.0.0.1:5000"');
                
                // 직접 백엔드 서버 URL 확인 요청
                console.log('디버깅: 서버 URL을 다시 확인해보세요. 현재 서버 URL:', API_BASE_URL);
                console.log('디버깅: 올바른 URL 형식 예시: http://localhost:5000/api 또는 /api (프록시 사용 시)');
              }
              
              setError(`설정 파일 업로드에 실패했습니다: ${errorMessage}`);
            }
          } else {
            setError('설정 파일 업로드에 실패했습니다: 알 수 없는 오류');
          }
          
          setUploadStatus('failed');
        }
      }
    } catch (err) {
      console.error('파일 업로드 오류:', err);
      
      // 오류 객체의 전체 구조 로깅
      console.error('오류 객체 구조:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      
      // 상세한 에러 메시지 표시
      if (err instanceof Error) {
        // Axios 에러인지 확인 (response 속성이 있는지로 판단)
        const axiosError = err as AxiosCustomError;
        if (axiosError.response) {
          const errorMessage = axiosError.response.data?.message || axiosError.message;
          const statusCode = axiosError.response.status;
          console.error(`HTTP 에러 (${statusCode}):`, errorMessage);
          setError(`설정 파일 업로드에 실패했습니다 (${statusCode}): ${errorMessage}`);
        } else {
          // 네트워크 오류 처리 개선
          let errorMessage = err.message;
          
          if (errorMessage === 'Network Error') {
            errorMessage = '네트워크 오류: 서버에 연결할 수 없습니다. 다음을 확인해보세요:\n' + 
              '1. 백엔드 서버가 실행 중인지\n' +
              '2. CORS 설정이 올바른지\n' +
              '3. API 엔드포인트 주소가 올바른지';
            
            console.error('네트워크 오류 상세 디버깅:');
            console.error('- API URL:', uploadUrl);
            console.error('- 브라우저에서 직접 해당 URL 접근이 가능한지 확인해보세요.');
            console.error('- 백엔드 서버가 실행 중이고 해당 포트가 열려있는지 확인해보세요.');
            
            // 직접 백엔드 서버 URL 확인 요청
            console.log('서버 URL을 다시 확인해보세요. 현재 서버 URL:', API_BASE_URL);
            console.log('올바른 URL 형식 예시: http://localhost:5000/api 또는 /api (프록시 사용 시)');
          }
          
          setError(`설정 파일 업로드에 실패했습니다: ${errorMessage}`);
        }
      } else {
        setError('설정 파일 업로드에 실패했습니다: 알 수 없는 오류');
      }
      
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
        
        await axiosInstance.delete(`/openvpn/connection/${connectionId}`, getRequestConfig());
        
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
      
      console.log('디버깅: 연결 요청 데이터:', data);
      
      await axiosInstance.post('/openvpn/connect', data, getRequestConfig());
      
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
      
      // 연결 상태 확인을 위한 타이머 설정
      let checkCount = 0;
      const maxChecks = 30; // 30번 확인 (약 1분)
      
      const checkConnectionStatus = async () => {
        try {
          const response = await axiosInstance.get<OpenVPNStatusResponse>(
            `/openvpn/status?connection_id=${connectionId}`,
            getRequestConfig()
          );
          
          const connection = response.data.connections?.find(conn => conn.id === connectionId);
          
          if (connection) {
            console.log(`디버깅: 연결 상태 확인 (${checkCount+1}/${maxChecks}):`, connection.status);
            
            // 연결 상태에 따라 업데이트
            if (connection.status === 'connected') {
              setMessage('VPN이 성공적으로 연결되었습니다.');
              setConnections(prevConnections => 
                prevConnections.map(conn => 
                  conn.id === connectionId ? { ...connection } : conn
                )
              );
              return; // 연결 성공 시 타이머 종료
            } else if (connection.status === 'failed') {
              // 실패 메시지 처리 개선
              const errorMessage = connection.last_error || '알 수 없는 오류';
              let userFriendlyError = errorMessage;
              
              // 일반적인 오류 패턴에 대한 사용자 친화적 메시지 추가
              if (errorMessage.includes("CERTIFICATE")) {
                userFriendlyError = 'OpenVPN 인증서 오류: 업로드된 .ovpn 파일에 유효한 인증서가 없습니다.';
              } else if (errorMessage.includes("Permission denied")) {
                userFriendlyError = '권한 오류: 서버에서 OpenVPN을 실행할 권한이 없습니다.';
              } else if (errorMessage.includes("command not found")) {
                userFriendlyError = 'OpenVPN이 서버에 설치되어 있지 않거나 경로가 올바르지 않습니다.';
              }
              
              setError(`VPN 연결에 실패했습니다: ${userFriendlyError}`);
              setActiveConnectionId(null);
              setConnections(prevConnections => 
                prevConnections.map(conn => 
                  conn.id === connectionId ? { ...connection } : conn
                )
              );
              return; // 연결 실패 시 타이머 즉시 종료
            } else if (connection.status === 'disconnected') {
              setMessage('VPN 연결이 종료되었습니다.');
              setActiveConnectionId(null);
              setConnections(prevConnections => 
                prevConnections.map(conn => 
                  conn.id === connectionId ? { ...connection } : conn
                )
              );
              return; // 이미 종료된 경우 타이머 종료
            }
          }
          
          checkCount++;
          
          // 최대 확인 횟수 초과 시 타임아웃 처리
          if (checkCount >= maxChecks) {
            setError('VPN 연결 시간이 초과되었습니다. 연결 상태를 확인할 수 없습니다.');
            fetchConnections(); // 최종 상태 확인을 위한 연결 목록 갱신
            return;
          }
          
          // 2초 후에 다시 확인
          setTimeout(checkConnectionStatus, 2000);
          
        } catch (err) {
          console.error('연결 상태 확인 오류:', err);
          setError('연결 상태를 확인하는 중 오류가 발생했습니다.');
          setActiveConnectionId(null);
        }
      };
      
      // 첫 번째 상태 확인은 2초 후에 시작
      setTimeout(checkConnectionStatus, 2000);
      
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
      setError('');
      
      console.log('디버깅: VPN 연결 해제 요청:', connectionId);
      console.log('디버깅: API_BASE_URL:', API_BASE_URL);
      
      // 요청 데이터와 URL 명시적 로깅
      const requestUrl = `/openvpn/disconnect`;
      const requestData = { connection_id: connectionId };
      const requestConfig = getRequestConfig();
      
      console.log('디버깅: 요청 URL:', requestUrl);
      console.log('디버깅: 요청 데이터:', requestData);
      console.log('디버깅: 요청 설정:', requestConfig);
      
      // 요청 전송
      const response = await axiosInstance.post(
        requestUrl, 
        requestData,
        requestConfig
      );
      
      console.log('디버깅: 서버 응답:', response.data);
      
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
      
      // 연결 상태 확인을 위한 타이머 설정
      let checkCount = 0;
      const maxChecks = 10; // 10번 확인 (약 20초)
      
      const checkDisconnectStatus = async () => {
        try {
          const response = await axiosInstance.get<OpenVPNStatusResponse>(
            `/openvpn/status?connection_id=${connectionId}`,
            getRequestConfig()
          );
          
          const connection = response.data.connections?.find(conn => conn.id === connectionId);
          
          if (connection) {
            console.log(`디버깅: 연결 해제 상태 확인 (${checkCount+1}/${maxChecks}):`, connection.status);
            
            // 연결 상태에 따라 업데이트
            if (connection.status === 'disconnected') {
              setMessage('VPN 연결이 종료되었습니다.');
              setConnections(prevConnections => 
                prevConnections.map(conn => 
                  conn.id === connectionId ? { ...connection } : conn
                )
              );
              return; // 연결 해제 성공 시 타이머 종료
            } else if (connection.status === 'failed') {
              setError(`VPN 연결 해제에 실패했습니다: ${connection.last_error || '알 수 없는 오류'}`);
              setConnections(prevConnections => 
                prevConnections.map(conn => 
                  conn.id === connectionId ? { ...connection } : conn
                )
              );
              return; // 연결 해제 실패 시 타이머 종료
            }
          }
          
          checkCount++;
          
          // 최대 확인 횟수 초과 시 타임아웃 처리
          if (checkCount >= maxChecks) {
            // 연결 상태를 다시 한번 새로고침
            fetchConnections();
            return;
          }
          
          // 2초 후에 다시 확인
          setTimeout(checkDisconnectStatus, 2000);
          
        } catch (err) {
          console.error('연결 해제 상태 확인 오류:', err);
          setError('연결 해제 상태를 확인하는 중 오류가 발생했습니다.');
        }
      };
      
      // 첫 번째 상태 확인은 2초 후에 시작
      setTimeout(checkDisconnectStatus, 2000);
      
    } catch (err) {
      console.error('VPN 연결 해제 오류:', err);
      setError('VPN 연결 해제에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // TryHackMe 안내 섹션
  const renderTryHackMeGuide = () => (
    <div className="tryhackme-guide">
      <h3>TryHackMe VPN 설정 가이드</h3>
      <ol>
        <li>
          <a href="https://tryhackme.com/" target="_blank" rel="noopener noreferrer">
            TryHackMe 웹사이트
          </a>에 가입하고 로그인합니다.
        </li>
        <li>
          <a href="https://tryhackme.com/access" target="_blank" rel="noopener noreferrer">
            액세스 페이지
          </a>로 이동합니다.
        </li>
        <li>운영체제에 맞는 OpenVPN 설정 파일을 다운로드합니다.</li>
        <li>다운로드한 .ovpn 파일을 아래 폼을 통해 업로드합니다.</li>
        <li>TryHackMe 사용자 이름과 비밀번호를 입력한 후 연결합니다.</li>
        <li>연결이 완료되면 TryHackMe의 실습 환경에 접속할 수 있습니다.</li>
        <li><strong>참고:</strong> 업로드한 파일은 자동으로 계정과 연결되어 저장됩니다.</li>
      </ol>
    </div>
  );

  // 연결 상태에 따른 CSS 클래스 반환
  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'connected': return 'status-connected';
      case 'connecting': return 'status-connecting';
      case 'disconnected': return 'status-disconnected';
      case 'failed': return 'status-failed';
      case 'uploaded': return 'status-uploaded';
      default: return 'status-unknown';
    }
  };

  // 상태 텍스트 반환 함수
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'connected': return '연결됨';
      case 'connecting': return '연결 중...';
      case 'disconnected': return '연결 해제됨';
      case 'failed': return '연결 실패';
      case 'uploaded': return '업로드됨';
      case 'error': return '오류 발생';
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

      {renderTryHackMeGuide()}

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
          <ul>
            {connections.map((connection) => (
              <li key={connection.id} className={`connection-item ${getStatusClass(connection.status)}`}>
                <div className="connection-info">
                  <div className="connection-name">{connection.name}</div>
                  {connection.description && (
                    <div className="connection-description">{connection.description}</div>
                  )}
                  <div className="connection-status">
                    상태: {getStatusText(connection.status)}
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
                    <button
                      onClick={() => handleConnect(connection.id)}
                      disabled={isLoading || activeConnectionId !== null}
                      className="connect-btn"
                    >
                      연결
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDisconnect(connection.id)}
                      disabled={isLoading || connection.status === 'disconnected'}
                      className="disconnect-btn"
                    >
                      연결 해제
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(connection.id)}
                    disabled={isLoading}
                    className="delete-btn"
                  >
                    삭제
                  </button>
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