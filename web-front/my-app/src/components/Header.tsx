import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState } from '../store';
import { logout } from '../store/authSlice';
import './Header.css';

interface HeaderProps {
  onMenuItemClick: (view: 'main' | 'scan') => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuItemClick }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.auth);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const handleGuestMode = () => {
    navigate('/');
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <h1>PortSookhee</h1>
        </div>
        <nav className="nav-menu">
          <button onClick={() => onMenuItemClick('main')}>홈</button>
          <button onClick={() => onMenuItemClick('scan')}>스캔</button>
        </nav>
        <div className="user-menu">
          {user ? (
            <>
              <span className="username">{user.username}</span>
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