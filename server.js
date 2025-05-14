//copyright 2025 Service Media, Inc

import { createRequire } from "module";
const require = createRequire(import.meta.url);

import path from 'path';
import { fileURLToPath } from 'url';

import express, { query } from "express";
import http from "http";
import jwt from "jsonwebtoken";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
// import mongojs from "mongojs";
import methodOverride from "method-override";
import session from "express-session";
import MongoStore from "connect-mongo"; //better
import validator from "validator"; 
// import minio from "minio";
import helmet from "helmet";

import sharp from "sharp";


import bcrypt from "bcryptjs"; //just drop in replacement ?!? ok then

import { ObjectId } from "mongodb";
import { RunDataQuery } from "./connect/database.js"; //connection happens here

import fs from 'fs/promises'

const { Readable, Writable } = require("node:stream");
const fs_sync = require("node:fs");

import { readFile } from "node:fs/promises";
const entities = require("entities"); //hrm
// const fs = require("fs");

const ffmpeg = require('fluent-ffmpeg')
const ffmpeg_static = require('ffmpeg-static')
// const requireText = require('require-text');

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
    
export let app = express();
require('dotenv').config();

export let googleMapsKey = process.env.GOOGLEMAPS_KEY;

// app.use(helmet.contentSecurityPolicy());
app.use(helmet.dnsPrefetchControl());
app.use(helmet.expectCt());

app.use(helmet.hidePoweredBy());
app.use(helmet.hsts());
app.use(helmet.ieNoOpen());
app.use(helmet.noSniff());
app.use(helmet.permittedCrossDomainPolicies());
app.use(helmet.referrerPolicy());
app.use(helmet.xssFilter());


var rootHost = process.env.ROOT_HOST
var topName = process.env.ROOT_NAME;
var requirePayment = true; //if subscription is required to login, true for servicemedia
var adminEmail = process.env.ADMIN_EMAIL;
var domainAdminEmail = process.env.DOMAIN_ADMIN_EMAIL;

var whitelist = ['unityapp', 'http://smxr.net', 'https://smxr.net', 'https://servicemedia.s3.amazonaws.com/', 'http://localhost:3000', 'https://servicemedia.net', 'strr.us.s3.amazonaws.com', 'mvmv.us.s3.amazonaws.com', 'http://strr.us', 'https://strr.us',
 'https://strr.us/socket.io', 'http://valuebring.com', 'http://elnoise.com', 'philosophersgarden.com', 'http://elnoise.com', 'http://eloquentnoise.com', 'http://thefamilyshare.com', 'http://little-red-schoolhouse.com', 
 'http://visiblecity.net', 'http://philosophersgarden.net', 'https://realitymangler.com', 'http://regalrooms.tv', 'https://mvmv.us', 'http://mvmv.us', 
 'http://nilch.com', 'https://servicemedia.net', 'http://kork.us', 'http://spacetimerailroad.com'];

var corsOptions = function (origin) {
//    console.log("checking vs whitelist:" + origin);
    if ( whitelist.indexOf(origin) !== -1 ) {
        return true;
    } else {
        return true; //fornow...
    }
};

var oneDay = 86400000;

let busy = false;
// var databaseUrl = process.env.MONGO_URL; //main db connstring
// // console.log(databaseUrl);
// var collections = ["acl", "auth_req", "domains", "apps", "assets", "assetsbundles", "models", "users", "inventories", "inventory_items", "audio_items", "text_items", "audio_item_keys", "image_items", "video_items",
//     "obj_items", "paths", "keys", "traffic", "scores", "attributes", "achievements", "activity", "actions", "purchases", "storeitems", "scenes", "groups", "weblinks", "locations", "iap"];

// export let db_old = mongojs(databaseUrl, collections); //soon you will die!!  VERY SOON!!  HA AHHHAA!
app.use(express.static(path.join(__dirname, './'), { maxAge: oneDay }));

app.use(function(req, res, next) {

    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST');
    res.header('Access-Control-Max-Age', '300');
    res.header('Access-Control-Allow-Headers', 'Origin, Access-Control-Allow-Origin, x-unity-version, X-Unity-Version, token, cookie, appid, Cookie, X-Access-Token, x-access-token, X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
    res.header('Access-Control-Expose-Headers', 'set-cookie, Set-Cookie', 'token');
    if ('OPTIONS' == req.method) {
        res.send(200);
    } else {
        next();
    }
});

app.use(methodOverride());  //for header rewriting

var expiryDate = new Date(Date.now() + 60 * 60 * 1000); // 2 hour

app.use(session({
    resave: true,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_SESSIONS_URL }), //new way w/ mongo connect
    rolling: true,
    secret: process.env.JWT_SECRET }));


app.use(cookieParser()); //unused?
app.use(bodyParser.json({ "limit": "150mb", extended: true })); //set this to route specific somehow, for add_scene_mods?
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

var maxItems = 1000;

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

import {SESClient,SendEmailCommand} from "@aws-sdk/client-ses"
// export let s3 = new aws.S3();
export const s3 = new S3Client({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWSKEY,
        secretAccessKey: process.env.AWSSECRET
    }
});
export const ses = new SESClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWSKEY,
        secretAccessKey: process.env.AWSSECRET
    }
});

