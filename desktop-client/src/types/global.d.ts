import type { ClawBridge } from '@electron/preload';

declare global {
  interface Window {
    claw: ClawBridge;
  }
}

export {};
