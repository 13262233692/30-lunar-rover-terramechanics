import { useSimulationStore } from '../store/simulationStore';
import { Shield, Zap, AlertTriangle, Lock, Unlock, ArrowRight } from 'lucide-react';

const WHEEL_LABELS = ['左前', '右前', '左中', '右中', '左后', '右后'];
const AXLE_LABELS = ['前轴', '中轴', '后轴'];

function SlipBar({ value, threshold }: { value: number; threshold: number }) {
  const pct = Math.min(value * 100, 100);
  const isOver = value >= threshold;
  const isWarning = value >= threshold * 0.625;
  const barColor = isOver ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500';
  const thresholdPct = threshold * 100;

  return (
    <div className="relative w-full h-2 bg-white/10 rounded-full overflow-hidden">
      <div className={`absolute left-0 top-0 h-full ${barColor} rounded-full transition-all duration-150`} style={{ width: `${pct}%` }} />
      <div className="absolute top-0 h-full w-0.5 bg-red-400/80" style={{ left: `${thresholdPct}%` }} />
    </div>
  );
}

function TorqueFlowArrow({ direction, amount }: { direction: string; amount: number }) {
  if (direction === 'none' || amount < 0.01) return <span className="text-white/20">—</span>;
  const isLTR = direction === 'left-to-right';
  return (
    <div className="flex items-center gap-0.5">
      <span className={`text-[8px] font-mono ${isLTR ? 'text-amber-400' : 'text-sky-400'}`}>
        {isLTR ? 'L→R' : 'R→L'}
      </span>
      <Zap size={8} className={amount > 0.5 ? 'text-yellow-400 animate-pulse' : 'text-amber-400/60'} />
      <span className="text-[8px] text-amber-300 font-mono">{amount.toFixed(2)}Nm</span>
    </div>
  );
}

function WheelGripDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-emerald-400',
    warning: 'bg-amber-400 animate-pulse',
    critical: 'bg-orange-500 animate-pulse',
    locked: 'bg-red-500 animate-pulse',
  };
  return <div className={`w-2 h-2 rounded-full ${colors[status] || 'bg-white/20'}`} />;
}

export function DifferentialLockPanel() {
  const diffLockState = useSimulationStore(s => s.diffLockState);
  const diffLockEnabled = useSimulationStore(s => s.diffLockEnabled);
  const setDiffLockEnabled = useSimulationStore(s => s.setDiffLockEnabled);

  const { wheelConditions, axlePairs, activeLockCount, totalTorqueRedistributed, interventionCount, slipThreshold } = diffLockState;

  return (
    <div className="absolute bottom-4 left-4 z-20 w-96 bg-black/70 backdrop-blur-xl border border-amber-500/20 rounded-xl overflow-hidden shadow-2xl shadow-amber-900/20">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-500/20 bg-gradient-to-r from-amber-900/25 to-transparent">
        <div className="flex items-center gap-2">
          <Shield size={13} className="text-amber-400" />
          <span className="text-amber-300 text-[10px] font-mono tracking-widest uppercase">差速锁扭矩分配控制器</span>
        </div>
        <button
          onClick={() => setDiffLockEnabled(!diffLockEnabled)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono uppercase transition-all ${
            diffLockEnabled
              ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
              : 'bg-white/5 text-white/30 border border-white/10'
          }`}
        >
          {diffLockEnabled ? <Lock size={9} /> : <Unlock size={9} />}
          {diffLockEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="p-3 space-y-2.5">
        <div className="grid grid-cols-3 gap-2">
          <div className={`bg-gradient-to-br ${activeLockCount > 0 ? 'from-red-900/40' : 'from-emerald-900/20'} to-transparent border border-white/10 rounded-lg p-2 text-center`}>
            <div className="text-[8px] text-white/40 font-mono uppercase">锁止轴数</div>
            <div className={`text-base font-mono font-bold ${activeLockCount > 0 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
              {activeLockCount}
            </div>
          </div>
          <div className="bg-gradient-to-br from-amber-900/20 to-transparent border border-white/10 rounded-lg p-2 text-center">
            <div className="text-[8px] text-white/40 font-mono uppercase">扭矩转移</div>
            <div className="text-base text-amber-400 font-mono font-bold">{totalTorqueRedistributed.toFixed(2)}</div>
            <div className="text-[7px] text-white/25 font-mono">Nm</div>
          </div>
          <div className="bg-gradient-to-br from-violet-900/20 to-transparent border border-white/10 rounded-lg p-2 text-center">
            <div className="text-[8px] text-white/40 font-mono uppercase">介入次数</div>
            <div className="text-base text-violet-400 font-mono font-bold">{interventionCount}</div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[9px] text-amber-400/80 font-mono uppercase tracking-wider">车轮工况</span>
            <span className="text-[8px] text-white/20 font-mono">红线 {(slipThreshold * 100).toFixed(0)}%</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 2, 4].map(leftIdx => {
              const rightIdx = leftIdx + 1;
              const lCond = wheelConditions[leftIdx];
              const rCond = wheelConditions[rightIdx];
              if (!lCond || !rCond) return null;
              const pair = axlePairs[leftIdx / 2];
              return (
                <div key={leftIdx} className="bg-white/5 border border-white/10 rounded-lg p-1.5 space-y-1">
                  <div className="text-center text-[8px] text-amber-400/60 font-mono uppercase">{AXLE_LABELS[leftIdx / 2]}</div>
                  {[
                    { cond: lCond, label: WHEEL_LABELS[leftIdx] },
                    { cond: rCond, label: WHEEL_LABELS[rightIdx] },
                  ].map(({ cond, label }) => (
                    <div key={cond.wheelIndex} className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <WheelGripDot status={cond.gripStatus} />
                          <span className="text-[8px] text-white/50 font-mono">{label}</span>
                        </div>
                        <span className={`text-[8px] font-mono ${
                          cond.gripStatus === 'locked' ? 'text-red-400' :
                          cond.gripStatus === 'critical' ? 'text-orange-400' :
                          cond.gripStatus === 'warning' ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {(cond.slipRatio * 100).toFixed(0)}%
                        </span>
                      </div>
                      <SlipBar value={cond.slipRatio} threshold={slipThreshold} />
                      <div className="flex justify-between">
                        <span className="text-[7px] text-white/25 font-mono">扭矩</span>
                        <span className="text-[7px] text-amber-300/70 font-mono">{cond.torqueActual.toFixed(2)}Nm</span>
                      </div>
                    </div>
                  ))}
                  {pair && (
                    <div className="pt-0.5 border-t border-white/5 flex justify-center">
                      <TorqueFlowArrow direction={pair.torqueTransferDirection} amount={pair.torqueTransferAmount} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-white/5">
          <div className="flex gap-3">
            {(['healthy', 'warning', 'critical', 'locked'] as const).map(status => (
              <div key={status} className="flex items-center gap-1">
                <WheelGripDot status={status} />
                <span className="text-[7px] text-white/30 font-mono capitalize">{status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
