import filter from "lodash/filter";
import isEqual from "lodash/isEqual";
import { postMessage, squareToCoords } from "./utils";
import { boards, drawCache } from "./globals";
import { parseCommand } from "./commands";
import {
  IChessboard,
  TArea,
  TPiece,
  IMoveTemplate,
  IPotentialMoves,
  IMove,
  TFromTo,
  TMoveType,
  Nullable,
  KeyDirection,
} from "./types";
import { i18n } from "./i18n";
import { ComponentChessboard } from "./chessboard";

/**
 * Check if input is valid square name
 */
export function validateSquareName(input: string): boolean {
  return /^[a-h][1-8]$/.test(input);
}

const emptyDrawCache: { arrows: TFromTo[]; areas: TArea[] } = {
  arrows: [],
  areas: [],
};

/**
 * Draw all needed arrows and marks on the board
 * Note that drawing is async,
 * otherwise it can be triggered during opponent's move
 */
export function drawMovesOnBoard(board: IChessboard, inputText: string): void {
  if (!board) {
    return;
  }

  setTimeout(() => {
    const parseResults = parseMoveInput(inputText);
    const moves = getLegalMoves(board, parseResults);

    const prevState = drawCache.get(board) || emptyDrawCache;
    let newState = emptyDrawCache;

    if (moves.length === 1) {
      const move = moves[0];
      newState = {
        arrows: [[move.from, move.to]],
        areas: [],
      };
    } else if (moves.length > 1) {
      newState = {
        arrows: [],
        areas: moves.map((m) => {
          return m.from;
        }),
      };
    }

    if (isEqual(prevState, newState)) {
      return;
    }

    // unmark old aread
    prevState.arrows.forEach((arrow: TFromTo) => board.unmarkArrow(...arrow));
    prevState.areas.forEach((area: TArea) => board.unmarkArea(area));

    // draw new ones
    newState.arrows.forEach((arrow: TFromTo) => board.markArrow(...arrow));
    newState.areas.forEach((area: TArea) => board.markArea(area));

    drawCache.set(board, newState);
  });
}

/**
 * Handle user input and act in appropriate way
 * The function uses active board on the screen if there's any
 */
export function go(board: IChessboard, input: string): boolean {
  const command = parseCommand(input);
  if (command) {
    command();
    return true;
  }

  const parseResult = parseMoveInput(input);
  const moves = getLegalMoves(board, parseResult);
  if (moves.length === 1) {
    const move = moves[0];
    makeMove(board, move.from, move.to, move.promotionPiece);

    return true;
  } else if (moves.length > 1) {
    postMessage(i18n("ambiguousMove", { move: input }));
  } else {
    postMessage(i18n("incorrectMove", { move: input }));
  }

  return false;
}

export function goKbAndMouse(
  board: ComponentChessboard,
  targetSquare: TArea,
  piece: TPiece,
  direction: KeyDirection
) {
  const moveString = (piece: TPiece, targetSquare: TArea) => {
    return piece === "p" ? targetSquare : piece.toUpperCase() + targetSquare;
  };
  const potentialMovesTemplates = [
    {
      piece: piece,
      to: targetSquare,
      from: "..",
    },
  ];
  const moves = board.isPlayersMove()
    ? getLegalMoves(board, potentialMovesTemplates)
    : getLegalPremoves(board, potentialMovesTemplates);

  if (moves.length === 0) {
    postMessage(
      i18n("incorrectMove", { move: moveString(piece, targetSquare) })
    );
    return;
  }

  let move: Nullable<IMove> = null;
  if (moves.length === 1) {
    move = moves[0];
  } else {
    move = narrowDownMoves(
      board.getPieceMap(),
      moves,
      piece,
      direction,
      board.game.getOptions().flipped
    );
  }
  if (move !== null) {
    makeMove(board, move.from, move.to, move.promotionPiece);
  } else {
    postMessage(
      i18n("ambiguousMove", { move: moveString(piece, targetSquare) })
    );
  }
}

