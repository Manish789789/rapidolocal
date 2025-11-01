import driversAuthActivityModel from "../../models/driversAuthActivity.model";
import { logger } from "@/utils/logger";

export const sendInAppMessage = async (driverId: string, pushData: any = {}) => {
    try {
        const activeTokens = await driversAuthActivityModel
            .findOne({
                user: driverId,
                token: { $ne: "" },
                fcmToken: { $ne: "" },
            })
            .select("_id user fcmToken")
            .sort({ createdAt: -1 })
            .lean();

        if (!activeTokens?.fcmToken) {
            logger.warn({ msg: "No active FCM token found for driver", driverId });
            return;
        }

        logger.info({
            msg: "In-app message push sent",
            driverId,
            event: pushData?.event,
        });
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
    }
};
