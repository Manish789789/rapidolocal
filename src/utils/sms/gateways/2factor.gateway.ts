interface TwoFactorSettings {
    settings: {
        apiKey: string;
    };
    toDetails: {
        countryCode?: string;
        phone?: string;
        otp?: string;
    };
}

export default async function ({
    settings: {
        apiKey = "",
    },
    toDetails: {
        countryCode = "1",
        phone,
        otp
    }
}: TwoFactorSettings) {

    if (!apiKey) {
        throw new Error("Auth key is required for 2Factor");
    }
    try {
        await fetch(`https://2factor.in/API/V1/${apiKey}/SMS/${countryCode}${phone}/${otp}/OTP1`)
        return true
    } catch (error) {
        return false;
    }

}