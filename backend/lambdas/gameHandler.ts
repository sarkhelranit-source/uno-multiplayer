// =====================================================
// gameHandler.ts — Lambda handler for $default WebSocket route
//
// Handles TWO categories of actions:
//   1. Room Management: CREATE_ROOM, JOIN_ROOM, LEAVE_ROOM, RECONNECT
//   2. Game Actions:    START_GAME, PLAY_CARD, DRAW_CARD, etc.
//
// Routes incoming WebSocket messages to the appropriate
// function, persists state, and broadcasts updates.
// =====================================================

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient, GetCommand, PutCommand,
  DeleteCommand, UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { UnoGame, UnoPlayer, CardColor } from "./types.js";
import {
  initializeGame,
  playCard,
  drawCard,
  playDrawnCard,
  passAfterDraw,
  callUno,
  getPublicGameState,
  getPrivatePlayerState,
} from "./gameEngine.js";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const GAMES_TABLE = process.env.GAMES_TABLE!;

// Room code characters (no ambiguous chars like 0/O, 1/I/L)
const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 4;
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;

// =====================================================
// MAIN HANDLER
// =====================================================

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

  let body: { action: string; payload?: Record<string, unknown> };
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON." };
  }

  const { action, payload = {} } = body;

  // Validate action is a known string
  const VALID_ACTIONS = [
    // Room management
    'CREATE_ROOM', 'JOIN_ROOM', 'LEAVE_ROOM', 'RECONNECT',
    // Game actions
    'START_GAME', 'PLAY_CARD', 'DRAW_CARD', 'PLAY_DRAWN_CARD',
    'PASS_AFTER_DRAW', 'CALL_UNO', 'TIMEOUT',
    // Keep-alive
    'PING',
    // Reactions
    'SEND_REACTION',
    // Reset
    'RETURN_TO_LOBBY',
  ];
  if (!VALID_ACTIONS.includes(action)) {
    return { statusCode: 400, body: `Unknown action: ${action}` };
  }

  // Handle keep-alive pings immediately — no processing needed
  if (action === 'PING') {
    return { statusCode: 200, body: 'PONG' };
  }

  try {
    // =========================================================
    // ROOM MANAGEMENT (don't need to be in a game yet)
    // =========================================================
    if (action === 'CREATE_ROOM') {
      return await handleCreateRoom(connectionId, payload, apigwManagementApi);
    }

    if (action === 'JOIN_ROOM') {
      return await handleJoinRoom(connectionId, payload, apigwManagementApi);
    }

    if (action === 'RECONNECT') {
      return await handleReconnect(connectionId, payload, apigwManagementApi);
    }

    // =========================================================
    // GAME ACTIONS (must be in a room)
    // =========================================================

    // 1. Get Room ID for this connection
    const connectionData = await docClient.send(new GetCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
    }));

    const roomId = connectionData.Item?.roomId as string | undefined;
    if (!roomId || roomId === "LOBBY") {
      await sendToConnection(apigwManagementApi, connectionId, {
        type: 'error',
        message: 'You are not in a room. Create or join one first.',
      });
      return { statusCode: 400, body: "Not in a room." };
    }

    let retries = 3;
    while (retries > 0) {
      try {
        // 2. Get Game State
        const gameData = await docClient.send(new GetCommand({
      TableName: GAMES_TABLE,
      Key: { roomId },
    }));

    if (!gameData.Item) {
      return { statusCode: 404, body: "Game not found." };
    }

    const game = gameData.Item as UnoGame;

    // Handle LEAVE_ROOM
    if (action === 'LEAVE_ROOM') {
      return await handleLeaveRoom(connectionId, game, apigwManagementApi);
    }

    // Handle SEND_REACTION
    if (action === 'SEND_REACTION') {
      const sender = game.players.find(p => p.connectionId === connectionId);
      if (sender) {
        const now = Date.now();
        // Rate limit: 3 seconds (3000 ms)
        if (sender.lastReactionAt && now - sender.lastReactionAt < 3000) {
          return { statusCode: 429, body: "Too many reactions." };
        }
        
        sender.lastReactionAt = now;
        
        await broadcastToRoom(game, apigwManagementApi, {
          type: 'reaction',
          emoji: payload.emoji,
          playerName: sender.name
        });
        
        // Save the updated lastReactionAt timestamp to DynamoDB
        await saveGame(game);
      }
      return { statusCode: 200, body: "Reaction sent." };
    }

    // 3. Process Game Action through the engine
    let result;

    switch (action) {
      case 'RETURN_TO_LOBBY': {
        if (game.status !== 'finished') {
          return { statusCode: 400, body: "Game is not finished." };
        }
        
        const sender = game.players.find(p => p.connectionId === connectionId);
        if (!sender) return { statusCode: 400, body: "Sender not found." };
        
        const actualHost = game.players.find(p => p.sessionId === game.hostId);
        let isHost = !!actualHost && sender.name === actualHost.name;
        
        // If not host, check if host is disconnected. If so, transfer host role.
        if (!isHost) {
          if (actualHost?.isDisconnected) {
            game.hostId = sender.sessionId;
            isHost = true;
          }
        }
        
        if (!isHost) {
          return { statusCode: 403, body: "Only the host can return to lobby." };
        }
        
        // Reset game state for lobby
        game.status = 'waiting';
        game.winner = undefined;
        game.players.forEach(p => {
          p.hand = [];
          p.hasCalledUno = false;
        });
        game.drawPile = [];
        game.discardPile = [];
        
        // Broadcast lobby update
        const currentHostName = game.players.find(p => p.sessionId === game.hostId)?.name;
        const lobbyState = {
          type: 'lobbyUpdate',
          roomId: game.roomId,
          players: game.players.map(p => ({
            name: p.name,
            isHost: p.name === currentHostName,
            isDisconnected: p.isDisconnected,
          })),
          playerCount: game.players.length,
          maxPlayers: MAX_PLAYERS,
        };
        await broadcastToRoom(game, apigwManagementApi, lobbyState);
        
        result = { success: true };
        break;
      }

      case 'START_GAME': {
        if (game.status !== 'waiting') {
          return { statusCode: 400, body: "Game already started." };
        }
        const hostPlayer = game.players.find(p => p.connectionId === connectionId);
        const actualHost = game.players.find(p => p.sessionId === game.hostId);
        
        // Allowed if the player is the host, OR if the actual host is disconnected
        if (game.hostId !== hostPlayer?.sessionId && !actualHost?.isDisconnected) {
          return { statusCode: 403, body: "Only the host can start the game." };
        }
        // Strip any remaining disconnected ghost players (Fix B)
        game.players = game.players.filter(p => !p.isDisconnected);
        
        if (game.players.length < MIN_PLAYERS) {
          return { statusCode: 400, body: `Need at least ${MIN_PLAYERS} connected players to start.` };
        }

        // If the host was stripped because they were disconnected, transfer host to the first active player
        if (!game.players.some(p => p.sessionId === game.hostId) && game.players.length > 0) {
          game.hostId = game.players[0].sessionId;
        }

        const newGame = initializeGame(
          roomId,
          game.hostId,
          game.players.map(p => ({
            connectionId: p.connectionId,
            sessionId: p.sessionId,
            name: p.name,
          })),
        );

        // Inherit the version from the lobby state to satisfy OCC
        newGame.version = game.version;

        await saveGame(newGame);
        await broadcastGameState(newGame, apigwManagementApi);
        return { statusCode: 200, body: "Game started." };
      }

      case 'PLAY_CARD':
        result = playCard(
          game, connectionId,
          payload.cardId as string,
          payload.wildColor as string | undefined,
          payload.unoCalled as boolean | undefined,
        );
        break;

      case 'DRAW_CARD':
        result = drawCard(game, connectionId);
        break;

      case 'PLAY_DRAWN_CARD':
        result = playDrawnCard(
          game, connectionId,
          payload.cardId as string,
          payload.wildColor as string | undefined,
          payload.unoCalled as boolean | undefined,
        );
        break;

      case 'PASS_AFTER_DRAW':
        result = passAfterDraw(game, connectionId);
        break;

      case 'CALL_UNO':
        result = callUno(game, connectionId);
        break;

      case 'TIMEOUT': {
        const timeSinceTurnStarted = Date.now() - (game.turnStartedAt || 0);
        if (timeSinceTurnStarted < 25_000) {
          // Silently ignore early timeouts (due to network sync/clock drift).
          // The frontend will resend it on its next interval tick.
          return { statusCode: 200, body: "Ignored early timeout." };
        }
        const timedOutPlayer = game.players[game.currentPlayerIndex];
        return await handleLeaveRoom(
          timedOutPlayer.connectionId, 
          game, 
          apigwManagementApi, 
          `${timedOutPlayer.name} timed out due to inactivity and was removed.`
        );
      }

      default:
        return { statusCode: 400, body: "Unknown action." };
    }

    // 4. Check result
    if (!result.success) {
      await sendToConnection(apigwManagementApi, connectionId, {
        type: 'error',
        message: result.error || 'Action failed.',
      });
      return { statusCode: 400, body: result.error || "Action failed." };
    }

    // Let the game naturally fall through to save the finished state

    // 5. Save Updated Game State
    await saveGame(game);

    // 6. Broadcast to all players in the room
    await broadcastGameState(game, apigwManagementApi);

    return { statusCode: 200, body: "OK" };
      } catch (err: any) {
        if (err.name === 'ConditionalCheckFailedException') {
          retries--;
          if (retries > 0) {
            continue;
          }
          
          try {
            await sendToConnection(apigwManagementApi, connectionId, {
              type: 'error',
              message: 'Network sync failed. Please try your move again.',
            });
          } catch (e) {
            console.error('Failed to send OCC error message', e);
          }
          // Return 200 OK so API Gateway doesn't log a system crash
          return { statusCode: 200, body: "Conflict resolved by informing client" };
        }

        console.error("Error processing action:", err);
        return { statusCode: 500, body: "Internal server error." };
      }
    }
    return { statusCode: 500, body: "Unexpected loop exit." };
  } catch (err: any) {
    console.error("Error outside retry loop:", err);
    return { statusCode: 500, body: "Internal server error." };
  }
};

