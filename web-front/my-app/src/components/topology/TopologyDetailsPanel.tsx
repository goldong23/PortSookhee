import React from 'react';
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
  if (!selectedNode) {
    return (
      <div className="topology-details-panel">
        <p>노드를 선택하여 상세 정보를 확인하세요.</p>
      </div>
    );
  }

  return (
    <div className="topology-details-panel">
      <h3>{selectedNode.name}</h3>
      <div className="details-section">
        <p><strong>ID:</strong> {selectedNode.id}</p>
        <p><strong>Type:</strong> {selectedNode.type}</p>
        {selectedNode.ip && <p><strong>IP:</strong> {selectedNode.ip}</p>}
      </div>
      
      {selectedNode.vulnerabilities && selectedNode.vulnerabilities.length > 0 && (
        <div className="vulnerabilities-section">
          <h4>취약점</h4>
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
  );
};

export default TopologyDetailsPanel; 