///////// minio init ///////////////////////////////
var minioClient = null;
if (process.env.MINIOKEY && process.env.MINIOKEY != "" && process.env.MINIOENDPOINT && process.env.MINIOENDPOINT != "") {
    const minio = require('minio');
        minioClient = new minio.Client({
        endPoint: process.env.MINIOENDPOINT,
        port: 9000,
        useSSL: false,
        accessKey: process.env.MINIOKEY,
        secretKey: process.env.MINIOSECRET
    });
}

if (process.env.GRAB_AND_SQUEEZE && process.env.GRAB_AND_SQUEEZE === "YES") {
    //import the media libs and enabled the gs routes
}
////////////////////////////////////
var appAuth = "noauth";

var server = http.createServer(app);
server.timeout = 240000;
server.keepAliveTimeout = 24000;
server.listen(process.env.PORT || 4000, function() {
    console.log("Express server listening on port 4000");
});

// INCLUDE EXTERNAL ROUTES BELOW

// import gs_routes from './routes/gs_routes.js';
// app.use('/gs', gs_routes);  

//////////////////// middleware functions inserted into routes

export function requiredAuthentication(req, res, next) { //primary auth method, used in the routes below

    if (req.session.user && req.session.user.status == "validated") { //check using session cookie
        if (requirePayment) { 
            if (req.session.user.paymentStatus == "ok") {
                next();
            } else {
                req.session.error = 'Access denied! - payment status not ok';
                res.send('payment status not OK');       
            }
        } else {
            console.log("authenticated!");
            next();
        }
    } else {
        if (req.headers['x-access-token'] != null) {  //check using json web token
            var token = req.headers['x-access-token'];
            console.log("req.headers.token: " + token);
            jwt.verify(token, process.env.JWT_SECRET, function (err, payload) {
                    console.log(JSON.stringify(payload));
                    if (payload) {
                        // user.findById(payload.userId).then(
                        //     (doc)=>{
                        //         req.user=doc;
                        //         next();
                        //     }
                        // )
                        // console.log("gotsa token payload: " + req.session.user._id + " vs " +  payload.userId);
                        if (payload.userId != null){
                            (async () => {
                              console.log("gotsa payload.userId : " + payload.userId);
                              try {
                                var oo_id = ObjectId.createFromHexString(payload.userId);
                                const query = {"_id": oo_id};
                                const user = await RunDataQuery("users", "findOne", query);
                                if (user) {
                                  if (user.status == "validated") {
                                      // userStatus = "subscriber";
                                      console.log("user is good");
                                      next();
                                    } else {
                                      req.session.error = 'Access denied!';
                                      console.log("token authentication failed! not a subscriber");
                                      res.send('noauth');    
                                    }
                                } else {
                                  req.session.error = "access denied!";
                                  req.send("noauth");
                                }
                              } catch (e) {
                                req.session.error = "auth error! " + e;
                                console.log("auth error! " + e);
                              }
                            
                           
                          })();
                            // next();
                        } else {
                            req.session.error = 'Access denied!';
                            console.log("token authentication failed! headers: " + JSON.stringify(req.headers));
                            res.send('noauth');
                        }
                    } else {
                        req.session.error = 'Access denied!';
                        console.log("token authentication failed! headers: " + JSON.stringify(req.headers));
                        res.send('noauth');
                    }
            });
        } else {
            req.session.error = 'Access denied!';
            console.log("authentication failed! No cookie or token found");
            res.send('noauth');
        }
    }
}

