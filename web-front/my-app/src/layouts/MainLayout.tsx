import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import Header from '../components/Header';
import { NodeData } from '../components/topology/Topology';
import './MainLayout.css';

const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [currentView, setCurrentView] = useState<'main' | 'scan' | 'features' | 'marketplace' | 'company'>('main');

  const handleMenuItemClick = (view: 'main' | 'scan' | 'features' | 'marketplace' | 'company') => {
    setCurrentView(view);
    if (view === 'scan') {
      navigate('/scan');
    } else {
      navigate('/');
    }
  };

  return (
    <div className="main-layout">
      <Header onMenuItemClick={handleMenuItemClick} />
      <main className="main-content">
        {currentView === 'main' && (
          <div className="main-view-content">
            <div className="topology-area">
              <Outlet />
            </div>
          </div>
        )}
        {currentView === 'scan' && (
          <div className="scan-view-content">
            <h2 className="view-heading">스캔</h2>
            <Outlet />
          </div>
        )}
        {currentView === 'features' && (
          <div className="features-view-content">
            <h2 className="view-heading">기능</h2>
            <p>기능 페이지 내용이 여기에 표시됩니다.</p>
          </div>
        )}
        {currentView === 'marketplace' && (
          <div className="marketplace-view-content">
            <h2 className="view-heading">마켓플레이스</h2>
            <p>마켓플레이스 페이지 내용이 여기에 표시됩니다.</p>
          </div>
        )}
        {currentView === 'company' && (
          <div className="company-view-content">
            <h2 className="view-heading">회사 정보</h2>
            <p>회사 정보 페이지 내용이 여기에 표시됩니다.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default MainLayout; 