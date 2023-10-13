import forEach from "lodash/forEach";
import { GlobalChessboard } from "./global-chessboard";
import { VueChessboard } from "./vue-chessboard";
import { ComponentChessboard } from "./component-chessboard";
import { boards } from "../globals";
import { Nullable, IChessboard, MousePosition, TArea } from "../types";
import { IGame } from "./component-chessboard/types";

export { GlobalChessboard } from "./global-chessboard";
export { VueChessboard } from "./vue-chessboard";
export { ComponentChessboard } from "./component-chessboard";

export function getBoard(): Nullable<IChessboard> {
  const element = document.querySelector(".chessboard, .board, chess-board");

  if (element) {
    const existingBoard = boards.get(element);
    if (existingBoard) {
      return existingBoard;
    }

    const boardSelectorMappings = {
      ".chessboard": GlobalChessboard,
      ".board:not(chess-board):not(wc-chess-board)": VueChessboard,
      "chess-board, wc-chess-board": ComponentChessboard,
    };

    let board = null;

    forEach(boardSelectorMappings, (Constructor, selector) => {
      if (element.matches(selector)) {
        board = new Constructor(element);
        // exit loop
        return false;
      }
    });

    if (board) {
      boards.set(element, board);
    }

    return board;
  }

  return null;
}

export function getSquareAtMouseCoordinates(
  board: IChessboard,
  game: IGame,
  mousePosition: MousePosition
): Nullable<TArea> {
  const flipped = game.getOptions().flipped;
  const boardRect = board.getRelativeContainer().getBoundingClientRect();
  const x = mousePosition.x - boardRect.left;
  const y = mousePosition.y - boardRect.top;
  const squareSize = boardRect.width / 8;
  let file = Math.floor(x / squareSize);
  let rank = 7 - Math.floor(y / squareSize);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) {
    return null;
  }
  if (flipped) {
    file = 7 - file;
    rank = 7 - rank;
  }
  return `${"abcdefgh"[file]}${rank + 1}` as TArea;
}
