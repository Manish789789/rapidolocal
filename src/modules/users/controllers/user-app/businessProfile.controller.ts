import { pagination, resources } from "@/utils/resources";
import businessProfileModel from "../../models/businessProfile.model";
import { logger } from "@/utils/logger";
import { attachPaymentMethod } from "@/modules/paymentGateways/stripe.controller";
import { attachSquarePaymentMethod } from "@/modules/paymentGateways/square.controller";

export const { edit, update, deleteItem } = resources(businessProfileModel)

export const create = async ({ request, body, error }: any) => {
    try {
        let paymentMethod = null;
        let squarePaymentMethod = null;

        if (body.methodId || body.paymentMethod.methodId) {
            paymentMethod = await attachPaymentMethod({ request: { ...request }, body })
        }
        if (body.squareMethodId || body.paymentMethod.squareMethodId) {
            squarePaymentMethod = await attachSquarePaymentMethod({ request: { ...request }, body });
        }

        if (paymentMethod || squarePaymentMethod) {
            await businessProfileModel.create({
                ...body,
                user: request?.user?._id
            })
            return { success: true, message: 'Profile successfully saved' };
        }
        return error(400, { success: false, message: 'Something is wrong.', data: [] })
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: e?.message || 'Something is wrong.', data: [] })
    }
};

export const index = async ({ request, body, error }: any) => {
    try {
        body = {
            ...body,
            filter: {
                ...body.filter,
                user: request?.user?._id
            }
        }
        return { success: true, data: await pagination(body, businessProfileModel) };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: e?.message || 'Something is wrong.', data: [] })
    }
};