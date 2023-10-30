import find from "lodash/find";
import {
  IChessboard,
  TArea,
  IMoveDetails,
  Nullable,
  MousePosition,
  TPiece,
  KeyDirection,
} from "../../types";
import { IGame, TElementWithGame, IMoveEvent, IPiece } from "./types";
import { squareToCoords, ALL_AREAS, coordsToSquare } from "../../utils";
import { dispatchPointerEvent } from "../../dom-events";

const ERROR_AREA_COLOR = "#ff4444";

/**
 * Chessboard implemented with some kinds of web components
 * Beta in April 2020
 */
export class ComponentChessboard implements IChessboard {
  element: TElementWithGame;
  game: IGame;
  pieceMap: Nullable<Record<TPiece, Record<KeyDirection, TArea>>> = null;
  // piece map getter

  constructor(element: Element) {
    this.element = <TElementWithGame>element;
    this.game = this.element.game;
    if (this.pieceMap === null) {
      this.initializePieceMap();
      this.updateDirectionalColoring();
    }

    this.game.on("Move", (move: IMoveEvent) => {
      const event = new Event("ccHelper-draw");
      this.onMove(move);
      document.dispatchEvent(event);
    });
  }

  getPieceMap() {
    if (!this.pieceMap) {
      throw new Error("Piece map is not initialized");
    }
    return this.pieceMap;
  }

  onMove(move: IMoveEvent) {
    if (!this.game.getPlayingAs) {
      throw new Error("Unable to get playing as on move");
    }
    const playingAs = this.game.getPlayingAs();
    const moveData = move.data.move;
    const piece = moveData.piece;
    const pieceMap = this.getPieceMap();
    console.log(moveData.san);
    if (moveData.color === playingAs) {
      if (["O-O", "O-O-O"].includes(moveData.san)) {
        const rooksDirectionMap = pieceMap["r"];
        const isKingSide = moveData.san === "O-O";
        const kingCoords = squareToCoords(moveData.to);
        console.log(`King coords are ${JSON.stringify(kingCoords)}`);
        const rookFileNum = isKingSide ? kingCoords[0] - 1 : kingCoords[0] + 1;
        const rookFile = ["", "a", "b", "c", "d", "e", "f", "g", "h"][
          rookFileNum
        ];
        const rookSquare = `${rookFile}${kingCoords[1]}`;
        // If there is only one rook on the board, we can assume that it is the one that castled
        if (Object.keys(rooksDirectionMap).length === 1) {
          const direction = Object.keys(rooksDirectionMap)[0] as KeyDirection;
          this.setPieceMap("r", direction, rookSquare);
          return;
        }

        // Otherwise we check if there is a rook on the correct square
        // Check if rook is on the same rank as the king
        // and is on the correct side of the king based on the type of castling
        Object.entries(rooksDirectionMap).forEach(([direction, square]) => {
          const rookCoords = squareToCoords(square);
          const isSameRank = kingCoords[1] == rookCoords[1];
          const isCorrectSide = isKingSide
            ? rookCoords[0] > kingCoords[0]
            : rookCoords[0] < kingCoords[0];
          if (isSameRank && isCorrectSide) {
            this.setPieceMap("r", direction as KeyDirection, rookSquare);
            return;
          }
        });
      } else if (pieceMap[piece]) {
        const directionMap = pieceMap[piece];
        for (const mapDirection in directionMap) {
          const square = directionMap[mapDirection as KeyDirection];
          if (square === moveData.from) {
            this.setPieceMap(piece, mapDirection as KeyDirection, moveData.to);
          }
        }
      }
    } else {
      if (moveData.capturedStr) {
        const capturedPiece = moveData.capturedStr.toLowerCase();
        if (pieceMap[capturedPiece]) {
          const directionMap = pieceMap[capturedPiece];
          let deleteDirection = null;
          for (const mapDirection in directionMap) {
            const square = directionMap[mapDirection as KeyDirection];
            if (square === moveData.to) {
              deleteDirection = mapDirection as KeyDirection;
              break;
            }
          }
          if (deleteDirection) {
            this.deleteFromPieceMap(capturedPiece, deleteDirection);
          }
        }
      }
    }
  }

  getElement() {
    return this.element;
  }

  getRelativeContainer() {
    return this.element;
  }

