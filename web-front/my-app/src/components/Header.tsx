import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState } from '../store';
import { logout } from '../store/authSlice';
import './Header.css';

interface HeaderProps {
  onMenuItemClick: (view: 'main' | 'scan' | 'vpn' | 'test') => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuItemClick }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.auth);
  
  // 실제 로그인한 회원인지 확인
  const isLoggedInMember = user && !user.isGuest;

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const handleGuestMode = () => {
    navigate('/');
  };

  const handleVpnClick = () => {
    // 실제 회원만 VPN 페이지로 이동
    if (isLoggedInMember) {
      navigate('/vpn');
    } else {
      // 알림만 표시하고 페이지 이동은 하지 않음
      alert('VPN 기능은 로그인 후 사용 가능합니다.');
    }
  };
  
  const handleTestClick = () => {
    navigate('/test');
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <h1>PortSookhee</h1>
        </div>
        <nav className="nav-menu nav-center">
          <button onClick={() => onMenuItemClick('main')}>홈</button>
          <button onClick={() => onMenuItemClick('scan')}>스캔</button>
          
          {isLoggedInMember ? (
            // 로그인한 사용자용 VPN 버튼
            <button onClick={handleVpnClick} className="vpn-button">
              OpenVPN
            </button>
          ) : (
            // 비로그인 사용자 또는 비회원용 비활성화 버튼
            <button 
              onClick={handleVpnClick} 
              className="vpn-button-disabled"
            >
              OpenVPN
              <span className="login-required-text">로그인 필요</span>
            </button>
          )}
          
          <button onClick={handleTestClick} className="test-button">
            API 테스트
          </button>
        </nav>
        <div className="user-menu">
          {user ? (
            <>
              <div className="username-container">
                {user.username}
                {user.isGuest && <span className="guest-badge">(비회원)</span>}
              </div>
              <button onClick={handleLogout} className="logout-button">
                로그아웃
              </button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('/login')} className="login-button">
                로그인
              </button>
              <button onClick={handleGuestMode} className="guest-button">
                비회원으로 계속하기
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header; 