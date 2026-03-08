// 3D Rubik's Cube state and visualization (twisty-player integration)

// Face indices: U=0, D=1, F=2, B=3, R=4, L=5
// Each face is a 3x3 array: face[row][col]
// Colors: W=white(U), Y=yellow(D), R=red(F), O=orange(B), B=blue(R), G=green(L)

const SOLVED_STATE = {
  U: [['W','W','W'],['W','W','W'],['W','W','W']],
  D: [['Y','Y','Y'],['Y','Y','Y'],['Y','Y','Y']],
  F: [['R','R','R'],['R','R','R'],['R','R','R']],
  B: [['O','O','O'],['O','O','O'],['O','O','O']],
  R: [['B','B','B'],['B','B','B'],['B','B','B']],
  L: [['G','G','G'],['G','G','G'],['G','G','G']],
};

let cubeState = deepCopy(SOLVED_STATE);

// Track moves for twisty-player display
let cubeScramble = '';
let manualMoves = [];

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function rotateFaceCW(face) {
  const n = face.length;
  const result = [];
  for (let i = 0; i < n; i++) {
    result[i] = [];
    for (let j = 0; j < n; j++) {
      result[i][j] = face[n - 1 - j][i];
    }
  }
  return result;
}

function rotateFaceCCW(face) {
  const n = face.length;
  const result = [];
  for (let i = 0; i < n; i++) {
    result[i] = [];
    for (let j = 0; j < n; j++) {
      result[i][j] = face[j][n - 1 - i];
    }
  }
  return result;
}

function rotateFace180(face) {
  return rotateFaceCW(rotateFaceCW(face));
}

// Apply a single move to the cube state
function applyMoveToCube(state, move) {
  const s = deepCopy(state);

  switch (move) {
    case 'R': {
      s.R = rotateFaceCW(s.R);
      const temp = [s.F[0][2], s.F[1][2], s.F[2][2]];
      for (let i = 0; i < 3; i++) s.F[i][2] = s.D[i][2];
      for (let i = 0; i < 3; i++) s.D[i][2] = s.B[2 - i][0];
      for (let i = 0; i < 3; i++) s.B[i][0] = s.U[2 - i][2];
      for (let i = 0; i < 3; i++) s.U[i][2] = temp[i];
      break;
    }
    case "R'": {
      s.R = rotateFaceCCW(s.R);
      const temp = [s.F[0][2], s.F[1][2], s.F[2][2]];
      for (let i = 0; i < 3; i++) s.F[i][2] = s.U[i][2];
      for (let i = 0; i < 3; i++) s.U[i][2] = s.B[2 - i][0];
      for (let i = 0; i < 3; i++) s.B[i][0] = s.D[2 - i][2];
      for (let i = 0; i < 3; i++) s.D[i][2] = temp[i];
      break;
    }
    case 'R2': {
      s.R = rotateFace180(s.R);
      for (let i = 0; i < 3; i++) {
        const t = s.F[i][2]; s.F[i][2] = s.B[2 - i][0]; s.B[2 - i][0] = t;
      }
      for (let i = 0; i < 3; i++) {
        const t = s.U[i][2]; s.U[i][2] = s.D[i][2]; s.D[i][2] = t;
      }
      break;
    }
    case 'L': {
      s.L = rotateFaceCW(s.L);
      const temp = [s.F[0][0], s.F[1][0], s.F[2][0]];
      for (let i = 0; i < 3; i++) s.F[i][0] = s.U[i][0];
      for (let i = 0; i < 3; i++) s.U[i][0] = s.B[2 - i][2];
      for (let i = 0; i < 3; i++) s.B[i][2] = s.D[2 - i][0];
      for (let i = 0; i < 3; i++) s.D[i][0] = temp[i];
      break;
    }
    case "L'": {
      s.L = rotateFaceCCW(s.L);
      const temp = [s.F[0][0], s.F[1][0], s.F[2][0]];
      for (let i = 0; i < 3; i++) s.F[i][0] = s.D[i][0];
      for (let i = 0; i < 3; i++) s.D[i][0] = s.B[2 - i][2];
      for (let i = 0; i < 3; i++) s.B[i][2] = s.U[2 - i][0];
      for (let i = 0; i < 3; i++) s.U[i][0] = temp[i];
      break;
    }
    case 'L2': {
      s.L = rotateFace180(s.L);
      for (let i = 0; i < 3; i++) {
        const t = s.F[i][0]; s.F[i][0] = s.B[2 - i][2]; s.B[2 - i][2] = t;
      }
      for (let i = 0; i < 3; i++) {
        const t = s.U[i][0]; s.U[i][0] = s.D[i][0]; s.D[i][0] = t;
      }
      break;
    }
    case 'U': {
      s.U = rotateFaceCW(s.U);
      const temp = [...s.F[0]];
      s.F[0] = [...s.R[0]];
      s.R[0] = [...s.B[0]];
      s.B[0] = [...s.L[0]];
      s.L[0] = temp;
      break;
    }
    case "U'": {
      s.U = rotateFaceCCW(s.U);
      const temp = [...s.F[0]];
      s.F[0] = [...s.L[0]];
      s.L[0] = [...s.B[0]];
      s.B[0] = [...s.R[0]];
      s.R[0] = temp;
      break;
    }
    case 'U2': {
      s.U = rotateFace180(s.U);
      let temp = [...s.F[0]]; s.F[0] = [...s.B[0]]; s.B[0] = temp;
      temp = [...s.R[0]]; s.R[0] = [...s.L[0]]; s.L[0] = temp;
      break;
    }
    case 'D': {
      s.D = rotateFaceCW(s.D);
      const temp = [...s.F[2]];
      s.F[2] = [...s.L[2]];
      s.L[2] = [...s.B[2]];
      s.B[2] = [...s.R[2]];
      s.R[2] = temp;
      break;
    }
    case "D'": {
      s.D = rotateFaceCCW(s.D);
      const temp = [...s.F[2]];
      s.F[2] = [...s.R[2]];
      s.R[2] = [...s.B[2]];
      s.B[2] = [...s.L[2]];
      s.L[2] = temp;
      break;
    }
    case 'D2': {
      s.D = rotateFace180(s.D);
      let temp = [...s.F[2]]; s.F[2] = [...s.B[2]]; s.B[2] = temp;
      temp = [...s.R[2]]; s.R[2] = [...s.L[2]]; s.L[2] = temp;
      break;
    }
    case 'F': {
      s.F = rotateFaceCW(s.F);
      const temp = [...s.U[2]];
      for (let i = 0; i < 3; i++) s.U[2][i] = s.L[2 - i][2];
      for (let i = 0; i < 3; i++) s.L[i][2] = s.D[0][i];
      for (let i = 0; i < 3; i++) s.D[0][i] = s.R[2 - i][0];
      for (let i = 0; i < 3; i++) s.R[i][0] = temp[i];
      break;
    }
    case "F'": {
      s.F = rotateFaceCCW(s.F);
      const temp = [...s.U[2]];
      for (let i = 0; i < 3; i++) s.U[2][i] = s.R[i][0];
      for (let i = 0; i < 3; i++) s.R[i][0] = s.D[0][2 - i];
      for (let i = 0; i < 3; i++) s.D[0][i] = s.L[i][2];
      for (let i = 0; i < 3; i++) s.L[i][2] = temp[2 - i];
      break;
    }
    case 'F2': {
      s.F = rotateFace180(s.F);
      for (let i = 0; i < 3; i++) {
        const t = s.U[2][i]; s.U[2][i] = s.D[0][2 - i]; s.D[0][2 - i] = t;
      }
      for (let i = 0; i < 3; i++) {
        const t = s.L[i][2]; s.L[i][2] = s.R[2 - i][0]; s.R[2 - i][0] = t;
      }
      break;
    }
    case 'B': {
      s.B = rotateFaceCW(s.B);
      const temp = [...s.U[0]];
      for (let i = 0; i < 3; i++) s.U[0][i] = s.R[i][2];
      for (let i = 0; i < 3; i++) s.R[i][2] = s.D[2][2 - i];
      for (let i = 0; i < 3; i++) s.D[2][i] = s.L[i][0];
      for (let i = 0; i < 3; i++) s.L[i][0] = temp[2 - i];
      break;
    }
    case "B'": {
      s.B = rotateFaceCCW(s.B);
      const temp = [...s.U[0]];
      for (let i = 0; i < 3; i++) s.U[0][i] = s.L[2 - i][0];
      for (let i = 0; i < 3; i++) s.L[i][0] = s.D[2][i];
      for (let i = 0; i < 3; i++) s.D[2][i] = s.R[2 - i][2];
      for (let i = 0; i < 3; i++) s.R[i][2] = temp[i];
      break;
    }
    case 'B2': {
      s.B = rotateFace180(s.B);
      for (let i = 0; i < 3; i++) {
        const t = s.U[0][i]; s.U[0][i] = s.D[2][2 - i]; s.D[2][2 - i] = t;
      }
      for (let i = 0; i < 3; i++) {
        const t = s.L[i][0]; s.L[i][0] = s.R[2 - i][2]; s.R[2 - i][2] = t;
      }
      break;
    }
    default:
      return state; // Unknown move, return unchanged
  }

  return s;
}

