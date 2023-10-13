import { MousePosition } from "./types";

const mousePosition: MousePosition = { x: 0, y: 0 };

export function getMousePosition() {
  return mousePosition;
}

export function bindDocumentMouse() {
  document.addEventListener("mousemove", (e) => {
    mousePosition.x = e.clientX;
    mousePosition.y = e.clientY;
  });
}
