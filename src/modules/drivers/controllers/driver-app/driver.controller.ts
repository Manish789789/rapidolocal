// import { driversModel } from '@/modules/drivers/models/drivers.model';
// import moment from "moment";
import driversModel from "../../models/drivers.model";
import driversAuthActivityModel from "../../models/driversAuthActivity.model";
import { logger } from "@/utils/logger";
import { sendOtpFromDefault } from "@/utils/sms/sms.handler";
import rideBookingsModel, {
  bookingStatus,
} from "@/modules/ride-bookings/models/rideBookings.model";
import { generateRandomNumbers, toFixed } from "@/utils";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import moment from "moment-timezone";
import driversWalletTransactionModel from "../../models/driversWalletTransaction.model";
import { getuserSocketId, surgeUpdated } from "@/utils/fetchSocketId";
import {
  createAccountLink,
  createPayoutAccount,
} from "@/modules/paymentGateways/stripe.controller";
import {
  generatePdfFile,
  generateUniquePdfFileName,
  taxPdfFile,
} from "@/utils/invoicePdf";
import { unlink } from "fs/promises";
import { sendSocket, sendToAll, sendToAllUsers } from "@/utils/websocket";
import {
  decryptBankDetails,
  encryptBankDetails,
  validateAutoDepositDriverAccount,
} from "@/modules/rbcBank/helper";
import { loginOtpNotification } from "@/utils/emails/email.handler";
import {
  deleteDriverInRedis,
  getActiveBookingCountOnThewayArrivedFromRedis,
} from "@/utils/redisHelper";
import driversWithdrawalModel from "../../models/driversWithdrawal.model";
import driverFormModel from "../../../formsubmission/models/form.model"
import drivergeoareamodel from "../../../driver-areas/models/geoAreas.model"
import vehicalinformationModel from "../../models/vehicalinformation.model";

const submitLogin = async (
  request: any,
  body: any,
  ip: any,
  jwt: any,
  error: any,
  userLocation: any
) => {
  try {
    const { email, phone, socialToken, socialType, fcmToken } = body;

    let socialFilter: any = {};

    let user: any = null;
    if (socialToken) {
      socialFilter[`socialAccount.${socialType}`] = body.decodedToken.sub;
      user = await driversModel.findOne(socialFilter);
    } else {
      user = await driversModel.findOne(
        email ? { email } : phone ? { phone } : socialFilter
      );
    }

    if (!user) {
      user = await driversModel.create({
        email: body?.email || body?.decodedToken?.email || "",
        phone: body?.phone || body?.decodedToken?.phone || "",
        fullName: body?.fullName || body?.decodedToken?.name || "",
        avatar: body?.avatar || body?.decodedToken?.picture || "",
        ...socialFilter,
      });
    }
    socialFilter.otp = null;
    socialFilter.otpExpireAt = null;
    await driversModel.updateOne({ _id: user._id }, socialFilter);

    const token = await jwt.sign(user._id);

    await driversAuthActivityModel.updateMany(
      { user: user._id },
      {
        token: null,
        logoutAt: new Date(),
        expiredAt: new Date(),
      }
    );

    await driversAuthActivityModel.create({
      user: user._id,
      browserName: request.useragent?.browser,
      osName: request.useragent?.os,
      isMobile: request.useragent?.isMobile,
      ip: ip == "::1" ? "" : ip,
      location: "",
      loginAt: new Date(),
      token: token,
      fcmToken,
      expiredAt: moment()
        .add(parseInt(process.env.JWT_EXPIRE || "10m"), "days")
        .toDate(),
      userLocation: userLocation || {},
    });
    return token;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: null });
  }
};

export const loginOrRegister = async ({
  jwt,
  ip,
  error,
  request,
  body,
  userLocation,
}: any) => {
  try {
    const { otp, socialToken } = body;
    let message = "";
    let data = "";

    if (body?.phone) {
      const driver = await driversModel.findOne({ phone: body?.phone });
      if (driver) {
        if (driver?.isBlocked) {
          const blockedUntil = new Date(driver.isBlocked);
          if (blockedUntil.getTime() > Date.now()) {
            return error(400, {
              success: false,
              data: null,
              message: "Your account has been blocked. Please contact support.",
            });
          }
        }
      }
    }

    if (!otp && !socialToken) {
      let response = await generateAndSendOtp(request, body);

      if (!response) {
        return error(400, {
          success: false,
          message: "Something is wrong please try again",
        });
      }
      message = "OTP successfully sent.";
    } else {
      data = await submitLogin(request, body, ip, jwt, error, userLocation);
    }

    return { success: true, message, data };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: null });
  }
};

export const generateAndSendOtp = async (request: any, body: any) => {
  let { email, phone, countryCode, countryName, deviceInfo } = body;
  try {
    if (
      phone &&
      phone?.length > 2 &&
      (phone?.includes(" ") ||
        phone?.includes("(") ||
        phone?.includes(")") ||
        phone?.includes("-") ||
        phone?.includes("+") ||
        phone?.length > 10)
    ) {
      let newPhone = phone.replace(/[\s()-+]/g, "").trim();
      if (newPhone.length > 10) {
        newPhone = newPhone.slice(-10);
      }
      phone = newPhone;
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const expireAt = new Date(Date.now() + 5 * 60 * 1000);

    const OTPdata = {
      otp:
        process.env.NODE_ENV == "development" ||
        email == "navdeep.shopyvilla@gmail.com" ||
        phone == "9779806366"
          ? 159357
          : otp,
      otpExpireAt: expireAt,
    };

    let user: any = await driversModel
      .findOneAndUpdate(email ? { email } : { phone }, {
        $set: OTPdata,
        deviceInfo,
        deletedAt: null,
      })
      .lean();
    if (!user) {
      user = await driversModel.create({
        email: email || "",
        phone: phone || "",
        fullName: "",
        country: {
          name: countryName || "canada",
          countryCode: countryCode || "1",
          currencyCode: "CAD",
          currencySymbol: "$",
        },
        location: {
          coordinates: [0, 0],
        },
        deviceInfo: deviceInfo || {},
        ...OTPdata,
      });
      user = await driversModel.findById(user?._id).lean();
    }

    if (email) {
      loginOtpNotification(user, otp);
    } else if (phone) {
      if (process.env.NODE_ENV !== "development") {
        let isSendOtp = await sendOtpFromDefault({ countryCode, phone, otp });

        if (!isSendOtp) {
          return false;
        }
      }
    }
    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const logout = async ({ jwt, ip, error, request, body }: any) => {
  try {
    let updateDriverData: any = {
      iAmOnline: false,
      missedBookingCount: 0,
      missedBookingAt: null,
      socket_id: "",
      fcmToken: "",
    };
    await driversModel.updateOne({ _id: request?.user?._id }, updateDriverData);

    await driversAuthActivityModel.updateOne(
      { token: request.token },
      {
        token: null,
        logoutAt: new Date(),
        expiredAt: new Date(),
      }
    );
    return { success: true };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: null });
  }
};

export const driverProfile = async ({ jwt, ip, error, request, body }: any) => {
  try {
    let bankDetails = await decryptBankDetails(request?.user?.bankDetails);
    request.user = { ...request.user, ...bankDetails };

    if (request?.user?.isBlocked) {
      const blockedUntil = new Date(request.user.isBlocked);
      const now = new Date();

      if (blockedUntil > now) {
        return error(401, {
          success: false,
          data: null,
          message: "Your account has been blocked. Please contact support.",
        });
      }
    }

    const vehileId = request?.user?.vehicalInformationId;
    const vehicalInfo: any = await vehicalinformationModel.findOne({ _id: vehileId });
    return {
      success: true,
      data: {
        ...request.user,
        vehicalInformationId: vehicalInfo || {},
        totalRides: request?.user?.rideCount,
      },
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: null });
  }
};

export const updateFcmToken = async ({
  jwt,
  ip,
  error,
  request,
  body,
}: any) => {
  try {
    const { fcmToken } = body;
    driversAuthActivityModel
      .updateOne({ token: request.token }, { fcmToken })
      .exec();
    driversModel.updateOne({ _id: request?.user?._id }, { fcmToken }).exec();

    return { success: true, message: "Token successfully updated" };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: null });
  }
};

