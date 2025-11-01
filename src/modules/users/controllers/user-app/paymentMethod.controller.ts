import { pagination, resources } from "@/utils/resources";
import paymentMethodsModel from "../../models/paymentMethods.model";
import { attachPaymentMethod, createPaymentintent } from "@/modules/paymentGateways/stripe.controller";
import { logger } from '@/utils/logger';
import { attachSquarePaymentMethod, createSquarePayment } from "@/modules/paymentGateways/square.controller";
import settingsModel from "@/modules/settings/models/settings.model";

export const { edit, deleteItem } = resources(paymentMethodsModel)

export const create = async ({ request, body, error }: any) => {
    try {
        body = {
            ...body,
            paymentMethod: body
        }
        let paymentMethod = null;
        let squarePaymentMethod = null;
        if (body.methodId || body.paymentMethod.methodId) {
            paymentMethod = await attachPaymentMethod({ request: { ...request }, body })
        }
        if (body.squareMethodId || body.paymentMethod.squareMethodId) {
            squarePaymentMethod = await attachSquarePaymentMethod({ request: { ...request }, body });
        }

        if (!paymentMethod && !squarePaymentMethod) {
            return { success: true, message: 'Invalid card', data: await pagination(body, paymentMethodsModel) };
        }

        let paymentData = {}
        await paymentMethodsModel.updateMany({ user: request?.user?._id }, { isDefault: false })

        if (paymentMethod) {
            paymentData = {
                ...body,
                user: request?.user?._id,
                isDefault: true
            };
        }

        if (squarePaymentMethod) {
            paymentData = {
                ...body,
                user: request?.user?._id,
                isDefault: true,
                squareMethodId: squarePaymentMethod
            };
        }
        await paymentMethodsModel.create(paymentData);

        return { success: true, message: 'Payment method successfully added', data: await pagination(body, paymentMethodsModel) };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: 'Invalid card', data: [] })
    }
};

export const update = async ({ request, body, params, error }: any) => {
    try {
        await paymentMethodsModel.updateMany({ user: request?.user?._id }, { isDefault: false })
        await paymentMethodsModel.updateOne({ _id: params.id }, {
            isDefault: true
        })
        return { success: true, message: 'Payment method successfully updated', data: await pagination(body, paymentMethodsModel) };
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
        let availableSettings = await settingsModel.find({}).lean();
        const paymentGateway = String(availableSettings[0]?.defaultSettings?.paymentGateway).toUpperCase();
        if (paymentGateway?.includes("STRIPE")) {
            body = {
                ...body,
                filter: {
                    ...body.filter,
                    squareMethodId: ""
                }
            }
        } else if (paymentGateway?.includes("SQUARE")) {
            body = {
                ...body,
                filter: {
                    ...body.filter,
                    methodId: ""
                }
            }
        }
        return { success: true, data: await pagination(body, paymentMethodsModel) };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: e?.message || 'Something is wrong.', data: [] })
    }
};

export const addcash = async ({ request, body, error }: any) => {
    try {
        let defaultPaymet = await paymentMethodsModel.findOne({ user: request?.user?._id, isDefault: true }).lean()
        if (defaultPaymet?.methodId) {
            let intent = await createPaymentintent(request, body.cash * 100, 'automatic_async', defaultPaymet.methodId)
            if (intent) {
                return { success: true, message: '', clientSecret: intent.client_secret };
            }
        } else if (defaultPaymet?.squareMethodId) {
            let squarePaymentIntent = await createSquarePayment(request, body.cash * 100, defaultPaymet.squareMethodId, "WalletAdd", "0", true)
            if (squarePaymentIntent) {
                return { success: true, message: 'Cash Added' };
            }
        }
        return error(400, { success: false, message: 'Something is wrong.', data: [] })
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: e?.message || 'Something is wrong.', data: [] })
    }
};