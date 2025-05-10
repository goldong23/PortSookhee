import React from 'react';
import Header from './Page/Header/Header';
import Topology from './topology';

import './App.css';

function App() {
  return (
    <div>
      <Header />
      <h1 className="text-2xl font-bold mb-4">Network Topology Demo</h1>
      <Topology />
    </div>
  );
}

export default App;