// =====================================================
// ROOM MANAGEMENT
// =====================================================

/**
 * Creates a new room. The creator becomes the host.
 * Payload: { playerName: string }
 */
async function handleCreateRoom(
  connectionId: string,
  payload: Record<string, unknown>,
  apigwManagementApi: ApiGatewayManagementApiClient,
): Promise<APIGatewayProxyResult> {
  const playerName = validatePlayerName(payload.playerName);
  if (!playerName) {
    return { statusCode: 400, body: "Invalid player name." };
  }

  // Get sessionId from ConnectionsTable
  const connData = await docClient.send(new GetCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
  }));
  const sessionId = (connData.Item?.sessionId as string) || connectionId;

  // Generate unique room code
  const roomId = generateRoomCode();

  // Create the initial player
  const hostPlayer: UnoPlayer = {
    connectionId,
    sessionId,
    name: playerName,
    hand: [],
    hasCalledUno: false,
    isDisconnected: false,
  };

  // Create the game in "waiting" status
  const game: UnoGame = {
    roomId,
    hostId: sessionId,
    status: 'waiting',
    drawPile: [],
    discardPile: [],
    currentPlayerIndex: 0,
    direction: 1,
    currentColor: 'red' as CardColor,
    pendingDrawCount: 0,
    hasDrawnThisTurn: false,
    players: [hostPlayer],
    settings: {
      stackDrawCards: true,
      forcePlay: false,
      jumpIn: false,
      drawUntilMatch: false,
    },
  };

  // Save the game
  await saveGame(game);

  // Update connection's roomId
  await docClient.send(new UpdateCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
    UpdateExpression: 'SET roomId = :roomId',
    ExpressionAttributeValues: { ':roomId': roomId },
  }));

  // Send room created confirmation to the creator
  await sendToConnection(apigwManagementApi, connectionId, {
    type: 'roomCreated',
    roomId,
    players: [{ name: playerName, isHost: true, isReady: true }],
  });

  return { statusCode: 200, body: "Room created." };
}

