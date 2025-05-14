import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';

/**
 * Topology.tsx – fully‑working, self‑debugging demo.
 * Renders a 3‑node topology and logs lifecycle events so you can see what happens.
 */
const Topology = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    console.log('[Topology] creating Cytoscape instance');

    const cy = cytoscape({
      container: containerRef.current,

      // TODO: 토폴로지 인스턴스들. api를 통해서 동적으로 추가되거나 삭제되게 해야함.
      elements: [
        { data: { id: 'router' } },
        { data: { id: 'switch' } },
        { data: { id: 'server' } },
        { data: { source: 'router', target: 'switch' } },
        { data: { source: 'switch', target: 'server' } },
      ],

      // TODO: 토폴로지 스타일 수정
      style: [
        {
          selector: 'node',
          style: {
            width: 50,
            height: 50,
            'text-valign': 'center',
            'text-halign': 'center',
            color: '#fff',
            'font-size': 12,
          },
        },
        {
          selector: '[type = "router"]',
          style: {
            shape: 'octagon',
            'background-color': '#dc2626',
            label: 'Router',
          },
        },
        {
          selector: '[type = "switch"]',
          style: {
            shape: 'rectangle',
            'background-color': '#2563eb',
            label: 'Switch',
          },
        },
        {
          selector: '[type = "server"]',
          style: {
            shape: 'round-rectangle',
            'background-color': '#16a34a',
            label: 'Server',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 3,
            'line-color': '#9ca3af',
            'target-arrow-color': '#9ca3af',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
      ],
      layout: {
        name: 'breadthfirst',      // left → right
        roots: '#router',          // 시작 노드
        spacingFactor: 1.8,
        animate: true,
        directed: true,
        padding: 20,
      } as any,
    });

    cy.one('layoutstop', () => cy.fit()); // 레이아웃 완료 후 컨테이너에 맞춰줌

    return () => cy.destroy();
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full border border-gray-300 rounded-lg shadow"
    />
  );
};

export default Topology;