export function checkAppID(req, res, next) {
    console.log("req.headers: " + JSON.stringify(req.headers));
    if (req.headers.appid) {
        var a_id = ObjectId.createFromHexString(req.headers.appid.toString().replace(":", ""));

        (async () => {
          try {
            const query = {"_id": a_id };
            const app = await RunDataQuery("apps", "findOne", query);

            next();
          } catch (e) { 
                console.log("no app id! " + e);
                req.session.error = 'Access denied!';
                res.send("noappauth " + e);
          }
        })();

    } else {
        console.log("no app id!");
        req.session.error = 'Access denied!';
        res.send("noappauth");
    }
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function admin (req, res, next) { //check user id against acl
    var u_id = req.session.user._id.toString();
    if (req.session.user != undefined) {
        if (req.session.user.authLevel != undefined) {
            if (req.session.user.authLevel.includes("admin")) {
                next(); 
            } else {
                req.session.error = 'Access denied!';
                res.send('noauth');
            }
        }
    }
}

function usercheck (req, res, next) { //gotsta beez the owner of requested resource
    var u_id = req.session.user._id.toString();
    var req_u_id = req.params._id;
//        var scene_id = req.params.scene_id;
    console.log("checkin " + u_id + " vs " + req_u_id);
    if (u_id == req_u_id.toString().replace(":", "")) { //hrm.... dunno why the : needs trimming...
        next();
    } else {
        req.session.error = 'Access denied!';
        res.send('noauth');
    }
}

function domainadmin (req, res, next) { //TODO also check acl
    (async () => {
        try {
            const oid = ObjectId.createFromHexString(req.session.user._id.toString());
            const query = {"_id": oid};
            const user = await RunDataQuery("users", "findOne", query);
            if (user.authLevel.includes("domain_admin") || user.authLevel.includes("admin")) { //should be separate, but later..
                next();
            } else {
               res.send("noauth");
            }
        } catch (e) {
            console.log("error checking domainadmin " + e);
            res.send("noauth " + e);
        }
    })();  
}


export function getExtension(filename) {
    // console.log("tryna get extension of " + filename);
    var i = filename.lastIndexOf('.');
    return (i < 0) ? '' : filename.substr(i);
}

export function convertStringToObjectID (stringID) {
    if (ObjectId.isValid(stringID)) {
        return ObjectId.createFromHexString(stringID);
    } else {
        return null;
    }
    
}

export function removeDuplicates(arr){
    let unique_array = []
    for(let i = 0;i < arr.length; i++){
        if(unique_array.indexOf(arr[i]) == -1){
            unique_array.push(arr[i])
        }
    }
    return unique_array
}

export function saveActivity (data) {
    (async () => {
        try {
            const saved = await RunDataQuery("activity", "insertOne", data);
            console.log("inserted an activity " + saved);
        } catch (e) {
            console.log("error inserting activity " + e);
        }
    })();
   
   
}
////////////////////////// create API KEYS ... maybe later...


// app.post('/create_apikey/', requiredAuthentication, function(req, res){
    
//     var uid = req.body.userID; 
//     console.log("tryna create API Key for " + JSON.stringify(req.body.userID));
//     if (uid) {
//         var oo_id = ObjectId.createFromHexString(uid);
//         db_old.users.findOne({_id: oo_id}, function (err, user) {  
//             if (err || !user) {
//             req.session.error = 'Create API Key Failed - user not found ' + uid;
//             console.log('Create API Key Failed - user not found ' + uid);
//             res.send('noauth');
//         } else {
//             console.log("gotsa user " + user._id + " authLevel " + user.authLevel + " status " + user.status);
//             if (user.apikey && user.apikey.length > 4) { //hrm 
//                 res.send("cain't have but one apikey, please contact system administrator");
//                 // res.send(newkey);
//             } else {
//                 let timestamp = Date.now();
//                 timestamp = parseInt(timestamp);
//                 let newkey = "smxr_apikey_" + uid + "_" + timestamp;
//                 db_old.users.update( { _id: oo_id }, { $set: { 
//                     apikey: newkey
//                 }});
//                 res.send("apikey created!");
//                 }
//             }
//         });
//     } else {
//         res.send("nope");
//     }
// });


///////////////////////// OBJECT STORE (S3, Minio, etc) OPS BELOW - TODO - replace all s3 calls w promised based versions, to suport minio, etc... (!)
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

export async function ReturnObjectExists(bucket, key) { //s3.headObject == minio.statObject
    if (minioClient) {
                //todo!
    } else {

        const command = new HeadObjectCommand({
            Bucket: bucket,
            Key: key,
        });
        
        try {
            let data = await s3.send(command);
            console.log("File exists: " + JSON.stringify(data));
            return { exists: true, error: null };
            // return true;
        } catch (error) {
            if (error.name === 'NotFound') {
                console.log("File does not exist: " + key);
                return { exists: false, error: null };
                // return false;
            }
            console.error(`Error checking file existence: ${error}`);
            return { exists: false, error };
            // return false;
        }
    }
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
export async function GetObject(bucket, key, type) {

    try {
        const response = await s3.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
        if (type && type == "binary") {
            const bytes = await response.Body.transformToByteArray();
            console.log("bytes length " + bytes.length);
            return bytes
        } else if (type && type == "stream") {
            // const stream = await response.Body.transformToWebStream();
            // console.log("stream length " + stream);

            return response //it's already a stream!
        } else {
            // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
            const str = await response.Body.transformToString();
            // console.log(str);
            return str;
        }
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
export async function PutObject(bucket, key, body, contentType) {

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType
      });
    
      try {
        const response = await s3.send(command);
        // console.log(response);
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
            console.error(`Error copying: ${error}`);
            // return { exists: false, error };
            return error;
        }
    }
} 

export async function SendEmail(toAddress, fromAddress, htmlbody, subject) {
    console.log("tryna send email " + toAddress + fromAddress);
    const command = new SendEmailCommand({
        Destination: {
          /* required */
          CcAddresses: [
            /* more items */
          ],
        //   ToAddresses: toAddresses, //must be an array
          ToAddresses: [
            toAddress,
            /* more To-email addresses */
          ],
        },
        Message: {
          /* required */
          Body: {
            /* required */
            Html: {
              Charset: "UTF-8",
              Data: htmlbody,
            }
            // Text: {
            //   Charset: "UTF-8",
            //   Data: textbody,
            // },
          },
          Subject: {
            Charset: "UTF-8",
            Data: subject,
          },
        },
        Source: fromAddress,
        ReplyToAddresses: [
           
          /* more items */
        ],
      });
      try {
        return await ses.send(command);
      } catch (caught) {
        console.log("caught email error " + caught);
        if (caught instanceof Error && caught.name === "MessageRejected") {
          /** @type { import('@aws-sdk/client-ses').MessageRejected} */
          const messageRejectedError = caught;
          return messageRejectedError;
        }
        throw caught;
      }
}

//ROUTES BELOW
////////////////////////////////////////////////////////////////
app.get("/", function (req, res) {
    //send "Hello World" to the client as html
    res.send("Hello World!");
    // res.writeHead(301,{Location: 'http://w3docs.com'});
    // res.end();
});


app.get("/privacy.html", function (req,res) {
    res.redirect("/main/privacy.html");
});

app.get( "/crossdomain.xml", onCrossDomainHandler )
function onCrossDomainHandler( req, res ) {
    var xml = '<?xml version="1.0"?>\n<cross-domain-policy>\n';
    xml += '<allow-access-from domain="strr.us" to-ports="*"/>\n';
    xml += '<allow-access-from domain="mvmv.us" to-ports="*"/>\n';
    xml += '<allow-access-from domain="3dcasefiles.com" to-ports="*"/>\n';
    xml += '</cross-domain-policy>\n';

    req.setEncoding('ascii');
    res.writeHead( 200, {'Content-Type': 'text/xml'} );
    res.end( xml );
};

app.get("/amirite/:_id", function (req, res) {
    //console.log("amirite: " + req.session);
    if (req.session.user) {
    //console.log(JSON.stringify(req.session.user._id.toString()) + " " + req.params._id);
        if (req.session.user._id.toString() == req.params._id) {
            console.log("req.session.user.authLevel :" + req.session.user.authLevel);
            if (req.session.user.userName != "guest" && req.session.user.userName != "subscriber" && req.session.user.authLevel != undefined && req.session.user.authLevel != "noauth") {
                res.send(req.session.user.userName + "~" + req.session.user._id.toString() + "~" + req.session.user.authLevel);

            } else {
                res.send("0");
            }

        } else {
            res.send("0");
        }
    } else {
        res.send("0");
    }
});


function AppQuery (app) {
    // console.log(JSON.stringify(app._id));
    let id = app._id;
    // let query = {'acl_rule': 'app_admin_' + id};
    return 'app_admin_' + id;
}
function ReturnID(item) {
    var splitter = item.acl_rule.lastIndexOf('_');
     let id = item.acl_rule.substring(splitter + 1);
    //  console.log("id " + id + " frim rule item " + JSON.stringify(item));
     return id;
}

////////////////////////////////////// CLIENT (i.e. WebXR) AUTH ROUTE - no cookies, just tokens now...
app.get("/ami-rite-token/:token", function (req, res) { //
    jwt.verify(req.params.token, process.env.JWT_SECRET, function (err, payload) {
        console.log("token auth payload: " + JSON.stringify(payload));
            if (payload) {
                if (Date.now() >= payload.exp * 1000) {
                    console.log ("EXPIRED TOKEN!");
                    res.send("3");   
                } else {
                    console.log("time remaining on token: " + ((payload.exp * 1000) - Date.now()));
                  if (payload.userId != null){
                        if (payload.userId == "0000000000000") {
                            console.log("payload is guest token"); 
                            res.send('0');
                        } else {

                            console.log("gotsa payload.userId : " + payload.userId);

                            (async () => {
                              try {
                                var oo_id = ObjectId.createFromHexString(payload.userId);
                                const query = {"_id": oo_id};
                                const user = await RunDataQuery("users", "findOne", query);
                                if (user) {
                                  if (user.status == "validated") {
                                    // userStatus = "subscriber";
                                    console.log("gotsa subscriber!");
                                    let userData = {};
                                    userData._id = user._id;
                                    userData.userName = user.userName;
                                    userData.sceneShortID = payload.shortID;
                                    userData.authLevel = user.authLevel;
                                    
                                    const scenequery = {"short_id": userData.sceneShortID};
                                    const scene = await RunDataQuery("scenes", "findOne", scenequery); //check that user is authed for this scene
                                    if (scene) {
                                      if (scene.user_id == userData._id) { //TO DO check the acl for write_scene etc..
                                          userData.sceneOwner = "indaehoose";
                                          userData.sceneID = scene._id;
                                          res.send(userData);
                                        } else {
                                          res.send(userData);
                                        }
                                    } else {
                                      res.send(userData);
                                    }
                                   
                                    
                                    } else {
                                      req.session.error = 'Access denied!';
                                      console.log("token authentication failed! not a subscriber");
                                      res.send("2");    
                                    }
                                }
                                
                              } catch (e) {
                                res.send("auth error " + e);
                              }
                              
                            })();
                            
                        }
                      
                    } else {
                        req.session.error = 'Access denied!';
                        console.log("token authentication failed! headers: " + JSON.stringify(req.headers));
                        res.send('4');
                    }
                }
            } else {
                req.session.error = 'Access denied!';
                console.log("token authentication failed! headers: " + JSON.stringify(req.headers));
                res.send('5');
            }
    });
});

///////// ADMIN SESSION CHECK
app.get("/ami-rite/:_id", function (req, res) { 
    if (req.session.user) {
        if (req.session.user._id.toString() == req.params._id) {
            var response = {};
            response.auth = req.session.user.authLevel;
            response.userName = req.session.user.userName;
            response.userID = req.params._id;
            response.mapkey = process.env.GOOGLEMAPS_KEY;

            console.log("ami-rite authLevel :" + req.session.user.authLevel);
            if (req.session.user.userName != "guest" && req.session.user.userName != "subscriber" && req.session.user.authLevel != undefined && req.session.user.authLevel != "noauth") {
                if (response.auth.includes("admin")) {

                    (async () => {
                        try {
                            const query = {};
                            const apps = await RunDataQuery("apps", "find", query);
                            if (response.auth.includes("domain_admin")) { 
                                response.apps = apps;
                                console.log("that there's a domain_admin!");
                                const domainsquery = {};
                                const domains = await RunDataQuery("domains", "find", domainsquery);
                                response.domains = domains;
                                res.json(response);
                              
                            } else { //just an admin, check acl
                                const aclQueryArray = apps.map(AppQuery); //flatten apps array for query
                                const aclquery = {"acl_rule" : { $in: aclQueryArray }, "userIDs": response.userID};
                                const rules = await RunDataQuery("acl", "find", aclquery);
                                if (rules && rules.length) {
                                    let rulesAppIDs = rules.map(ReturnID).join(); // a string that's only the appIDs
                                    // console.log(rulesAppIDs);
                                    let appResponse = apps.filter(function (item) { //faster than nested for loops?
                                        return rulesAppIDs.includes(item._id);  //filter out those that don't match the approved ones
                                    });
                                    // console.log("apps " + JSON.stringify(appResponse));
                                    response.apps = appResponse;
                                    res.json(response);
                                } else {
                                    console.log("caint find no rules!?!");
                                    res.send("no rules!");
                                }

                            }
                        } catch (e) {
                            console.log("error checking admin fu " + e);
                            res.send("error checking appdomain " + e);
                        }
                    })();
                  
                } else {
                    res.json(response);
                }
            } else {
                res.send("0");
            }
        } else {
            res.send("0");
        }
    } else {
        res.send("0");
    }
});


app.get("/connectionCheck", function (req, res) {
    res.send("connected");
});



app.post("/logout", requiredAuthentication, function (req, res) {    
    req.session.destroy();
    res.send("logged out");
    
});
 
app.post("/return_traffic", function (req, res) {    //umm, need to limit scope below if no auth?
   
    // console.log("return traffic data " + JSON.stringify(req.body));
    let query = {};
    let startpoint = req.body.startpoint;
    let appdomain = req.body.appdomain != null ? req.body.appdomain.toString() : null;
    if (req.body.startpoint) {

        if (appdomain) {
            query = {$and: [{timestamp: {$gt : startpoint }}, {appdomain : appdomain}, {hostname : {$ne : "localhost"}}]};
        } else {
            if (startpoint != 0) {
                // query = {timestamp: {$gt : startpoint }};
                query = {$and: [{timestamp: {$gt : startpoint }}, {hostname : {$ne : "localhost"}}]};
            }
        }
    
        (async () => {
            try {
                const trafficdata = await RunDataQuery("traffic", "find", query);
                res.send(trafficdata);
            } catch (e) {
                console.log("error getting traffic data " +e);
                res.send("error getting traffic data " +e);
            }
        })();

    } else {
        console.log("no start point!");
        res.send("no startpoint defined!");
    }

});


//////////////////////////////////// AUTHREQ LOGIN ROUTE
app.post("/authreq", function (req, res) {
    console.log('authRequest for: ' + req.body.uname);
    // var currentDate = Math.floor(new Date().getTime()/1000);

    let isSubscriber = false;
    const username = req.body.uname;
    const password = req.body.upass;

    (async () => {
        try {
            // if (username == "subscriber") { //wtf
            //     const query = {receipt : password};
            //     const iap = await RunDataQuery("iap", "findOne", query);
            //     if (iap) {
            //         isSubscriber = true;
            //     }
            //     if (username == "subscriber" && !isSubscriber) { //mmkay
            //         username = "guest";
            //         password = "password";
            //     }
            // }

            var un_query = {userName: username};
            var em_query = {email: username};
            console.log("authreq tryna find " + username);
            const query = {$or: [un_query, em_query]}; //use either un or email
            const authUser = await RunDataQuery("users", "find", query);
            console.log(authUser.length + " users like dat " + username + " authlevel " + authUser[0].authLevel + " and isSubscriber " + isSubscriber );
            const authUserIndex = 0; //
            // for (var i = 0; i < authUser.length; i++) {
            //     if (authUser[i].userName == req.body.uname) { //only for cases where multiple accounts on one email, match on the name// seems like a bad thing...
            //         authUserIndex = i;
            //     }
            // }
            if (authUser[authUserIndex] != null && authUser[authUserIndex] != undefined && authUser[authUserIndex].status == "validated" ) {

                if (username == "subscriber" && isSubscriber) { //if it's a validated subscriber let 'em through without password hashtest like below//BUT WHY?
                    req.session.user = authUser[authUserIndex];
                        res.cookie('_id', req.session.user._id.toString(), { maxAge: 36000 });
                        var authString = req.session.user.authLevel != null ? req.session.user.authLevel : "noauth";
                        // if (isSubscriber && username == "guest") {
                        //     username = "subscriber"; //switch it back for return...
                        // }
                        var authResp = req.session.user._id.toString() + "~" + username + "~" + authString;
                        res.json(authResp);
                        // req.session.auth = authUser[0]._id;
                        appAuth = authUser[authUserIndex]._id;
                        console.log("auth = " + appAuth);
                        
                } else {
                    var hash = authUser[authUserIndex].password;
                    bcrypt.compare(password, hash, function (err, match) {  //check password vs hash
                        if (match) {
                            if (requirePayment && authUser[authUserIndex].paymentStatus != "ok") {
                                console.log("payment status not OK");
                                req.session.auth = "noauth";
                                res.send("payment status not ok");
                                // callback();
                            } else {
                                req.session.user = authUser[authUserIndex];
                                var token=jwt.sign({userId:authUser[authUserIndex]._id},process.env.JWT_SECRET, { expiresIn: '1h' });
                                res.cookie('_id', req.session.user._id.toString(), { maxAge: 36000 });
                                var authString = req.session.user.authLevel != null ? req.session.user.authLevel : "noauth";
                                var authResp = req.session.user._id.toString() + "~" + username + "~" + authString + "~" + token;
                                res.json(authResp);
                                // req.session.auth = authUser[0]._id;
                                appAuth = authUser[authUserIndex]._id;
                                console.log("auth = " + appAuth);
                            }

                        } else if (password == process.env.TESTPASS) { //WHAT? TODO: IMPERSONATE USER LOGIC? 
                            console.log("admin override..?!");
                            // req.session.auth = "noauth";
                            // res.send("noauth");
                            req.session.user = authUser[authUserIndex];
                            var token=jwt.sign({userId:authUser[authUserIndex]._id},process.env.JWT_SECRET, { expiresIn: '1h' });
                            res.cookie('_id', req.session.user._id.toString(), { maxAge: 36000 });
                            var authString = req.session.user.authLevel != null ? req.session.user.authLevel : "noauth";
                            var authResp = req.session.user._id.toString() + "~" + username + "~" + authString + "~" + token;
                            res.json(authResp);
                            // req.session.auth = authUser[0]._id;
                            appAuth = authUser[authUserIndex]._id;
                            console.log("auth = " + appAuth);

                        } else {
                            console.log("hash does not match!");
                            req.session.auth = "noauth";
                            res.send("authentication failed");
                        }
                    });
                }
            } else {
                console.log("user account not validated 1");
                res.send("user account not validated");
                req.session.auth = "noauth";
            }

        } catch (e) {
            console.log("authreq error " + e);
            res.send("authreq error " + e);
        }
    })();
});
   
const ffmpegPromise_hls360 = (inputPath, outputPath) => {
    return new Promise((resolve, reject) => {
    //   ffmpeg(inputPath)
    //     .output(outputPath)
    let savepath = outputPath + 'output.m3u8'; //local
        ffmpeg(inputPath)
            .setFfmpegPath(ffmpeg_static)
            // var proc = ffmpeg('rtmp://path/to/live/stream', { timeout: 432000 })
            .output(savepath)
            .outputOptions([
              // '-codec: copy',
              '-hls_time 5',
              '-hls_list_size 0',
              '-hls_playlist_type vod',
              // '-hls_base_url http://localhost:8080/',
              '-hls_segment_filename '+ outputPath +'%03d.ts'
            ])
            // set video bitrate
            .videoBitrate(5000) //compromise
            // set h264 preset
            // .addOption('preset','superfast')
            // set target codec
            .videoCodec('libx264')
            // set audio bitrate
            // .audioCodec('libfdk_aac')
            .audioBitrate('128k')
            // set audio codec
            // .audioCodec('libmp3lame')
            // set number of audio channels
            .audioChannels(2)
            .withSize('4096x2048') //4k equirect
            // set hls segments time
            // .addOption('-hls_time', 10)
            // // include all the segments in the list
            // .addOption('-hls_list_size',0)
            // setup event handlers
            .on('end', () => resolve(outputPath))
            .on('progress', (progress) => {
                console.log(`Frame: ${progress.frames} - Time: ${progress.timemark}`);
            })
            .on('error', (err) => reject(new Error(`FFmpeg failed: ${err.message}`)))
            .run();
    });
  }

  async function exists(f) {
    try {
      await fs.promises.stat(f);
      return true;
    } catch {
      return false;
    }
  }  

app.post('/process_video_hls_local', requiredAuthentication, function (req, res) {
    let fullpath = req.body.fullpath;

   console.log("tryna encode local file " + req.body.fullpath); 
    (async () => {
        try {
            if (!busy) {    
                const fileExists = await exists(fullpath);
                if (!fileExists){
                    console.log("that file doesn't exist!");   
                }//exists is deprecated, existSync doesn't work w/ promise version..
                if (!req.session.user || process.env.LOCAL_TEMP_FOLDER == undefined && process.env.LOCAL_TEMP_FOLDER == "") {
                    console.log("temp folders not found!");
                } else {
                    busy = true;
                    var ts = Math.round(Date.now() / 1000);
                    let downloadpath = path.dirname(fullpath) + "/";  //set local folder
                    let filename = path.basename(fullpath); // set local filename (*.mp4)                
                    
                    var stats = fs.stat(fullpath)
                    var fileSizeInBytes = stats.size;
                    // Convert the file size to megabytes (optional)
                    var fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);
                    const updoc = {
                        userID : req.session.user._id.toString(),
                        username : req.session.user.userName,
                        title : ts + "." + filename,
                        filename : filename,
                        item_type : 'video',
                        tags: [],
                        item_status: "private",
                        otimestamp : ts,
                        ofilesize : fileSizeInMegabytes};
                    //insert vid first to get the id used for paths below
                    console.log("tryna save hls to " + downloadpath + " filename " + filename + " size " + fileSizeInMegabytes );
                    
                    const response = await ffmpegPromise_hls360(fullpath, downloadpath);
                    console.log("hls encoding result " +JSON.stringify(response));

                    const video_item = await RunDataQuery("video_items", "insertOne", updoc);
                    console.log("inserted video item, uploading next...")
                    const files = await fs.readdir(downloadpath);
                    for (const file of files) {
                        console.log("tryna read file " + downloadpath + file);
                        if (path.extname(file) == '.ts') {   
                            const theFile = await fs.readFile(downloadpath + file);
                            const status = await PutObject(process.env.ROOT_BUCKET_NAME,"users/" + updoc.userID + "/video/" + video_item.insertedId +"/hls/" + file, theFile, 'video/MP2T');
                            // console.log("upload status " + status.size);
                        } else if (path.extname(file) == '.m3u8') {
                            const theFile = await fs.readFile(downloadpath + file);
                            const status = await PutObject(process.env.ROOT_BUCKET_NAME,"users/" + updoc.userID + "/video/" + video_item.insertedId +"/hls/" + file, theFile, 'application/x-mpegURL');
                            // console.log("upload status " + status.size);
                        }
                    }
                    busy = false;
                    res.send ("done!!");
                    console.log("Done!@ :)") ;  
                }
            
            } else {
                console.log("busy at the moment, give us a shake..");
            }
        } catch (e) {
            console.log("error projessing hls local " + e);
            busy = false;
            res.send("error projessing hls local " + e);
        }
    })(); //end async   
});


