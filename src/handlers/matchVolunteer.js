import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event) => {
  try {
    const { incidentId, volunteerId } = JSON.parse(event.body || "{}");

    if (!incidentId || !volunteerId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing incidentId or volunteerId." }) };
    }

    const timestamp = Date.now();

    await docClient.send(new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { PK: `INCIDENT#${incidentId}`, SK: "METADATA" },
      UpdateExpression: "SET #st = :matched, matchedVolunteerId = :volId, updatedAt = :ts",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":matched": "matched",
        ":volId": volunteerId,
        ":ts": timestamp
      }
    }));

    await docClient.send(new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { PK: `VOLUNTEER#${volunteerId}`, SK: "METADATA" },
      UpdateExpression: "SET #st = :assigned, assignedTo = :incId, updatedAt = :ts",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":assigned": "assigned",
        ":incId": incidentId,
        ":ts": timestamp
      }
    }));

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Volunteer successfully dispatched.", incidentId, volunteerId })
    };
  } catch (error) {
    console.error("Match Error:", error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to dispatch volunteer." })
    };
  }
};