export const updateProfile = async ({ jwt, ip, error, request, body }: any) => {
  try {
    let updatedFields = body;
    // console.log(updatedFields, "data of the body");
    if (
      typeof updatedFields?.signature != "undefined" &&
      updatedFields?.signature.includes("base64")
    ) {
      const base64Image = updatedFields?.signature.split(";base64,").pop();
      const fileName = `${generateRandomNumbers(10)}.png`;
      const filePath = path.join(__dirname, "uploads", fileName);

      fs.writeFile(filePath, base64Image, { encoding: "base64" }, (e) => {
        if (e) {
          logger.error({ error: e, msg: e.message });
          return error(400, {
            success: false,
            error: e,
            message: "Failed to upload file",
          });
        }
        updatedFields.signature = fileName;
      });
    }

    if (typeof updatedFields.password !== "undefined") {
      if (typeof updatedFields.oldpassword === "undefined") {
        return { success: false, message: "Please enter old password" };
      } else if (!updatedFields.oldpassword) {
        return { success: false, message: "Please enter old password" };
      }
      let user: any = await driversModel.findOne({ _id: request?.user?._id });

      const match: any = await user.checkPassword(updatedFields.oldpassword);

      if (!match) {
        return { success: false, message: "Old password does not match" };
      }
      const salt = await bcrypt.genSalt(10);
      updatedFields.password = await bcrypt.hash(updatedFields.password, salt);
    }

    if (updatedFields?.vehicleInfo?.isApproved && updatedFields?.vehicleInfo) {
      updatedFields = {
        ...updatedFields,
        vehicleInfo: {
          ...updatedFields.vehicleInfo,
          isDocResubmitted: true,
        },
      };
    }

    let updateQuery: any = { $set: updatedFields };
    const lastVehicleId = body?.otherVehicleInfo?.lastVehicleId;

    if (updatedFields?.vehicleId) {
      updateQuery = {
        $pull: { otherVehicleInfo: { _id: updatedFields.vehicleId } },
      };
    } else if (updatedFields?.otherVehicleInfo) {
      if (lastVehicleId) {
        updateQuery = {
          $set: {
            "otherVehicleInfo.$[elem].vehicleInsurancePolicyNo":
              updatedFields.otherVehicleInfo.vehicleInsurancePolicyNo,
            "otherVehicleInfo.$[elem].vehicleInsuranceExpiryDate":
              updatedFields.otherVehicleInfo.vehicleInsuranceExpiryDate,
            "otherVehicleInfo.$[elem].vehicleInsurancePhoto":
              updatedFields.otherVehicleInfo.vehicleInsurancePhoto,
            "otherVehicleInfo.$[elem].vehicleInsepection":
              updatedFields.otherVehicleInfo.vehicleInsepection,
            "otherVehicleInfo.$[elem].lastInspectionDate":
              updatedFields.otherVehicleInfo.lastInspectionDate,
          },
        };
      } else {
        // updateQuery.$push = { otherVehicleInfo: updatedFields.otherVehicleInfo };
        updateQuery = {
          $push: { otherVehicleInfo: updatedFields.otherVehicleInfo },
        };
      }
      delete updatedFields.otherVehicleInfo;
    }
    // if (updatedFields?.otherVehicleInfo) {
    //   updateQuery.$push = { otherVehicleInfo: updatedFields.otherVehicleInfo };
    //   delete updateQuery.$set.otherVehicleInfo;
    // }
    if (updatedFields?.doctype) {
      const vehicalInfo: any = await vehicalinformationModel.findOne({ driver: request?.user?._id });
      const formData = updatedFields.formData || {};

      if (vehicalInfo) {
        // Find if document with this docType already exists
        const existingDocIndex = vehicalInfo.documents.findIndex(
          (doc: any) => doc.docType === updatedFields.doctype
        );

        if (existingDocIndex !== -1) {
          // ✅ Update existing document
          await vehicalinformationModel.updateOne(
            { driver: request?.user?._id },
            {
              $set: {
                [`documents.${existingDocIndex}.data`]: formData,
                [`documents.${existingDocIndex}.uploadedAt`]: new Date(),
                [`documents.${existingDocIndex}.verifiedAI`]: false,
                [`documents.${existingDocIndex}.verifiedAdmin`]: false,
                [`documents.${existingDocIndex}.rejectedReason`]: ""
              }
            }
          );
        } else {
          // ✅ Add new document to existing vehicalInformation
          await vehicalinformationModel.updateOne(
            { driver: request?.user?._id },
            {
              $push: {
                "documents": {
                  docType: updatedFields.doctype,
                  data: formData,
                  verifiedAI: false,
                  verifiedAdmin: false,
                  rejectedReason: "",
                  uploadedAt: new Date()
                }
              }
            }
          );
        }
      } else {
        // ✅ Create new vehical info for this driver
        const newVehicalInfo = await vehicalinformationModel.create({
          driver: request?.user?._id,
          vehicalsInformation: {
            documents: [
              {
                docType: updatedFields.doctype,
                data: formData,
                verifiedAI: false,
                verifiedAdmin: false,
                rejectedReason: "",
                uploadedAt: new Date()
              }
            ]
          }
        });

        // ✅ Update driver model with this vehicalInformationId
        await driversModel.updateOne(
          { _id: request?.user?._id },
          { $set: { vehicalInformationId: newVehicalInfo._id } }
        );
      }
    }

    if (
      body?.bankDetails?.institutionNumber ||
      body?.bankDetails?.transitNumber ||
      body?.bankDetails?.accountNumber ||
      body?.bankDetails?.accountHolderName
    ) {
      let accountId =
        body.bankDetails.institutionNumber +
        "-" +
        body.bankDetails.transitNumber +
        "-" +
        body.bankDetails.accountNumber;
      let isValid = await validateAutoDepositDriverAccount(accountId);
      if (!isValid) {
        return error(400, {
          success: false,
          data: null,
          message: "Enter valid Account details",
        });
      }
      let output = await encryptBankDetails(updateQuery["$set"]);
      updateQuery = output;
    }

    let user: any = await driversModel.findOneAndUpdate(
      { _id: request?.user?._id },
      updateQuery,
      {
        new: true,
        runValidators: true,
        arrayFilters: lastVehicleId
          ? [{ "elem._id": lastVehicleId }]
          : undefined,
      }
    );
    user = user.toJSON();
    user.token = request.user.token;

    return {
      success: true,
      message: "Profile successfully updated",
      data: user,
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, {
      success: false,
      data: null,
      message: "update profile failed",
    });
  }
};

export const sendAndConfirmOtp = async ({
  jwt,
  ip,
  error,
  request,
  body,
}: any) => {
  try {
    const { otp, email, phone, gender } = body;
    let message = "";
    let data = "";

    if (request?.user?.email != email) {
      const user = await driversModel.findOne({
        email: email,
        _id: {
          $ne: request?.user?._id,
        },
      });
      if (user) {
        return error(400, { success: false, message: "Email already Exists" });
      }
    }

    if (request?.user?.phone != phone) {
      const user = await driversModel.findOne({
        phone: phone,
        _id: {
          $ne: request?.user?._id,
        },
      });
      if (user) {
        return error(400, { success: false, message: "Phone already Exists" });
      }
    }

    if (!otp) {
      let response = await generateAndSendOtpForVerification(request, body);
      if (!response) {
        return error(400, {
          success: false,
          message: "Something is wrong please try again",
        });
      }
      message = "OTP successfully sent.";
    } else {
      let updatedDriverData = {
        email,
        phone,
        otp: "",
        fullName: body?.fullName || request?.user?.fullName || "",
        gender: body?.gender || request?.user?.gender || "",
      };
      await driversModel.updateOne(
        { _id: request?.user?._id },
        updatedDriverData
      );

      message = "Otp verification is completed";
    }
    return { success: true, message, data };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: null });
  }
};

