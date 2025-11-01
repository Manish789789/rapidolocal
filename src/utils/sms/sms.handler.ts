import { getSettings } from "@/plugins/settings/settings.plugin";
import { logger } from "@/utils/logger";
import msg91Gateway from "./gateways/msg91.gateway";
import twoFactorGateway from "./gateways/2factor.gateway";
import twilioGateway from "./gateways/twilio.gateway";

export const sendOtpFromDefault = async ({ countryCode, phone, otp }: any) => {
    try {
        if (["251"].includes(countryCode)) {
            return false
        }
        if (phone && phone?.length > 2 && (phone?.includes(" ") || phone?.includes("(") || phone?.includes(")") || phone?.includes("-") || phone?.includes("+") || phone?.length > 10)) {
            let newPhone = phone.replace(/[\s()-+]/g, "").trim();
            if (newPhone.length > 10) {
                newPhone = newPhone.slice(-10);
            }
            phone = newPhone;
        }

        if (!countryCode) {
            countryCode = "1"
        }

        let settings = getSettings()
        let filterd: any = settings?.smsGateway

        switch (settings?.smsGateway.gateway) {
            case "msg91":
                msg91Gateway({
                    settings: {
                        route: parseInt(settings?.smsGateway?.route || "4"),
                        sender: settings?.smsGateway?.senderId || "NOGIZ",
                        authkey: settings?.smsGateway?.authKey || '',
                        templateId: settings?.smsGateway?.templateId || '',
                    },
                    toDetails: {
                        countryCode,
                        phone,
                        otp
                    }
                });
                return true;
            case "2 factor":
                twoFactorGateway({
                    settings: {
                        apiKey: settings?.smsGateway?.apiKey || '',
                    },
                    toDetails: {
                        countryCode,
                        phone,
                        otp
                    }
                });
                return true;
            case "twilio":
                twilioGateway({
                    settings: {
                        accountSid: settings?.smsGateway?.accountSid || '',
                        fromNumber: settings?.smsGateway?.fromNumber || '',
                        authToken: settings?.smsGateway?.authToken || '',

                    },
                    toDetails: {
                        countryCode,
                        phone,
                        otp
                    }
                });
                return true;
                break;

            default:
                break;
        }

        return false;
    } catch (e: any) {

        logger.error({ error: e, msg: e.message });
        return false
    }
}