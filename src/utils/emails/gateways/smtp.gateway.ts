import nodemailer from "nodemailer";

interface EmailDetails {
    host: string;
    port?: number;
    username: string;
    password: string;
    fromEmail: string;
    fromName: string;
    toEmail: string;
    toName?: string;
    subject: string;
    html: string;
}

export const smtpGateway = async (settings: EmailDetails) => {
    try {
        if (!settings || !settings.host || !settings.port || !settings.username || !settings.password || !settings.fromEmail) {
            throw new Error("Invalid email settings provided");
        }

        var transporter = nodemailer.createTransport({
            host: settings?.host || "smtp.mailtrap.io",
            port: settings?.port || 587,
            secure: false, // upgrade later with STARTTLS
            auth: {
                user: settings.username,
                pass: settings.password,
            },
        });
        let mailOptions = {
            from: `"${settings.fromName || `Ride sharing Team`} Team" <${settings.fromEmail}>`,
            to: settings.toEmail,
            subject: settings.subject,
            html: settings.html
        };

        transporter.sendMail(mailOptions, (e, info) => {
            if (e) {
            } else {
            }
        });

    } catch (e) {
    }
}