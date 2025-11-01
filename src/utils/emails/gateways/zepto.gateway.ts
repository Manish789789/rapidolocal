import { logger } from "@/utils/logger";
import { SendMailClient } from "zeptomail";

interface EmailDetails {
    mailToken: string;
    apiUrl: string;
    fromEmail: string;
    fromName: string;
    toEmail: string;
    toName?: string;
    subject: string;
    html: string;
}

export const zeptoGateway = async (settings: EmailDetails) => {
    try {

        if (!settings || !settings.mailToken || !settings.apiUrl || !settings.fromEmail) {
            throw new Error("Invalid email settings provided");
        }
        let client = new SendMailClient({
            url: `${settings.apiUrl}/`,
            token: settings.mailToken
        });


        client.sendMail({
            "from":
            {
                "address": settings.fromEmail,
                "name": settings.fromName || `Ride sharing Team`
            },
            "to":
                [
                    {
                        "email_address":
                        {
                            "address": settings.toEmail,
                            "name": settings.toName || ""
                        }
                    }
                ],
            "subject": settings.subject,
            "htmlbody": settings.html,
        }).then((resp: any) => {
        }).catch((e: any) => {
            logger.error({ error: e, msg: e.message });
        });
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
    }
}