
export type Player = 'X' | 'O' | null;

export interface GameState {
  board: Player[];
  currentPlayer: 'X' | 'O';
  winner: Player | 'Draw' | null;
  scores: { X: number; O: number };
  history: string[];
}

export interface ThrowState {
  isCharging: boolean;
  power: number; // 0-100
  angle: number; // -45 to 45
  isFlying: boolean;
  isSplit: boolean; // Is the current throw a split throw
  landingPos: { x: number; y: number } | null;
}

export interface Commentary {
  text: string;
  type: 'success' | 'fail' | 'win' | 'taunt' | 'split' | 'point';
}
