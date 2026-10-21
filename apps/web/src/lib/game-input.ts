import type { Dir } from "schema/in-game";

// Activate game controls on contact; the later pointer-generated click must not
// move twice. Keyboard and assistive-technology clicks still activate normally.
export function directionButtonHandlers(move: () => void, disabled: boolean) {
  return {
    onPointerDown(event: { button: number; isPrimary: boolean }) {
      if (!disabled && event.button === 0 && event.isPrimary) move();
    },
    onClick(event: { detail: number }) {
      if (!disabled && event.detail === 0) move();
    },
  };
}

type TouchPoint = { identifier: number; clientX: number; clientY: number };

export function createSwipeGesture() {
  let start: TouchPoint | null = null;
  const cancel = () => { start = null; };
  const consume = (touch: TouchPoint | undefined): Dir | null => {
    if (!start || !touch || start.identifier !== touch.identifier) return null;
    const dx = touch.clientX - start.clientX, dy = touch.clientY - start.clientY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return null;
    cancel(); // Exactly one move per gesture, even before the finger lifts.
    return Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up";
  };
  return {
    start(touches: ArrayLike<TouchPoint>) {
      const touch = touches[0];
      start = touches.length === 1 ? { identifier: touch.identifier, clientX: touch.clientX, clientY: touch.clientY } : null;
    },
    move(touches: ArrayLike<TouchPoint>) {
      if (touches.length !== 1) { cancel(); return null; }
      return consume(touches[0]);
    },
    end(touches: ArrayLike<TouchPoint>) {
      const direction = consume(touches[0]);
      cancel();
      return direction;
    },
    cancel,
  };
}