function narrowDownMoves(
  pieceMap: Record<TPiece, Record<KeyDirection, TArea>>,
  potentialMoves: IMove[],
  piece: TPiece,
  direction: KeyDirection,
  flipped: boolean
): Nullable<IMove> {
  if (piece === "p") {
    // Check for autopromotion
    const firstMove = potentialMoves[0];
    const everyMoveStartsFromSameSquare = potentialMoves.every(
      (move) => move.from === firstMove.from
    );

    if (everyMoveStartsFromSameSquare) {
      const queenPromotionMove = potentialMoves.find((move) => {
        return move.promotionPiece === "q";
      });
      if (queenPromotionMove) {
        return queenPromotionMove;
      }
    }

    if (direction === KeyDirection.GENERAL) {
      const forwardMoves = potentialMoves.filter((move) => {
        move.from[0] === move.to[0];
      });
      if (forwardMoves.length === 1) {
        return forwardMoves[0];
      }
    } else if (direction === KeyDirection.LEFT) {
      const leftMoves = potentialMoves.filter((move) => {
        return flipped ? move.from[0] > move.to[0] : move.from[0] < move.to[0];
      });
      if (leftMoves.length === 1) {
        return leftMoves[0];
      }
    } else if (direction === KeyDirection.RIGHT) {
      const rightMoves = potentialMoves.filter((move) => {
        return flipped ? move.from[0] < move.to[0] : move.from[0] > move.to[0];
      });
      if (rightMoves.length === 1) {
        return rightMoves[0];
      }
    } else {
      throw new Error("Unsupported key direction");
    }
  }
  if (["n", "r", "q"].includes(piece)) {
    if (pieceMap[piece] && pieceMap[piece][direction]) {
      const startingSquare = pieceMap[piece][direction];
      const moves = potentialMoves.filter((move) => {
        return move.from === startingSquare;
      });
      if (moves.length === 1) {
        return moves[0];
      }
    }
  }
  return null;
}

/**
 * Check move and make it if it's legal
 * This function relies on chess.com chessboard interface
 */
export function makeMove(
  board: IChessboard,
  fromField: TArea,
  toField: TArea,
  promotionPiece?: TPiece
) {
  if (board.isLegalMove(fromField, toField)) {
    board.makeMove(fromField, toField, promotionPiece);
    try {
      board.submitDailyMove();
    } catch (e) {
      console.log(e);
    }
  } else {
    const move = fromField + "-" + toField;
    postMessage(i18n("illegalMove", { move }));
  }
}

/**
 * Get exact from and to coords from move data
 */
export function getLegalMoves(
  board: IChessboard,
  potentialMoves: IPotentialMoves
): IMove[] {
  if (!board || !potentialMoves.length || !board.isPlayersMove()) {
    return [];
  }

  let legalMoves: IMove[] = [];
  potentialMoves.forEach((move) => {
    const toYCoord = squareToCoords(move.to)[1];

    const pieces = board.getPiecesSetup();

    const matchingPieces = filter(pieces, (p) => {
      // Treat promotion moves without "promotionPiece" as invalid
      if (p.type === "p" && [1, 8].includes(toYCoord) && !move.promotionPiece) {
        return false;
      }

      return (
        // RegExp is required, because move.piece/move.from aren't always there
        // It might be just ".", meaning "any piece" (imagine move like "e2e4")
        new RegExp(`^${move.piece}$`).test(p.type) &&
        new RegExp(`^${move.from}$`).test(p.area) &&
        board.isLegalMove(p.area, move.to)
      );
    });

    legalMoves = [
      ...legalMoves,
      ...matchingPieces.map((piece) => ({
        ...move,
        from: <TArea>piece.area,
      })),
    ];
  });

  return excludeConflictingMoves(legalMoves);
}

export function getLegalPremoves(
  board: ComponentChessboard,
  potentialMoves: IPotentialMoves
): IMove[] {
  if (!board || !potentialMoves.length) {
    return [];
  }

  let allLegalMoves = board.game.premoves.getLegalMoves();
  const moves: IMove[] = [];
  potentialMoves.forEach((move) => {
    const matchingMoves = allLegalMoves.filter((m) => {
      const matchingPiece =
        !m.piece || new RegExp(`^${move.piece}$`).test(m.piece);
      const matchingFrom =
        !m.from || !move.from || new RegExp(`^${move.from}$`).test(m.from);
      const matchingTo = m.to === move.to;
      const matchingPromotion = m.promotion === move.promotionPiece;
      return matchingPiece && matchingFrom && matchingTo && matchingPromotion;
    });
    for (const move of matchingMoves) {
      if (!move.piece) {
        continue;
      }
      moves.push({
        piece: move.piece,
        from: move.from,
        to: move.to,
        promotionPiece: move.promotion,
      });
    }
  });
  console.log(`Legal premoves are ${JSON.stringify(moves, null, 2)}`);
  return moves;
}