/**
 * Joins an existing room.
 * Payload: { roomId: string, playerName: string }
 */
async function handleJoinRoom(
  connectionId: string,
  payload: Record<string, unknown>,
  apigwManagementApi: ApiGatewayManagementApiClient,
): Promise<APIGatewayProxyResult> {
  const playerName = validatePlayerName(payload.playerName);
  if (!playerName) {
    return { statusCode: 400, body: "Invalid player name." };
  }

  const roomId = (payload.roomId as string || '').toUpperCase().trim();
  if (!roomId || roomId.length !== ROOM_CODE_LENGTH) {
    return { statusCode: 400, body: "Invalid room code." };
  }

  // Get the game
  const gameData = await docClient.send(new GetCommand({
    TableName: GAMES_TABLE,
    Key: { roomId },
  }));

  if (!gameData.Item) {
    await sendToConnection(apigwManagementApi, connectionId, {
      type: 'error',
      message: 'Room not found. Check the code and try again.',
    });
    return { statusCode: 404, body: "Room not found." };
  }

  const game = gameData.Item as UnoGame;

  // Validate room state
  if (game.status === 'playing') {
    // Allow joining as spectator in the future; for now, reject
    await sendToConnection(apigwManagementApi, connectionId, {
      type: 'error',
      message: 'Game already in progress. Wait for it to finish.',
    });
    return { statusCode: 400, body: "Game already in progress." };
  }

  // Prevent joining abandoned rooms
  if (game.players.every(p => p.isDisconnected)) {
    await sendToConnection(apigwManagementApi, connectionId, {
      type: 'error',
      message: 'This room has been abandoned by the host. Please check the code or create a new room.',
    });
    return { statusCode: 404, body: "Room abandoned." };
  }

  // Get sessionId
  const connData = await docClient.send(new GetCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
  }));
  const sessionId = (connData.Item?.sessionId as string) || connectionId;

  // Check for duplicate names or reclaimable seats (Fix D)
  const existingPlayerIndex = game.players.findIndex(p => p.name.toLowerCase() === playerName.toLowerCase());
  
  if (existingPlayerIndex !== -1) {
    if (game.players[existingPlayerIndex].isDisconnected) {
      // Reclaim the disconnected ghost seat
      game.players[existingPlayerIndex].connectionId = connectionId;
      game.players[existingPlayerIndex].sessionId = sessionId;
      game.players[existingPlayerIndex].isDisconnected = false;
    } else {
      await sendToConnection(apigwManagementApi, connectionId, {
        type: 'error',
        message: 'That name is already taken in this room.',
      });
      return { statusCode: 400, body: "Name already taken." };
    }
  } else {
    // If not reclaiming, verify the room isn't full
    if (game.players.length >= MAX_PLAYERS) {
      await sendToConnection(apigwManagementApi, connectionId, {
        type: 'error',
        message: 'Room is full (max 8 players).',
      });
      return { statusCode: 400, body: "Room is full." };
    }

    // Add the new player
    const newPlayer: UnoPlayer = {
      connectionId,
      sessionId,
      name: playerName,
      hand: [],
      hasCalledUno: false,
      isDisconnected: false,
    };
    game.players.push(newPlayer);
  }

  // Save the game
  await saveGame(game);

  // Update connection's roomId
  await docClient.send(new UpdateCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
    UpdateExpression: 'SET roomId = :roomId',
    ExpressionAttributeValues: { ':roomId': roomId },
  }));

  // Broadcast updated lobby state to ALL players in the room
  const currentHostName = game.players.find(p => p.sessionId === game.hostId)?.name;
  const lobbyState = {
    type: 'lobbyUpdate',
    roomId,
    players: game.players.map(p => ({
      name: p.name,
      isHost: p.name === currentHostName,
      isDisconnected: p.isDisconnected,
    })),
    playerCount: game.players.length,
    maxPlayers: MAX_PLAYERS,
  };

  await broadcastToRoom(game, apigwManagementApi, lobbyState);

  return { statusCode: 200, body: "Joined room." };
}