  getSquareAtMouseCoordinates(mousePosition: MousePosition): Nullable<TArea> {
    const flipped = this.game.getOptions().flipped;
    const boardRect = this.getRelativeContainer().getBoundingClientRect();
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

  makeMove(fromSq: TArea, toSq: TArea, promotionPiece?: string) {
    const move = { from: fromSq, to: toSq };

    // In case of promotion only interact via JS API
    if (!promotionPiece) {
      const fromPosition = this._getSquarePosition(fromSq);
      const toPosition = this._getSquarePosition(toSq);
      dispatchPointerEvent(this.element, "pointerdown", {
        x: fromPosition.x,
        y: fromPosition.y,
      });
      dispatchPointerEvent(this.element, "pointerup", {
        x: toPosition.x,
        y: toPosition.y,
      });
    }

    try {
      this.game.move({
        ...move,
        promotion: promotionPiece,
        animate: false,
        userGenerated: true,
      });
    } catch (e) {
      // this.game.move throws an error on such a call
      // not catching the error causes the field not to be cleaned up
      // @TODO understand why the error is thrown
    }
  }

  isLegalMove(fromSq: TArea, toSq: TArea) {
    const legalMoves = this.game.getLegalMoves();
    return Boolean(find(legalMoves, { from: fromSq, to: toSq }));
  }

  isPlayersMove() {
    if (this.game.getMode().name === "analysis") {
      return true;
    }

    if (!this.game.getPlayingAs) {
      return false;
    }

    return this.game.getTurn() === this.game.getPlayingAs();
  }

  getPiecesSetup() {
    const pieces = this.game.getPieces().getCollection();
    return Object.values(pieces).reduce(
      (acc, piece) => ({
        ...acc,
        [piece.square]: {
          color: piece.color,
          type: piece.type,
          area: piece.square,
        },
      }),
      {}
    );
  }

  markArrow(fromSq: TArea, toSq: TArea) {
    const arrowCoords = `${fromSq}${toSq}`;
    const markings = this.game.getMarkings();
    if (!markings.arrow[arrowCoords]) {
      this.game.toggleMarking({
        arrow: { color: "d", from: fromSq, to: toSq },
      });
    }

    // legacy call, probably can be removed in the future
    setTimeout(() => {
      const markings = this.game.getMarkings();
      if (!markings.arrow[arrowCoords]) {
        try {
          this.game.toggleMarking({ key: arrowCoords, type: "arrow" });
        } catch (e) {}
      }
    });
  }

  unmarkArrow(fromSq: TArea, toSq: TArea) {
    const arrowCoords = `${fromSq}${toSq}`;
    const markings = this.game.getMarkings();
    if (markings.arrow[arrowCoords]) {
      this.game.toggleMarking({
        arrow: { color: "d", from: fromSq, to: toSq },
      });
    }

    // legacy call, probably can be removed in the future
    setTimeout(() => {
      const markings = this.game.getMarkings();
      if (markings.arrow[arrowCoords]) {
        try {
          this.game.toggleMarking({ key: arrowCoords, type: "arrow" });
        } catch (e) {}
      }
    });
  }

  clearMarkedArrows() {
    const markings = this.game.getMarkings();
    const arrowMarkings = markings.arrow;
    Object.values(arrowMarkings).forEach((arrow) => {
      const { from, to } = arrow;
      this.unmarkArrow(from, to);
    });
  }

  markArea(square: TArea) {
    const markings = this.game.getMarkings();
    if (!markings.square[square]) {
      this.game.toggleMarking({ square: { color: ERROR_AREA_COLOR, square } });
    }

    // legacy call, probably can be removed in the future
    setTimeout(() => {
      const markings = this.game.getMarkings();
      if (!markings.square[square]) {
        try {
          this.game.toggleMarking({ key: square, type: "square" });
        } catch (e) {}
      }
    });
  }

  unmarkArea(square: TArea) {
    const markings = this.game.getMarkings();
    if (markings.square[square]) {
      this.game.toggleMarking({ square: { color: ERROR_AREA_COLOR, square } });
    }

    // legacy call, probably can be removed in the future
    setTimeout(() => {
      const markings = this.game.getMarkings();
      if (markings.square[square]) {
        try {
          this.game.toggleMarking({ key: square, type: "square" });
        } catch (e) {}
      }
    });
  }

  clearMarkedAreas() {
    ALL_AREAS.forEach((area: TArea) => {
      this.unmarkArea(area);
    });
  }

  clearAllMarkings() {
    this.clearMarkedAreas();
    this.clearMarkedArrows();
  }

  submitDailyMove() {
    const dailyComponent = document.querySelector(
      ".daily-game-footer-component"
    );
    if (dailyComponent) {
      (<any>dailyComponent).__vue__.$emit("save-move");
    }
  }

  setPieceMap(
    piece: TPiece,
    direction: KeyDirection,
    square: TArea,
    update: boolean = true
  ) {
    const pieceMap = this.getPieceMap();
    if (!pieceMap[piece]) {
      pieceMap[piece] = {} as Record<KeyDirection, TArea>;
    }
    const directionMap = pieceMap[piece];
    directionMap[direction] = square;
    console.log(
      `Direction map is now ${JSON.stringify(directionMap, null, 2)}`
    );
    console.log(`Piece map is now ${JSON.stringify(pieceMap, null, 2)}`);
    if (update) {
      this.updateDirectionalColoring();
    }
  }

  deleteFromPieceMap(piece: TPiece, direction: KeyDirection) {
    const pieceMap = this.getPieceMap();
    if (!pieceMap[piece]) {
      throw new Error(`Unable to find piece ${piece} in piece map`);
    }
    const directionMap = pieceMap[piece];
    if (!directionMap[direction]) {
      throw new Error(
        `Unable to find direction ${direction} for piece ${piece}`
      );
    }
    delete directionMap[direction];
    console.log(
      `Direction map is now ${JSON.stringify(directionMap, null, 2)}`
    );
    console.log(`Piece map is now ${JSON.stringify(pieceMap, null, 2)}`);
    this.updateDirectionalColoring();
  }

  initializePieceMap() {
    console.log("Initializing piece map");
    if (!this.pieceMap) {
      this.pieceMap = {};
    }
    if (!this.game.getPlayingAs) {
      throw new Error(
        "Unable to get playing as side while initializing piece map"
      );
    }
    const playingAs = this.game.getPlayingAs();
    const allPieces = Object.values(this.game.getPieces().getCollection());
    const playerPieces = allPieces.filter((piece) => {
      return piece.color === playingAs;
    });
    const rooks = playerPieces.filter((piece) => piece.type === "r");
    const knights = playerPieces.filter((piece) => piece.type === "n");
    const queens = playerPieces.filter((piece) => piece.type === "q");

    // Sort pieces by file (left to right) and then rank (top to bottom) from perspective of player
    const sortPieces = (a: IPiece, b: IPiece) => {
      const fileA = a.square.charCodeAt(0);
      const fileB = b.square.charCodeAt(0);
      const rankA = parseInt(a.square[1]);
      const rankB = parseInt(b.square[1]);

      if (playingAs === 1) {
        // If playing as white
        if (fileA !== fileB) return fileA - fileB;
        return rankB - rankA;
      } else {
        if (fileA !== fileB) return fileB - fileA;
        return rankA - rankB;
      }
    };

    const processPieces = (pieces: IPiece[]) => {
      if (pieces.length === 0) {
        return;
      }
      const generalPiece = pieces[0];
      const rightPiece = pieces[pieces.length - 1];
      this.setPieceMap(
        generalPiece.type,
        KeyDirection.GENERAL,
        generalPiece.square,
        false
      );
      if (generalPiece === rightPiece) {
        return;
      }
      this.setPieceMap(
        rightPiece.type,
        KeyDirection.RIGHT,
        rightPiece.square,
        false
      );
    };

    rooks.sort(sortPieces);
    knights.sort(sortPieces);
    queens.sort(sortPieces);

    processPieces(rooks);
    processPieces(knights);
    processPieces(queens);
    console.log(JSON.stringify(this.pieceMap));
  }

  clearDirectionalColoring() {
    const piecesElements = Array.from(this.element.querySelectorAll(".piece"));
    piecesElements.forEach((el) => {
      el.classList.remove("glow-red");
      el.classList.remove("glow-blue");
    });
  }

  updateDirectionalColoring() {
    this.clearDirectionalColoring();
    const piecesElements = Array.from(this.element.querySelectorAll(".piece"));
    const pieceMap = this.getPieceMap();
    Object.entries(pieceMap).forEach(([piece, directionMap]) => {
      Object.entries(directionMap).forEach(([direction, square]) => {
        const coords = squareToCoords(square);
        const pieceElement = piecesElements.find((el) => {
          return el.classList.contains(`square-${coords[0]}${coords[1]}`);
        });
        if (!pieceElement) {
          return;
        }
        if (direction === KeyDirection.GENERAL) {
          pieceElement.classList.add("glow-blue");
        } else {
          pieceElement.classList.add("glow-red");
        }
      });
    });
  }

  _getMoveData(event: IMoveEvent): IMoveDetails {
    const data = event.data.move;
    let moveType = "move";
    if (data.san.startsWith("O-O-O")) {
      moveType = "long-castling";
    } else if (data.san.startsWith("O-O")) {
      moveType = "short-castling";
    } else if (data.capturedStr) {
      moveType = "capture";
    }

    return {
      piece: data.piece,
      moveType,
      from: data.from,
      to: data.to,
      promotionPiece: data.promotion,
      check: /\+$/.test(data.san),
      checkmate: /\#$/.test(data.san),
    };
  }

  _getSquarePosition(square: TArea, fromDoc: boolean = true) {
    const isFlipped = this.element.game.getOptions().flipped;
    const coords = squareToCoords(square);
    const { left, top, width } = this.element.getBoundingClientRect();
    const squareWidth = width / 8;
    const correction = squareWidth / 2;

    if (!isFlipped) {
      return {
        x: (fromDoc ? left : 0) + squareWidth * coords[0] - correction,
        y: (fromDoc ? top : 0) + width - squareWidth * coords[1] + correction,
      };
    } else {
      return {
        x: (fromDoc ? left : 0) + width - squareWidth * coords[0] + correction,
        y: (fromDoc ? top : 0) + squareWidth * coords[1] - correction,
      };
    }
  }
}