app.get('/resize_uploaded_picture/:_id', requiredAuthentication, function (req, res) { //presumes original pic has already been uploaded to production folder and db entry made
    console.log("tryna resize pic with key: " + req.params._id);
    
    (async () => { 
        try {
            var o_id = ObjectId.createFromHexString(req.params._id);
            const query = {"_id": o_id};
            let image = await RunDataQuery("image_items", "findOne", query);
            console.log("gotsa image from db " + image._id);
            let oKey = "users/" + image.userID + "/pictures/originals/" + image._id +".original."+image.filename;
            // var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: oKey};
            let extension = getExtension(image.filename).toLowerCase();
            let contentType = 'image/jpeg';
            let format = 'jpg';
            let alphaValue = 1;
            if (extension == ".PNG" || extension == ".png") {
                contentType = 'image/png';
                format = 'png';
                alphaValue = 0;
            } 
            let bytes = await GetObject(process.env.ROOT_BUCKET_NAME, oKey, "binary"); //get the original pic, returns byte array
            console.log("gots data with format " + format + " with alpha " + alphaValue +  " key : users/" + image.userID + "/pictures/originals/" + image._id +".original."+image.filename);
            const buffer = Buffer.from(bytes); //convert to buffer for sharp

                const buff1 = await sharp(buffer)
                .resize({
                kernel: sharp.kernel.nearest,
                height: 1024,
                width: 1024,
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: alphaValue }
                })
               
                .toFormat(format)
                .toBuffer();

                // console.log("tryna put standard to key : users/" + image.userID + "/pictures/" + image._id +".standard."+image.filename );
                let key1 = "users/" + image.userID + "/pictures/" + image._id +".standard."+image.filename;
                const putstatus_1 = await PutObject(process.env.ROOT_BUCKET_NAME, key1, buff1, contentType); 
                console.log("putstatus 1 ok");

                const buff2 = await sharp(buffer)
                // .flatten({ background: { r: 0, g: 0, b: 0, alpha: alphaValue } })
                .resize({
                kernel: sharp.kernel.nearest,
                height: 512,
                width: 512,
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: alphaValue }
                })
                
                .toFormat(format)
                .toBuffer();
                
                let key2 = "users/" + image.userID + "/pictures/" + image._id +".half."+image.filename;
                const putstatus_2 = await PutObject(process.env.ROOT_BUCKET_NAME, key2, buff2, contentType); 
                console.log("putstatus 2 ok");

                const buff3 = await sharp(buffer)
                
                .resize({
                kernel: sharp.kernel.nearest,
                height: 128,
                width: 128,
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: alphaValue }
                })
                
                .toFormat(format)
                .toBuffer();
                
                let key3 = "users/" + image.userID + "/pictures/" + image._id +".thumb."+image.filename;
                const putstatus_3 = await PutObject(process.env.ROOT_BUCKET_NAME, key3, buff3, contentType); 
                console.log("putstatus 3 ok");
                console.log("Done resizng " + format);
        
        } catch (e) {
            console.log("error resizing pic " + e);
            res.send("error resizing pic " + e);
        }
    })();//end async
        
});
       
