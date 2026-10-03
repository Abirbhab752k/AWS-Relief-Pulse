import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event) => {
  try {
    const { text } = JSON.parse(event.body || "{}");
    if (!text) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing emergency description text." }) };
    }

    const volunteersData = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_NAME,
      FilterExpression: "BEGINS_WITH(PK, :pk) AND #st = :status",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: { ":pk": "VOLUNTEER#", ":status": "available" }
    }));

    const roster = (volunteersData.Items || []).map(v => 
      `- ID: ${v.id} | Name: ${v.name} | Skills: ${v.categories?.join(",")} | Radius: ${v.radiusKm}km`
    ).join("\n");

    const prompt = `You are an AI triage coordinator for emergency dispatch in India. Analyze this report and output ONLY a JSON object:

Report: "${text}"

Volunteer Roster:
${roster}

JSON Format:
{
  "urgencyScore": <number 1-10>,
  "categories": ["medical"|"food"|"transport"|"shelter"|"power"|"pets"],
  "summary": "<dispatch summary under 20 words>",
  "rationale": "<reason for urgency score>",
  "recommendedAction": "<immediate next step>",
  "recommendedVolunteerIds": [<matching volunteer IDs>]
}`;

    const command = new InvokeModelCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const bedrockResponse = await bedrock.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
    const resultText = responseBody.content[0].text;
    const triageData = JSON.parse(resultText);

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify(triageData)
    };
  } catch (error) {
    console.error("Triage Error:", error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to triage incident", details: error.message })
    };
  }
};
