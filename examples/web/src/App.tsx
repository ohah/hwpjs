import { useEffect, useState } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';
import * as hwpjs from '@ohah/hwpjs';

function App() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const loadHwpFile = async () => {
      const arrayBuffer = await fetch('./noori.hwp').then((res) => res.arrayBuffer());
      const result: number[] = Array.from(new Uint8Array(arrayBuffer));
      console.log('hwpjs', result);
      const result2 = hwpjs.parseHwp(result);
      console.log('parsed', result2);
    };
    loadHwpFile();
  }, []);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>count is {count}</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">Click on the Vite and React logos to learn more</p>
    </>
  );
}

export default App;
