import { generateRandomString } from "@/utils";
import couponsModel from "../../models/coupons.model";
import { logger } from "@/utils/logger";

export const handleReferalCode = async (user: any, referrerUserId: any, discount: any, maxLimit: any) => {
    try {
        couponsModel.create({
            code: `${generateRandomString(6)}${discount}`,
            discountType: "percentage",
            discountAmount: discount,
            uptoAmount: 100,
            expiredAt: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000),
            usageLimit: maxLimit,
            usedCount: 0,
            userId: user._id,
            autoApply: true,
            validFor: "newUsers",
            invitedBy: referrerUserId,
            status: true,
            invitedTo: user._id
        });
        return true
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return false;
    }
}