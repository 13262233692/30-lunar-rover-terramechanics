import { useSimulationStore } from '../store/simulationStore';
import { Gauge, ChevronRight, ChevronLeft } from 'lucide-react';

const WHEEL_LABELS = ['左前', '右前', '左中', '右中', '左后', '右后'];

function WheelCard({ index, sinkage, drawbarPull, slipRatio, motionResistance }: {
  index: number;
  sinkage: number;
  drawbarPull: number;
  slipRatio: number;
  motionResistance: number;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-cyan-400/80 font-mono uppercase">{WHEEL_LABELS[index]}</span>
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <div className="flex justify-between">
          <span className="text-[9px] text-white/30">沉陷</span>
          <span className="text-[9px] text-amber-400 font-mono">{(sinkage * 1000).toFixed(1)}mm</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] text-white/30">牵引力</span>
          <span className="text-[9px] text-emerald-400 font-mono">{drawbarPull.toFixed(1)}N</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] text-white/30">滑转率</span>
          <span className="text-[9px] text-sky-400 font-mono">{(slipRatio * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] text-white/30">阻力</span>
          <span className="text-[9px] text-red-400 font-mono">{motionResistance.toFixed(1)}N</span>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const showDashboard = useSimulationStore(s => s.showDashboard);
  const toggleDashboard = useSimulationStore(s => s.toggleDashboard);
  const wheelStates = useSimulationStore(s => s.wheelStates);
  const totalDrawbarPull = useSimulationStore(s => s.totalDrawbarPull);
  const totalMotionResistance = useSimulationStore(s => s.totalMotionResistance);
  const avgSinkage = useSimulationStore(s => s.avgSinkage);
  const maxSinkage = useSimulationStore(s => s.maxSinkage);
  const roverState = useSimulationStore(s => s.roverState);

  if (!showDashboard) {
    return (
      <button
        onClick={toggleDashboard}
        className="absolute top-4 right-4 z-20 bg-black/60 backdrop-blur-md border border-cyan-500/30 rounded-lg p-2 text-cyan-400 hover:bg-cyan-500/20 transition-all"
      >
        <ChevronLeft size={18} />
      </button>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-20 w-64 bg-black/70 backdrop-blur-xl border border-cyan-500/20 rounded-xl overflow-hidden shadow-2xl shadow-cyan-900/20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-gradient-to-l from-cyan-900/30 to-transparent">
        <div className="flex items-center gap-2">
          <Gauge size={14} className="text-cyan-400" />
          <span className="text-cyan-300 text-xs font-mono tracking-widest uppercase">推演仪表</span>
        </div>
        <button onClick={toggleDashboard} className="text-cyan-400 hover:text-cyan-300 transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="p-3 space-y-3 max-h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gradient-to-br from-emerald-900/30 to-transparent border border-emerald-500/20 rounded-lg p-2.5 text-center">
            <div className="text-[9px] text-emerald-400/60 font-mono uppercase">总挂钩牵引力</div>
            <div className="text-lg text-emerald-400 font-mono font-bold">{totalDrawbarPull.toFixed(1)}</div>
            <div className="text-[9px] text-white/30 font-mono">N</div>
          </div>
          <div className="bg-gradient-to-br from-red-900/30 to-transparent border border-red-500/20 rounded-lg p-2.5 text-center">
            <div className="text-[9px] text-red-400/60 font-mono uppercase">总运动阻力</div>
            <div className="text-lg text-red-400 font-mono font-bold">{totalMotionResistance.toFixed(1)}</div>
            <div className="text-[9px] text-white/30 font-mono">N</div>
          </div>
          <div className="bg-gradient-to-br from-amber-900/30 to-transparent border border-amber-500/20 rounded-lg p-2.5 text-center">
            <div className="text-[9px] text-amber-400/60 font-mono uppercase">平均沉陷</div>
            <div className="text-lg text-amber-400 font-mono font-bold">{(avgSinkage * 1000).toFixed(1)}</div>
            <div className="text-[9px] text-white/30 font-mono">mm</div>
          </div>
          <div className="bg-gradient-to-br from-orange-900/30 to-transparent border border-orange-500/20 rounded-lg p-2.5 text-center">
            <div className="text-[9px] text-orange-400/60 font-mono uppercase">最大沉陷</div>
            <div className="text-lg text-orange-400 font-mono font-bold">{(maxSinkage * 1000).toFixed(1)}</div>
            <div className="text-[9px] text-white/30 font-mono">mm</div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-lg p-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[9px] text-white/40 font-mono">漫游车位置</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[8px] text-white/30 font-mono">X</div>
              <div className="text-[10px] text-cyan-400 font-mono">{roverState.x.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[8px] text-white/30 font-mono">Z</div>
              <div className="text-[10px] text-cyan-400 font-mono">{roverState.z.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[8px] text-white/30 font-mono">航向</div>
              <div className="text-[10px] text-cyan-400 font-mono">{(roverState.heading * 180 / Math.PI).toFixed(1)}°</div>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] text-cyan-400/80 font-mono uppercase tracking-wider">各轮状态</span>
          {wheelStates.map((ws, i) => (
            <WheelCard
              key={i}
              index={i}
              sinkage={ws.sinkage}
              drawbarPull={ws.drawbarPull}
              slipRatio={ws.slipRatio}
              motionResistance={ws.motionResistance}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
