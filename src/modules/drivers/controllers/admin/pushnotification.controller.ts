import { sendPush } from "@/utils/pushnotification/pushNotification";
import driversAuthActivityModel from "../../models/driversAuthActivity.model";
import { logger } from "@/utils/logger";

export const sendToDriverPushNotification = async (driverId: string, pushData: any = {}) => {
    try {
        let activeTokens = await driversAuthActivityModel.findOne({
            user: driverId,
            token: { $ne: '' },
            fcmToken: { $ne: '' },
        }).select("_id user fcmToken").sort({ createdAt: -1 }).lean()
        if (activeTokens && activeTokens?.fcmToken) {
            sendPush({
                to: activeTokens?.fcmToken || '',
                ...pushData
            })
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
    }
}