/**
 * Leaves the current room.
 */
async function handleLeaveRoom(
  connectionId: string,
  game: UnoGame,
  apigwManagementApi: ApiGatewayManagementApiClient,
  reason?: string
): Promise<APIGatewayProxyResult> {
  const playerIndex = game.players.findIndex(p => p.connectionId === connectionId);
  if (playerIndex === -1) {
    return { statusCode: 400, body: "Not in this room." };
  }

  const leavingPlayer = game.players[playerIndex];

  // Remove the player
  game.players.splice(playerIndex, 1);

  // Update connection back to LOBBY
  await docClient.send(new UpdateCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
    UpdateExpression: 'SET roomId = :roomId',
    ExpressionAttributeValues: { ':roomId': 'LOBBY' },
  }));

  // Notify the leaving player IMMEDIATELY
  await sendToConnection(apigwManagementApi, connectionId, {
    type: 'leftRoom',
    ...(reason && { reason: "You were kicked due to inactivity." })
  });

  // If room is now empty, delete the game
  if (game.players.length === 0) {
    await docClient.send(new DeleteCommand({
      TableName: GAMES_TABLE,
      Key: { roomId: game.roomId },
    }));
    return { statusCode: 200, body: "Left room. Room deleted." };
  }

  // If the host left, transfer host to the next player
  if (leavingPlayer.sessionId === game.hostId) {
    game.hostId = game.players[0].sessionId;
  }

  // If game is in progress and a player left, handle it
  if (game.status === 'playing') {
    if (game.players.length < MIN_PLAYERS) {
      // The remaining player wins by default!
      game.status = 'finished';
      game.winner = game.players[0].name;
      game.lastAction = 'Opponent left the game.';
    } else {
      // Adjust currentPlayerIndex based on who left
      if (game.currentPlayerIndex > playerIndex) {
        // The current player shifted left
        game.currentPlayerIndex -= 1;
      } else if (game.currentPlayerIndex === playerIndex) {
        // It was the leaving player's turn. The next player takes their spot.
        if (game.currentPlayerIndex >= game.players.length) {
          game.currentPlayerIndex = 0;
        }
        // Also reset the turn timer for the new player!
        game.turnStartedAt = Date.now();
      }
      // Put leaving player's cards back into draw pile
      if (leavingPlayer.hand.length > 0) {
        game.drawPile.push(...leavingPlayer.hand);
      }
      game.lastAction = reason || `${leavingPlayer.name} left the game.`;
    }
  }

  // Save updated game
  await saveGame(game);

  // Broadcast updated state to remaining players
  if (game.status === 'playing' || game.status === 'finished') {
    await broadcastGameState(game, apigwManagementApi);
  } else {
    const currentHostName = game.players.find(p => p.sessionId === game.hostId)?.name;
    const lobbyState = {
      type: 'lobbyUpdate',
      roomId: game.roomId,
      players: game.players.map(p => ({
        name: p.name,
        isHost: p.name === currentHostName,
        isDisconnected: p.isDisconnected,
      })),
      playerCount: game.players.length,
      maxPlayers: MAX_PLAYERS,
    };
    await broadcastToRoom(game, apigwManagementApi, lobbyState);
  }

  return { statusCode: 200, body: "Left room." };
}

