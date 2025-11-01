import { generateRandomNumbers } from "@/utils";
import moment from "moment";
import userWalletTransactionsModel from "../../models/userWalletTransactions.model";
import activityLogsModel from "../../../activityLogs/models/activityLogs.model";
import usersModel from "../../models/users.model";
import { resources } from "@/utils/resources";
import { autoDeductMoneyFromAccount } from "@/modules/paymentGateways/stripe.controller";
import { autoDeductMoneyFromSquare } from "@/modules/paymentGateways/square.controller";
import rideBookingsModel, {
  bookingStatus,
} from "@/modules/ride-bookings/models/rideBookings.model";
import { logger } from "@/utils/logger";
import { convertJson } from "@/utils/convertjson";
import usersAuthActivityModel from "../../models/usersAuthActivity.model";
export const { index, create, edit, update, deleteItem, multiDeleteItem } =
  resources(usersModel);

export const block = async ({ params, error }: any) => {
  try {
    await usersModel.updateOne(
      { _id: params.id },
      { isBlocked: moment().add(10, "years").format() }
    );
    await usersAuthActivityModel.updateMany(
      { user: params.id },
      { $set: { fcmToken: null } }
    );

    activityLogsModel.create({
      title: "User Blocked",
      description: "Blocked by admin",
      user: params.id,
    });
    return { success: true, message: "Customer successfully blocked" };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};
export const unBlock = async ({ params, error }: any) => {
  try {
    await usersModel.updateOne(
      { _id: params.id },
      { isBlocked: moment().add(-1, "day").format() }
    );
    activityLogsModel.create({
      title: "User Unblock",
      description: "Unblock by admin",
      user: params.id,
    });

    return { success: true, message: "Customer successfully unblocked" };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};
export const addMoney = async ({ body, params, error }: any) => {
  try {
    let updatedUser = await usersModel.findOneAndUpdate(
      { _id: params.id },
      { $inc: { wallet: body.amount } }
    );

    await userWalletTransactionsModel.create({
      amount: body.amount,
      description: "Added money in wallet by admin",
      trxType: "Credit",
      trxId: `WLT${generateRandomNumbers(6)}`,
      user: params.id,
      currency: {
        currencyCode: updatedUser?.country?.currencyCode,
        currencySymbol: updatedUser?.country?.currencySymbol,
      },
    });
    await activityLogsModel.create({
      title: "Added money in wallet by admin",
      description: body.description,
      user: params.id,
    });
    return { success: true, message: "Money successfully added" };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};
export const deductMoney = async ({ body, params, error }: any) => {
  try {
    const user = await usersModel.findOne({ _id: params.id });

    if (!user) {
      return { success: false, message: "User not found" };
    }
    const totalAmount = body.amount;
    const paymentMethod = body.paymentMethod;
    const walletBalance = user.wallet;

    if (paymentMethod === "wallet") {
      if (walletBalance >= totalAmount) {
        await usersModel.findOneAndUpdate(
          { _id: params.id },
          { $inc: { wallet: -totalAmount } }
        );
        await userWalletTransactionsModel.create({
          amount: -body.amount,
          description: "Deducted money from wallet and Square",
          trxType: "Debit",
          trxId: `WLT${generateRandomNumbers(6)}`,
          user: params.id,
          currency: {
            currencyCode: "cad",
            currencySymbol: "$",
          },
        });

        await activityLogsModel.create({
          title: "Deducted money from wallet by admin",
          description: `Deducted $${totalAmount} from wallet by admin`,
          user: params.id,
        });

        return {
          success: true,
          message: "Money successfully deducted from wallet",
        };
      } else {
        return {
          success: false,
          message: "Wallet balance is not enough",
        };
      }
    }
    if (paymentMethod === "square") {
      const squareResult = await autoDeductMoneyFromSquare(
        params.id,
        totalAmount
      );
      if (squareResult) {
        await userWalletTransactionsModel.create({
          amount: -body.amount,
          description: "Deducted money from wallet and Square",
          trxType: "Debit",
          trxId: `WLT${generateRandomNumbers(6)}`,
          user: params.id,
          currency: {
            currencyCode: "cad",
            currencySymbol: "$",
          },
        });
        await activityLogsModel.create({
          title: "Deducted money from Square by admin",
          description: `Deducted $${totalAmount} from Square by admin`,
          user: params.id,
        });
        await usersModel.findOneAndUpdate(
          { _id: params.id },
          { $inc: { wallet: -totalAmount } }
        );
        return {
          success: true,
          message: "Money successfully deducted from Square",
        };
      } else {
        return {
          success: false,
          message: "Your not detucted from Square",
        };
      }
    }
    if (paymentMethod === "stripe") {
      const stripeResult = await autoDeductMoneyFromAccount(
        params.id,
        totalAmount
      );
      if (stripeResult) {
        await userWalletTransactionsModel.create({
          amount: -body.amount,
          description: "Deducted money from Stripe",
          trxType: "Debit",
          trxId: `WLT${generateRandomNumbers(6)}`,
          user: params.id,
          currency: {
            currencyCode: stripeResult?.currency,
            currencySymbol: "$",
          },
        });
        await activityLogsModel.create({
          title: "Deducted money from Stripe by admin",
          description: `Deducted $${totalAmount} from Stripe by admin`,
          user: params.id,
        });
        await usersModel.findOneAndUpdate(
          { _id: params.id },
          { $inc: { wallet: -totalAmount } }
        );
        return {
          success: true,
          message: "Money successfully deducted from Stripe",
        };
      } else {
        return {
          success: false,
          message: "Your not detucted from Stripe",
        };
      }
    }
    return {
      success: false,
      message: "External payment (Square/Stripe) failed. Wallet rolled back.",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};
export const analytics = async ({ params, error }: any) => {
  try {
    const userId = params.id;

    // Check if user exists
    const user = await usersModel.findOne({ _id: userId });
    if (!user) {
      return error(400, {
        success: false,
        message: "User not found",
        data: {},
      });
    }

    const completeRides = await rideBookingsModel.countDocuments({
      customer: userId,
      tripStatus: bookingStatus.completed,
    });
    const totalRides = await rideBookingsModel.countDocuments({
      customer: userId,
    });
    const paid = await rideBookingsModel.countDocuments({
      customer: userId,
      paymentStatus: true,
    });
    const cancelledRides = await rideBookingsModel.countDocuments({
      customer: userId,
      canceledBy: "user",
      tripStatus: "canceled", // adjust this field based on your schema
    });
    const paidCancelledRides = await rideBookingsModel.countDocuments({
      customer: userId,
      tripStatus: "canceled",
      canceledBy: "user",
      paymentStatus: true,
    });
    const unpaidCancelledRides = await rideBookingsModel.countDocuments({
      customer: userId,
      tripStatus: "canceled",
      canceledBy: "user",
      paymentStatus: false,
    });

    return {
      success: true,
      data: {
        userId,
        totalRides,
        completeRides,
        paid,
        cancelledRides: {
          total: cancelledRides,
          paid: paidCancelledRides,
          unpaid: unpaidCancelledRides,
        },
      },
      message: "Analytics fetched successfully",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(500, {
      success: false,
      message: "Internal Server Error",
      data: {},
    });
  }
};
export const driverUnblock = async ({ params, error, body }: any) => {
  try {
    const user = await usersModel.findOne({ _id: params.id });
    if (!user) {
      return error(400, {
        success: false,
        data: {},
        message: "Driver not found",
      });
    }

    const driverIdToRemove = body.id;

    const isBlocked = user.blockDrivers.includes(driverIdToRemove);
    if (!isBlocked) {
      return error(400, {
        success: false,
        data: {},
        message: "Driver is not blocked",
      });
    }
    await usersModel.updateOne(
      { _id: params.id },
      { $pull: { blockDrivers: driverIdToRemove } }
    );

    await activityLogsModel.create({
      title: "Driver Unblocked",
      description: "Driver unblocked by admin",
      user: params.id,
    });

    return {
      success: true,
      message: "Driver successfully unblocked",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, {
      success: false,
      data: {},
      message: "Something went wrong",
    });
  }
};
export const addDriverBlock = async ({ params, error, body }: any) => {
  try {
    const user = await usersModel.findOne({ _id: params.id });
    if (!user) {
      return error(400, {
        success: false,
        data: {},
        message: "User not found",
      });
    }

    const driverIdsToAdd: string[] = body.id;

    if (!Array.isArray(driverIdsToAdd) || driverIdsToAdd.length === 0) {
      return error(400, {
        success: false,
        data: {},
        message: "No driver IDs provided",
      });
    }

    await usersModel.updateOne(
      { _id: params.id },
      {
        $addToSet: {
          blockDrivers: { $each: driverIdsToAdd },
        },
      }
    );

    await activityLogsModel.create({
      title: "Drivers Blocked",
      description: `Blocked ${driverIdsToAdd.length} driver(s) by admin`,
      user: params.id,
    });

    return {
      success: true,
      message: "Drivers successfully blocked",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, {
      success: false,
      data: {},
      message: "Something went wrong",
    });
  }
};
export const getDriversCsv = async ({ error, body }: any) => {
  if (!body.selectedField) {
    return error(400, {
      success: false,
      data: {},
      message: "Please provide selectedField",
    });
  }
  try {
    const user = await usersModel.find(body.filter).select(body.selectedField);
    const { fileUrl } = await convertJson(user, body.selectedField);
    return { success: true, fileUrl, message: "Drivers successfully fetched" };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};
