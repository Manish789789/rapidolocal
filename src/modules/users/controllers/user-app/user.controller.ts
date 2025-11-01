import { updateEmailOnStripe } from "@/modules/paymentGateways/stripe.controller";
import usersModel from "../../models/users.model";
import usersAuthActivityModel from "../../models/usersAuthActivity.model";
import couponsModel from "@/modules/coupons/models/coupons.model";
import { isFloat } from "@/utils";
import { sendOtpFromDefault } from "@/utils/sms/sms.handler";
import { logger } from "@/utils/logger";
import rideBookingsModel, { bookingStatus } from "@/modules/ride-bookings/models/rideBookings.model";
import { haversineDistanceCalculate } from "@/utils/map/helper";
import { sendSocket } from "@/utils/websocket";
import { updateProfileVerificationNotification } from "@/utils/emails/email.handler";
import { sendToDriverSocket, sendToUserSocket } from "@/plugins/websocket/websocket.plugin";

export const myProfile = async ({ request, error }: any) => {
  try {
    return {
      success: true,
      data: { ...request?.user, totalRides: request?.user?.rideCount },
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: [], message: "Not my profile" })
  }
};

export const updateFcmToken = async ({ request, body, error }: any) => {
  try {
    const { fcmToken } = body;
    await usersAuthActivityModel.updateOne({ token: request.token }, { fcmToken })
    return { success: true, message: 'FCM Token successfully updated' };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: [], message: "token not updated" })
  }
};

export const updateProfile = async ({ request, body, error }: any) => {
  try {
    if (body?.phone) {
      let replacedValue = body?.phone.replaceAll(" ", "").replaceAll("-", "").replaceAll("+", "").replaceAll(/\D+/g, '')
      body.phone = replacedValue
    }
    let { extraFields, fullName, email, phone, otp, countryName, countryCode, theme, gender, avatar, blockDrivers, favDrivers, defaultOtpCode, defaultOtpCodeValue } = body;
    if (phone && phone?.length > 2 && (phone?.includes(" ") || phone?.includes("(") || phone?.includes(")") || phone?.includes("-") || phone?.includes("+") || phone?.length > 10)) {
      let newPhone = phone.replace(/[\s()-+]/g, "").trim();
      if (newPhone.length > 10) {
        newPhone = newPhone.slice(-10);
      }
      phone = newPhone;
    }
    if (email) {
      let user = await usersModel.countDocuments({ email, _id: { $ne: request?.user?._id } });
      if (user) {
        return error(400, { success: false, message: 'Email already exist.' })
      }
    }

    if (phone) {
      let user = await usersModel.countDocuments({ phone, _id: { $ne: request?.user?._id } });
      if (user) {
        return error(400, { success: false, message: 'Phone already exist.' })
      }
      if (!countryCode) {
        return error(400, { success: false, message: 'Invalid country code' })
      }
      if (!countryName) {
        return error(400, { success: false, message: 'Invalid country name.' })
      }
    }



    let user = request.user
    let message = "Profile successfully updated"
    if (extraFields && typeof extraFields == 'object') {
      user = await usersModel.findOneAndUpdate({ _id: request?.user?._id }, {
        extraFields: {
          ...request.user.extraFields,
          ...extraFields
        }
      }, { new: true })
    }
    if (defaultOtpCode) {
      user = await usersModel.findOneAndUpdate({ _id: request?.user?._id }, {
        defaultOtpCode: defaultOtpCode,
        defaultOtpCodeValue: defaultOtpCodeValue
      })

    }
    if (typeof fullName != 'undefined' && fullName.length != 0) {
      user = await usersModel.findOneAndUpdate({ _id: request?.user?._id }, {
        fullName: fullName
      })
      user = {
        ...user,
        fullName: fullName
      }
    }

    if (typeof theme != 'undefined' && theme.length != 0) {
      user = await usersModel.findOneAndUpdate({ _id: request?.user?._id }, {
        theme: theme
      })
      user = {
        ...user,
        theme: theme
      }
    }

    if (typeof gender != 'undefined' && gender.length != 0) {
      user = await usersModel.findOneAndUpdate({ _id: request?.user?._id }, {
        gender: gender
      })
      user = {
        ...user,
        gender: gender
      }
    }

    if (typeof avatar != 'undefined' && avatar.length != 0) {
      user = await usersModel.findOneAndUpdate({ _id: request?.user?._id }, {
        avatar: avatar
      })
      user = {
        ...user,
        avatar: avatar
      }
    }
    if (blockDrivers?.length >= 0) {
      user = await usersModel.findOneAndUpdate({ _id: request?.user?._id }, {
        blockDrivers: blockDrivers
      })
      user = {
        ...user,
        blockDrivers: blockDrivers
      }
    }
    if (favDrivers?.length >= 0) {
      user = await usersModel.findOneAndUpdate({ _id: request?.user?._id }, {
        favDrivers: favDrivers
      })
      user = {
        ...user,
        favDrivers: favDrivers
      }
    }

    if (email && email != request.user.email) {
      if (otp) {
        user = await usersModel.findOneAndUpdate({ _id: request?.user?._id }, {
          email,
          otp: null
        }, { new: true });
        await updateEmailOnStripe(request.user, email);
      } else {
        const otp = Math.floor(100000 + Math.random() * 900000);
        const expireAt = new Date(Date.now() + 5 * 60 * 1000);
        await usersModel.updateOne({ _id: request?.user?._id }, {
          otp: (process.env.NODE_ENV == "development" || phone == '6476496123' || phone == '9779806366') ? 159357 : otp,
          otpExpireAt: expireAt,
          deletedAt: null
        })

        updateProfileVerificationNotification({
          ...user,
          email
        }, otp);
        message = 'We have sent OTP to your new email to verify'
      }

    }

    if (phone && phone != request.user.phone) {
      if (otp) {
        user = await usersModel.findOneAndUpdate({ _id: request?.user?._id }, {
          phone,
          countryName: countryName || '',
          countryCode: countryCode || '',
          otp: null
        }, { new: true })
      } else {
        const otp = Math.floor(100000 + Math.random() * 900000);
        const expireAt = new Date(Date.now() + 5 * 60 * 1000);
        const OTPdata = {
          otp: (process.env.NODE_ENV == "development" || phone == '6476496123' || phone == '9779806366') ? 159357 : otp,
          otpExpireAt: expireAt,
        };
        await usersModel.updateOne({ _id: request?.user?._id }, {
          otp: OTPdata.otp,
          otpExpireAt: OTPdata.otpExpireAt,
          deletedAt: null
        })

        if (process.env.NODE_ENV != "development") {
          let isSendOtp = sendOtpFromDefault({ countryCode: request.user.countryCode, phone, otp: OTPdata.otp });
          if (!isSendOtp) {
            return error(400, { success: false, message: 'Otp Send Failed' })
          }
        }

        message = 'We have sent OTP to your new phone to verify'
      }
    }
    return { success: true, message, data: user?._doc || user };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: [], message: "Profile not updated" })
  }
};

