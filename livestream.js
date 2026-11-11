import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import chokidar from 'chokidar';

// 1. Initialize AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = 'your-hls-stream-bucket';
const S3_FOLDER = 'live/stream1'; // Destination folder prefix in S3
const LOCAL_WATCH_DIR = path.join(process.cwd(), 'output');

// Track uploaded segments so we know what to prune
let activeS3Segments = new Set();

/**
 * Helper to upload a file to S3 with correct content-type
 */
async function uploadToS3(localFilePath, s3Key) {
  const ext = path.extname(localFilePath);
  // Important: Browsers and players strictly check Content-Type headers
  const contentType = ext === '.m3u8' ? 'application/x-mpegURL' : 'video/MP2T';

  try {
    const fileBuffer = fs.readFileSync(localFilePath);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
        // Cache-Control is critical: Manifests must NEVER cache; Chunks can cache forever
        CacheControl: ext === '.m3u8' ? 'max-age=0, no-cache, no-store, must-revalidate' : 'public, max-age=31536000',
      })
    );
    console.log(`Successfully uploaded: ${s3Key}`);
  } catch (error) {
    console.error(`Failed to upload ${s3Key}:`, error);
  }
}

/**
 * Parses the rolling .m3u8 file to check which segments are currently active
 */
function parseActiveSegments(manifestPath) {
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const lines = content.split('\n');
    // Extract lines ending with .ts
    return lines
      .map(line => line.trim())
      .filter(line => line.endsWith('.ts'));
  } catch (e) {
    return [];
  }
}

/**
 * Handles deletions of rolled-over segments
 */
async function handleManifestRollover(manifestPath) {
  const currentSegments = parseActiveSegments(manifestPath);
  
  // Find segments that exist in S3 but are no longer in the .m3u8 file
  for (const savedSegment of activeS3Segments) {
    if (!currentSegments.includes(savedSegment)) {
      const s3Key = `${S3_FOLDER}/${savedSegment}`;
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
          })
        );
        activeS3Segments.delete(savedSegment);
        console.log(`Rolled over & deleted from S3: ${s3Key}`);
      } catch (err) {
        console.error(`Failed to delete expired chunk ${s3Key}:`, err);
      }
    }
  }
}

// 2. Initialize Directory Watcher
console.log(`Watching local directory: ${LOCAL_WATCH_DIR}`);
const watcher = chokidar.watch(LOCAL_WATCH_DIR, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100
  }
});

watcher.on('all', async (event, filePath) => {
  const fileName = path.basename(filePath);
  const s3Key = `${S3_FOLDER}/${fileName}`;

  // If a new .ts segment is created
  if ((event === 'add' || event === 'change') && fileName.endsWith('.ts')) {
    activeS3Segments.add(fileName);
    await uploadToS3(filePath, s3Key);
    
    // Clean up local disk so server storage doesn't fill up
    fs.unlink(filePath, (err) => { if (err) console.error(err); });
  }

  // If the manifest rolls over/updates
  if ((event === 'add' || event === 'change') && fileName.endsWith('.m3u8')) {
    // Process manifest pruning before replacing the live playlist index file
    await handleManifestRollover(filePath);
    await uploadToS3(filePath, s3Key);
  }
});
