
// import { createRequire } from "module";
// require('dotenv').config();

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import * as minio from 'minio'

import chalk from 'chalk';

import {
    S3Client, 
    S3ServiceException, 
    GetObjectCommand, 
    HeadObjectCommand, 
    CopyObjectCommand, 
    ListObjectsV2Command,
    PutObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
} from "@aws-sdk/client-s3";


const s3 = new S3Client({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWSKEY,
        secretAccessKey: process.env.AWSSECRET
    }
});

//  const minioClient = new S3Client({ //hallucination?
//   region: "us-east-1", 
//         // endpoint: process.env.MINIOENDPOINT, // Replace with your MinIO endpoint
//         endpoint: "http://localhost:9000", 
//         credentials: {
//             accessKeyId: process.env.MINIOKEY, // Replace with your MinIO access key
//             secretAccessKey: process.env.MINIOSECRET, // Replace with your MinIO secret key
//         },
//         forcePathStyle: true, // Required for some MinIO setups
//     });

// import { createRequire } from "module";


var minioClient = null;
if (process.env.MINIOKEY && process.env.MINIOKEY != "" && process.env.MINIOENDPOINT && process.env.MINIOENDPOINT != "") {
  
    // const minio = require('minio');
        minioClient = new minio.Client({
        endPoint: process.env.MINIOENDPOINT,
        port: 9000,
        useSSL: false,
        accessKey: process.env.MINIOKEY,
        secretKey: process.env.MINIOSECRET
    });
    console.log("gotsa minio client " + minioClient);
}


///////////////////////// OBJECT STORE (S3, Minio, etc) OPS BELOW - TODO - fix minio, garage maybe?

export async function CopyObjectAWStoMinio(awsBucketName,
                                            awsObjectKey,
                                            minioBucketName,
                                            minioObjectKey) {
    
   try {
    // 1. Get the object from AWS S3
    const getObjectParams = {
      Bucket: awsBucketName,
      Key: awsObjectKey,
    };
    const response = await s3.send(
      new GetObjectCommand(getObjectParams)
    );

    if (!response.Body) {
      throw new Error(chalk.red("Object body not found in AWS S3."));
    }
    // console.log("gotsa pic body content type ");
    // 2. Upload the object to MinIO
    // const putObjectParams = {
    //   Bucket: minioBucketName,
    //   Key: minioObjectKey,
    //   Body: response.Body
    //   // ContentType: ContentType, // Preserve content type
    // };
    // await minioClient.send(new PutObjectCommand(putObjectParams));
    minioClient.putObject(minioBucketName, minioObjectKey, response.Body, (err, etag) => {
      if (err) return console.log(chalk.red('Error uploading object.', err));
      // console.log('Object uploaded successfully, ETag:', etag);
        console.log(chalk.cyan(`Successfully copied object to MinIO as '${minioObjectKey}'.`));
    });
    // });

   
    // return "copied " + awsObjectKey + "to minio!";
  } catch (error) {
    console.error(chalk.cyan(chalk.red("Error copying object:", error)));
  }
}

export async function ReturnPresignedUrl(bucket, key, time) {
    
    if (minioClient) {
        return minioClient.presignedGetObject(bucket, key, time);
    } else {
        // return s3.getSignedUrl('getObject', {Bucket: bucket, Key: key, Expires: time}); //returns a promise if called in async function?
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          });
        return await getSignedUrl(s3, command, {expiresIn : time});
        // return url;
    } 
}

export async function ReturnPresignedUrlPut(bucket, key, time) {
    
    if (minioClient) {
        return minioClient.presignedPutObject(bucket, key, time);
    } else {
        // return s3.getSignedUrl('getObject', {Bucket: bucket, Key: key, Expires: time}); //returns a promise if called in async function?
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
          });
        return await getSignedUrl(s3, command, {expiresIn : time});
        // return url;
    } 
}

export async function DeleteObjects(bucket, objectKeys) { //s3.headObject == minio.statObject
    if (minioClient) {
                //todo!
    } else {

        const command = new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: objectKeys,
        });
        
        try {
            const response = await s3.send(command);
            // await s3.waitUntilObjectNotExists(
            //     { Bucket: bucket, Key: key },
            //   );
            console.log("delete objects resp: " + response );
            return response;
            // return true;
        } catch (error) {
            if (error.name === 'NotFound') {
                console.log("File does not exist: " + key);
                return "not found";
                // return false;
            }
            console.error(`Error checking file existence: ${error}`);
            return error;
            // return false;
        }
    }
}