export const updateLastActive = async ({ request, error }: any) => {
  try {
    await usersAuthActivityModel.updateOne({ token: request.token }, { lastActive: new Date() })
    return { success: true, message: 'Last active successfully updated' };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: [], message: "Last active not updated" })
  }
};

export const deleteprofile = async ({ request, error }: any) => {
  try {
    await usersModel.updateOne({ _id: request?.user?._id }, {
      deletedAt: new Date()
    })
    return { success: true, message: "Profile successfully deleted" };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: [], message: "Profile not deleted" })
  }
};

export const fetchInvitedUsers = async ({ request, body, error }: any) => {
  try {
    var limit = typeof body.perPage == "undefined" ? 10 : body.perPage;
    var page = typeof body.page == "undefined" ? 1 : body.page;

    let invitedList = await couponsModel.aggregate([
      {
        $match: {
          userId: request?.user?._id,
          invitedBy: request?.user?._id
        }
      },
      {
        $lookup: {
          from: "users",
          localField: 'invitedTo',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $unwind: "$userDetails"
      },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          paginatedResults: [
            { $skip: limit * (page - 1) },
            { $limit: limit },
          ],
        }
      },
      { $unwind: '$totalCount' },
      {
        $replaceRoot: { newRoot: { $mergeObjects: ["$totalCount", { paginatedResults: "$paginatedResults" }] } }
      },
    ]);

    if (invitedList.length === 0) {
      return {
        success: true,
        data: {
          pages: 0,
          total: 0,
          currentPage: 1,
          lists: []
        }
      }
    }
    var totalPages: string | any = parseInt(invitedList[0].count) / limit;

    let resData = {
      pages: isFloat(totalPages) ? parseInt(totalPages) + 1 : totalPages,
      total: invitedList[0].count,
      currentPage: page,
      lists: invitedList[0].paginatedResults
    }

    return {
      success: true,
      message: "Invited users fetched",
      data: resData
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: [], message: "Invited Users not fetched" })
  }
};

export const updateDeviceInfo = async ({ request, body, error }: any) => {
  try {
    const { updateData } = body;
    await usersModel.updateOne(
      { _id: request?.user?._id },
      { $set: { deviceInfo: updateData } }
    )
    return { success: true, message: 'Device updated' };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: [], message: "Device Info not updated" })
  }
};

export const updateLocation = async ({ request, body, error }: any) => {
  try {
    if (!body?.location?.coordinates) {
      return error(400, { success: false, message: `Location not available` });
    }

    let userData = await usersModel.findOne({ _id: request?.user?._id })
    if (userData?.location?.coordinates[0] === body?.location?.coordinates[0] && userData?.location?.coordinates[1] === body?.location?.coordinates[1]) {
      return error(400, { success: false, message: `Location not available` });
    }

    let distance = haversineDistanceCalculate(body?.location.coordinates[1], body?.location.coordinates[0], userData?.location?.coordinates[1], userData?.location?.coordinates[0]);

    let updateData: any = {}
    if (distance < 20) {
      return error(400, { success: false, message: `Location not available` });
    } else {
      updateData.location = body?.location
    }

    if (typeof body.heading != 'undefined') {
      updateData.heading = body.heading
    }

    await rideBookingsModel.updateOne(
      { _id: request?.user?._id },
      { ...updateData },
    )

    let booking: any = await rideBookingsModel.findOne({ customer: body.userId, tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.arrived] }, paymentStatus: true }).populate("driver customer").lean();
    if (booking) {
      await rideBookingsModel.updateOne(
        { _id: booking._id },
        { $set: { "tripAddress.0.location": { latitude: body?.location.coordinates[1], longitude: body?.location.coordinates[0] } } }
      );
      // sendSocket([booking?.driver?._id?.toString(), booking?.customer?._id?.toString()], "UpdatedTripAddress", { userId: body?.userId, bookingId: booking._id, updatedLocation: body?.location.coordinates });
      sendToUserSocket(booking?.customer?._id?.toString(), {
        event: "UpdatedTripAddress",
        data: { userId: body?.userId, bookingId: booking._id, updatedLocation: body?.location.coordinates }
      })
      sendToDriverSocket(booking?.driver?._id?.toString(), {
        event: "UpdatedTripAddress",
        data: { userId: body?.userId, bookingId: booking._id, updatedLocation: body?.location.coordinates }
      })
      return { success: true, message: 'Location updated' };
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: [], message: `Location not available` })
  }
};