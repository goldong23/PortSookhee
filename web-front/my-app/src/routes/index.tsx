import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import AuthLayout from '../layouts/AuthLayout';
import MainLayout from '../layouts/MainLayout';
import Login from '../components/auth/Login';
import Register from '../components/auth/Register';
import Topology, { NodeData } from '../components/topology/Topology';
import ScanForm from '../components/topology/ScanForm';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const AppRoutes: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);

  return (
    <Routes>
      {/* 인증 관련 라우트 */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      {/* 메인 레이아웃 라우트 */}
      <Route element={<MainLayout />}>
        <Route path="/" element={
          <PrivateRoute>
            <Topology onNodeSelect={setSelectedNode} />
          </PrivateRoute>
        } />
        <Route path="/scan" element={
          <PrivateRoute>
            <ScanForm />
          </PrivateRoute>
        } />
      </Route>

      {/* 기본 리다이렉트 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes; 