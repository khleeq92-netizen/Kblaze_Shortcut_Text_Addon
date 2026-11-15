// Minimal React-like controlled input behaviour without React: tracks value via
// the native value setter the way React's onChange tracker does.
const input = document.getElementById('controlled') as HTMLInputElement;
const mirror = document.getElementById('controlled-state')!;
let state = '';
input.addEventListener('input', () => { state = input.value; mirror.textContent = state; });
(window as any).controlledState = () => state;
