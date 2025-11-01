import { sendPush } from "@/utils/pushnotification/pushNotification";
import usersAuthActivityModel from "../../models/usersAuthActivity.model";
import { logger } from "@/utils/logger";

export const sendToCustomerPushNotification = async (customerId: string, pushData: any = {}) => {
    try {
        let activeTokens: any = await usersAuthActivityModel.findOne({
            user: customerId,
            token: { $ne: '' },
            fcmToken: { $ne: '' },
        }).select("_id user fcmToken").sort({ lastActive: -1 }).lean();
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