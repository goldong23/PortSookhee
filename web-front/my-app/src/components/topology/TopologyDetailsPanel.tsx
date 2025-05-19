import React, { useState } from 'react';
import { NodeData } from './Topology';
import './TopologyDetailsPanel.css';

interface Vulnerability {
  severity: 'high' | 'medium' | 'low';
  description: string;
  cve?: string;
}

interface TopologyDetailsPanelProps {
  selectedNode: NodeData | null;
}

const TopologyDetailsPanel: React.FC<TopologyDetailsPanelProps> = ({ selectedNode }) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'ports' | 'os' | 'scripts' | 'vulnerabilities'>('basic');

  if (!selectedNode) {
    return (
      <div className="topology-details-panel">
        <p>노드를 선택하여 상세 정보를 확인하세요.</p>
      </div>
    );
  }

  // 호스트 업타임 포맷팅
  const formatUptime = (seconds?: number): string => {
    if (!seconds) return '알 수 없음';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${days}일 ${hours}시간 ${minutes}분`;
  };

  return (
    <div className="topology-details-panel">
      <h3>{selectedNode.name}</h3>
      
      {/* 기본 정보 */}
      <div className="details-tabs">
        <button 
          className={activeTab === 'basic' ? 'active' : ''} 
          onClick={() => setActiveTab('basic')}
        >
          기본 정보
        </button>
        {selectedNode.nmapData?.ports && selectedNode.nmapData.ports.length > 0 && (
          <button 
            className={activeTab === 'ports' ? 'active' : ''} 
            onClick={() => setActiveTab('ports')}
          >
            포트 ({selectedNode.nmapData.ports.length})
          </button>
        )}
        {selectedNode.nmapData?.os && (
          <button 
            className={activeTab === 'os' ? 'active' : ''} 
            onClick={() => setActiveTab('os')}
          >
            OS
          </button>
        )}
        {selectedNode.nmapData?.scripts && selectedNode.nmapData.scripts.length > 0 && (
          <button 
            className={activeTab === 'scripts' ? 'active' : ''} 
            onClick={() => setActiveTab('scripts')}
          >
            스크립트
          </button>
        )}
        {selectedNode.vulnerabilities && selectedNode.vulnerabilities.length > 0 && (
          <button 
            className={activeTab === 'vulnerabilities' ? 'active' : ''} 
            onClick={() => setActiveTab('vulnerabilities')}
          >
            취약점
          </button>
        )}
      </div>
      
      <div className="tab-content">
        {/* 기본 정보 탭 */}
        {activeTab === 'basic' && (
          <div className="details-section">
            <p><strong>ID:</strong> {selectedNode.id}</p>
            <p><strong>유형:</strong> {selectedNode.type}</p>
            <p><strong>IP 주소:</strong> {selectedNode.ip || '알 수 없음'}</p>
            
            {selectedNode.nmapData && (
              <>
                {selectedNode.nmapData.hostname && (
                  <p><strong>호스트명:</strong> {selectedNode.nmapData.hostname}</p>
                )}
                {selectedNode.nmapData.mac && (
                  <p>
                    <strong>MAC 주소:</strong> {selectedNode.nmapData.mac}
                    {selectedNode.nmapData.macVendor && ` (${selectedNode.nmapData.macVendor})`}
                  </p>
                )}
                {selectedNode.nmapData.distance !== undefined && (
                  <p><strong>홉 수:</strong> {selectedNode.nmapData.distance}</p>
                )}
                {selectedNode.nmapData.uptime && (
                  <p>
                    <strong>가동 시간:</strong> {formatUptime(selectedNode.nmapData.uptime.seconds)}
                    {selectedNode.nmapData.uptime.lastBoot && ` (부팅 시각: ${selectedNode.nmapData.uptime.lastBoot})`}
                  </p>
                )}
                {selectedNode.nmapData.lastScanTime && (
                  <p><strong>마지막 스캔:</strong> {selectedNode.nmapData.lastScanTime}</p>
                )}
              </>
            )}
          </div>
        )}
        
        {/* 포트 정보 탭 */}
        {activeTab === 'ports' && selectedNode.nmapData?.ports && (
          <div className="ports-section">
            <div className="port-list">
              <table>
                <thead>
                  <tr>
                    <th>포트</th>
                    <th>프로토콜</th>
                    <th>상태</th>
                    <th>서비스</th>
                    <th>제품/버전</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedNode.nmapData.ports.map((port, index) => (
                    <tr key={index} className={port.state === 'open' ? 'port-open' : ''}>
                      <td>{port.port}</td>
                      <td>{port.protocol}</td>
                      <td>{port.state}</td>
                      <td>{port.service}</td>
                      <td>
                        {port.product && `${port.product}`}
                        {port.version && ` ${port.version}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* OS 정보 탭 */}
        {activeTab === 'os' && selectedNode.nmapData?.os && (
          <div className="os-section">
            <p><strong>OS명:</strong> {selectedNode.nmapData.os.name || '알 수 없음'}</p>
            {selectedNode.nmapData.os.version && (
              <p><strong>버전:</strong> {selectedNode.nmapData.os.version}</p>
            )}
            {selectedNode.nmapData.os.accuracy !== undefined && (
              <p><strong>정확도:</strong> {selectedNode.nmapData.os.accuracy}%</p>
            )}
            {selectedNode.nmapData.tcpSequence && (
              <>
                <h4>TCP 시퀀스 정보</h4>
                <p><strong>클래스:</strong> {selectedNode.nmapData.tcpSequence.class}</p>
                <p><strong>난이도:</strong> {selectedNode.nmapData.tcpSequence.difficulty}</p>
              </>
            )}
          </div>
        )}
        
        {/* 스크립트 실행 결과 탭 */}
        {activeTab === 'scripts' && selectedNode.nmapData?.scripts && (
          <div className="scripts-section">
            {selectedNode.nmapData.scripts.map((script, index) => (
              <div key={index} className="script-item">
                <h4>{script.name}</h4>
                <pre>{script.output}</pre>
              </div>
            ))}
          </div>
        )}
        
        {/* 취약점 탭 */}
        {activeTab === 'vulnerabilities' && selectedNode.vulnerabilities && selectedNode.vulnerabilities.length > 0 && (
          <div className="vulnerabilities-section">
            <ul>
              {selectedNode.vulnerabilities.map((vuln, index) => (
                <li key={index} className={`severity-${vuln.severity}`}>
                  <p><strong>심각도:</strong> {vuln.severity}</p>
                  <p><strong>설명:</strong> {vuln.description}</p>
                  {vuln.cve && <p><strong>CVE:</strong> {vuln.cve}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopologyDetailsPanel; 