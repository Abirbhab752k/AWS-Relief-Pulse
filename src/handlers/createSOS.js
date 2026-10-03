import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const id = "inc_" + Date.now().toString(36);
    const timestamp = Date.now();

    let presignedUploadUrl = null;
    let s3ObjectKey = null;

    if (body.fileName) {
      s3ObjectKey = `evidence/${new Date().toISOString().slice(0, 10)}/${id}-${body.fileName}`;
      const s3Command = new PutObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: s3ObjectKey,
        ContentType: body.fileType || "image/jpeg"
      });
      presignedUploadUrl = await getSignedUrl(s3Client, s3Command, { expiresIn: 900 });
    }

    const item = {
      PK: `INCIDENT#${id}`,
      SK: "METADATA",
      id,
      name: body.name,
      phone: body.phone || "",
      location: body.location,
      lat: body.lat,
      lng: body.lng,
      categories: body.categories || [],
      urgency: body.urgency || "moderate",
      urgencyScore: body.urgencyScore || 5,
      summary: body.summary,
      detail: body.detail || "",
      status: "open",
      s3PhotoKey: s3ObjectKey,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await docClient.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: item
    }));

    return {
      statusCode: 201,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ incident: item, uploadUrl: presignedUploadUrl })
    };
  } catch (error) {
    console.error("Create SOS Error:", error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Could not create SOS record." })
    };
  }
};
