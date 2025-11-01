import twilioMod from "twilio";
import twilio from "twilio";

interface TwilioSettings {
    settings: {
        accountSid: string;
        fromNumber: string;
        authToken: string;
    };
    toDetails: {
        countryCode?: string;
        phone?: string;
        otp?: string;
    };
}

export default async function ({
    settings: {
        accountSid = "",
        fromNumber = "",
        authToken = "",

    },
    toDetails: {
        countryCode = "1",
        phone,
        otp
    }
}: TwilioSettings) {
    try {

        if (!accountSid || !fromNumber) {
            throw new Error("Auth key is required for Twilio");
        }

        if (!phone) {
            throw new Error("Recipient phone is required");
        }

        const countryDialMap: Record<string, string> = {
            ca: "1",
            in: "91",
        };
        const normalizedCode = countryDialMap[countryCode.toLowerCase()] || countryCode.replace("+", "");
        const cleanPhone = `+${normalizedCode}${phone.replace(/\D/g, "")}` || `+${countryCode}${phone.replace(/\D/g, "")}`;
        const client = twilio(accountSid, authToken);

        const messageBody = otp
            ? `Your verification code is ${otp}`
            : "You have a new message";

        await client.messages.create({
            body: messageBody,
            from: fromNumber,
            to: cleanPhone,
        });
        return true
    } catch (error) {
        return false;
    }

}