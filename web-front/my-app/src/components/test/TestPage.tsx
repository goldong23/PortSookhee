import React, { useState } from 'react';
import axios from 'axios';

interface ApiResult {
  success: boolean;
  data?: any;
  error?: string;
}

// API 테스트 유형
type TestType = 'general' | 'virtualFit';

const TestPage: React.FC = () => {
  const [testType, setTestType] = useState<TestType>('general');
  
  // 일반 API 테스트 상태
  const [apiUrl, setApiUrl] = useState<string>('');
  const [method, setMethod] = useState<string>('GET');
  
  // Virtual Fit API 테스트 상태
  const [apiKey, setApiKey] = useState<string>('');
  const [modelImageUrl, setModelImageUrl] = useState<string>('https://segmind-sd-models.s3.amazonaws.com/display_images/model.png');
  const [clothImageUrl, setClothImageUrl] = useState<string>('https://segmind-sd-models.s3.amazonaws.com/display_images/cloth.jpg');
  const [category, setCategory] = useState<string>('Upper body');
  
  // 공통 상태
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 일반 API 호출 핸들러
  const handleGeneralApiCall = async () => {
    if (!apiUrl) {
      setError('API URL을 입력해주세요');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let response;
      
      if (method === 'GET') {
        response = await axios.get(apiUrl);
      } else if (method === 'POST') {
        response = await axios.post(apiUrl);
      } else {
        throw new Error('지원하지 않는 HTTP 메서드입니다');
      }

      setResult({
        success: true,
        data: response.data
      });
    } catch (err: any) {
      setError(err.message || '알 수 없는 오류가 발생했습니다');
      setResult({
        success: false,
        error: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  // Virtual Fit API 호출 핸들러
  const handleVirtualFitCall = async () => {
    if (!apiKey.trim()) {
      setError('API Key를 입력해주세요');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 백엔드 API 엔드포인트 - 통합된 백엔드 서버 URL 사용
      const backendUrl = '/api/virtual-fit/try-on';
      
      const response = await axios.post(backendUrl, {
        api_key: apiKey,
        model_image: modelImageUrl,
        cloth_image: clothImageUrl,
        category: category,
        num_inference_steps: 35,
        guidance_scale: 2,
        seed: Math.floor(Math.random() * 1000000),
      });

      setResult({
        success: true,
        data: response.data
      });
    } catch (err: any) {
      setError(err.message || '알 수 없는 오류가 발생했습니다');
      if (err.response) {
        setResult({
          success: false,
          error: `상태 코드: ${err.response.status}, 메시지: ${JSON.stringify(err.response.data)}`
        });
      } else {
        setResult({
          success: false,
          error: err.message
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      padding: '20px', 
      maxWidth: '800px', 
      margin: '0 auto' 
    }}>
      <h1>API 테스트</h1>
      
      <div style={{ 
        display: 'flex', 
        marginBottom: '20px', 
        gap: '10px' 
      }}>
        <button 
          style={{ 
            padding: '8px 16px', 
            backgroundColor: testType === 'general' ? '#4CAF50' : '#f0f0f0',
            color: testType === 'general' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          onClick={() => setTestType('general')}
        >
          일반 API 테스트
        </button>
        <button 
          style={{ 
            padding: '8px 16px', 
            backgroundColor: testType === 'virtualFit' ? '#4CAF50' : '#f0f0f0',
            color: testType === 'virtualFit' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          onClick={() => setTestType('virtualFit')}
        >
          Virtual Fit API 테스트
        </button>
      </div>
      
      <div style={{ 
        border: '1px solid #ddd', 
        borderRadius: '8px', 
        padding: '20px',
        backgroundColor: '#f9f9f9' 
      }}>
        {testType === 'general' ? (
          // 일반 API 테스트 UI
          <div style={{ marginBottom: '20px' }}>
            <div>
              <label htmlFor="api-url">API URL:</label>
              <input
                id="api-url"
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://example.com/api"
                style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
              />
            </div>
            <div>
              <label htmlFor="method">HTTP 메서드:</label>
              <select
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                style={{ padding: '8px', marginBottom: '10px' }}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
            <button
              style={{
                padding: '10px 16px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                opacity: loading ? 0.7 : 1
              }}
              onClick={handleGeneralApiCall}
              disabled={loading}
            >
              {loading ? '요청 중...' : 'API 요청 보내기'}
            </button>
          </div>
        ) : (
          // Virtual Fit API 테스트 UI
          <div style={{ marginBottom: '20px' }}>
            <div>
              <label htmlFor="api-key">API Key:</label>
              <input
                id="api-key"
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="여기에 API 키를 입력하세요"
                style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
              />
            </div>
            <div>
              <label htmlFor="model-image">모델 이미지 URL:</label>
              <input
                id="model-image"
                type="text"
                value={modelImageUrl}
                onChange={(e) => setModelImageUrl(e.target.value)}
                style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
              />
            </div>
            <div>
              <label htmlFor="cloth-image">의류 이미지 URL:</label>
              <input
                id="cloth-image"
                type="text"
                value={clothImageUrl}
                onChange={(e) => setClothImageUrl(e.target.value)}
                style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
              />
            </div>
            <div>
              <label htmlFor="category">카테고리:</label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ padding: '8px', marginBottom: '10px' }}
              >
                <option value="Upper body">상의</option>
                <option value="Lower body">하의</option>
                <option value="Dress">드레스</option>
              </select>
            </div>
            <button
              style={{
                padding: '10px 16px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                opacity: loading ? 0.7 : 1
              }}
              onClick={handleVirtualFitCall}
              disabled={loading}
            >
              {loading ? '가상 피팅 생성 중...' : '가상 피팅 생성하기'}
            </button>
            <div style={{ 
              fontSize: '12px', 
              color: '#666', 
              marginTop: '10px' 
            }}>
              <p>* Segmind API 키가 필요합니다. <a href="https://www.segmind.com/" target="_blank" rel="noopener noreferrer">segmind.com</a>에서 키를 발급받으세요.</p>
            </div>
          </div>
        )}

        <div style={{ 
          marginTop: '20px',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          padding: '15px',
          backgroundColor: '#fff'
        }}>
          {error && (
            <div style={{
              backgroundColor: '#ffebee',
              color: '#c62828',
              padding: '10px',
              borderRadius: '4px',
              marginBottom: '10px'
            }}>
              <h3>오류 발생</h3>
              <p>{error}</p>
            </div>
          )}
          
          {result && (
            <div style={{ marginTop: '10px' }}>
              <h3>응답 결과</h3>
              
              {/* Virtual Fit API 응답에 이미지가 있는 경우 표시 */}
              {testType === 'virtualFit' && result.success && result.data?.data?.image && (
                <div style={{ marginBottom: '15px' }}>
                  <h4>생성된 이미지:</h4>
                  <img 
                    src={`data:image/png;base64,${result.data.data.image}`} 
                    alt="Virtual Fitting Result" 
                    style={{ maxWidth: '100%', marginBottom: '15px' }}
                  />
                </div>
              )}
              
              {/* API 응답 JSON */}
              <pre>{JSON.stringify(result.data, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestPage; 