export const generateAndSendOtpForVerification = async (
  request: any,
  body: any
) => {
  let { email, phone, countryCode } = body;
  try {
    if (
      phone &&
      phone?.length > 2 &&
      (phone?.includes(" ") ||
        phone?.includes("(") ||
        phone?.includes(")") ||
        phone?.includes("-") ||
        phone?.includes("+") ||
        phone?.length > 10)
    ) {
      let newPhone = phone.replace(/[\s()-+]/g, "").trim();
      if (newPhone.length > 10) {
        newPhone = newPhone.slice(-10);
      }
      phone = newPhone;
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const expireAt = new Date(Date.now() + 5 * 60 * 1000);

    const OTPdata = {
      otp:
        process.env.NODE_ENV == "development" ||
        phone == "6476496123" ||
        phone == "9779806366"
          ? 159357
          : otp,
      otpExpireAt: expireAt,
    };

    let user = await driversModel
      .findOneAndUpdate(
        { _id: request?.user?._id },
        { ...OTPdata, deletedAt: null }
      )
      .lean();

    if (!user) {
      throw new Error("User is not available");
    }

    if (email) {
      user = { ...user, email: email };
      loginOtpNotification(user, otp);
    } else if (phone) {
      if (process.env.NODE_ENV !== "development") {
        let isSendOtp = await sendOtpFromDefault({
          countryCode: 1,
          phone,
          otp: String(OTPdata.otp),
        });
        if (!isSendOtp) {
          return false;
        }
      }
    }
    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const legalAgreement = async ({ request, body }: any) => {
  return {
    success: true,
    data: `
  As of January 30, 2024, last updated
  
  To put it briefly, let's begin with the prerequisites listed below for drivers who wish to work for RapidoRide in Newfoundland and Labrador:
  
  A current Class 04 or higher driver's licence issued in Newfoundland and Labrador
  As mandated by law, each driver must have separate personal vehicle insurance for the duration of the policy. Included in the Personal Insurance coverage must be the SEF1-45. 
  Drivers agree to provide Rapido Ride with a copy of their insurance certificate as proof of their additional insurance. 
  four years of verified driving experience in Canada
  Drivers had to be at least 25 years old.
  No more than one cancellation due to nonpayment of insurance payments in the preceding three years
  Driver abstract with no more than one three-year at-fault claim
  abstract driver with no more than three claims in the last six years
  Verify your driving record and criminal background to pass the driver screening process.
  Ownership of the vehicle is registered to the driver.
  a current auto insurance policy.
  Vehicle Safety Certificate should be completed in accordance with provincial regulations.
  The cars have to be 4-door sedans, SUVs, or minivans, and they have to be private passenger vehicles.
  Vehicles must be free of obvious cosmetic damage and in acceptable physical condition.
  Installed for the winter, snow tyres or all-weather tyres are used from November 1 to April 30 of the following year.
  Every seat in a vehicle needs to have a seat belt.
  The vehicles have to be 10 years old or newer in model year.
  Vehicles must have gone no more than 200,000 km overall.
  a smartphone with the Rapido Driver software installed and functional. There are versions for Android and iOS.
  Send an email with your details to info@rapidoride.com to apply to drive with us. Applicants must fulfil all requirements in order to be authorised to drive and adhere to public safety standards.
  ESSENTIAL INFORMATION
  
  The ESSENTIAL LEGAL INFORMATION regarding driving for Rapido Ride is located below. This is the place to learn about the requirements for driving a car, a driver, and documents in Newfoundland and Labrador, as well as provincial laws, insurance coverage, privacy, and other needs.
  
  SERVICE AGREEMENT FOR Rapido Ride TRANSPORTATION PROVIDER
  
  The website https://www.rapidoride.com/ (THE WEBSITE), the Rapido Ride mobile application (THE "RIDER APP"), and the Rapido Ride partner mobile application (THE "DRIVER APP") are all operated by Rapido Ride ("www.rapidoride.com"/"WE"/"US"/"OUR"/"COMPANY"). A LEGAL AGREEMENT BETWEEN YOU, AN INDEPENDENT PROVIDER OF RIDESHARE OR TRANSPORTATION SERVICES ("TRANSPORTATION PROVIDER"), AND Rapido Ride is established by the terms and conditions stated above (the "AGREEMENT"). By clicking "YES, I AGREE," you agree to be bound by the terms and conditions of the agreement. If you are accepting this agreement on behalf of a corporation or other entity, you represent and warrant that you have the necessary right and authority to bind said corporation or entity to the terms of this agreement. You are also required to make sure that any employees or contractors who register as transportation providers through you do so in accordance with the terms of this agreement.
  
  • The Service for Rapidohiking. A software platform known as the "Rapido Ride Service" enables registered users, also referred to as "Riders" or "Customers," to request and accept rides from independent third-party suppliers of logistics and/or transportation services who have registered on the platform as transportation providers, or "Transportation Providers." You understand that Rapido Ride does not offer logistical or transportation services and is not a transportation carrier.
  
  
  • Becoming a Registered Provider of Transportation. You must register with Rapido Ride and give us specific personal information in order to become a Transportation Provider (see to our Privacy Policy for more details).
  
  
  • Rapido Ride Partners. The Rapido Ride Service may be provided in collaboration with various outside parties, including local governments, nonprofits, and for-profit businesses, referred to as "Rapido Ride Affiliates." For instance, Rapido Ride may collaborate with a city to fund and/or advertise the service; alternatively, Rapido Ride might obtain a licence for specific technologies to enable it to offer the service. Sections 14 (Insurance), 20 (Limitation of Liability), 21 (Indemnification), 23 (Release), and 26 (Disputes) of this Agreement shall benefit Rapido Ride Affiliates.
  
  
  • Your car. It is required of you as a Transportation Provider that you have legal access to a car. Since we are not a taxi company, we do not offer automobiles. You are required to operate a vehicle that conforms with all relevant legislation in Newfoundland and Labrador in order to provide the transportation services. You bear the exclusive responsibility for all costs and expenses associated with carrying out the services under this agreement, unless otherwise specified in writing. This includes, but is not limited to, fuel costs, fuel taxes, excise taxes, permits of all kinds, gross revenue taxes, income taxes (if applicable), licencing, insurance coverage, and any other taxes, fines, or fees imposed or assessed against the equipment or you in any part of Newfoundland & Labrador.
  
  
  • Driver ID: In order to grant Transportation Providers access to the Rapido Ride Service, Rapido Ride will furnish them with a unique identity and password key (referred to as a "Driver ID"). Rapido Ride retains the right, at all times and in Rapido Ride's sole discretion, to forbid or otherwise limit you or any of your employees from using the Rapido Ride Service, for any reason or for no reason at all. You are responsible for maintaining the security of each Driver ID.
  
  
  • Routes for Ride-Share. Various pick-ups and drop-offs are included in the optimised ride-share itineraries that The Rapido Ride Service offers ("Ride-Share Itineraries"). Itineraries for ride-sharing are dynamic and subject to real-time updates.
  
  
  • The effectiveness of the transport services. In order to provide the transportation services, you must:
  • Throughout the ride-share itinerary, keep the Driver App open, in full screen mode, with GPS access enabled, and connected to the internet, with the exception of when you're phoning or messaging a customer or using a map app to find your way about;
  
  
  • do each pick-up and drop-off in the order listed in the Driver App and in a timely manner;
  • use the Driver App to let the client know when you'll be arriving;
  • watch for a customer's arrival at the designated pick-up spot till the time indicated in the Driver App;
  • deliver clients to their destinations in a secure, continuous manner following the order indicated in the Driver App;
  • during idle hours, as indicated by the Driver App, wait in the assigned spot;
  • thoroughly and carefully fill out the Ride-Share Itinerary in a competent and professional way, according to all applicable legal requirements as well as (a) industry standards, industry standards, and this Agreement.
  
  A major violation of this agreement will occur if this paragraph is not followed.
  • Apply Limitations. You won't do this and you won't let anybody to:
  • alter, translate, reverse engineer, decompile, disassemble, or produce derivative works based on the driver app, website, or Rapido ride service; or gain access to any of these resources in order to: (i) develop a service or product that is competitive; or (ii) replicate any concepts, features, or functionalities;
  • try to get unauthorised access to any areas of the Rapido Ride Service that Rapido Ride has not made available to you, such as access to other users' accounts, or get around any user limitations or other timing or use restrictions that are incorporated into the service;
  • instigate or start any scripts or programmes with the intention of data mining, indexing, surveying, or scraping any part of the Rapido Ride Service, or to burden or impede the operation and/or functioning of any Rapido Ride Service component unfairly;
  • make an effort to access Rapido Ride Service or associated systems or networks without authorization or to cause any harm to them;
  • using a network analyzer, packet sniffer, or other tool, intercept, investigate, or visually monitor any proprietary communications protocol utilised by a client, a server, or the Rapido Ride Service;
  • without the prior written approval of Rapido Ride, resell, rent, lease, transfer, assign, distribute, or engage in any other commercial exploitation of the Rapido Ride Service (or any of its components); or
  • use the Rapido Ride Service for any illegal activity, such as sending spam or other repetitive or unsolicited messages in violation of applicable laws; or sending or storing any content that is libellous, obscene, threatening, or otherwise unlawful or tortious, including content that infringes upon the privacy rights of third parties or could be harmful to minors.
  
  
  • Representations and warranties made by the transportation provider. You represent and warrant to Rapido Ride that, for the duration of this Agreement, you will continue to hold a valid driver's licence as well as all other licences, permits, insurance (as specified in this Section 22), and other legal requirements required to carry out the transportation services you are providing. If you are a business or other legal body engaging into this Agreement, you represent and guarantee that you will abide by all relevant employment and tax laws and regulations.
  
  
  • Non-Distinctive Association. It shall be permissible for each party to this Agreement to engage into comparable arrangements with other parties.
  
  
  • Absence of solicitation and diversion. You commit to avoid using your connection with Rapido Ride (or the knowledge you have obtained from it) to try to steal business from Rapido Ride or transfer it to another firm that offers comparable services for the duration of this Agreement. You also agree that you will not seek to solicit any Rapido Ride contractors or employees during the course of this agreement or for six (6) months thereafter.
  
  
  • Star ratings for transport providers. Customers will be able to assign stars to Transportation Providers in order to rank them. When assigning Ride-Share Itineraries, we may, at our sole discretion, utilise this technology to identify the best Transportation Providers available.
  
  
  • Employees of the transportation provider. You may assign contractors or employees to handle transportation services on your behalf, but only if such parties agree to the provisions of this agreement in each instance. You are exclusively in charge of addressing grievances, determining salaries, hours, and working conditions for your contractors and workers, and overseeing and controlling them in accordance with the requirements of this Agreement. All salaries, benefits, and other costs for your contractors and workers, as well as any relevant tax withholdings, employment insurance, and other applicable taxes and withholdings, are your entire responsibility.
  • Liability. Throughout the duration of this Agreement, you shall maintain the minimum amount of liability insurance for your personal vehicle as required by law. If you operate a licenced limousine, livery or taxicab service, you must: (i) obtain and maintain the necessary vehicle insurance as required by law during the term of this agreement; (ii) acknowledge and agree to submit all insurance claims to the insurer designated by such insurer; and (iii) make sure your insurance policy gives you enough coverage to allow you to carry out the transportation services under this agreement.
  • To the extent that this Agreement is relevant, you will abide by all of your legal duties under social insurance and tax legislation. If you fail to comply with any of your tax responsibilities, you will hold Rapido Ride harmless from any and all tax liabilities, fines, levies, claims, and penalties that may be levied against you or Rapido Ride. For you, your employees, agents, or subcontractors, Rapido Ride is not permitted to withhold income taxes, social insurance taxes, unemployment insurance taxes, or any other type of municipal, provincial, or federal tax. Rapido Ride shall abide with the conditions of a garnishment order, as required by law, if ordered by a court of law with appropriate power and jurisdiction.
  
  
  • Property of the mind. Copyright, trademark, and other intellectual property laws prohibit unauthorised use of the Website, Driver App, Rapido Ride Service, and the information and materials they contain. These belong to Rapido Ride and its licensors. A non-transferable, non-exclusive, revocable licence to (a) access the Website and Rapido Ride Service and (b) download, install, and use the Driver App on a mobile device that you own or control exclusively for your personal use is granted to you by Rapido Ride, subject to the terms of this Agreement (the "Licence"). Instead of being sold, the Driver App is licenced to you. This Agreement does not provide you any permission to use the Rapido Ride names, trademarks, logos, domain names, or other distinguishing characteristics of our brands without our prior written authorization. This licence may be revoked at any moment, at the sole discretion of Rapido Ride.
  
  
  • Should you offer Rapido Ride any recommendations, remarks, or other input about the Website, Driver App, or Rapido Ride Service (hereinafter, "Feedback"), Rapido Ride reserves the right to use such input in the Website, Driver App, Rapido Ride Service, or any other Rapido Ride offerings (all together, "Rapido Ride Offerings"). Therefore, You acknowledge and agree that: (a) Rapido Ride is not obligated to keep the Feedback confidential; (b) You have all the rights to disclose the Feedback to us and that it is not confidential or proprietary information of You or any third party; (c) Rapido Ride (as well as all of its successors and assigns, as well as any successors and assigns of any of the Rapido Ride Offerings) may freely use, reproduce, publicise, licence, distribute, and otherwise commercialise the Feedback in any Hi
  
  
  • "Confidential Information" refers to all information, including oral information, that is provided to the other party by either party and labelled as "proprietary," "confidential," or a similar designation, or that the receiver reasonably knows is considered to be such by the party revealing it. "Confidential Information" excludes any information that the receiving party can show through its written records that: (a) it was known to it before it was disclosed hereunder by the disclosing party without a prior obligation of confidentiality; (b) it is or becomes known through no wrongful act of the receiving party; (c) it was rightfully received from a third party authorised to make such a disclosure; (d) it was independently developed by the receiving party; (e) it was approved for release by the disclosing party's prior written authorization; or (f) it was disclosed by a court order or as otherwise required by law, provided that the party required to disclose the information gives prompt advance notice to allow the other party to seek a protective order or otherwise prevent such Unless specifically permitted in writing by the other party, or as required to exercise its rights or fulfil its duties under this Agreement, neither party may utilise the other's confidential information. Each party shall take reasonable precautions to protect the other party's private information, but in no case shall it take less precautions than it does to protect its own secret information of a similar kind. Except for its officers, employees, service partners, clients, consultants, and legal advisors who have signed written confidentiality agreements with it that are at least as restrictive as those in this Section and who need access to the other party's confidential information in order to carry out the terms of the agreement, neither party may disclose the other party's confidential information to any other person or entity. In the event that this Agreement terminates, the receiving party must, pursuant to Rapido Ride's record keeping policy and requirements, promptly return all Confidential Information to the disclosing party or destroy it at that party's request. Each party understands that in the event that any unauthorised use or disclosure of the other party's Confidential Information takes place or is threatened, the disclosing party may not have a sufficient remedy in the form of money damages. This is because of the unique character of the other party's Confidential Information. The disclosing party may seek an injunction to stop any unauthorised use or disclosure in addition to any other remedies that may be available at law, in equity, or otherwise. Notwithstanding the foregoing provisions in this Section, the parties may disclose this Agreement: (i) as otherwise required by law or the rules of any stock exchange or over-the-counter trading system provided that reasonable measures are used to preserve the confidentiality of the Agreement; (ii) in confidence to legal counsel; (iii) in connection with the requirements of a public offering or securities filing provided reasonable measures are used to obtain confidential treatment for the proposed disclosure, to the extent such treatment is available; (iv) in connection with the enforcement of this Agreement or any rights under this Agreement, provided that reasonable measures are used to preserve the confidentiality of the Agreement; (v) in confidence, to auditors, accountants and their advisors; (vi) in confidence, in connection with a financing or potential financing or change of control or potential change of control of a party or an Affiliate of a party, provided that reasonable measures are used to preserve the confidentiality of the Agreement. The parties shall reasonably cooperate to minimise disclosure for any legally required disclosure or disclosure made in response to a court order, regulatory request, or securities filing. Notwithstanding the aforementioned clauses in this section, any vehicle insurer and any party directly involved in an insurance claim involving the transportation of paying passengers, or which the party reasonably believes involves such transportation, may receive access to your Confidential Information.
  • Service Data and Privacy. By accepting the terms of our Privacy Policy, you acknowledge that we handle personal information in accordance with those policies. Each trip you accept through the Rapido trip Service will immediately trigger the collection and compilation of information about the ride, including the pick-up and drop-off locations, the route followed, your name, the name(s) of the customer(s), the amount paid, and the ride's date and time. As further outlined in our Privacy Policy, Rapido Ride gathers and retains this data.
  
  
  • Liability Restrictions.
  
  
  • Rapido Ride disclaims any liability pertaining to your dealings and/or contacts with clients. Rapido Ride disclaims all liability and responsibility for any actions or inactions on the part of its patrons. You accept all risks by signing up to be a Transportation Network Company Provider. We are unable to ensure any customer's safety or identification. We are under no duty to mediate any disagreements that may arise between you and any of our clients. You are aware that by utilising the Rapido ride service, you could encounter situations that could be dangerous, unpleasant, or inappropriate in some other way.
  
  
  • You understand that privacy cannot be guaranteed on the Internet and that it is not a secure medium. Internet data transmission is susceptible to forgery and interception, including, but not limited to, payment and personal information. When you provide us with confidential information via the Internet, or when you implicitly or explicitly give us permission to do so, Rapido Ride shall not be liable for any harm that results to you or any other party, nor for any mistakes or modifications made to any information that is transmitted.
  
  
  • Rapido Ride shall not be liable for any damages of any kind, including but not limited to direct, indirect, special, incidental, consequential, exemplary, or punitive damages, arising out of or in connection with (i) your use of, or inability to use or access the Website, Driver App, or Rapido Ride Service; including but not limited to loss of revenue, profit, business or anticipated savings, loss of use, loss of goodwill, loss of data, business interruptions, lost opportunities, and whether caused by tort (including negligence and strict liability), breach of contract, or otherwise, even if foreseeable. Nothing in the above affects any responsibility that is not allowable by relevant law to be restricted or excluded.
  
  
  • To the extent permitted by law, Rapido Ride is not responsible for: (i) the actions, inactions, errors, omissions, representations, warranties, breaches or negligence of any customer or for any personal injuries, death, property damage, or other damages of expenses resulting therefrom; (ii) the actions, inactions, errors, omissions, representations, warranties, breaches or negligence of Transportation Providers or for any damages or expenses resulting therefrom including without limitation any personal injury or property damage; (iii) indirect losses which means loss to you which is a side effect of the main loss or damage and where you and Rapido Ride would not have reasonably anticipated that type of loss arising at the time of entering into this Agreement; (iv) failure to provide Rapido Ride or to meet any of our obligations under this Agreement where such delay, cancellation or failure is due to events beyond our control (e.g., a network failure, internet delays, rerouting acts of any government or authority, acts of nature, telecommunication equipment failures, other equipment failures, electrical power failures, strikes, labor disputes, riots, insurrections, civil disturbances, shortages of labor or materials, fires, floods, storms, explosions, acts of God, war, governmental actions, orders of domestic or foreign courts or tribunals, non-performance of third parties, weather, or road conditions and breakdowns); or (v) if for any reason, all or any part of the Website, Driver App or Rapido Ride Service are unavailable at any time or for any period.
  As a result of any claim arising out of or related to any of the following: (a) bodily injury (including death) or damage to tangible personal or real property caused by any act, error, omission, or misconduct on your part; (b) violation of any law or regulation by You (including, without limitation, any privacy or personal information protection law or regulation); or (c) breach of any warranties or representations made by You, You agree to indemnify, defend, and hold Rapido Ride (including its officers, directors, agents, and employees) harmless from and against all liabilities, damages, losses, expenses, claims, demands, suits, fines, and/or judgements (collectively, "Claims").
  
  
  • Warranties disclaimed. The website, driver app, and Rapido ride service are all offered "as is." Rapido Ride makes no warranties, expressed or implied, statutory or otherwise, including any warranties or representations that the features, contents, or other aspects of the website, driver app, or Rapido ride service will be accurate, safe, dependable, timely, secure, error-free, or uninterrupted; that defects will be fixed; that the website, app, or Rapido ride service are free of viruses or other harmful components; or that they will otherwise meet your needs, requirements? To the greatest extent allowed by law, all statutory guarantees are disclaimed, and you hereby forgo the right to receive any benefit from such statutory warranties. To be clear, by using the Website, Driver App, or Rapido Ride Service, you assume all risk of infection of your computer system, mobile device, software, data, or other proprietary material by viruses, distributed denial-of-service attacks, or other technologically harmful materials. Rapido Ride will not be responsible for any loss or damage resulting from any of these events. You assume all risk while using the Driver App, the Website, or the Rapido Ride Service.
  
  
  As a condition of using the Rapido Ride Service, you release Rapido Ride and its parents, subsidiaries, affiliates, officers, employees, agents, partners, and licensors (collectively, the "Rapido Ride Parties") from any and all claims, demands, losses, damages, rights, claims, and actions of any kind, including but not limited to personal injuries, death, and property damage, that are either directly or indirectly related to or arise from your use of the Rapido Ride Service. The releases will be effective immediately.
  
  
  • The parties' relationship. Each party works as an independent contractor. For all intents and purposes, neither party shall be considered the other's employee, agent, partner, joint venturer, or legal representative. Neither party shall have the right, power, or authority to bind the other to any obligation or liability.
  
  
  • Duration and Ending. Rapido Ride has the right to end this Agreement for any reason at any time, with or without warning. You can stop using the Rapido Ride Service at any time by deleting the Driver App and giving us notice in accordance with Section 27.
  
  
  • By registering as a Transportation Network Company Provider. In the event that a disagreement or controversy emerges between the parties regarding the application or interpretation of any clause in this agreement, including this Section's provisions, it will be arbitrated in accordance with this Section's provisions. It is further agreed that the start of any legal action, other than one solely seeking equitable relief, will need completion of such arbitration. No appeal may be filed from the arbitrator's ruling, which is final and binding on the parties. A single arbitrator will preside over all arbitrations pertaining to this Agreement, and they will all take place in St. John's, Newfoundland, Canada. A party wishing to resolve a disagreement or controversy under this Agreement must give notice of arbitration to the opposing party in order to designate the arbitrator. This notice of arbitration must state that the party submitting it wishes to have arbitration and include a brief description of the disagreement or issue. It cannot take any particular format. The parties shall agree on the arbitrator's appointment. Any party may apply to a court of competent jurisdiction for the appointment of an arbitrator, and all parties may submit materials to the court, if, after twenty (20) days from the date the notice of arbitration was sent, the arbitrator has not been appointed by agreement of the parties. All parties shall be entitled to attend the arbitration, subject to any restrictions set by the arbiter. The processes to be followed shall be decided by the parties or, in the absence of agreement, by the arbitrator, subject to the other requirements of this Section. Notwithstanding a party's failure to comply with a procedural order issued by the arbitrator, the arbitrator shall have the authority to carry out the arbitration and give the verdict. All notifications and statements must essentially conform with the provisions of this Section, although they are not needed to be in a certain format, subject to the arbitrator's decision. All parties agree to evenly split the arbitrator's costs and expenses, subject to the arbitrator's judgement. Any cause of action arising under this Agreement must be started by giving notice to the other party within a year after the occurrence giving rise to it; if not, the cause of action will be permanently barred.
  
  
  • Take note. All correspondence with Rapido Ride must be sent through the website's "Contact Us" page (www.Rapido Ride.com). Notifications from Rapido Ride will be sent to the email address you registered with.
  
  
  • You may not assign or transfer this Agreement, your licence to use the Website, Driver App, or Rapido Ride Service to any other person without Rapido Ride's permission. Rapido Ride shall not be deemed to have waived any right, authority, or remedy under this Agreement by reason of any lack or delay on the part of Rapido Ride in using such right, power, or remedy. The laws of the Province of Newfoundland & Labrador, Canada, govern this Agreement, and the courts of that province will have the only authority to award equitable remedy under the terms of this Agreement. Each party works as an independent contractor. For all intents and purposes, neither party shall be considered the other's employee, agent, partner, or legal representative, nor shall either have the right, power, or authority to impose any duties or obligations on the other. The remaining terms of this Agreement will remain in full force and effect even if a court of competent jurisdiction rules that any of the provisions herein are unlawful. The affected provisions will be reinterpreted to the greatest extent permitted by law in order to achieve the original goals of the agreement. All previous and contemporaneous agreements are superseded by this agreement and our privacy policy, which together represent the parties' final, comprehensive, and exclusive agreement regarding the subject matter hereof. This Agreement will remain in effect even after it terminates or expires, including the sections pertaining to intellectual property, liability limitations, disclaimers, indemnity, and dispute resolution. This Agreement may not be assigned by you. This Agreement may be assigned by us without limitation.
  
    `,
  };
};

export const backgroundCheckText = async ({ request, body }: any) => {
  return {
    success: true,
    data: `
  <p>Please upload your valid criminal record background check and vulnerable sector check. </p>
  <p>To obtain these documents, visit  <a href="https://www.rnc.gov.nl.ca/criminal-records-screening-certificate-vulnerable-sector-check/">https://www.rnc.gov.nl.ca/criminal-records-screening-certificate-vulnerable-sector-check/</a>, complete the application process, and submit the results once you receive them. If you prefer Rapidoride to handle this on your behalf, please email us at <a href="mailto:contact@rapidoride.com">contact@rapidoride.com.</a></p>
  
    
    `,
  };
};

export const driverAbstractText = async ({ request, body }: any) => {
  return {
    success: true,
    data: `
  <p>A copy of your driving record (or driver’s abstract) is available online at MyGovNL.</p>
   <a href="https://www.gov.nl.ca/motorregistration/commercial-vehicles-and-drivers/request-driver-record-abstract/">https://www.gov.nl.ca/motorregistration/commercial-vehicles-and-drivers/request-driver-record-abstract/</a>
    `,
  };
};

export const onlineStatus = async ({ request, body, error }: any) => {
  try {
    // const isAnyOtherActiveBooking = await rideBookingsModel.countDocuments({
    //     $or: [
    //         { "scheduled.scheduledAt": null },
    //         {
    //             $and: [
    //                 { "scheduled.scheduledAt": { $ne: null } },
    //                 { "scheduled.startRide": true }
    //             ],
    //         },
    //     ],
    //     driver: request?.user?._id,
    //     tripStatus: { $in: ["picked", "ontheway", "arrived"] },
    //     paymentStatus: true,
    // });

    const isAnyOtherActiveBooking =
      await getActiveBookingCountOnThewayArrivedFromRedis(request?.user?._id);

    if (body.status !== "online" && isAnyOtherActiveBooking) {
      return error(400, {
        success: false,
        data: null,
        message: "Unable to offline",
      });
    }
    // console.log("isAnyOtherActiveBooking***", isAnyOtherActiveBooking)
    let updatedDriverData = {
      iAmOnline: body.status == "online" ? true : false,
      socket_id: body.status !== "online" ? "" : undefined,
      missedBookingCount: 0,
      missedBookingAt: null,
      stopFutureRide: false,
    };
    await driversModel.updateOne(
      { _id: request?.user?._id.toString() },
      updatedDriverData
    );
    sendToAllUsers("DriverLocationUpdate", {
      driverId: request?.user?._id,
      location: {
        type: "Point",
        coordinates: [
          request?.user?.location?.coordinates[0] || 0,
          request?.user?.location?.coordinates[1] || 0,
        ],
      },
      heading: request?.user?.heading,
    });
    surgeUpdated();
    return {
      success: true,
      message:
        body.status == "online" ? "Your are online now" : "You are offline now",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: null, message: "Server error" });
  }
};

export const todayAnalytics = async ({ request, body, error }: any) => {
  try {
    const timezone = "America/St_Johns";
    const currentDate = moment().tz(timezone).format("YYYY-MM-DD");
    const startOfDay = moment.tz(currentDate, timezone).startOf("day").toDate();
    const endOfDay = moment.tz(currentDate, timezone).endOf("day").toDate();

    const [totalEarning, totalRidesWithTime] = await Promise.all([
      driversWalletTransactionModel
        .aggregate([
          {
            $match: {
              driver: request?.user?._id,
              createdAt: {
                $gte: startOfDay,
                $lt: endOfDay,
              },
            },
          },
          {
            $group: {
              _id: null,
              totalEarning: { $sum: "$amount" },
            },
          },
        ])
        .then((result: any) => {
          if (result.length > 0) {
            const { totalEarning } = result[0];
            return totalEarning;
          }
          return 0;
        }),
      rideBookingsModel
        .aggregate([
          {
            $match: {
              driver: request?.user?._id,
              tripStatus: bookingStatus.completed,
              dropedAt: {
                $gte: startOfDay,
                $lt: endOfDay,
              },
            },
          },
          {
            $addFields: {
              timeDifference: {
                $subtract: ["$dropedAt", "$pickedAt"],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalRides: { $sum: 1 },
              totalTime: { $sum: "$timeDifference" },
            },
          },
        ])
        .then((result: any) => {
          if (result.length > 0) {
            const { totalRides, totalTime } = result[0];
            return { totalRides, totalTime };
          }
          return { totalRides: 0, totalTime: 0 };
        }),
    ]);

    return {
      success: true,
      data: {
        totalEarning,
        totalRides: totalRidesWithTime.totalRides,
        totalTime: totalRidesWithTime.totalTime,
      },
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: null });
  }
};

export const earningReport = async ({ request, body, error }: any) => {
  try {
    const timezoneNST = "America/St_Johns";
    const startOfWeek = moment()
      .tz(timezoneNST)
      .startOf("isoWeek")
      .startOf("day");
    const endOfWeek = moment().tz(timezoneNST).endOf("isoWeek").endOf("day");

    const weekArray: any = [];
    let currentDay = startOfWeek.clone();
    while (currentDay <= endOfWeek) {
      weekArray.push(currentDay.format("YYYY-MM-DD"));
      currentDay.add(1, "day");
    }

    const [
      weekChart,
      totalEarning,
      totalRidesWithTime,
      withdrawalsHistory,
      walletHistory,
    ] = await Promise.all([
      driversWalletTransactionModel
        .aggregate([
          {
            $match: {
              driver: request?.user?._id,
              createdAt: {
                $gte: startOfWeek.toDate(),
                $lt: endOfWeek.toDate(),
              },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                  timezone: "America/St_Johns",
                },
              },
              totalAmount: { $sum: "$amount" },
            },
          },
        ])
        .then((result) => {
          const resultMap = new Map(
            result.map(({ _id, totalAmount }) => [
              _id,
              {
                label: moment(_id).format("dddd").slice(0, 1),
                value: parseFloat(Number(totalAmount).toFixed(2)),
              },
            ])
          );
          return weekArray.map(
            (date: any) =>
              resultMap.get(date) || {
                label: moment(date).format("dddd").slice(0, 1),
                value: 0,
              }
          );
        })
        .catch((e) => {
          logger.error({ error: e, msg: e.message });
          return [];
        }),
      driversWalletTransactionModel
        .aggregate([
          {
            $match: {
              driver: request?.user?._id,
              createdAt: {
                $gte: startOfWeek.toDate(),
                $lt: endOfWeek.toDate(),
              },
            },
          },
          {
            $group: {
              _id: null,
              totalEarning: { $sum: "$amount" },
              totalRides: { $sum: 1 },
            },
          },
        ])
        .then((result: any) => {
          if (result.length > 0) {
            const { totalEarning } = result[0];
            return totalEarning;
          }
          return 0;
        }),
      rideBookingsModel
        .aggregate([
          {
            $match: {
              driver: request?.user?._id,
              tripStatus: bookingStatus.completed,
              dropedAt: {
                $gte: startOfWeek.toDate(),
                $lt: endOfWeek.toDate(),
              },
            },
          },
          {
            $project: {
              timeDifference: {
                $subtract: ["$dropedAt", "$pickedAt"],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalRides: { $sum: 1 },
              totalTime: { $sum: "$timeDifference" },
            },
          },
        ])
        .then((result: any) => {
          if (result.length > 0) {
            const { totalRides, totalTime } = result[0];
            return { totalRides, totalTime };
          }
          return { totalRides: 0, totalTime: 0 };
        }),

      driversWithdrawalModel
        .find({
          driver: request?.user?._id,
          status: 2,
        })
        .sort({ createdAt: -1 })
        .limit(10),

      driversWalletTransactionModel
        .find({
          driver: request?.user?._id,
          createdAt: {
            $gte: startOfWeek.toDate(),
            $lt: endOfWeek.toDate(),
          },
        })
        .sort({ createdAt: -1 }),
    ]);

    let data = {
      weekChart,
      weekTotal: {
        totalEarning,
        totalRides: totalRidesWithTime.totalRides,
        totalTime: totalRidesWithTime.totalTime,
      },
      withdrawalsHistory,
      walletHistory,
    };
    return { success: true, data: data };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const earningReportByWeek = async ({ request, body, error }: any) => {
  try {
    const timezoneNST = "America/St_Johns";
    const startDateUTC = body?.startDate;
    const startDateNST = moment
      .utc(startDateUTC)
      .tz(timezoneNST)
      .startOf("day");
    let startOfWeek = startDateNST.clone().startOf("isoWeek").startOf("day");
    let endOfWeek = startDateNST.clone().endOf("isoWeek").endOf("day");

    if (startDateNST.isoWeekday() === 7) {
      startOfWeek = startOfWeek.add(1, "week");
      endOfWeek = endOfWeek.add(1, "week");
    }

    const weekArray: any = [];
    let currentDay = startOfWeek.clone();
    while (currentDay <= endOfWeek) {
      weekArray.push(currentDay.format("YYYY-MM-DD"));
      currentDay.add(1, "day");
    }

    const [
      weekChart,
      totalEarning,
      totalRidesWithTime,
      cancelationFee,
      walletHistory,
    ] = await Promise.all([
      driversWalletTransactionModel
        .aggregate([
          {
            $match: {
              driver: request?.user?._id,
              createdAt: {
                $gte: startOfWeek.toDate(),
                $lt: endOfWeek.toDate(),
              },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                  timezone: "America/St_Johns",
                },
              },
              totalAmount: { $sum: "$amount" },
            },
          },
        ])
        .then((result) => {
          const resultMap = new Map(
            result.map(({ _id, totalAmount }) => [
              _id,
              {
                label: moment(_id).format("dddd").slice(0, 1),
                value: parseFloat(Number(totalAmount).toFixed(2)),
              },
            ])
          );

          return weekArray.map(
            (date: any) =>
              resultMap.get(date) || {
                label: moment(date).format("dddd").slice(0, 1),
                value: 0,
              }
          );
        })
        .catch((e) => {
          logger.error({ error: e, msg: e.message });
          return [];
        }),
      driversWalletTransactionModel
        .aggregate([
          {
            $match: {
              driver: request?.user?._id,
              createdAt: {
                $gte: startOfWeek.toDate(),
                $lt: endOfWeek.toDate(),
              },
            },
          },
          {
            $group: {
              _id: null,
              totalEarning: { $sum: "$amount" },
            },
          },
        ])
        .then((result: any) => {
          if (result.length > 0) {
            const { totalEarning } = result[0];
            return totalEarning;
          }
          return 0;
        }),
      rideBookingsModel
        .aggregate([
          {
            $match: {
              driver: request?.user?._id,
              tripStatus: bookingStatus.completed,
              dropedAt: {
                $gte: startOfWeek.toDate(),
                $lt: endOfWeek.toDate(),
              },
            },
          },
          {
            $addFields: {
              timeDifference: {
                $subtract: ["$dropedAt", "$pickedAt"],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalRides: { $sum: 1 },
              totalTaxes: { $sum: "$finalBilling.driverEarning.driverTax" },
              totalTips: { $sum: "$finalBilling.driverEarning.tips" },
              subTotal: { $sum: "$finalBilling.driverEarning.subTotal" },
              expenses: { $sum: "$finalBilling.driverEarning.expenses" },
              grandTotal: { $sum: "$finalBilling.driverEarning.grandTotal" },
              totalTime: { $sum: "$timeDifference" },
            },
          },
        ])
        .then((result: any) => {
          if (result.length > 0) {
            const {
              totalRides,
              totalTime,
              totalTips,
              totalTaxes,
              subTotal,
              grandTotal,
              expenses,
            } = result[0];
            return {
              totalRides,
              totalTime,
              totalTips,
              newFare: toFixed(subTotal) - toFixed(expenses),
              totalTaxes,
              grandTotal,
            };
          }
          return {
            totalRides: 0.0,
            totalTime: 0.0,
            totalTips: 0.0,
            newFare: 0.0,
            totalTaxes: 0.0,
            grandTotal: 0.0,
          };
        }),
      driversWalletTransactionModel
        .aggregate([
          {
            $match: {
              driver: request?.user?._id,
              description: "On ride cancellation",
              trxType: "Credit",
              createdAt: {
                $gte: startOfWeek.toDate(),
                $lt: endOfWeek.toDate(),
              },
            },
          },
          {
            $group: {
              _id: null,
              totalEarning: { $sum: "$amount" },
            },
          },
        ])
        .then((result: any) => {
          if (result.length > 0) {
            const { totalEarning } = result[0];
            return totalEarning;
          }
          return 0;
        }),
      driversWalletTransactionModel
        .find({
          driver: request?.user?._id,
          createdAt: {
            $gte: startOfWeek.toDate(),
            $lt: endOfWeek.toDate(),
          },
        })
        .sort({ createdAt: -1 }),
    ]);

    let data = {
      weekChart,
      weekTotal: {
        totalEarning,
        totalRides: totalRidesWithTime.totalRides,
        totalTime: totalRidesWithTime.totalTime,
      },
      breakdown: [
        { title: "Net Fare", value: `$${toFixed(totalRidesWithTime.newFare)}` },
        { title: "Tips", value: `$${toFixed(totalRidesWithTime.totalTips)}` },
        { title: "Taxes", value: `$${toFixed(totalRidesWithTime.totalTaxes)}` },
        { title: "Bonus", value: `$0.00` },
        { title: "Cancellation fee", value: `$${toFixed(cancelationFee)}` },
        { title: "Penality", value: `$0.00`, txnType: "debit" },
        {
          title: "Total Earning",
          value: `$${toFixed(
            toFixed(totalRidesWithTime.grandTotal) + toFixed(cancelationFee)
          )}`,
        },
      ],
      walletHistory,
    };
    return { success: true, data: data };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const paymentDetails = async ({ request, body, error }: any) => {
  try {
    if (
      request.user?.paymentDetails &&
      request.user?.paymentDetails?.stripeAccountID
    ) {
      if (request.user?.paymentDetails?.status == "approved") {
        return {
          success: true,
          data: request.user?.paymentDetails,
        };
      } else {
        let accountLink: any = await createAccountLink(
          request.user?.paymentDetails?.stripeAccountID
        );
        return {
          success: true,
          data: {
            ...request.user?.paymentDetails,
            accountLink: accountLink?.url,
          },
        };
      }
    } else {
      let response: any = await createPayoutAccount(request.user.email);
      if (response && response?.account && response?.accountLink) {
        await driversModel.updateOne(
          { _id: request?.user?._id },
          {
            paymentDetails: {
              stripeAccountID: response?.account?.id,
              accountLink: response?.accountLink?.url,
              status: "created",
            },
          }
        );

        return {
          success: true,
          data: {
            stripeAccountID: response?.account?.id,
            accountLink: response?.accountLink?.url,
            status: "created",
          },
        };
      }
    }
    return { success: false, data: null };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: null });
  }
};

export const updateLocation = async ({ request, body, error }: any) => {
  try {
    if (body?.location?.coords?.latitude) {
      body = {
        ...body,
        heading: body?.location?.coords?.heading,
        location: {
          type: "Point",
          coordinates: [
            body?.location?.coords?.longitude,
            body?.location?.coords?.latitude,
          ],
        },
      };
    }
    if (!body?.location?.coordinates) {
      return error(400, { success: false, message: "coordinates required" });
    }

    let driverData = await driversModel.findOne({ _id: request?.user?._id });

    if (
      driverData?.location?.coordinates[0] === body.location?.coordinates[0] &&
      driverData?.location?.coordinates[1] === body.location?.coordinates[1]
    ) {
      return { success: true, message: "Location updated" };
    }

    let updateData: any = {
      location: body?.location,
    };
    if (typeof body.heading != "undefined") {
      updateData.heading = body.heading;
    }

    await driversModel.updateOne(
      { _id: request?.user?._id },
      { ...updateData }
    );

    sendToAllUsers("DriverLocationUpdate", {
      driverId: body.driverId,
      ...updateData,
    });

    return { success: true, message: "Location updated" };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: `Route not available` });
  }
};

