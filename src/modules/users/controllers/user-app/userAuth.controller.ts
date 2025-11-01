import { generateRandomString } from "@/utils";
import usersModel from "../../models/users.model";
import couponsModel from "@/modules/coupons/models/coupons.model";
import { handleReferalCode } from "@/modules/coupons/controllers/user-app/coupons.controller";
import usersAuthActivityModel from "../../models/usersAuthActivity.model";
import { sendOtpFromDefault } from "@/utils/sms/sms.handler";
import phoneValidator from "phone";
import { logger } from "@/utils/logger";
import { loginOtpNotification } from "@/utils/emails/email.handler";

export const generateAndSendOtp = async (body: any) => {
  let { email, phone, countryName, countryCode, referrer, deviceInfo } = body;
  try {
    if (process.env.isTestMode === "false" && !["1", "44", "49", "33", "61", "31", "47", "46", "45", "353"].includes(countryCode)) {
      return false
    }
    if (phone && phone?.length > 2 && (phone?.includes(" ") || phone?.includes("(") || phone?.includes(")") || phone?.includes("-") || phone?.includes("+") || phone?.length > 10)) {
      let newPhone = phone.replace(/[\s()-+]/g, "").trim();
      if (newPhone.length > 10) {
        newPhone = newPhone.slice(-10);
      }
      phone = newPhone;
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const expireAt = new Date(Date.now() + 5 * 60 * 1000);

    const OTPdata = {
      otp: (process.env.NODE_ENV == "development" || phone == '6476496123' || phone == '9779806366') ? 159357 : otp,
      otpExpireAt: expireAt,
    };

    let user: any = await usersModel.findOneAndUpdate(email ? { email } : { phone }, { $set: OTPdata, deletedAt: null }).lean();

    if (!user) {
      let inviteBy = null;
      if (referrer) {
        const userReferrer = await usersModel.findOne({ inviteCode: referrer }).select("_id").lean();
        if (userReferrer && String(userReferrer?._id) !== String(user?._id)) {
          inviteBy = userReferrer._id
        }
      }

      user = await usersModel.create({
        email: email || '',
        phone: phone || '',
        fullName: '',
        inviteBy: inviteBy,
        inviteCode: generateRandomString(8),
        country: {
          name: countryName || '',
          countryCode: countryCode || '',
          currencySymbol: "$",
          currencyCode: "CAD"
        },
        ...OTPdata
      })
      user = await usersModel.findById(user._id).lean();
    }

    if (email) {
      loginOtpNotification(user, otp);
    } else if (phone) {
      if (process.env.NODE_ENV !== "development") {
        let isSendOtp = await sendOtpFromDefault({ countryCode, phone, otp });
        if (!isSendOtp) {
          return false
        }
      }
    }

    return true
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false
  }
}

const submitLogin = async (request: any, body: any, ip: any, jwt: any, userLocation: any) => {
  let { email, phone, socialToken, socialType, fcmToken, referrer, countryCode, countryName } = body;

  if (!email && !phone && !socialToken) {
    throw new Error("Invalid login details");
  }

  let socialFilter: any = {}

  let user: any = null
  if (socialToken) {
    socialFilter[`socialAccount.${socialType}`] = body.decodedToken.sub
    user = await usersModel.findOne(socialFilter).select("inviteBy ")
  } else {
    user = await usersModel.findOne(email ? { email } : phone ? { phone } : socialFilter)
  }

  if (user) {
    await usersModel.updateOne({ _id: user._id }, { phone, countryCode, countryName })
  }

  if (phone && phone?.length > 2 && (phone?.includes(" ") || phone?.includes("(") || phone?.includes(")") || phone?.includes("-") || phone?.includes("+") || phone?.length > 10)) {
    let newPhone = phone.replace(/[\s()-+]/g, "").trim();
    if (newPhone.length > 10) {
      newPhone = newPhone.slice(-10);
    }
    phone = newPhone;
  }

  if (!user) {
    let inviteBy = null;
    if (referrer) {
      const userReferrer = await usersModel.findOne({ inviteCode: referrer }).select("_id");
      if (userReferrer && String(userReferrer?._id) !== String(user?._id)) {
        inviteBy = userReferrer._id
      }
    }

    user = await usersModel.create({
      email: body?.email || body?.decodedToken?.email || '',
      phone: body?.phone || body?.decodedToken?.phone || '',
      fullName: body?.fullName || body?.decodedToken?.name || '',
      avatar: body?.avatar || body?.decodedToken?.picture || '',
      inviteBy: inviteBy,
      inviteCode: generateRandomString(8),
      country: {
        name: countryName,
        currencyCode: countryCode,
        currencySymbol: "$"
      },
      ...socialFilter
    })

    if (user?.inviteBy) {
      handleReferalCode(user, user?.inviteBy, 35, 5);
    }
  }

  socialFilter.otp = null
  socialFilter.otpExpireAt = null
  await usersModel.updateOne({ _id: user._id }, socialFilter)

  const token = await jwt.sign(user._id)

  await usersAuthActivityModel.updateMany({ user: user._id }, {
    token: null,
    logoutAt: new Date(),
    expiredAt: new Date()
  })

  await usersAuthActivityModel.create({
    user: user._id,
    browserName: request.useragent?.browser,
    osName: request.useragent?.os,
    isMobile: request.useragent?.isMobile,
    ip: ip == '::1' ? '' : ip,
    location: '',
    loginAt: new Date(),
    token: token,
    fcmToken,
    expiredAt: new Date(Date.now() + parseInt('30d') * 60 * 1000),
    userLocation: userLocation || {},
  })
  return token
}

export const loginOrRegister = async ({ jwt, ip, error, request, body, userLocation }: any) => {
  if (body?.phone) {
    let replacedValue = body?.phone.replaceAll(" ", "").replaceAll("-", "").replaceAll("+", "").replaceAll(/\D+/g, '')
    body.phone = replacedValue
  }
  const { otp, email, phone, socialToken } = body;
  if (!email && !phone && !socialToken) {
    throw new Error("Invalid login details");
  }

  let message = ''
  let data = ''

  if (!otp && !socialToken) {
    let response = await generateAndSendOtp(body)
    if (!response) {
      return error(400, { success: false, message: "Something is wrong please try again" });
    }
    message = "OTP successfully sent."
  } else {
    data = await submitLogin(request, body, ip, jwt, userLocation)
  }

  return { success: true, message, data };
};

export const logout = async ({ request }: any) => {
  await usersAuthActivityModel.updateOne({ token: request.user.token }, {
    token: null,
    logoutAt: new Date(),
    expiredAt: new Date()
  })
  return { success: true, message: "User successfully logged out" };
};

export const eventListen = async ({ request }: any) => {
  return { success: false, message: "Event listen successfully" };
};