async function DownloadAudioFile (params, location) {
    //errors caught in calling function?
    try {
        const response = await GetObject(params.Bucket, params.Key, "stream");
        console.log("response is " + response);
        const fileStream = fs_sync.createWriteStream(location);
        response.Body.pipe(fileStream);
        console.log("done downloading audio..");
    } catch (e) {
        console.log("error downloading audio file! " +e);
    }   
}


const ffmpegPromise_audioFiles = (inputPath, audio_id) => {
    console.log("tryna process audioFile at inputPath "+ inputPath +" audioID "+ audio_id);
    return new Promise((resolve, reject) => {
        //   ffmpeg(inputPath)
        //     .output(outputPath)
        ffmpeg(inputPath)
        // .setFfmpegPath(ffmpeg_static)
        
        .output(process.env.LOCAL_TEMP_FOLDER + "/" + audio_id + '.tmp.png')            
        .complexFilter(
        [
            '[0:a]aformat=channel_layouts=mono,showwavespic=s=600x200'
        ]
        )
        .outputOptions(['-vframes 1'])
        // .format('png')

        .output(process.env.LOCAL_TEMP_FOLDER + "/" + audio_id + '.tmp.ogg')
        .audioBitrate(192)
        .audioCodec('libvorbis')
        .format('ogg')

        .output(process.env.LOCAL_TEMP_FOLDER + "/" + audio_id + '.tmp.mp3')
        .audioBitrate(192)
        .audioCodec('libmp3lame')
        .format('mp3')



        .on('progress', (progress) => {
            console.log(`Frame: ${progress.frames} - Time: ${progress.timemark}`);
        })
        .on('error', (err) => reject(new Error(`FFmpeg failed: ${err.message}`)))
        .on('end', () => resolve("done squeezing audio"))
      

        .run();
    });
}

