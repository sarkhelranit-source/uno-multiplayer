// =====================================================
// connectionHandler.ts — Lambda handler for $connect / $disconnect
//
// Manages the WebSocket connection lifecycle:
//   $connect  → Stores connectionId in ConnectionsTable
//   $disconnect → Removes connection, marks player as disconnected,
//                 broadcasts disconnect to remaining room players.
// =====================================================

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { UnoGame } from "./types.js";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const GAMES_TABLE = process.env.GAMES_TABLE!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { eventType, connectionId } = event.requestContext;

  if (eventType === "CONNECT") {
    // Parse query string parameters: ?sessionId=xyz
    // sessionId is used for reconnection — it persists across browser refreshes
    const sessionId = event.queryStringParameters?.sessionId;

    try {
      await docClient.send(new PutCommand({
        TableName: CONNECTIONS_TABLE,
        Item: {
          connectionId: connectionId,
          sessionId: sessionId || connectionId, // fallback to connectionId if no sessionId
          roomId: "LOBBY",
          timestamp: Date.now(),
        },
      }));
      return { statusCode: 200, body: "Connected." };
    } catch (err) {
      console.error("Error on $connect:", err);
      return { statusCode: 500, body: "Failed to connect." };
    }

  } else if (eventType === "DISCONNECT") {
    try {
      // 1. Get the connection to find the roomId
      const connectionData = await docClient.send(new GetCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId },
      }));

      const roomId = connectionData.Item?.roomId as string | undefined;

      // 2. Delete the connection record
      await docClient.send(new DeleteCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId },
      }));

      // 3. If they were in a room, mark them as disconnected in the game
      if (roomId && roomId !== "LOBBY") {
        const gameData = await docClient.send(new GetCommand({
          TableName: GAMES_TABLE,
          Key: { roomId },
        }));

        if (gameData.Item) {
          const game = gameData.Item as UnoGame;
          const playerIndex = game.players.findIndex(p => p.connectionId === connectionId);

          if (playerIndex !== -1) {
            game.players[playerIndex].isDisconnected = true;

            // Save updated game state
            await docClient.send(new PutCommand({
              TableName: GAMES_TABLE,
              Item: game,
            }));

            // Broadcast disconnect to remaining connected players
            const endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
            const apigwManagementApi = new ApiGatewayManagementApiClient({ endpoint });

            const disconnectMessage = {
              type: "playerDisconnected",
              playerName: game.players[playerIndex].name,
              playerIndex,
              players: game.players.map(p => ({
                name: p.name,
                cardCount: p.hand.length,
                hasCalledUno: p.hasCalledUno,
                isDisconnected: p.isDisconnected,
              })),
            };

            const postPromises = game.players
              .filter(p => !p.isDisconnected && p.connectionId !== connectionId)
              .map(async (player) => {
                try {
                  await apigwManagementApi.send(new PostToConnectionCommand({
                    ConnectionId: player.connectionId,
                    Data: Buffer.from(JSON.stringify(disconnectMessage)),
                  }));
                } catch (e: unknown) {
                  const error = e as { $metadata?: { httpStatusCode?: number } };
                  if (error.$metadata?.httpStatusCode === 410) {
                    player.isDisconnected = true;
                  }
                }
              });

            await Promise.all(postPromises);
          }
        }
      }

      return { statusCode: 200, body: "Disconnected." };
    } catch (err) {
      console.error("Error on $disconnect:", err);
      return { statusCode: 500, body: "Failed to disconnect." };
    }
  }

  return { statusCode: 400, body: "Invalid event type." };
};