/**
 * Exclude moves conflicting between each other for whatever reasons
 * (some exceptions)
 */
export function excludeConflictingMoves(moves: IMove[]): IMove[] {
  const piecesString = moves
    .map((m) => m.piece)
    .sort()
    .join("");
  if (piecesString === "bp") {
    // Bishop and pawn conflict
    // Pawn is preferred in this case
    // @see https://github.com/everyonesdesign/Chess-Helper/issues/51
    const pawnMove = moves.find((m) => m.piece === "p") as IMove;
    return [pawnMove];
  }

  return moves;
}

/**
 * Parse message input by user
 */
export function parseMoveInput(input: string): IPotentialMoves {
  return [...parseUCI(input), ...parseAlgebraic(input)];
}

/**
 * Parse simplest move format: 'e2e4'
 */
export function parseUCI(input: string): IPotentialMoves {
  const filteredSymbols = input.replace(/( |-)+/g, "");
  const fromSquare = <TArea>filteredSymbols.slice(0, 2);
  const toSquare = <TArea>filteredSymbols.slice(2, 4);
  const promotion = <TPiece>filteredSymbols.slice(4, 5);

  if (validateSquareName(fromSquare) && validateSquareName(toSquare)) {
    const result: IMoveTemplate = {
      piece: ".",
      from: fromSquare,
      to: toSquare,
    };

    if (promotion) {
      result.promotionPiece = promotion;
    }

    return [result];
  }

  return [];
}

/**
 * Extract all possible information from algebraic notation
 */
export function parseAlgebraic(input: string): IPotentialMoves {
  // ignore UCI notation
  if (/^\s*[a-h][1-8][a-h][1-8][rqknb]?\s*$/.test(input)) {
    return [];
  }

  let moveString = input.replace(/[\s\-\(\)]+/g, "");
  const moves: IPotentialMoves = [];

  if (/[o0][o0][o0]/i.test(moveString)) {
    return [
      // white long castling
      {
        piece: "k",
        from: "e1",
        to: "c1",
      },
      // black long castling
      {
        piece: "k",
        from: "e8",
        to: "c8",
      },
    ];
  } else if (/[o0][o0]/i.test(moveString)) {
    return [
      // white short castling
      {
        piece: "k",
        from: "e1",
        to: "g1",
      },
      // black short castling
      {
        piece: "k",
        from: "e8",
        to: "g8",
      },
    ];
  }

  const pawnRegex =
    /^([a-h])?(x)?([a-h])([1-8])(e\.?p\.?)?(=[qrnbQRNB])?[+#]?$/;
  const pawnResult = moveString.match(pawnRegex);
  if (pawnResult) {
    const [_, fromFile, isCapture, toFile, toRank, enPassant, promotion] =
      pawnResult;

    if (fromFile === toFile) {
      // Do nothing
      // This disables moves like `bb4` for pawns to avoid ambiguity with bishops
    } else {
      const move: IMoveTemplate = {
        piece: "p",
        from: <TArea>`${fromFile || "."}.`,
        to: <TArea>`${toFile || "."}${toRank || "."}`,
      };

      if (promotion) {
        move.promotionPiece = <TPiece>promotion[1].toLowerCase();
      }

      moves.push(move);
    }
  }

  const pieceRegex = /^([RQKNBrqknb])([a-h])?([1-8])?(x)?([a-h])([1-8])?[+#]?$/;
  const pieceResult = moveString.match(pieceRegex);
  if (pieceResult) {
    const [_, pieceName, fromFile, fromVer, isCapture, toFile, toRank] =
      pieceResult;

    moves.push({
      piece: <TPiece>pieceName.toLowerCase(),
      from: <TArea>`${fromFile || "."}${fromVer || "."}`,
      to: <TArea>`${toFile || "."}${toRank || "."}`,
    });
  }

  return moves;
}
