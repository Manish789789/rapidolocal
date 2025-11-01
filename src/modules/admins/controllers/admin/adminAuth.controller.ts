import CryptoJS from "crypto-js";
import adminsModel from "@/modules/admins/models/admins.model";
import adminsAuthActivityModel from "@/modules/admins/models/adminsAuthActivity.model";
import {
  forgotPasswordNotification,
  signupVerificationNotification,
} from "@/utils/emails/email.handler";

export const login = async ({
  jwt,
  ip,
  error,
  request,
  body,
  userLocation,
}: any) => {
  const { email, password } = body;
  let user: any = await adminsModel.findOne({ email });
  if (user && (await user.checkPassword(password))) {
    const token = await jwt.sign({ ...JSON.parse(JSON.stringify(user)) });

    await adminsAuthActivityModel.create({
      user: user._id,
      browserName: request.useragent?.browser,
      osName: request.useragent?.os,
      isMobile: request.useragent?.isMobile,
      ip: ip == "::1" ? "" : ip,
      location: "",
      loginAt: new Date(),
      token: token,
      expiredAt: new Date(Date.now() + parseInt("30d") * 60 * 1000),
      userLocation: userLocation || {},
    });

    return {
      success: true,
      data: {
        _id: user._id,
        fullName: user.fullName,
        userID: user.userID,
        avatar: user.avatar,
        superAdmin: user.superAdmin,
        token,
      },
    };
  } else {
    return error(401, {
      success: false,
      message: "Invalid email or password",
    });
  }
};

export const forgotPassword = async ({ body }: any) => {
  const OTPdata = {
    otp: Math.floor(100000 + Math.random() * 900000),
    expireAt: new Date(Date.now() + 1 * 600 * 1000),
  };

  let user: any = await adminsModel
    .findOne({ email: body.email })
    .select("fullName email")
    .lean();

  if (user) {
    await adminsModel.updateOne(
      { email: body.email },
      { $set: OTPdata, deletedAt: null }
    );
    forgotPasswordNotification(user, OTPdata.otp);
  }

  return { success: true, data: {}, message: "OTP sent to registered email" };
};
export const updateForgotPassword = async ({ error, body }: any) => {
  let user: any = await adminsModel.findOne({ email: body.email }).lean();
  if (!user) {
    return error(401, {
      success: false,
      message: "Invalid email",
    });
  } else if (user && user.otp != body.otp) {
    return error(401, {
      success: false,
      message: "Wrong OTP",
    });
  } else if (user && user.expireAt < Date.now()) {
    return error(401, {
      success: false,
      message: "OTP expired, Please generate new OTP.",
    });
  }

  body.password = await Bun.password.hash(body.password, {
    algorithm: "bcrypt",
    cost: 4,
  });

  await adminsModel.updateOne(
    { email: body.email },
    { $set: { password: body.password } }
  );
  return { success: true, message: "Password successfully changed" };
};

export const myProfile = async ({ request }: any) => {
  return { success: true, data: request.user };
};
