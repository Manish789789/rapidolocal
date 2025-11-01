import { t } from "elysia";
import driversModel from "../models/drivers.model";
import mongoose from "mongoose";

const deviceInfoSchema = t.Optional(
  t.Object({
    apiLevel: t.Number(),
    androidId: t.String(),
    baseOs: t.String(),
    device: t.String(),
    deviceName: t.String(),
    isTabletMode: t.Boolean(),
    brand: t.String(),
    deviceId: t.String(),
    model: t.String(),
    systemName: t.String(),
    systemVersion: t.String(),
    isLowRamDevice: t.Boolean(),
    isDisplayZoomed: t.Boolean(),
    appVersion: t.String(),
    deviceOS: t.String(),
  })
);

export const loginValidator = t.Object({
  email: t.Optional(
    t.String({
      format: "email",
      error: "Invalid email",
    })
  ),
  phone: t.Optional(
    t.String({
      error: "Invalid phone",
    })
  ),
  fullName: t.Optional(
    t.String({
      error: "Invalid name",
    })
  ),
  gender: t.Optional(
    t.String({
      error: "Invalid gender",
    })
  ),
  socialToken: t.Optional(
    t.String({
      error: "Invalid socialToken",
    })
  ),
  otp: t.Optional(
    t.String({
      minLength: 6,
      maxLength: 6,
      error: "Invalid OTP",
    })
  ),
  countryName: t.Optional(
    t.String({
      maxLength: 20,
      error: "Invalid country name",
    })
  ),
  countryCode: t.Optional(
    t.String({
      maxLength: 20,
      error: "Invalid country code",
    })
  ),
  deviceInfo: deviceInfoSchema,
  password: t.Optional(
    t.String({
      minLength: 8,
      maxLength: 20,
      pattern:
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$",
      error: "Invalid password",
    })
  ),
});

export const validatePhone = async ({ body }: any) => {
  if (!body?.countryCode) {
    throw new Error("Invalid country code.");
  }
  body.phone = body.phone
    .replaceAll(" ", "")
    .replaceAll("-", "")
    .replaceAll("+", "")
    .replaceAll(/\D+/g, "");
};

export const validateOtp = async ({ body, request }: any) => {
  let checkPoint = {};
  if (request?.user) {
    checkPoint = { _id: request?.user?._id };
  } else if (typeof body?.email !== "undefined" && body.email.length !== 0) {
    checkPoint = { email: body.email };
  } else if (typeof body?.phone !== "undefined" && body.phone.length !== 0) {
    checkPoint = { phone: body.phone };
  } else {
    throw new Error("Invalid email or phone number");
  }
  const otpList: any = await driversModel.findOne({
    ...checkPoint,
    deletedAt: null,
  });
  if (!otpList) {
    throw new Error("User not found or OTP not generated");
  }
  const now = new Date();
  if (otpList && otpList.otp !== body.otp) {
    throw new Error("Wrong OTP");
  } else if (otpList && otpList.otpExpireAt < now) {
    throw new Error("OTP expired, Please generate new OTP.");
  }
  if (otpList && new Date(otpList.isBlocked) > now) {
    throw new Error("Your account is temporarily blocked");
  }
};

export const validateCountryName = async ({ body, request }: any) => { };

export const validateCountryCode = async ({ body, request }: any) => { };

export const validateMongodbId = ({ parmas }: any) => {
  const { id } = parmas;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Your account is temporarily blocked");
  }
};
