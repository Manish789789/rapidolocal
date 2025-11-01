import { pagination, resources } from "@/utils/resources";
import shortcutModel from "../../models/shortcut.model";
import { logger } from "@/utils/logger";
import { attachPaymentMethod } from "@/modules/paymentGateways/stripe.controller";
import { attachSquarePaymentMethod } from "@/modules/paymentGateways/square.controller";

export const { edit, update, deleteItem } = resources(shortcutModel)

export const index = async ({ request, body, error }: any) => {
    try {
        body = {
            ...body,
            filter: {
                ...body.filter,
                user: request?.user?._id
            }
        }
        return { success: true, message: 'Shortcuts fetched successfully', data: await pagination(body, shortcutModel) };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: '0 records' })
    }
};

export const create = async ({ request, body, error }: any) => {
    try {
        let paymentMethod = null;
        let squarePaymentMethod = null;

        if (body?.methodId || body?.paymentMethod?.methodId) {
            paymentMethod = await attachPaymentMethod({ request: { ...request }, body })
        }
        if (body?.squareMethodId || body?.paymentMethod?.squareMethodId) {
            squarePaymentMethod = await attachSquarePaymentMethod({ request: { ...request }, body });
        }

        await shortcutModel.create({
            ...body,
            user: request?.user?._id
        })
        return { success: true, message: 'Profile successfully saved' };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: 'Something is wrong.', data: [] })
    }
};