import { loadBindings } from './bindings';
import { InputManager } from './inputManager';

/** Single app-wide input manager (keyboard listeners attached once in main.tsx). */
export const inputManager = new InputManager(loadBindings());
