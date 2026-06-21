import { useSimulationStore } from '../store/simulationStore';
import { SceneType } from '../store/types';
import {
  ChevronLeft, ChevronRight, Play, Square, RotateCcw,
  Globe, Settings, Gauge
} from 'lucide-react';

export function ControlPanel() {
  const showPanel = useSimulationStore(s => s.showPanel);
  const togglePanel = useSimulationStore(s => s.togglePanel);
  const sceneType = useSimulationStore(s => s.sceneType);
  const setSceneType = useSimulationStore(s => s.setSceneType);
  const soilParams = useSimulationStore(s => s.soilParams);
  const setSoilParams = useSimulationStore(s => s.setSoilParams);
  const wheelParams = useSimulationStore(s => s.wheelParams);
  const setAllWheelParams = useSimulationStore(s => s.setAllWheelParams);
  const isRunning = useSimulationStore(s => s.isRunning);
  const startSimulation = useSimulationStore(s => s.setIsRunning);
  const resetSimulation = useSimulationStore(s => s.resetSimulation);

  if (!showPanel) {
    return (
      <button
        onClick={togglePanel}
        className="absolute top-4 left-4 z-20 bg-black/60 backdrop-blur-md border border-cyan-500/30 rounded-lg p-2 text-cyan-400 hover:bg-cyan-500/20 transition-all"
      >
        <ChevronRight size={18} />
      </button>
    );
  }

  return (
    <div className="absolute top-4 left-4 z-20 w-80 bg-black/70 backdrop-blur-xl border border-cyan-500/20 rounded-xl overflow-hidden shadow-2xl shadow-cyan-900/20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-900/30 to-transparent">
        <div className="flex items-center gap-2">
          <Settings size={14} className="text-cyan-400" />
          <span className="text-cyan-300 text-xs font-mono tracking-widest uppercase">Terramechanics Control Panel</span>
        </div>
        <button onClick={togglePanel} className="text-cyan-400 hover:text-cyan-300 transition-colors">
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Globe size={12} className="text-cyan-400" />
            <span className="text-[10px] text-cyan-400/80 font-mono uppercase tracking-wider">Celestial Body</span>
          </div>
          <div className="flex gap-2">
            {(['lunar', 'mars'] as SceneType[]).map(type => (
              <button
                key={type}
                onClick={() => setSceneType(type)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-all ${
                  sceneType === type
                    ? type === 'lunar'
                      ? 'bg-gray-500/40 text-gray-200 border border-gray-400/50 shadow-lg shadow-gray-500/20'
                      : 'bg-orange-600/40 text-orange-200 border border-orange-400/50 shadow-lg shadow-orange-500/20'
                    : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                }`}
              >
                {type === 'lunar' ? 'Lunar (Moon)' : 'Mars'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] text-cyan-400/80 font-mono uppercase tracking-wider">Soil Parameters (Regolith)</span>
          {[
            { key: 'phi', label: 'Friction Angle φ', min: 0.3, max: 1.1, step: 0.01, unit: 'rad' },
            { key: 'c', label: 'Cohesion c', min: 0, max: 2000, step: 10, unit: 'Pa' },
            { key: 'k_c', label: 'Cohesion Mod k_c', min: 0, max: 5000, step: 50, unit: 'N/m^n' },
            { key: 'k_phi', label: 'Friction Mod k_φ', min: 0, max: 5000000, step: 10000, unit: 'N/m^{n+1}' },
            { key: 'K', label: 'Shear Mod K', min: 0.001, max: 0.1, step: 0.001, unit: 'm' },
            { key: 'n', label: 'Sinkage Exp n', min: 0.5, max: 2.0, step: 0.05, unit: '' },
            { key: 'rho', label: 'Density ρ', min: 500, max: 3000, step: 10, unit: 'kg/m³' },
          ].map(param => (
            <div key={param.key} className="space-y-0.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-white/50 font-mono">{param.label}</span>
                <span className="text-[10px] text-cyan-400 font-mono">
                  {(soilParams as any)[param.key]?.toFixed(param.step < 0.01 ? 3 : param.step < 1 ? 2 : 0)} {param.unit}
                </span>
              </div>
              <input
                type="range"
                min={param.min}
                max={param.max}
                step={param.step}
                value={(soilParams as any)[param.key]}
                onChange={e => setSoilParams({ [param.key]: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <span className="text-[10px] text-cyan-400/80 font-mono uppercase tracking-wider">Wheel Parameters (Mesh Wheel)</span>
          {[
            { key: 'radius', label: 'Wheel Radius', min: 0.05, max: 0.5, step: 0.005, unit: 'm' },
            { key: 'width', label: 'Wheel Width', min: 0.02, max: 0.4, step: 0.005, unit: 'm' },
            { key: 'openRatio', label: 'Open Ratio (Mesh)', min: 0, max: 0.8, step: 0.05, unit: '' },
            { key: 'load', label: 'Vertical Load W', min: 10, max: 500, step: 5, unit: 'N' },
          ].map(param => (
            <div key={param.key} className="space-y-0.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-white/50 font-mono">{param.label}</span>
                <span className="text-[10px] text-cyan-400 font-mono">
                  {(wheelParams[0] as any)[param.key]?.toFixed(param.step < 1 ? 3 : 0)} {param.unit}
                </span>
              </div>
              <input
                type="range"
                min={param.min}
                max={param.max}
                step={param.step}
                value={(wheelParams[0] as any)[param.key]}
                onChange={e => setAllWheelParams({ [param.key]: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => startSimulation(!isRunning)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-mono uppercase tracking-wider transition-all ${
              isRunning
                ? 'bg-red-500/30 text-red-300 border border-red-400/40 hover:bg-red-500/40'
                : 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/40 hover:bg-cyan-500/40'
            }`}
          >
            {isRunning ? <Square size={12} /> : <Play size={12} />}
            {isRunning ? 'Stop' : 'Start'}
          </button>
          <button
            onClick={resetSimulation}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-mono uppercase tracking-wider bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/80 transition-all"
            title="Reset Simulation"
          >
            <RotateCcw size={12} />
          </button>
        </div>

        <div className="pt-2 border-t border-white/5">
          <div className="text-[10px] text-white/30 font-mono space-y-0.5 leading-relaxed">
            <div className="text-cyan-400/60 mb-1">Keyboard Controls:</div>
            <div>WASD / Arrow Keys - Drive rover</div>
            <div>Mouse Drag - Rotate camera</div>
            <div>Scroll Wheel - Zoom in/out</div>
            <div>RMB Drag - Pan camera</div>
          </div>
        </div>
      </div>
    </div>
  );
}
