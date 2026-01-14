
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Player, GameState, ThrowState } from './types';
import { getGameCommentary } from './services/geminiService';

const GRID_SIZE = 4;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const SCORE_TO_WIN = 3;

const WIN_LINES = [
  // Horizontal
  [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
  // Vertical
  [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
  // Diagonals
  [0, 5, 10, 15], [3, 6, 9, 12]
];

const App: React.FC = () => {
  const [game, setGame] = useState<GameState>({
    board: Array(TOTAL_CELLS).fill(null),
    currentPlayer: 'X',
    winner: null,
    scores: { X: 0, O: 0 },
    history: []
  });

  const [toss, setToss] = useState<ThrowState>({
    isCharging: false,
    power: 0,
    angle: 0,
    isFlying: false,
    isSplit: false, // This will be pre-determined
    landingPos: null
  });

  // Pre-determine if the next hoop is split
  const [nextIsSplit, setNextIsSplit] = useState<boolean>(Math.random() < 0.2);

  const [commentary, setCommentary] = useState<string>("預覽手中圈圈類型，制定你的奪分策略！");
  const [isLoadingCommentary, setIsLoadingCommentary] = useState(false);
  const [visualFeedback, setVisualFeedback] = useState<string | null>(null);
  const [clearingIndices, setClearingIndices] = useState<number[]>([]);

  const [flightTarget, setFlightTarget] = useState({ x: '0px', y: '0px', scale: 0.6 });

  const processBoardScoring = (board: Player[], player: 'X' | 'O'): { newBoard: Player[], points: number } => {
    let newBoard = [...board];
    let pointsEarned = 0;
    let indicesToRemove = new Set<number>();

    WIN_LINES.forEach(line => {
      const [a, b, c, d] = line;
      if (newBoard[a] === player && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c] && newBoard[a] === newBoard[d]) {
        pointsEarned += 1;
        line.forEach(idx => indicesToRemove.add(idx));
      }
    });

    if (pointsEarned > 0) {
      setClearingIndices(Array.from(indicesToRemove));
      indicesToRemove.forEach(idx => {
        newBoard[idx] = null;
      });
    }

    return { newBoard, points: pointsEarned };
  };

  const handleGeminiCommentary = async (action: 'throw' | 'win' | 'miss' | 'steal' | 'split' | 'point', player: 'X' | 'O', currentBoard: Player[], currentScores: {X: number, O: number}) => {
    setIsLoadingCommentary(true);
    const msg = await getGameCommentary(action, player, currentBoard, currentScores);
    setCommentary(msg);
    setIsLoadingCommentary(false);
  };

  const executeToss = useCallback(async () => {
    const finalPower = toss.power;
    const finalAngle = toss.angle;
    const currentHoopIsSplit = nextIsSplit; // Use the pre-determined type

    const tx = (finalAngle / 45) * 220;
    const ty = 80 - (finalPower / 100) * 280;
    const ts = 0.9 - (finalPower / 100) * 0.45;

    setFlightTarget({ x: `${tx}px`, y: `${ty}px`, scale: ts });
    setToss(prev => ({ ...prev, isFlying: true, isSplit: currentHoopIsSplit }));

    const targetXPercent = (finalAngle + 45) / 90 * 100;
    const targetYPercent = 100 - finalPower;

    setTimeout(async () => {
      const col = Math.floor(targetXPercent / 25);
      const row = Math.floor(targetYPercent / 25);
      
      let indicesToUpdate: number[] = [];
      if (currentHoopIsSplit) {
        if (col - 1 >= 0) indicesToUpdate.push(row * 4 + (col - 1));
        if (col + 1 < 4) indicesToUpdate.push(row * 4 + (col + 1));
      } else {
        if (row >= 0 && row < 4 && col >= 0 && col < 4) {
          indicesToUpdate.push(row * 4 + col);
        }
      }

      let hitOccurred = indicesToUpdate.length > 0;
      let isStealOccurred = false;
      let intermediateBoard = [...game.board];
      
      indicesToUpdate.forEach(idx => {
        if (intermediateBoard[idx] && intermediateBoard[idx] !== game.currentPlayer) {
          isStealOccurred = true;
        }
        intermediateBoard[idx] = game.currentPlayer;
      });

      const { newBoard, points } = processBoardScoring(intermediateBoard, game.currentPlayer);
      const newScores = { ...game.scores, [game.currentPlayer]: game.scores[game.currentPlayer] + points };
      
      let finalWinner: Player | null = null;
      if (newScores.X >= SCORE_TO_WIN) finalWinner = 'X';
      else if (newScores.O >= SCORE_TO_WIN) finalWinner = 'O';

      if (hitOccurred) {
        let feedback = currentHoopIsSplit ? 'DOUBLE HIT!' : 'HIT!';
        if (points > 0) feedback = `POINT +${points}!`;
        else if (isStealOccurred && !currentHoopIsSplit) feedback = 'STEAL!';
        
        setVisualFeedback(feedback);

        if (finalWinner) {
          handleGeminiCommentary('win', game.currentPlayer, newBoard, newScores);
        } else if (points > 0) {
          handleGeminiCommentary('point', game.currentPlayer, newBoard, newScores);
        } else if (currentHoopIsSplit) {
          handleGeminiCommentary('split', game.currentPlayer, newBoard, newScores);
        } else if (isStealOccurred) {
          handleGeminiCommentary('steal', game.currentPlayer, newBoard, newScores);
        } else {
          handleGeminiCommentary('throw', game.currentPlayer, newBoard, newScores);
        }
        
        setGame(prev => ({
          ...prev,
          board: newBoard,
          scores: newScores,
          winner: finalWinner,
          currentPlayer: prev.currentPlayer === 'X' ? 'O' : 'X'
        }));
      } else {
        setVisualFeedback('MISS!');
        handleGeminiCommentary('miss', game.currentPlayer, game.board, game.scores);
        setGame(prev => ({
          ...prev,
          currentPlayer: prev.currentPlayer === 'X' ? 'O' : 'X'
        }));
      }

      // Prepare next hoop for next player
      setNextIsSplit(Math.random() < 0.2);

      if (points > 0) {
        setTimeout(() => setClearingIndices([]), 800);
      }

      setToss(prev => ({
        ...prev,
        isCharging: false,
        power: 0,
        isFlying: false,
        landingPos: { x: targetXPercent, y: targetYPercent }
      }));

      setTimeout(() => setVisualFeedback(null), 1200);
    }, 900);
  }, [toss.power, toss.angle, game, nextIsSplit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (game.winner || toss.isFlying) return;

      if (e.code === 'Space' && !toss.isCharging) {
        setToss(prev => ({ ...prev, isCharging: true, power: 0 }));
      } else if (e.code === 'ArrowLeft') {
        setToss(prev => ({ ...prev, angle: Math.max(-45, prev.angle - 4) }));
      } else if (e.code === 'ArrowRight') {
        setToss(prev => ({ ...prev, angle: Math.min(45, prev.angle + 4) }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && toss.isCharging) {
        executeToss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [toss.isCharging, toss.isFlying, game.winner, executeToss]);

  useEffect(() => {
    let interval: number;
    if (toss.isCharging) {
      interval = window.setInterval(() => {
        setToss(prev => {
          let nextPower = prev.power + 3.2;
          if (nextPower > 100) nextPower = 0;
          return { ...prev, power: nextPower };
        });
      }, 30);
    }
    return () => clearInterval(interval);
  }, [toss.isCharging]);

  const resetGame = () => {
    setGame({
      board: Array(TOTAL_CELLS).fill(null),
      currentPlayer: 'X',
      winner: null,
      scores: { X: 0, O: 0 },
      history: []
    });
    setToss(prev => ({ ...prev, power: 0, angle: 0, isFlying: false, isSplit: false }));
    setNextIsSplit(Math.random() < 0.2);
    setCommentary("新積分對局開始！看好你手中的圈圈！");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative bg-slate-900 overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,#3b82f6,transparent_70%)]"></div>
      </div>

      {/* Header & Scores */}
      <div className="z-10 text-center mb-6">
        <h1 className="text-5xl font-bold mb-2 orbitron bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 drop-shadow-lg">
          HOOP DUEL: POINT RUSH
        </h1>
        <div className="flex items-center justify-center gap-6 mt-4">
          <div className={`flex flex-col items-center p-3 rounded-xl border-b-4 transition-all duration-300 ${game.currentPlayer === 'X' ? 'bg-blue-600 border-blue-400 shadow-xl scale-110' : 'bg-slate-800 border-transparent opacity-60'}`}>
            <span className="text-sm font-bold opacity-80 uppercase tracking-widest">PLAYER X</span>
            <span className="text-4xl font-black orbitron">{game.scores.X}</span>
          </div>
          <div className="text-slate-600 font-bold text-2xl orbitron">/</div>
          <div className={`flex flex-col items-center p-3 rounded-xl border-b-4 transition-all duration-300 ${game.currentPlayer === 'O' ? 'bg-purple-600 border-purple-400 shadow-xl scale-110' : 'bg-slate-800 border-transparent opacity-60'}`}>
            <span className="text-sm font-bold opacity-80 uppercase tracking-widest">PLAYER O</span>
            <span className="text-4xl font-black orbitron">{game.scores.O}</span>
          </div>
        </div>
      </div>

      <div className="relative w-full max-w-4xl aspect-video perspective-grid flex items-center justify-center">
        {/* Aim Guide Line */}
        {!game.winner && !toss.isFlying && (
          <div 
            className={`aim-guide transition-all duration-100 ease-out ${nextIsSplit ? 'animate-pulse scale-y-110' : ''}`} 
            style={{ 
              transform: `translateX(-50%) rotate(${toss.angle}deg)`,
              color: nextIsSplit ? '#fbbf24' : (game.currentPlayer === 'X' ? '#60a5fa' : '#c084fc')
            }}
          ></div>
        )}

        <div className="grid-3d grid grid-cols-4 grid-rows-4 w-[420px] h-[420px] gap-2 p-3 rounded-xl border-4 border-slate-700/60 bg-slate-800/40 shadow-2xl relative">
          {game.board.map((cell, i) => (
            <div 
              key={i} 
              className={`relative flex items-center justify-center rounded-lg border-2 border-slate-700/50 bg-slate-900/90 transition-all duration-300
                ${cell === 'X' ? 'shadow-[inset_0_0_15px_rgba(37,99,235,0.3)]' : ''}
                ${cell === 'O' ? 'shadow-[inset_0_0_15px_rgba(147,51,234,0.3)]' : ''}
                ${clearingIndices.includes(i) ? 'scale-0 opacity-0 bg-yellow-400 rotate-180' : ''}
              `}
            >
              {cell && (
                <div className={`text-4xl font-bold animate-ring-float ${cell === 'X' ? 'text-blue-400' : 'text-purple-400'}`}>
                   {cell === 'X' ? (
                     <svg className="w-12 h-12 drop-shadow-[0_0_8px_currentColor]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                       <circle cx="12" cy="12" r="9" />
                       <circle cx="12" cy="12" r="5" strokeOpacity="0.4" />
                     </svg>
                   ) : (
                     <svg className="w-12 h-12 drop-shadow-[0_0_8px_currentColor]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="4" strokeDasharray="2 2" />
                     </svg>
                   )}
                </div>
              )}
              {!cell && !game.winner && (
                <div className="w-1.5 h-1.5 rounded-full bg-slate-700/40"></div>
              )}
            </div>
          ))}

          {game.winner && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[60]">
               <div className="text-6xl font-black orbitron text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.7)] animate-bounce text-center bg-slate-900/80 p-10 rounded-full backdrop-blur-xl border-2 border-white/20 uppercase">
                 {game.winner} Champion!
               </div>
            </div>
          )}
        </div>

        {/* Flying Rings */}
        {toss.isFlying && (
          <>
            <div 
              className={`absolute z-[100] pointer-events-none animate-toss ${toss.isSplit ? 'opacity-0' : ''}`}
              style={{
                left: '50%',
                top: '50%',
                '--target-x': flightTarget.x,
                '--target-y': flightTarget.y,
                '--target-scale': flightTarget.scale
              } as React.CSSProperties}
            >
              <div className={`w-28 h-28 rounded-full border-[12px] shadow-[0_40px_40px_rgba(0,0,0,0.6)] ${game.currentPlayer === 'X' ? 'border-blue-500 shadow-blue-500/50' : 'border-purple-500 shadow-purple-500/50'}`}></div>
            </div>

            {toss.isSplit && (
              <>
                <div 
                  className="absolute z-[100] pointer-events-none animate-toss"
                  style={{
                    left: '50%',
                    top: '50%',
                    '--target-x': `calc(${flightTarget.x} - 100px)`,
                    '--target-y': flightTarget.y,
                    '--target-scale': flightTarget.scale
                  } as React.CSSProperties}
                >
                  <div className="w-28 h-28 rounded-full border-[12px] shadow-[0_0_35px_rgba(251,191,36,0.6)] border-yellow-400"></div>
                </div>
                <div 
                  className="absolute z-[100] pointer-events-none animate-toss"
                  style={{
                    left: '50%',
                    top: '50%',
                    '--target-x': `calc(${flightTarget.x} + 100px)`,
                    '--target-y': flightTarget.y,
                    '--target-scale': flightTarget.scale
                  } as React.CSSProperties}
                >
                  <div className="w-28 h-28 rounded-full border-[12px] shadow-[0_0_35px_rgba(251,191,36,0.6)] border-yellow-400"></div>
                </div>
              </>
            )}
          </>
        )}

        {visualFeedback && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] pointer-events-none whitespace-nowrap">
            <span className={`text-6xl md:text-8xl font-black orbitron italic drop-shadow-2xl animate-ping ${visualFeedback === 'MISS!' ? 'text-red-400' : (visualFeedback.includes('POINT') ? 'text-yellow-400' : 'text-green-400')}`}>
              {visualFeedback}
            </span>
          </div>
        )}
      </div>

      <div className="mt-6 w-full max-w-xl bg-slate-800/90 backdrop-blur-xl rounded-2xl p-6 border border-slate-700 shadow-2xl z-20">
        <div className="flex flex-col gap-6">
          {/* AI Commentary Section */}
          <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-700 min-h-[4.5rem] flex items-center justify-center relative overflow-hidden shadow-inner">
             {isLoadingCommentary && <div className="absolute inset-0 bg-blue-500/10 animate-pulse"></div>}
             <p className="text-xl italic text-slate-100 text-center font-semibold leading-relaxed drop-shadow-sm">
               "{commentary}"
             </p>
          </div>

          <div className="flex items-center gap-6">
            {/* Hoop Preview */}
            <div className="flex flex-col items-center justify-center p-3 bg-slate-900/60 rounded-xl border border-slate-700 min-w-[100px]">
               <span className="text-[10px] font-black tracking-widest text-slate-400 mb-2 uppercase">Current</span>
               <div className={`w-12 h-12 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${nextIsSplit ? 'border-yellow-400 shadow-[0_0_15px_rgba(251,191,36,0.5)] animate-spin-slow' : (game.currentPlayer === 'X' ? 'border-blue-500' : 'border-purple-500')}`}>
                 {nextIsSplit ? <i className="fas fa-bolt text-yellow-400 text-xs"></i> : <div className="w-2 h-2 rounded-full bg-current"></div>}
               </div>
               <span className={`text-[10px] font-bold mt-2 uppercase ${nextIsSplit ? 'text-yellow-400' : 'text-slate-500'}`}>
                 {nextIsSplit ? 'Twin Hoop' : 'Standard'}
               </span>
            </div>

            {/* Power Bar */}
            <div className="flex-1">
              <div className="flex justify-between mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">
                <span>Charge Power</span>
                <span className="text-blue-400">{Math.round(toss.power)}%</span>
              </div>
              <div className="h-6 w-full bg-slate-900 rounded-lg overflow-hidden border-2 border-slate-700 p-0.5">
                <div 
                  className="h-full rounded-md transition-all duration-75 bg-gradient-to-r from-blue-600 via-emerald-500 to-rose-500"
                  style={{ width: `${toss.power}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4 text-slate-400">
               <div className="flex gap-2">
                 <div className="px-3 py-1.5 bg-slate-800 rounded-md text-[10px] font-black border border-slate-700 text-slate-300">⬅️ ➡️</div>
                 <div className="px-3 py-1.5 bg-slate-800 rounded-md text-[10px] font-black border border-slate-700 text-slate-300 uppercase">Space</div>
               </div>
               <span className="text-[10px] font-bold opacity-70 tracking-tighter uppercase">調整角度並長按空白鍵</span>
            </div>
            {game.winner && (
              <button 
                onClick={resetGame}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black orbitron transition-all active:scale-95 border-b-4 border-blue-900 shadow-xl"
              >
                PLAY AGAIN
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