/**
 * Reconnects a player using their sessionId.
 * Payload: { sessionId: string }
 */
async function handleReconnect(
  connectionId: string,
  payload: Record<string, unknown>,
  apigwManagementApi: ApiGatewayManagementApiClient,
): Promise<APIGatewayProxyResult> {
  const sessionId = payload.sessionId as string;
  if (!sessionId) {
    return { statusCode: 400, body: "Missing sessionId." };
  }

  // Look up the connection's room
  const connData = await docClient.send(new GetCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
  }));

  const roomId = connData.Item?.roomId as string | undefined;
  // If the connection already has a roomId from a previous session, try that
  // Otherwise, we need the roomId from the payload
  const targetRoomId = (roomId && roomId !== 'LOBBY') ? roomId : (payload.roomId as string);

  if (!targetRoomId) {
    return { statusCode: 400, body: "No room to reconnect to." };
  }

  const gameData = await docClient.send(new GetCommand({
    TableName: GAMES_TABLE,
    Key: { roomId: targetRoomId },
  }));

  if (!gameData.Item) {
    await sendToConnection(apigwManagementApi, connectionId, {
      type: 'error',
      message: 'Room no longer exists.',
    });
    return { statusCode: 404, body: "Room not found." };
  }

  const game = gameData.Item as UnoGame;

  // Find the player by sessionId
  const player = game.players.find(p => p.sessionId === sessionId);
  if (!player) {
    await sendToConnection(apigwManagementApi, connectionId, {
      type: 'error',
      message: 'No player with that session found in this room.',
    });
    return { statusCode: 404, body: "Player not found in room." };
  }

  // Update the player's connectionId and mark as connected
  player.connectionId = connectionId;
  player.isDisconnected = false;

  // Reset the turn timer if it's the reconnecting player's turn to give them a fair chance
  const playerIndex = game.players.findIndex(p => p.sessionId === sessionId);
  if (game.status === 'playing' && game.currentPlayerIndex === playerIndex) {
    game.turnStartedAt = Date.now();
  }

  // Update connection's roomId
  await docClient.send(new UpdateCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
    UpdateExpression: 'SET roomId = :roomId',
    ExpressionAttributeValues: { ':roomId': targetRoomId },
  }));

  // Save game
  await saveGame(game);

  // Send full game state to the reconnected player
  if (game.status === 'playing') {
    await broadcastGameState(game, apigwManagementApi);
  } else {
    const currentHostName = game.players.find(p => p.sessionId === game.hostId)?.name;
    const lobbyState = {
      type: 'lobbyUpdate',
      roomId: game.roomId,
      players: game.players.map(p => ({
        name: p.name,
        isHost: p.name === currentHostName,
        isDisconnected: p.isDisconnected,
      })),
      playerCount: game.players.length,
      maxPlayers: MAX_PLAYERS,
    };
    await broadcastToRoom(game, apigwManagementApi, lobbyState);
  }

  return { statusCode: 200, body: "Reconnected." };
}