app.get('/process_audio_download/:_id', requiredAuthentication, function (req, res) { //download before processing, instead of streaming it// combined minio/s3 version
    console.log("tryna process audio : " + req.params._id);
    if (process.env.LOCAL_TEMP_FOLDER && process.env.LOCAL_TEMP_FOLDER != "") {
        (async () => {
            if (!busy) {    
                try {
                    busy = true;
                    const o_id = ObjectId.createFromHexString(req.params._id);
                    const query = {"_id": o_id};
                    let audio_item = await RunDataQuery("audio_items", "findOne", query);
                    let downloadpath = process.env.LOCAL_TEMP_FOLDER;
                    var params = {Bucket: process.env.ROOT_BUCKET_NAME, Key: 'users/' + audio_item.userID + '/audio/originals/' + audio_item._id + ".original." + audio_item.filename};
                    let filename = audio_item._id +"."+ audio_item.filename;
                    // await fs.mkdir(downloadpath);
                    await DownloadAudioFile(params, downloadpath + "/" + filename);
                    console.log("file downloaded " + downloadpath + "/" + filename);
                    const processed = await ffmpegPromise_audioFiles(downloadpath +"/"+ filename, audio_item._id); //send for processing
                  
                    console.log("status processing audio " + processed); //files below should be in place now....
                    const put1 = await PutObject(process.env.ROOT_BUCKET_NAME,"users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".mp3",
                    await readFile(process.env.LOCAL_TEMP_FOLDER + "/" + audio_item._id + '.tmp.mp3'),'audio/mp3');
                    console.log("put mp3 good");

                    const put2 = await PutObject(process.env.ROOT_BUCKET_NAME,"users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".ogg",
                    await readFile(process.env.LOCAL_TEMP_FOLDER + "/" + audio_item._id + '.tmp.ogg'),'audio/ogg');
                    console.log("put ogg good");
                    
                    const put3 = await PutObject(process.env.ROOT_BUCKET_NAME,"users/" + audio_item.userID + "/audio/" + audio_item._id +"."+path.parse(audio_item.filename).name + ".png",
                    await readFile(process.env.LOCAL_TEMP_FOLDER + "/" + audio_item._id + '.tmp.png'),'audio/png');
                    console.log("put png good");

                    //cleanup
                    fs.unlink(process.env.LOCAL_TEMP_FOLDER + "/" + audio_item._id + '.tmp.ogg');
                    fs.unlink(process.env.LOCAL_TEMP_FOLDER + "/" + audio_item._id + '.tmp.mp3');
                    fs.unlink(process.env.LOCAL_TEMP_FOLDER + "/" + audio_item._id + '.tmp.png');
                    fs.unlink(downloadpath + "/" + filename);

                    busy = false;
                    console.log("processed and uploaded");
                    res.send("processed and uploading..");

                } catch (e) {
                    busy = false;
                    console.log("error processing audio files " + e);
                    res.send("error processing audio files " + e);
                }
            } else {
                console.log("busy with audio processing, give us a shake...");
            }
        })();
    } else {
        console.log("no temp folder found!");
    }
});

//TODO kruft mgmt, call this from admin pages to return unused assets
app.get('/usage_report/:user_id/:filetype', requiredAuthentication, domainadmin, function (req, res){ 
 
});