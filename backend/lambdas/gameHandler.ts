import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { UnoGame, Card } from "./types";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const GAMES_TABLE = process.env.GAMES_TABLE!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: "Missing connectionId." };
  }
  const endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
  const apigwManagementApi = new ApiGatewayManagementApiClient({ endpoint });
  
  if (!event.body) {
    return { statusCode: 400, body: "Missing body." };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON." };
  }

  const { action, payload } = body;

  try {
    // 1. Get Room ID for this connection
    const connectionData = await docClient.send(new GetCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId }
    }));
    
    const roomId = connectionData.Item?.roomId;
    if (!roomId || roomId === "LOBBY") {
      return { statusCode: 400, body: "Not in a game." };
    }

    // 2. Get Game State
    const gameData = await docClient.send(new GetCommand({
      TableName: GAMES_TABLE,
      Key: { roomId }
    }));
    
    if (!gameData.Item) {
      return { statusCode: 404, body: "Game not found." };
    }
    
    const game = gameData.Item as UnoGame;

    // 3. Process Action
    switch (action) {
      case "PLAY_CARD":
        await handlePlayCard(game, connectionId, payload.cardId, payload.wildColor);
        break;
      case "DRAW_CARD":
        await handleDrawCard(game, connectionId);
        break;
      case "CALL_UNO":
        await handleCallUno(game, connectionId);
        break;
      default:
        console.log("Unknown action:", action);
    }

    // 4. Save Updated Game State
    await docClient.send(new PutCommand({
      TableName: GAMES_TABLE,
      Item: game
    }));

    // 5. Broadcast to all players in the room
    await broadcastGameState(game, apigwManagementApi);

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("Error processing game action:", err);
    return { statusCode: 500, body: "Internal server error." };
  }
};

// --- Game Logic Helpers ---

async function handlePlayCard(game: UnoGame, connectionId: string, cardId: string, wildColor?: string) {
  const playerIndex = game.players.findIndex(p => p.connectionId === connectionId);
  if (playerIndex !== game.currentPlayerIndex) {
    throw new Error("Not your turn!");
  }

  const player = game.players[playerIndex];
  const cardIndex = player.hand.findIndex(c => c.id === cardId);
  
  if (cardIndex === -1) {
    throw new Error("Card not in hand!");
  }

  const cardToPlay = player.hand[cardIndex];
  const topCard = game.discardPile[game.discardPile.length - 1];

  // TODO: Implement thorough validation (matching color/value)
  const isValid = cardToPlay.color === "wild" || 
                  cardToPlay.color === game.currentColor ||
                  cardToPlay.value === topCard.value;

  if (!isValid) {
    throw new Error("Invalid move!");
  }

  // Remove from hand, add to discard
  player.hand.splice(cardIndex, 1);
  game.discardPile.push(cardToPlay);

  // Apply card effects
  if (cardToPlay.color === "wild") {
    game.currentColor = wildColor || "red"; // Fallback
    if (cardToPlay.value === "wild4") {
      game.pendingDrawCount += 4;
      // Skip next player effectively handled later or drawn by them
    }
  } else {
    game.currentColor = cardToPlay.color;
    if (cardToPlay.value === "draw2") {
      game.pendingDrawCount += 2;
    } else if (cardToPlay.value === "reverse") {
      game.direction = (game.direction * -1) as 1 | -1;
    } else if (cardToPlay.value === "skip") {
      // Advance an extra turn
      advanceTurn(game);
    }
  }

  // Next player's turn
  advanceTurn(game);
}

async function handleDrawCard(game: UnoGame, connectionId: string) {
  const playerIndex = game.players.findIndex(p => p.connectionId === connectionId);
  if (playerIndex !== game.currentPlayerIndex) {
    throw new Error("Not your turn!");
  }

  const player = game.players[playerIndex];
  
  // Handle stacked draw cards (e.g. Draw 2 or Draw 4)
  const drawCount = game.pendingDrawCount > 0 ? game.pendingDrawCount : 1;
  game.pendingDrawCount = 0; // reset

  for (let i = 0; i < drawCount; i++) {
    if (game.drawPile.length === 0) {
      reshuffleDiscardIntoDraw(game);
    }
    const drawnCard = game.drawPile.pop();
    if (drawnCard) {
      player.hand.push(drawnCard);
    }
  }

  // Advance turn
  advanceTurn(game);
}

async function handleCallUno(game: UnoGame, connectionId: string) {
  const player = game.players.find(p => p.connectionId === connectionId);
  if (player && player.hand.length <= 2) {
    player.hasCalledUno = true;
  }
}

function advanceTurn(game: UnoGame) {
  let nextIndex = game.currentPlayerIndex + game.direction;
  if (nextIndex >= game.players.length) {
    nextIndex = 0;
  } else if (nextIndex < 0) {
    nextIndex = game.players.length - 1;
  }
  game.currentPlayerIndex = nextIndex;
}

function reshuffleDiscardIntoDraw(game: UnoGame) {
  const topCard = game.discardPile.pop(); // Keep top card on discard
  
  // In real implementation, shuffle this array
  game.drawPile = [...game.discardPile];
  game.discardPile = topCard ? [topCard] : [];
}

async function broadcastGameState(game: UnoGame, apigwManagementApi: ApiGatewayManagementApiClient) {
  // We must send custom payloads to each player since hands are private
  
  const publicGameState = {
    discardPile: game.discardPile,
    currentPlayerIndex: game.currentPlayerIndex,
    direction: game.direction,
    currentColor: game.currentColor,
    playerData: game.players.map(p => ({
      name: p.name,
      cardCount: p.hand.length,
      hasCalledUno: p.hasCalledUno,
      isDisconnected: p.isDisconnected
    }))
  };

  const postPromises = game.players.map(async (player) => {
    if (player.isDisconnected) return;
    
    const privatePayload = {
      type: "gameStateUpdate",
      publicState: publicGameState,
      privateState: {
        hand: player.hand
      }
    };

    try {
      await apigwManagementApi.send(new PostToConnectionCommand({
        ConnectionId: player.connectionId,
        Data: Buffer.from(JSON.stringify(privatePayload))
      }));
    } catch (e: any) {
      if (e.$metadata?.httpStatusCode === 410) {
        player.isDisconnected = true;
      } else {
        console.error("Failed to post to connection", e);
      }
    }
  });

  await Promise.all(postPromises);
}