export const updateDeviceInfo = async ({ request, body, error }: any) => {
  try {
    const { updateData } = body;
    await driversModel.updateOne(
      { _id: String(request?.user?._id) },
      { $set: { deviceInfo: updateData } }
    );

    return { success: true, message: "Device updated" };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: `Device not available` });
  }
};

export const deleteProfile = async ({ request, body, error }: any) => {
  try {
    await driversModel.updateOne(
      { _id: request?.user?._id },
      { deletedAt: new Date() }
    );

    return { success: true, message: "Profile successfully deleted" };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: `Device not available` });
  }
};

export const taxInfoListing = async ({ request, body, error }: any) => {
  try {
    const createdAt = request.user.createdAt;
    const startYear = new Date(createdAt).getFullYear();
    const startMonth = new Date(createdAt).getMonth();
    const endYear = new Date().getFullYear();
    const endMonth = new Date().getMonth();

    const result = [];

    let year = startYear;
    let month = startMonth;

    while (year < endYear || (year === endYear && month <= endMonth)) {
      result.push({
        year: year,
        month: month + 1,
      });
      month++;
      if (month === 12) {
        month = 0;
        year++;
      }
    }
    return {
      message: "Tax info listing fetched successfully",
      data: result,
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: `list not available` });
  }
};

