import settingsModel from "../../models/settings.model";

export const getSettings = async ({ params, error }: any) => {
    try {
        const { settingField } = params

        let settings: any = await settingsModel.findOne({})
        return { success: true, data: settings?.[settingField] || {} };
    } catch (err) {
        return error(400, { success: false, data: {}, message: 'Something is wrong' });
    }
};

export const updateSettings = async ({ body, params, error }: any) => {
    try {
        const { settingField } = params
        await settingsModel.findOneAndUpdate({}, {
            [settingField]: body || {}
        }, { upsert: true, new: true, setDefaultsOnInsert: true })
        return { success: true, message: 'Settings successfully updated' };
    } catch (err) {
        return error(400, { success: false, data: {}, message: 'Something is wrong' });
    }
};