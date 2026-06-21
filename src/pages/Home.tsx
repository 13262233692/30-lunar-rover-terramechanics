import { Scene } from '../components/Scene';
import { ControlPanel } from '../components/ControlPanel';
import { Dashboard } from '../components/Dashboard';
import { useSimulationStore } from '../store/simulationStore';
import { useEffect } from 'react';

export default function Home() {
  const isRunning = useSimulationStore(s => s.isRunning);
  const setIsRunning = useSimulationStore(s => s.setIsRunning);
  const sceneType = useSimulationStore(s => s.sceneType);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRunning(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [setIsRunning]);

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{
      background: sceneType === 'lunar' ? '#0a0e17' : '#1a0a04',
    }}>
      <Scene />
      <ControlPanel />
      <Dashboard />

      {!isRunning && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="text-4xl font-mono font-bold tracking-widest text-cyan-400" style={{
                fontFamily: 'Orbitron, monospace',
                textShadow: '0 0 20px rgba(0,229,255,0.5), 0 0 40px rgba(0,229,255,0.2)',
              }}>
                EXTRATERRESTRIAL ROVER
              </div>
              <div className="text-lg font-mono tracking-[0.3em] text-cyan-400/60 mt-2" style={{
                fontFamily: 'Orbitron, monospace',
              }}>
                TERRAMECHANICS SANDBOX
              </div>
            </div>
            <div className="w-48 h-0.5 mx-auto bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
            <div className="text-sm text-white/40 font-mono animate-pulse">
              初始化推演引擎...
            </div>
            <div className="flex justify-center gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-cyan-400/60"
                  style={{
                    animation: 'pulse 1.5s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-black/50 backdrop-blur-md border border-white/10 rounded-full px-4 py-2">
        <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/10 text-white/50 border border-white/10">W</kbd>
        <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/10 text-white/50 border border-white/10">A</kbd>
        <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/10 text-white/50 border border-white/10">S</kbd>
        <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/10 text-white/50 border border-white/10">D</kbd>
        <span className="text-[9px] text-white/30 font-mono">移动漫游车</span>
      </div>
    </div>
  );
}
