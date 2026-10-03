import './styles.css';
import { Game } from './game/Game';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;

if (!webglAvailable()) {
  const boot = document.getElementById('boot');
  if (boot) boot.innerHTML = '<p>Scrollgate needs WebGL, which this browser or device has turned off. Try the latest Chrome, Edge, Safari or Firefox.</p>';
} else {
  const game = new Game(canvas, ui);
  game.start();
}