// =====================================================
// HELPERS
// =====================================================

/** Generates a random room code like "A3K7" */
function generateRoomCode(): string {
  let code = '';
  const buffer = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(buffer);
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[buffer[i] % ROOM_CODE_CHARS.length];
  }
  return code;
}

/** Validates and sanitizes player name. Returns cleaned name or null if invalid. */
function validatePlayerName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const cleaned = name.trim().slice(0, 20); // max 20 chars
  if (cleaned.length < 1) return null;
  // Allow only alphanumeric + spaces + common characters
  if (!/^[a-zA-Z0-9 _\-]+$/.test(cleaned)) return null;
  return cleaned;
}

// =====================================================
// PERSISTENCE
// =====================================================

async function saveGame(game: UnoGame): Promise<void> {
  const currentVersion = game.version || 1;
  game.version = currentVersion + 1;

  // Set TTL to 24 hours from now (in seconds) to prevent database memory leaks
  (game as any).expiresAt = Math.floor(Date.now() / 1000) + (24 * 60 * 60);

  await docClient.send(new PutCommand({
    TableName: GAMES_TABLE,
    Item: game,
    ConditionExpression: "attribute_not_exists(#v) OR #v = :expectedVersion",
    ExpressionAttributeNames: {
      "#v": "version"
    },
    ExpressionAttributeValues: {
      ":expectedVersion": currentVersion
    }
  }));
}

// =====================================================
// MESSAGING
// =====================================================

/** Send a message to a specific connectionId */
async function sendToConnection(
  apigwManagementApi: ApiGatewayManagementApiClient,
  connectionId: string,
  message: Record<string, unknown>,
): Promise<void> {
  try {
    await apigwManagementApi.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(message)),
    }));
  } catch (e: unknown) {
    const error = e as { $metadata?: { httpStatusCode?: number } };
    if (error.$metadata?.httpStatusCode !== 410) {
      console.error(`Failed to send to ${connectionId}:`, e);
    }
  }
}

/** Broadcast a raw message to all connected players in a room */
async function broadcastToRoom(
  game: UnoGame,
  apigwManagementApi: ApiGatewayManagementApiClient,
  message: Record<string, unknown>,
): Promise<void> {
  const postPromises = game.players
    .filter(p => !p.isDisconnected)
    .map(player => sendToConnection(apigwManagementApi, player.connectionId, message));

  await Promise.all(postPromises);
}

/**
 * Sends personalized game state to each player.
 * Every player gets the same public state but only their own hand.
 */
async function broadcastGameState(
  game: UnoGame,
  apigwManagementApi: ApiGatewayManagementApiClient,
): Promise<void> {
  const publicState = getPublicGameState(game);

  const postPromises = game.players.map(async (player) => {
    if (player.isDisconnected) return;

    const privateState = getPrivatePlayerState(game, player.connectionId);

    await sendToConnection(apigwManagementApi, player.connectionId, {
      type: "gameStateUpdate",
      publicState,
      privateState,
    });
  });

  await Promise.all(postPromises);
}
