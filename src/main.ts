import { Game } from './core/Game';
import { Renderer } from './rendering/Renderer';

function showFatal(message: string): void {
  const element = document.getElementById('fatal');
  if (!element) return;
  element.textContent = message;
  element.style.display = 'flex';
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas');

  if (!Renderer.isSupported()) {
    showFatal('SKYBOUND needs WebGL2, which this browser or device does not support.');
    return;
  }

  const game = await Game.create(canvas, showFatal);
  game.start();
}

boot().catch((error: unknown) => {
  console.error(error);
  showFatal('SKYBOUND failed to start. See the console for details.');
});