export async function DeleteObject(bucket, key) { //s3.headObject == minio.statObject
    if (minioClient) {
                //todo!
    } else {

        const command = new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
        });
        
        try {
            await s3.send(command);
            await s3.waitUntilObjectNotExists(
                { Bucket: bucket, Key: key },
              );
            console.log("File deleted: " + JSON.stringify(data));
            return "deleted";
            // return true;
        } catch (error) {
            if (error.name === 'NotFound') {
                console.log("File does not exist: " + key);
                return "not found";
                // return false;
            }
            console.error(`Error checking file existence: ${error}`);
            return error;
            // return false;
        }
    }
}

export async function ReturnMinioObjectExists(bucket, object) { //s3.headObject == minio.statObject
 try {
        await minioClient.statObject(bucket, object);
        return true; // Object exists
    } catch (err) {
        if (err.code === 'NoSuchKey' || err.code === 'Not Found' || err.code === 'NotFound') {
            return false; // Object does not exist
        } else {
          throw err; // Re-throw other errors
        }
       
    }
}

export async function ReturnObjectExists(bucket, key) { //s3.headObject == minio.statObject
    // if (minioClient) {
    //             //todo!
    // } else {

        const command = new HeadObjectCommand({
            Bucket: bucket,
            Key: key,
        });
        
        try {
            let data = await s3.send(command);
            // console.log("File exists: " + JSON.stringify(data));
            // return { exists: true, error: null };
            return true;
        } catch (error) {
            if (error.name === 'NotFound') {
                // console.log("File does not exist: " + key);
                // return { exists: false, error: null };
                return false;
            }
            console.error(`Error checking file existence: ${error}`);
            // return { exists: false, error };
            return false;
        }
    // }
}

export async function ReturnObjectMetadata(bucket, key) { //s3.headObject == minio.statObject
    if (minioClient) {
                //todo!
    } else {

        const command = new HeadObjectCommand({
            Bucket: bucket,
            Key: key,
        });
    
        try {
            let data = await s3.send(command);
            console.log("File exists:" + data);
            // return { exists: true, error: null };
            return data;
        } catch (error) {
            if (error.name === 'NotFound') {
                console.log("File does not exist: "  + key);
                // return { exists: false, error: null };
                return error;
            }
            console.error(`Error checking file existence: ${error}`);
            // return { exists: false, error };
            return error;
        }
      
    }
}
export async function ListObjects(bucket, prefix) {
    try {
    
      const response = await s3.send(
        new ListObjectsV2Command({
            Bucket: bucket,
            MaxKeys: 1000000,
            Prefix: prefix
          }),
      );
      return await response;
    } catch (caught) {
        if (caught instanceof NoSuchKey) {
          console.error(
            `Error from S3 listing objects from "${bucket}". no such bucket exists.`,
          );
          return "error";
        } else if (caught instanceof S3ServiceException) {
          console.error(
            `Error from S3 while getting object from ${bucket}.  ${caught.name}: ${caught.message}`,
          );
          return "error";
        } else {
          throw caught;
        //   return caught;
        }
      }
}
export async function GetObject(bucket, key) {

    try {
        const response = await s3.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
        // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
        const str = await response.Body.transformToString();
        // console.log(str);
        return str;
      } catch (caught) {
        if (caught instanceof NoSuchKey) {
          console.error(
            `Error from S3 while getting object "${key}" from "${bucket}". No such key exists.`,
          );
          return "error";
        } else if (caught instanceof S3ServiceException) {
          console.error(
            `Error from S3 while getting object from ${bucket}.  ${caught.name}: ${caught.message}`,
          );
          return "error";
        } else {
          throw caught;
        //   return caught;
        }
      }

}
export async function PutObject(bucket, key, body) {

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
      });
    
      try {
        const response = await s3.send(command);
        console.log(response);
        return response;
      } catch (caught) {
        if (
          caught instanceof S3ServiceException &&
          caught.name === "EntityTooLarge"
        ) {
          console.error(
            `Error from S3 while uploading object to ${bucketName}. \
    The object was too large. To upload objects larger than 5GB, use the S3 console (160GB max) \
    or the multipart upload API (5TB max).`,
          );
          
        } else if (caught instanceof S3ServiceException) {
          console.error(
            `Error from S3 while uploading object to ${bucketName}.  ${caught.name}: ${caught.message}`,
          );
        } else {
          throw caught;
        }
        return caught;
      }

}
export async function CopyObject(targetBucket, copySource, key) {
    if (minioClient) {

    } else {
      
        const command = new CopyObjectCommand({
            Bucket: targetBucket,
            CopySource: copySource,
            Key: key
        });
        try {
            let data = await s3.send(command);

            return data;
        } catch (error) {
            if (error.name === 'NotFound') {
                console.log(`File does not exist: ${filePath}`);
                // return { exists: false, error: null };
                return error;
            }
            console.error(chalk.red(`Error copying: ${error}`));
            // return { exists: false, error };
            return error;
        }
    }
} 

