import { logger } from "@/utils/logger";
import AWS from 'aws-sdk'
import driverMediaModel from "../../models/driverMedia.model";
import sharp from "sharp";


export const uploadMedia = async ({ request, file, body, ip, jwt, error }: any) => {
    try {
        const file = body.file;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const keykey = `websites/65f352b0d0b96c21405031be/drivers/${request?.user?._id}/${file.name.replace(".jpg", ".WEBP")}`;

        const wasabiEndpoint = new AWS.Endpoint(`s3.${process.env.AWS_REGION}.wasabisys.com`);
        const s3bucket = new AWS.S3({
            endpoint: wasabiEndpoint,
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION,
        });

        let processedBuffer = buffer;
        let compressionInfo = null;

        if (file.type.startsWith("image/")) {
            const originalSize = buffer.length;

            if (file.type === "image/webp" || file.name.toLowerCase().endsWith(".WEBP")) {
            } else {
                processedBuffer = await sharp(buffer)
                    .resize({ width: 512, height: 512 })
                    .webp({ quality: 90 })
                    .toBuffer();

                const processedSize = processedBuffer.length;
                compressionInfo = {
                    originalSize: (originalSize / 1024).toFixed(2) + " KB",
                    processedSize: (processedSize / 1024).toFixed(2) + " KB",
                    compressionRatio:
                        ((originalSize - processedSize) / originalSize * 100).toFixed(2) + "%",
                };
            }
        } else {
        }

        const params: any = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: keykey,
            Body: buffer,
            ContentType: file.type,
            ACL: "public-read",
        };

        const newFileUploaded = {
            description: "test",
            fileLink: `${process.env.AWS_Uploaded_File_URL_LINK}/${keykey}`,
            s3_key: params.Key,
            compression: compressionInfo,
        };

        const data = await s3bucket.upload(params).promise();

        await driverMediaModel.create({
            name: file.name,
            fileName: file.name,
            size: file?.size || "",
            type: file?.type || "",
            thumbnailUrl: data.Location,
            user: request?.user?._id,
        });

        return { success: true, data: newFileUploaded };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, data: '', message: 'Uploading error' });
    }
}