// Parse a move string into individual moves
function parseMoves(moveString) {
  if (!moveString || !moveString.trim()) return [];
  const tokens = moveString.trim().split(/\s+/);
  const moves = [];
  for (const token of tokens) {
    // Handle standard moves
    const match = token.match(/^([RLUDFBrludfb])(['2]?)$/);
    if (match) {
      let face = match[1].toUpperCase();
      const mod = match[2];
      moves.push(face + mod);
    }
  }
  return moves;
}

// Apply a sequence of moves
function applyMoves(state, moveString) {
  const moves = parseMoves(moveString);
  let current = state;
  for (const move of moves) {
    current = applyMoveToCube(current, move);
  }
  return current;
}

// Update the twisty-player display
function updateTwistyPlayer() {
  const player = document.getElementById('cube-player');
  if (!player) return;
  if (manualMoves.length > 0) {
    // Manual moves on top of scramble: scramble = setup, manual = alg
    player.setAttribute('setup-alg', cubeScramble);
    player.setAttribute('alg', manualMoves.join(' '));
  } else {
    // Just scramble — show as alg so it can be animated/played
    player.setAttribute('setup-alg', '');
    player.setAttribute('alg', cubeScramble);
  }
}

// Render cube — now syncs with twisty-player
function renderCube() {
  updateTwistyPlayer();
}

function resetCube() {
  cubeState = deepCopy(SOLVED_STATE);
  cubeScramble = '';
  manualMoves = [];
  updateTwistyPlayer();
}

function applyMove(move) {
  cubeState = applyMoveToCube(cubeState, move);
  manualMoves.push(move);
  updateTwistyPlayer();
}

function applyScrambleToCubeState(scramble) {
  cubeState = deepCopy(SOLVED_STATE);
  cubeState = applyMoves(cubeState, scramble);
  cubeScramble = scramble;
  manualMoves = [];
  updateTwistyPlayer();
}