export const taxInfo = async ({ request, body, error }: any) => {
  try {
    let year = body.year;
    let month = body.month;

    let nextDate: any, prevDate: any;
    if (year && month) {
      const firstDayOfMonth = new Date(`${month} 1, ${year}`);
      const lastDayOfMonth = new Date(
        firstDayOfMonth.getFullYear(),
        firstDayOfMonth.getMonth() + 1,
        0
      );
      prevDate = `${
        firstDayOfMonth.getMonth() + 1
      }-01-${firstDayOfMonth.getFullYear()}`;
      nextDate = `${
        lastDayOfMonth.getMonth() + 1
      }-${lastDayOfMonth.getDate()}-${lastDayOfMonth.getFullYear()}`;
    }
    if (year && !month) {
      nextDate = `12-31-${year}`;
      prevDate = `01-01-${year}`;
    }

    const aggregateData = await rideBookingsModel.aggregate([
      {
        $match: {
          driver: request?.user?._id,
          tripStatus: bookingStatus.completed,
          createdAt: {
            $gte: new Date(prevDate),
            $lte: new Date(nextDate),
          },
        },
      },
      {
        $group: {
          _id: null,
          totalFare: {
            $sum: { $ifNull: ["$finalBilling.driverEarning.fare", 0] },
          },
          serviceFee: {
            $sum: { $ifNull: ["$finalBilling.driverEarning.serviceFee", 0] },
          },
          miscellaneous: {
            $sum: { $ifNull: ["$finalBilling.driverEarning.expenses", 0] },
          },
          userDiscount: {
            $sum: { $ifNull: ["$finalBilling.userBilling.discount", 0] },
          },
          tips: { $sum: { $ifNull: ["$finalBilling.driverEarning.tips", 0] } },
          onlineMileage: { $sum: { $ifNull: ["$finalBilling.km", 0] } },
          bookingFee: {
            $sum: {
              $reduce: {
                input: {
                  $filter: {
                    input: "$finalBilling.pricing",
                    as: "item",
                    cond: { $eq: ["$$item.name", "Booking Fee"] },
                  },
                },
                initialValue: 0,
                in: { $add: ["$$value", "$$this.price"] },
              },
            },
          },
          collectedHst: {
            $sum: {
              $reduce: {
                input: {
                  $filter: {
                    input: "$finalBilling.pricing",
                    as: "item",
                    cond: { $eq: ["$$item.name", "Tax"] },
                  },
                },
                initialValue: 0,
                in: { $add: ["$$value", "$$this.price"] },
              },
            },
          },
          paidHst: {
            $sum: { $ifNull: ["$finalBilling.driverEarning.tax", 0] },
          },
        },
      },
    ]);

    const tripMileageCount = await rideBookingsModel.countDocuments({
      driver: request?.user?._id,
      tripStatus: bookingStatus.completed,
      createdAt: {
        $gte: new Date(prevDate),
        $lte: new Date(nextDate),
      },
    });

    const formatValue = (value: any) => {
      return value === 0 ? "0.00" : parseFloat(value).toFixed(2);
    };

    const aggregateDriverData = await driversModel.aggregate([
      {
        $match: {
          _id: request?.user?._id,
        },
      },
    ]);

    const totalFare = formatValue(aggregateData[0]?.totalFare || 0);
    const serviceFee = formatValue(aggregateData[0]?.serviceFee || 0);
    const bookingFee = formatValue(aggregateData[0]?.bookingFee || 0);
    const collectedHst = formatValue(aggregateData[0]?.collectedHst || 0);
    const paidHst = formatValue(aggregateData[0]?.paidHst || 0);
    const miscellaneous = formatValue(aggregateData[0]?.miscellaneous || 0);
    const userDiscount = formatValue(aggregateData[0]?.userDiscount || 0);
    const hstGst = aggregateDriverData[0]?.taxProfileForm?.hstGst || "";
    const tips = formatValue(aggregateData[0]?.tips || 0);
    const discount = formatValue(aggregateData[0]?.discount || 0);
    const onlineMileage = formatValue(aggregateData[0]?.onlineMileage || 0);
    const overallTotal =
      parseFloat(totalFare) +
      parseFloat(bookingFee) +
      parseFloat(collectedHst) +
      parseFloat(tips) -
      parseFloat(userDiscount);
    const total = overallTotal.toFixed(2);
    const breakDown =
      parseFloat(serviceFee) +
      parseFloat(bookingFee) +
      parseFloat(discount) +
      parseFloat(paidHst);
    const feesBreakdownTotal = breakDown.toFixed(2);
    const tripMileage = parseFloat(String(tripMileageCount * 2.3)).toFixed(2);
    const pdfData = {
      totalFare,
      serviceFee,
      bookingFee,
      collectedHst,
      miscellaneous,
      userDiscount,
      tips,
      total,
      feesBreakdownTotal,
      onlineMileage,
      discount,
      paidHst,
      tripMileage,
      hstGst,
    };
    const htmlContent = taxPdfFile(request, body, pdfData);
    const name = request.user.fullName.replace(/\s+/g, "_");
    const pdfMonth = body.month;
    const pdfYear = body.year;
    const fileName = generateUniquePdfFileName(name, pdfMonth, pdfYear);
    const pdfDirectory = path.join(__dirname, "pdfs");
    if (!fs.existsSync(pdfDirectory)) {
      fs.mkdirSync(pdfDirectory);
    }
    const pdfFilePath = path.join(pdfDirectory, fileName);

    const options = {
      format: "A4",
      orientation: "portrait",
      border: {
        top: "2cm",
        right: "1cm",
        bottom: "1mm",
        left: "1cm",
      },
    };

    try {
      const response: any = await generatePdfFile(
        htmlContent,
        pdfFilePath,
        options
      );
      const file = Bun.file(response.filename);
      const fileBuffer = await file.arrayBuffer();
      unlink(response.filename).catch((e) =>
        logger.error({ error: e, msg: e.message })
      );
      return new Response(fileBuffer, {
        headers: {
          "Content-Type": "application/pdf",
        },
      });
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });
      return error(400, { success: false, message: "PDF generation failed" });
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(500, { success: false, message: "Internal Server Error" });
  }
};

