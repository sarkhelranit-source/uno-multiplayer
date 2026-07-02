import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { UnoGame } from "./types";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const GAMES_TABLE = process.env.GAMES_TABLE!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { eventType, connectionId } = event.requestContext;

  if (eventType === "CONNECT") {
    // Optionally parse query string parameters like ?roomId=1234 or ?sessionId=xyz
    const roomId = event.queryStringParameters?.roomId;
    
    try {
      await docClient.send(new PutCommand({
        TableName: CONNECTIONS_TABLE,
        Item: {
          connectionId: connectionId,
          roomId: roomId || "LOBBY",
          timestamp: Date.now(),
        }
      }));
      return { statusCode: 200, body: "Connected." };
    } catch (err) {
      console.error("Error connecting:", err);
      return { statusCode: 500, body: "Failed to connect." };
    }
  } else if (eventType === "DISCONNECT") {
    try {
      // 1. Get the connection to find the roomId
      const connectionData = await docClient.send(new GetCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId }
      }));

      const roomId = connectionData.Item?.roomId;

      // 2. Delete the connection
      await docClient.send(new DeleteCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId }
      }));

      // 3. (Optional) If they were in a room, mark them as disconnected in the GamesTable
      if (roomId && roomId !== "LOBBY") {
        const gameData = await docClient.send(new GetCommand({
          TableName: GAMES_TABLE,
          Key: { roomId }
        }));

        if (gameData.Item) {
          const game = gameData.Item as UnoGame;
          const playerIndex = game.players.findIndex(p => p.connectionId === connectionId);
          
          if (playerIndex !== -1) {
            game.players[playerIndex].isDisconnected = true;
            await docClient.send(new PutCommand({
              TableName: GAMES_TABLE,
              Item: game
            }));
            
            // TODO: Broadcast disconnect to other players via Game Logic or ApiGatewayManagementApi
          }
        }
      }

      return { statusCode: 200, body: "Disconnected." };
    } catch (err) {
      console.error("Error disconnecting:", err);
      return { statusCode: 500, body: "Failed to disconnect." };
    }
  }

  return { statusCode: 400, body: "Invalid event type." };
};
