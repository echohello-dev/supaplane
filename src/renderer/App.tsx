import { useCallback, useEffect, useMemo, useState } from 'react';
import { prepare, layout } from '@chenglou/pretext';

type Supaplane = {
  platform: string;
  versions: { electron: string; node: string };
};

declare global {
  interface Window {
    supaplane: Supaplane;
  }
}

function App() {
  const [text, setText] = useState('Supaplane');
  const [width, setWidth] = useState(300);

  const prepared = useMemo(() => prepare(text, 'bold 64px Inter'), [text]);
  const { height } = layout(prepared, width, 80);

  const handleResize = useCallback(() => setWidth(window.innerWidth * 0.8), []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    setWidth(window.innerWidth * 0.8);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  return (
    <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', color: '#e0e0e0', background: '#1a1a2e', minHeight: '100vh' }}>
      <h2 style={{ fontSize: 13, color: '#888', fontWeight: 400, letterSpacing: 1 }}>
        ELECTRON {window.supaplane?.versions.electron} / NODE {window.supaplane?.versions.node} / {window.supaplane?.platform.toUpperCase()}
      </h2>

      <div style={{ marginTop: 48 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          style={{
            fontSize: 18,
            padding: '8px 12px',
            background: '#16213e',
            border: '1px solid #333',
            borderRadius: 6,
            color: '#e0e0e0',
            width: 320,
          }}
          placeholder="type something..."
        />
      </div>

      <div style={{
        marginTop: 40,
        fontSize: 64,
        fontWeight: 700,
        color: '#7c3aed',
        width,
        lineHeight: '80px',
        wordBreak: 'break-word',
        borderBottom: '1px solid #333',
        paddingBottom: 16,
      }}>
        {text}
      </div>

      <div style={{ marginTop: 16, fontSize: 14, color: '#666', fontFamily: 'JetBrains Mono, monospace' }}>
        measured by pretext — {Math.round(width)}px wide &times; {height}px tall
      </div>
    </div>
  );
}

export { App };