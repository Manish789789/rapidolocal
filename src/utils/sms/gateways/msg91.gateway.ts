interface Msg91Settings {
    settings: {
        route?: number;
        sender?: string;
        unicode?: number;
        authkey?: string;
        templateId?: string;
    };
    toDetails: {
        countryCode?: string;
        phone?: string;
        otp?: string;
    };
}

export default async function ({
    settings: {
        route = 4,
        sender = "NOGIZ",
        authkey,
        templateId,
    },
    toDetails: {
        countryCode = "1",
        phone,
        otp
    }
}: Msg91Settings) {

    if (!authkey) {
        throw new Error("Auth key is required for MSG91");
    }
    const payload = {
        route,
        sender,
        unicode: 0,
        mobiles: `${countryCode}${phone}`,
        templateId,
        variables: { number: otp },
        encryption: 0,
        short_url: 0,
        flash: false,
        encrypt: false,
    };

    const response = await fetch("https://control.msg91.com/api/v5/sms/sendSms", {
        method: "POST",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
            authkey: authkey,
        },
        body: JSON.stringify(payload),
    });
    if (response.ok) {
        const data = await response.json();
        return true;
    }
}