import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom';
import './App.scss';
import FractalCanvas from './components/FractalCanvas';
import SideDrawer from './components/SideDrawer';

type WindowSize = {
  width: number;
  height: number;
};

const useWindowSize = (): WindowSize => {
  const [size, setSize] = useState<WindowSize>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const resizeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      if (resizeTimerRef.current !== null) {
        return;
      }
      resizeTimerRef.current = window.setTimeout(() => {
        setSize({ width: window.innerWidth, height: window.innerHeight });
        resizeTimerRef.current = null;
      }, 200);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }
    };
  }, []);

  return size;
};

const FractalRoute = () => {
  const { loc } = useParams();
  const { width, height } = useWindowSize();
  const [tileSize] = useState(256);

  return (
    <div className="App">
      <SideDrawer />
      <FractalCanvas loc={loc} width={width} height={height} tileSize={tileSize} />
    </div>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FractalRoute />} />
        <Route path="/:algorithm" element={<FractalRoute />} />
        <Route path="/:algorithm/:loc" element={<FractalRoute />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
