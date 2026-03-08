const express = require('express');
const { execFile } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3000;

const CUBELIB_PATH = path.resolve(__dirname, '..', 'cubelib-repo', 'cli', 'target', 'release', 'cubelib-cli.exe');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function runCubelib(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile(CUBELIB_PATH, ['--no-check-update', ...args], { timeout }, (error, stdout, stderr) => {
      const out = (stdout || '').trim();
      const err = (stderr || '').trim();
      if (error && error.killed) {
        reject(new Error('Command timed out'));
      } else if (error) {
        reject(new Error(err || error.message));
      } else if (out.includes('ERROR')) {
        // cubelib logs errors to stdout via its logger
        const match = out.match(/ERROR\s+\[.*?\]\s*(.*)/);
        reject(new Error(match ? match[1] : out));
      } else if (!out && err) {
        reject(new Error(err));
      } else {
        resolve(out);
      }
    });
  });
}

// Validate scramble input - only allow valid cube notation characters
function validateMoves(input) {
  if (!input || typeof input !== 'string') return false;
  if (input.length > 500) return false;
  return /^[RLUDFBrludfbMESxyz2' \t\n()]+$/.test(input);
}

// Solve endpoint
app.post('/api/solve', async (req, res) => {
  try {
    const { scramble, count, min, max, quality, format, steps, backend, all } = req.body;

    if (!scramble || !validateMoves(scramble)) {
      return res.status(400).json({ error: 'Invalid scramble notation' });
    }

    const args = ['solve'];

    if (format) args.push('--format', format);
    if (all) args.push('--all');
    if (min != null) args.push('--min', String(min));
    if (max != null) args.push('--max', String(max));
    if (count != null) args.push('-n', String(count));
    if (quality != null) args.push('--quality', String(quality));
    if (steps) args.push('--steps', steps);
    if (backend) args.push('--backend', backend);

    args.push(scramble);

    const timeout = quality === 0 ? 120000 : 60000;
    const output = await runCubelib(args, timeout);

    res.json({ result: output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scramble endpoint
app.post('/api/scramble', async (req, res) => {
  try {
    const output = await runCubelib(['scramble']);
    res.json({ scramble: output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Invert endpoint
app.post('/api/invert', async (req, res) => {
  try {
    const { scramble } = req.body;

    if (!scramble || !validateMoves(scramble)) {
      return res.status(400).json({ error: 'Invalid move notation' });
    }

    const output = await runCubelib(['invert', scramble]);
    res.json({ result: output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Cubelib Web running at http://localhost:${PORT}`);
});
