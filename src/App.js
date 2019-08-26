import React, { useRef, useState, useEffect } from 'react';
import './App.css';
import { BrowserRouter, Route, Switch } from "react-router-dom";
import FractalCanvas from './components/FractalCanvas';
import SideDrawer from './components/SideDrawer';

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
      <BrowserRouter>
        <Switch>
          <Route path='/:algorithm([a-z]+)?/:loc(@[\-\d\.\,xX]+)?' component={props =>
            <FractalCanvas props={props.match.params} query={props.location.search} width={canvasSize.width} height={canvasSize.height}></FractalCanvas>
          }></Route>
        </Switch>
      </BrowserRouter>
    </div>
  );
}

export default App;