export const taxProfileForm = async ({ request, body, error }: any) => {
  try {
    await driversModel.updateOne(
      { _id: request?.user?._id },
      {
        taxProfileForm: {
          registeredName: body.registeredName,
          streetAddress: body.streetAddress,
          city: body.city,
          postCode: body.postCode,
          province: body.province,
          country: body.country,
          notGstRegistered: body.gstCheckBox,
          hstGst: body.hstGst,
          disclaimer: body.disclaimer,
        },
      }
    );
    return { success: true, message: "Tax Form submitted successfully" };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(500, { success: false, message: "Internal Server Error" });
  }
};


export const getUpdateLocation = async ({ request, body, error }: any) => {
  try {
    // console.log("Fetching driver location for driver ID:", request);
    const driverData = await driversModel.findOne(
      { _id: request?.user?._id },
      { location: 1, heading: 1, _id: 0, fullName: 1 }
    );
    // console.log("Fetched driver location data:", driverData);

    let matchingGeoArea = null;
    // 47.59983459942113, -52.73617073172303
    // Check if driver has location data
    if (driverData?.location?.coordinates) {
      const [driverLng, driverLat] = driverData.location.coordinates;

      // Use MongoDB's $geoWithin to check if driver point is within polygon area
      const geoAreas: any = await drivergeoareamodel.aggregate([
        {
          $match: {
        status: true,
        location: {
          $geoIntersects: {
            $geometry: {
          type: "Point",
          coordinates: [driverLng, driverLat],
            },
          },
        },
          },
        },
        {
          $project: {
        country: 1,
        city: 1,
        staticSurge: 1,
        _id: 1,
          },
        },
      ]);

      const geoAreaIds = geoAreas.map((area: any) => area._id);
      const geoArea = geoAreas.length > 0 ? geoAreas[0] : null;

      // console.log("Matching geo area found:", geoAreaIds  );

      if (geoArea) {
        matchingGeoArea = {
          driverGeoAreaId: geoArea._id, // Explicitly name it as driverGeoAreaId
          country: geoArea.country,
          city: geoArea.city,
          staticSurge: geoArea.staticSurge
        };
      }

      await driversModel.updateOne(
        {
          _id: request?.user?._id,
          approved_zones: { $ne: geoArea._id }
        },
        {
          $push: { approved_zones: geoArea._id }
        }
      );
    }
  
    return {
      success: true,
      data: {
        // ...driverData,
        geoArea: matchingGeoArea
      },
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(500, { success: false, message: 'Internal Server Error' });
  }
};

export const formList = async ({ request, error }: any) => {
  try {
    // console.log(request.user,'ouhiu');
    const driver = await driversModel.findOne({ _id: request?.user?._id });

    if (!driver) {
      return error(404, { success: false, message: 'Driver not found' });
    }

    const forms = await driverFormModel.findOne({
      "country.driverGeoArea": { $in: driver?.approved_zones || [] }
    });
    // console.log("Fetched forms:", forms);
    return { success: true, data: forms };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(500, { success: false, message: 'Internal Server Error' });
  }
}

export const documentVerification = async ({ request, body, response, params}: any) => {
  try {
    // console.log("Document verification request params:", params);
    const { id } = params;
    console.log("Driver ID for document verification:", id);
    // const driver = await driversModel.findOne({ _id: driverId });

    // if (!driver) {
    //   return { success: false, message: 'Driver not found' };
    // }

    const latestAuthActivity = await driversAuthActivityModel
      .findOne({
        user: id
      })
      .sort({ loginAt: -1 });

    const token = latestAuthActivity?.token;

    if (token && response) {
      // Set token in HTTP-only cookie
      response.cookie('authToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    }

    return {
      success: true,
      data: {
        token: token || null
      }
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    console.log(e, 'wewe'); 
    return { success: false, message: 'Internal Server Error' };
  }
}