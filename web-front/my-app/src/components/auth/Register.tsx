import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { setCredentials } from '../../store/authSlice';
import axios from 'axios';
import './Register.css';

interface RegisterResponse {
  message?: string;
  user?: {
    id?: string;
    username?: string;
    role?: string;
    _id?: string; // MongoDB ID 대응
  };
  token?: string;
}

interface ErrorResponse {
  message?: string;
  error?: string;
}

const Register = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // API 주소 결정
      const apiUrl = process.env.REACT_APP_API_BASE_URL 
        ? `${process.env.REACT_APP_API_BASE_URL}/auth/register` 
        : '/api/auth/register';
      
      console.log('회원가입 API 요청 주소:', apiUrl);
      console.log('회원가입 요청 데이터:', { username, email, password });
      
      // Axios로 요청
      const response = await axios.post<RegisterResponse>(apiUrl, { 
        username,
        email,
        password 
      });
      
      console.log('회원가입 성공 응답:', response.data);
      
      // 사용자 데이터 추출 - 다양한 응답 구조 대응
      const userData = response.data.user || {};
      const userId = userData.id || userData._id || `temp-${Date.now()}`;
      const userRole = userData.role || 'user';
      const responseToken = response.data.token || '';
      
      // 사용자 데이터를 Redux 스토어에 저장
      dispatch(setCredentials({ 
        user: {
          id: String(userId),
          username: userData.username || username,
          email: email,
        }, 
        token: responseToken
      }));
      
      // 성공 시 홈으로 이동
      console.log('회원가입 성공, 홈으로 이동');
      navigate('/');
    } catch (err: any) {
      console.error('회원가입 오류:', err);
      
      // 오류 응답 처리
      if (err.response) {
        const errData = err.response.data;
        console.log('백엔드 오류 응답:', errData);
        const errMessage = 
          errData?.message || 
          errData?.error || 
          errData?.detail || 
          '회원가입에 실패했습니다.';
        setError(errMessage);
      } else if (err.request) {
        setError('서버 응답이 없습니다. 네트워크 연결을 확인하세요.');
      } else {
        setError('회원가입 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="register-container">
      <form onSubmit={handleSubmit} className="register-form">
        <h2>회원가입</h2>
        {error && <div className="error-message">{error}</div>}
        <div className="form-group">
          <label htmlFor="username">사용자 이름</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">이메일</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">비밀번호</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword">비밀번호 확인</label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        <button type="submit" disabled={isLoading}>
          {isLoading ? '처리 중...' : '회원가입'}
        </button>
        <button type="button" className="back-button" onClick={() => navigate('/login')} disabled={isLoading}>
          로그인으로 돌아가기
        </button>
      </form>
    </div>
  );
};

export default Register; 