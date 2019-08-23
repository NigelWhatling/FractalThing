import React, { useRef, useState, useEffect } from 'react';
import './App.css';
import FractalCanvas from './components/FractalCanvas';

function App() {

  const outerDivRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const resizeTimerRef = useRef(null);

  useEffect(() => {

    const handleResize = (e) => {
      if (resizeTimerRef.current) return;
      resizeTimerRef.current = setTimeout(() => {
        setCanvasSize({ width: window.innerWidth, height: window.innerHeight });
        resizeTimerRef.current = null;
      }, 500);
    };

    setCanvasSize({ width: window.innerWidth, height: window.innerHeight });

    window.addEventListener('resize', handleResize);
    return (() => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    });

  }, [outerDivRef]);

  return (
    <div className="App" ref={outerDivRef}>
      <FractalCanvas width={canvasSize.width} height={canvasSize.height} step={0}></FractalCanvas>
    </div>
  );
}

export default App;
