import React from 'react';
import './App.css';
import FractalCanvas from './components/FractalCanvas';

function App() {

  return (
    <div className="App">
      <FractalCanvas width={800} height={600}></FractalCanvas>
    </div>
  );
}

export default App;
