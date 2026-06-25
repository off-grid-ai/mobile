import type { ComponentType } from 'react';

export interface RegisteredScreen {
  name: string;
  component: ComponentType<any>;
}

const screens: RegisteredScreen[] = [];

export function registerScreen(screen: RegisteredScreen): void {
  // Dedupe by name. loadProFeatures can run more than once (dev Fast Refresh, or
  // a future re-activate-on-purchase without restart); duplicate route names
  // crash the navigator (the duplicate-screen render bug). First wins. Mirrors
  // the guard in sectionRegistry.
  if (screens.some(s => s.name === screen.name)) return;
  screens.push(screen);
}

export function getRegisteredScreens(): RegisteredScreen[] {
  return screens;
}

export function _clearScreensForTesting(): void {
  screens.length = 0;
}
