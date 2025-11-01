import admin from "firebase-admin";
// import firebaseCredentails from "./firebaseCredentails.json";
import { logger } from "../logger";
// const serviceAccount = firebaseCredentails as admin.ServiceAccount
// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount)
// });
const messaging = admin.messaging();

export const sendPush = (message: any, sound = "rapidodefault.mp3") => {
    try {
        let payload: any = {
            ...message,
            "sound": message?.data?.notificationType === "newJobRequest" ? "newjobrequest.mp3" : message?.data?.notificationType === "jobInMatch" ? "tonebell.mp3" : message?.sound ? message?.sound : sound,
            priority: "high",
            content_available: true,
            tokens: Array.isArray(message.to) ? message.to : [message.to],
            "android": {
                "priority": "high",
                "notification": {
                    "sound": message?.data?.notificationType === "newJobRequest" ? "newjobrequest.mp3" : message?.data?.notificationType === "jobInMatch" ? "tonebell.mp3" : message?.sound ? message?.sound : sound,
                }
            },
            "apns": {
                "payload": {
                    "aps": {
                        "sound": message?.data?.notificationType === "newJobRequest" ? "newjobrequest.mp3" : message?.data?.notificationType === "jobInMatch" ? "tonebell.mp3" : message?.sound ? message?.sound : sound,
                    }
                }
            }
        };
        if (typeof payload?.data != 'undefined') {
            payload.data = JSON.parse(JSON.stringify(payload.data))
        }
        return new Promise((resolve, reject) => {
            messaging.sendEachForMulticast(payload).then((response) => {
                resolve(response);
            }).catch((e) => {
                reject("Notifictaion send error");
            });
        })
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return false
    }
}