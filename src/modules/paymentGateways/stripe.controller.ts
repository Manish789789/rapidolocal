import usersModel from "@/modules/users/models/users.model";
import { logger } from "@/utils/logger";
import Stripe from "stripe";
import paymentMethodsModel from "../users/models/paymentMethods.model";
import rideBookingsModel, {
  bookingStatus,
} from "../ride-bookings/models/rideBookings.model";
import driversModel from "../drivers/models/drivers.model";
import driversWalletTransactionModel from "../drivers/models/driversWalletTransaction.model";
import driversWithdrawalModel from "../drivers/models/driversWithdrawal.model";
import { sendToDriverPushNotification } from "../drivers/controllers/admin/pushnotification.controller";
import { afterPlaceBooking } from "../ride-bookings/controllers/user-app/rideBookings.controller";
import { updateBookingInRedis } from "@/utils/redisHelper";
import { createStripeCustomAccount } from "./CreateStripeAccount";
import mongoose from "mongoose";
import { jobSendByRedis } from "@/utils/constant";
import moment from "moment";
import { generateRandomNumbers } from "@/utils";
import userWalletTransactionsModel from "../users/models/userWalletTransactions.model";
import activityLogsModel from "../activityLogs/models/activityLogs.model";

const isTestMode = process.env.isTestMode === "true" ? true : false;
const stripe = new Stripe(
  isTestMode
    ? process.env.STRIPE_TEST_SECRET_KEY || ""
    : process.env.STRIPE_SECRET_KEY || ""
);

export const updateEmailOnStripe = async (UserDetails: any, newEmail: any) => {
  try {
    let customerId = "";
    if (isTestMode) {
      customerId = UserDetails?.extraFields?.testStripeCustomerId;
    } else {
      customerId = UserDetails?.extraFields?.stripeCustomerId;
    }

    if (customerId && newEmail) {
      const customer = await stripe.customers.update(customerId, {
        email: newEmail,
      });
      return customer;
    } else if (!customerId && newEmail) {
      let { stripeCustomerId, testStripeCustomerId } =
        UserDetails?.extraFields || {};
      const customer = await stripe.customers.create({
        email: newEmail,
        name: UserDetails.fullName,
      });
      await usersModel.updateOne(
        { _id: UserDetails._id },
        {
          extraFields: {
            ...(UserDetails?.extraFields || {}),
            testStripeCustomerId: isTestMode
              ? customer.id
              : testStripeCustomerId,
            stripeCustomerId: !isTestMode ? customer.id : stripeCustomerId,
          },
        }
      );
      return customer;
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const handleUserAllEmailUpdate = async () => {
  try {
    let userList = await usersModel.find();
    for (const element of userList) {
      await updateEmailOnStripe(element, element.email);
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const attachPaymentMethod = async ({ request, body }: any) => {
  let { stripeCustomerId, testStripeCustomerId } =
    request?.user?.extraFields || {};
  let customerId = isTestMode ? testStripeCustomerId : stripeCustomerId;
  let paymentMethod: any = {};
  try {
    if (typeof customerId == "undefined" || customerId?.length == 0) {
      const customer = await stripe.customers.create({
        email: request?.user?.email,
        name: request?.user?.fullName,
      });

      await usersModel.updateOne(
        { _id: request?.user?._id },
        {
          extraFields: {
            ...(request?.user?.extraFields || {}),
            testStripeCustomerId: isTestMode
              ? customer.id
              : testStripeCustomerId,
            stripeCustomerId: !isTestMode ? customer.id : stripeCustomerId,
          },
        }
      );
      customerId = customer.id;
    }

    try {
      paymentMethod = await stripe.paymentMethods.attach(
        body.paymentMethod.methodId,
        {
          customer: customerId,
        }
      );
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });
      if (
        e.message ==
        "The payment method you provided has already been attached to a customer."
      ) {
        await stripe.paymentMethods.detach(body.paymentMethod.methodId);
        paymentMethod = await stripe.paymentMethods.attach(
          body.paymentMethod.methodId,
          {
            customer: customerId,
          }
        );
      }
    }

    return paymentMethod;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const createPaymentintent = async (
  req: any,
  amount: any,
  capture_method: any = "automatic_async",
  paymentMethodId: any,
  type = "WalletAdd",
  orderId = "0"
) => {
  try {
    let { stripeCustomerId, testStripeCustomerId } =
      req.user?.extraFields || {};
    let customerId = isTestMode ? testStripeCustomerId : stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.fullName,
      });
      await usersModel.updateOne(
        { _id: req.user._id },
        {
          extraFields: {
            ...(req.user?.extraFields || {}),
            testStripeCustomerId: isTestMode
              ? customer.id
              : testStripeCustomerId,
            stripeCustomerId: !isTestMode ? customer.id : stripeCustomerId,
          },
        }
      );
      customerId = customer.id;
    }

    let paymentIntent: any = {};
    try {
      let intentData: any = {
        amount: amount,
        currency: "cad",
        payment_method_types: ["card"],
        customer: customerId,
        capture_method,
        metadata: {
          user: JSON.stringify({
            _id: String(req.user._id),
          }),
          type: type,
          orderId: String(orderId),
        },
        // off_session: true,
        // confirm: true
      };

      if (paymentMethodId != "applePay") {
        intentData.payment_method = paymentMethodId;
      }
      paymentIntent = await stripe.paymentIntents.create(intentData);
      return paymentIntent;
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });
      return false;
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const autoDeductExtraChargesFromCustomer = async (
  booking: any,
  otherChargesSum: any
) => {
  try {
    let userDetails: any = await usersModel
      .findOne({ _id: booking.customer })
      .lean();

    let { stripeCustomerId, testStripeCustomerId } =
      userDetails?.extraFields || {};
    let customerId = isTestMode ? testStripeCustomerId : stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userDetails.email,
        name: userDetails.fullName,
      });
      await usersModel.updateOne(
        { _id: userDetails._id },
        {
          extraFields: {
            ...(userDetails?.extraFields || {}),
            testStripeCustomerId: isTestMode
              ? customer.id
              : testStripeCustomerId,
            stripeCustomerId: !isTestMode ? customer.id : stripeCustomerId,
          },
        }
      );
      customerId = customer.id;
    }

    let paymentIntent: any = {};
    try {
      let intentData: any = {
        amount: Number.parseInt(String(otherChargesSum)),
        currency: "cad",
        payment_method_types: ["card"],
        customer: customerId,
        capture_method: "automatic_async",
        metadata: {
          user: JSON.stringify({
            _id: String(userDetails._id),
          }),
          type: "Other Charges Deduction",
          orderId: String(booking._id),
        },
        off_session: true,
        confirm: true,
      };
      intentData.payment_method = booking.paymentMethodId;
      paymentIntent = await stripe.paymentIntents.create(intentData);
      return paymentIntent;
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });
      return false;
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const capturePaymentIntent = async (
  paymentIntentId: string,
  amountToCapture = 0
) => {
  try {
    if (amountToCapture) {
      const captureResult = await stripe.paymentIntents.capture(
        paymentIntentId,
        {
          amount_to_capture: Number.parseInt(String(amountToCapture)),
        }
      );
      return captureResult;
    } else {
      const captureResult = await stripe.paymentIntents.capture(
        paymentIntentId
      );
      return captureResult;
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const cancelledPayment = async (paymentIntent: string = "") => {
  if (!paymentIntent) {
    return false;
  }
  try {
    return await stripe.paymentIntents.cancel(paymentIntent);
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const createPayoutAccount = async (email: string = "") => {
  try {
    if (email.length == 0) {
      return false;
    }
    const account = await stripe.accounts.create({
      country: "CA",
      email,
      controller: {
        fees: {
          payer: "application",
        },
        losses: {
          payments: "application",
        },
        stripe_dashboard: {
          type: "express",
        },
      },
    });
    if (account) {
      const accountLink = await createAccountLink(account.id);
      return { account, accountLink };
    }
    return account;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const createAccountLink = async (accountId: string = "") => {
  try {
    if (accountId.length == 0) {
      return false;
    }
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: "https://rapidoride.com",
      return_url: "https://rapidoride.com/return",
      type: "account_onboarding",
      collection_options: {
        fields: "eventually_due",
      },
    });
    return accountLink;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const makeTransferMoney = async (singleDriverPaymentDetails: any) => {
  try {
    let transferMoney = Math.round(
      parseInt(Number(singleDriverPaymentDetails.wallet).toFixed(2))
    );

    const transfer = await stripe.transfers.create({
      amount: transferMoney * 100,
      currency: "cad",
      destination: singleDriverPaymentDetails.bankDetails.stripeAccountID,
      metadata: {
        driver: JSON.stringify({
          _id: String(singleDriverPaymentDetails?._id),
        }),
        stripeId: JSON.stringify({
          _id: String(singleDriverPaymentDetails.bankDetails.stripeAccountID),
        }),
        type: "transferMoney",
      },
    });
    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const TransferMoneyByStripe = async (
  singleDriverPaymentDetails: any
) => {
  try {
    let transferMoney = Math.round(
      parseInt(Number(singleDriverPaymentDetails.wallet).toFixed(2))
    );
    if (
      !singleDriverPaymentDetails?.paymentDetails ||
      !singleDriverPaymentDetails?.paymentDetails?.stripeAccountID
    ) {
      const res = await createStripeCustomAccount(singleDriverPaymentDetails);
    }
    const transfer = await stripe.transfers.create({
      amount: transferMoney * 100,
      currency: "cad",
      destination: singleDriverPaymentDetails.paymentDetails.stripeAccountID,
      metadata: {
        driver: JSON.stringify({
          _id: String(singleDriverPaymentDetails?._id),
        }),
        stripeId: JSON.stringify({
          _id: String(
            singleDriverPaymentDetails.paymentDetails.stripeAccountID
          ),
        }),
        type: "transferMoney",
      },
    });
    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const handlePayoutreversed = async () => {
  try {
    let payoutIds = ["po_id"];
    for (const element of payoutIds) {
      let returnObject = await stripe.payouts.reverse(element);
    }
    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const payoutMoney = async (
  payoutMoney: any,
  uniqueId: any,
  driverId: any,
  stripeId: any
) => {
  try {
    const payout = await stripe.payouts.create(
      {
        amount: payoutMoney,
        currency: "cad",
        metadata: {
          uniqueId: JSON.stringify({
            _id: String(uniqueId),
          }),
          driver: JSON.stringify({
            _id: String(driverId),
          }),
          stripeId: JSON.stringify({
            _id: String(stripeId),
          }),
          type: "payoutMoney",
        },
      },
      {
        stripeAccount: stripeId,
      }
    );
    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const deleteConnectedAccount = async () => {
  try {
    let findAccountId = "acct_1QoCOjP5Fbs6PudP";
    let singleDriverPaymentDetails: any = await driversModel
      .findOne({
        "paymentDetails.stripeAccountID": findAccountId,
      })
      .lean();

    if (singleDriverPaymentDetails?.paymentDetails?.stripeAccountID) {
      const deletedAccount = await stripe.accounts.del(
        singleDriverPaymentDetails?.paymentDetails?.stripeAccountID
      );
      await driversModel.updateOne(
        { "paymentDetails.stripeAccountID": findAccountId },
        {
          "paymentDetails.stripeAccountID": "",
          "paymentDetails.accountLink": "",
          "paymentDetails.status": "",
        }
      );
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const getPaymentIntentRetrievalResult = async (paymentIntentId: any) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const makeTransferMoneyFailed = async (
  singleDriverPaymentDetails: any,
  transferMoney: any
) => {
  try {
    const transfer = await stripe.transfers.create({
      amount: transferMoney * 100,
      currency: "cad",
      destination: singleDriverPaymentDetails.paymentDetails.stripeAccountID,
      metadata: {
        driver: JSON.stringify({
          _id: String(singleDriverPaymentDetails?._id),
        }),
        stripeId: JSON.stringify({
          _id: String(
            singleDriverPaymentDetails.paymentDetails.stripeAccountID
          ),
        }),
        type: "transferMoney",
      },
    });
    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const autoDeductMoneyFromAccount = async (
  userId: any,
  otherChargesSum: any
) => {
  try {
    let userDetails: any = await usersModel.findOne({ _id: userId }).lean();
    let { stripeCustomerId, testStripeCustomerId } =
      userDetails?.extraFields || {};
    let customerId = isTestMode ? testStripeCustomerId : stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userDetails.email,
        name: userDetails.fullName,
      });
      await usersModel.updateOne(
        { _id: userDetails._id },
        {
          extraFields: {
            ...(userDetails?.extraFields || {}),
            testStripeCustomerId: isTestMode
              ? customer.id
              : testStripeCustomerId,
            stripeCustomerId: !isTestMode ? customer.id : stripeCustomerId,
          },
        }
      );
      customerId = customer.id;
    }

    let defaultPayment = await paymentMethodsModel
      .findOne({ user: userId })
      .lean();

    let lastCabBookingCompleted: any = await rideBookingsModel
      .findOne({
        customer: userId,
        paymentStatus: true,
        tripStatus: bookingStatus.completed,
      })
      .sort({ createdAt: -1 })
      .lean();

    let paymentMethodId = "";
    if (defaultPayment?.methodId) {
      paymentMethodId = defaultPayment.methodId;
    } else {
      paymentMethodId = lastCabBookingCompleted.paymentMethodId;
    }

    if (paymentMethodId) {
      let paymentIntent: any = {};
      try {
        let intentData: any = {
          amount: Number.parseInt(String(otherChargesSum * 100)),
          currency: "cad",
          payment_method_types: ["card"],
          customer: customerId,
          capture_method: "automatic_async",
          metadata: {
            user: JSON.stringify({
              _id: String(userDetails._id),
            }),
            type: "Other Charges Deduction",
            orderId: "",
          },
          off_session: true,
          confirm: true,
        };
        intentData.payment_method = paymentMethodId;

        paymentIntent = await stripe.paymentIntents.create(intentData);
        return paymentIntent;
      } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return false;
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const transferList = async (driver: any) => {
  try {
    if (driver.paymentDetails.stripeAccountID) {
      let totalAmount = 0;
      const payouts = await stripe.transfers.list({
        destination: driver.paymentDetails.stripeAccountID,
        created: {
          gte: Math.floor(new Date("2024-01-01").getTime() / 1000),
          lte: Math.floor(new Date("2024-12-31").getTime() / 1000),
        },
        limit: 100,
      });
      totalAmount += payouts.data.reduce(
        (sum: any, payout: any) => sum + payout.amount,
        0
      );
      return totalAmount / 100;
    } else {
      return 0;
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return 0;
  }
};

export const stripeWebhook = async ({ request, body }: any) => {
  try {
    const event = body;
    switch (event.type) {
      case "account.updated":
        if (
          event.data.object &&
          event.data.object?.id &&
          event.data.object?.object == "account"
        ) {
          let driver = await driversModel.findOneAndUpdate(
            { "paymentDetails.stripeAccountID": event.data.object?.id },
            {
              "paymentDetails.status": event.data.object?.payouts_enabled
                ? "approved"
                : "created",
            }
          );
          if (event.data.object?.payouts_enabled) {
            sendToDriverPushNotification(String(driver?._id), {
              notification: {
                title: `Congratulations! Your payment details have been successfully approved.`,
                body: "Your payment information has been reviewed and verified. You can now enjoy seamless transactions within the app.",
              },
              data: {
                notificationType: "paymentDetails",
              },
            });
          } else {
            sendToDriverPushNotification(String(driver?._id), {
              notification: {
                title: `Your payment details are currently under review.`,
                body: "Please check your documents and resubmit them for approval.",
              },
              data: {
                notificationType: "paymentDetails",
              },
            });
          }
        }

        break;

      case "payment_intent.amount_capturable_updated":
        const paymentIntentAmountCapturableUpdated = event.data.object;
        break;

      case "charge.succeeded":
        const chargeSucceeded = event.data.object;
        let paymentSuccessMetaData = {
          user: JSON.parse(chargeSucceeded.metadata.user),
          type: chargeSucceeded.metadata.type,
          orderId: chargeSucceeded.metadata.orderId,
        };
        if (paymentSuccessMetaData.type === "WalletAdd") {
          await usersModel.updateOne(
            { _id: paymentSuccessMetaData.user._id },
            {
              $inc: { wallet: chargeSucceeded.amount / 100 },
            }
          );
          await userWalletTransactionsModel.create({
            amount: chargeSucceeded.amount / 100,
            description: "Added money in wallet by user",
            trxType: "Credit",
            trxId: `WLT${generateRandomNumbers(6)}`,
            user: paymentSuccessMetaData.user._id,
          });
          await activityLogsModel.create({
            title: "Added money in wallet by user",
            description: "Pay by Stripe",
            user: paymentSuccessMetaData.user._id,
          });
        } else if (paymentSuccessMetaData.type === "tip") {
          let orderDetails: any = await rideBookingsModel
            .findOne({ _id: paymentSuccessMetaData.orderId })
            .populate("customer")
            .lean();
          await rideBookingsModel.updateOne(
            { _id: paymentSuccessMetaData.orderId },
            {
              tip: chargeSucceeded.amount / 100,
              "finalBilling.driverEarning.tips": chargeSucceeded.amount / 100,
              "finalBilling.userBilling.tip": chargeSucceeded.amount / 100,
              $inc: {
                "finalBilling.userBilling.totalAmount":
                  chargeSucceeded.amount / 100,
                "finalBilling.driverEarning.grandTotal":
                  chargeSucceeded.amount / 100,
              },
              $push: {
                "finalBilling.pricing": {
                  name: "Tip",
                  price: chargeSucceeded.amount / 100,
                },
              },
              tipStatus: "Success",
              forceUpdateInDB: true,
            }
          );

          await driversModel.updateOne(
            { _id: orderDetails.driver },
            {
              $inc: { wallet: chargeSucceeded.amount / 100 },
            }
          );
          sendToDriverPushNotification(String(orderDetails.driver), {
            notification: {
              title: `You received tip $${chargeSucceeded.amount / 100}`,
              body: "",
            },
            data: {
              notificationType: "tipRecived",
              bookingId: paymentSuccessMetaData.orderId,
            },
          });

          await driversWalletTransactionModel.create({
            description: "tip received",
            amount: chargeSucceeded.amount / 100,
            trxType: "Credit",
            driver: orderDetails?.driver,
            bookingId: orderDetails?._id,
          });
        } else if (paymentSuccessMetaData.type === "Other Charges Deduction") {
        } else {
          await rideBookingsModel.findByIdAndUpdate(
            paymentSuccessMetaData.orderId,
            {
              paymentStatus: true,
              paymentStep: "succeeded",
              forceUpdateInDB: true,
            }
          );
          let orderDetails = await rideBookingsModel
            .findOne({ _id: paymentSuccessMetaData.orderId })
            .populate("customer")
            .lean();
          await afterPlaceBooking(orderDetails);
        }
        break;

      case "payment_intent.canceled":
        const paymentIntentCanceled = event.data.object;
        break;

      case "payment_intent.partially_funded":
        const paymentIntentPartiallyFunded = event.data.object;
        break;

      case "payment_intent.payment_failed":
        const paymentIntentPaymentFailed = event.data.object;
        let paymentFailedMetaData = {
          user: JSON.parse(paymentIntentPaymentFailed.metadata.user),
          type: paymentIntentPaymentFailed.metadata.type,
          orderId: paymentIntentPaymentFailed.metadata.orderId,
        };
        if (paymentFailedMetaData.type === "WalletAdd") {
        } else if (paymentFailedMetaData.type === "tip") {
          await rideBookingsModel.updateOne(
            { _id: paymentFailedMetaData.orderId },
            {
              tipStatus: "Failed",
            }
          );
        } else if (paymentFailedMetaData.type === "Other Charges Deduction") {
        } else {
          if (jobSendByRedis) {
            await updateBookingInRedis(paymentFailedMetaData.orderId, {
              paymentStatus: false,
              tripStatus: bookingStatus.canceled,
              paymentStep: "failed",
              cancelledAt: new Date(),
            });
          } else {
            await rideBookingsModel.findByIdAndUpdate(
              paymentFailedMetaData.orderId,
              {
                paymentStatus: false,
                tripStatus: bookingStatus.canceled,
                paymentStep: "failed",
                cancelledAt: new Date(),
              }
            );
          }
        }
        break;

      case "payment_intent.processing":
        const paymentIntentProcessing = event.data.object;
        break;

      case "payment_intent.requires_action":
        const paymentIntentRequiresAction = event.data.object;
        break;

      case "payment_intent.succeeded":
        const paymentIntentSucceeded = event.data.object;
        let paymentIntentSucceededMetaData = {
          user: JSON.parse(paymentIntentSucceeded.metadata.user),
          type: paymentIntentSucceeded.metadata.type,
          orderId: paymentIntentSucceeded.metadata.orderId,
        };
        if (paymentIntentSucceededMetaData.type === "WalletAdd") {
        } else if (
          paymentIntentSucceededMetaData.type === "Other Charges Deduction"
        ) {
        } else {
          await rideBookingsModel.findByIdAndUpdate(
            paymentIntentSucceededMetaData.orderId,
            {
              paymentStatus: true,
              paymentStep: "succeeded",
              forceUpdateInDB: true,
            }
          );
        }
        break;

      case "transfer.created":
        const transferCreated = event.data.object;
        let transferCreateMetaData = {
          driver: JSON.parse(transferCreated.metadata.driver),
          stripeId: JSON.parse(transferCreated.metadata.stripeId),
          type: transferCreated.metadata.type,
        };
        if (transferCreateMetaData.type === "transferMoney") {
          // await driversWithdrawalModel.create({
          //   driver: transferCreateMetaData.driver._id,
          //   amount: transferCreated.amount / 100,
          //   txnId: transferCreated.id,
          //   txnTime: new Date(),
          //   status: 2,
          // });
          // await driversModel.findOneAndUpdate(
          //   { _id: transferCreateMetaData.driver._id },
          //   {
          //     $inc: {
          //       wallet: -(transferCreated.amount / 100),
          //       lifeTimeEarning: transferCreated.amount / 100,
          //     },
          //   }
          // );
        }
        break;
      default:
        break;
    }
    return { success: true, message: "Shortcuts fetched successfully" };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const TransferMoneyToDrivers = async (body: any, error: any) => {
  const results = [];
  const { driverIds = [], amount } = body;

  const verifiedDrivers = await driversModel
    .find({
      paymentDetails: { $exists: true },
      _id: { $in: driverIds.map((id: any) => new mongoose.Types.ObjectId(id)) },
    })
    .lean();

  if (verifiedDrivers.length === 0) {
    return error(400, {
      success: false,
      message: "Driver is not eligible for payout.",
    });
  }

  for (const driver of verifiedDrivers) {
    try {
      const transferMoney = Math.round(parseFloat(Number(amount).toFixed(2)));

      const transfer = await stripe.transfers.create({
        amount: transferMoney * 100,
        currency: "cad",
        destination: driver?.paymentDetails?.stripeAccountID,
        metadata: {
          driver: JSON.stringify({ _id: String(driver._id) }),
          stripeId: JSON.stringify({
            _id: driver?.paymentDetails?.stripeAccountID,
          }),
          type: "transferMoney",
        },
      });

      results.push({
        driverId: driver._id,
        status: "SUCCESS",
        txnId: transfer.id,
      });
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });

      results.push({
        driverId: driver._id,
        status: "FAILED",
        message: e.message,
      });
    }
  }

  const total = results.length;
  const failed = results.filter((r) => r.status !== "SUCCESS").length;
  const success = total - failed;

  return {
    statusCode: failed === total ? 500 : 200,
    body: JSON.stringify({
      success: failed === 0,
      message:
        failed === 0
          ? "All payouts completed successfully."
          : failed === total
            ? "All payouts failed."
            : `${success} payouts succeeded, ${failed} failed.`,
      results,
    }),
  };
};

export const refundAmountPaymentID = async (
  paymentId: string,
  amount: number
) => {
  try {
    if (!paymentId) {
      return false;
    }
    const refund = await stripe.refunds.create({
      payment_intent: paymentId,
      amount: Math.round(amount * 100),
    });
    return refund;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const stripAccountDelete = async () => {
  try {
    const driversList = await driversModel.find(
      {
        "paymentDetails.stripeAccountID": { $exists: true, $ne: "" },
      },
      { paymentDetails: 1 }
    );
    for (const singleDriversList of driversList) {
      if (singleDriversList?.paymentDetails?.stripeAccountID) {
        try {
          const deletedAccount = await stripe.accounts.del(
            singleDriversList?.paymentDetails?.stripeAccountID
          )
          await driversModel.updateOne(
            { _id: singleDriversList._id },
            {
              "paymentDetails.stripeAccountID": "",
              "paymentDetails.accountLink": "",
              "paymentDetails.status": ""
            }
          )
        } catch (err) {
          logger.error({ error: err, msg: `Failed for driver ${singleDriversList._id}` });
        }
      }
    }

    let stripeAccounts = await stripe.accounts.list({
      limit: 50,
    });
    for (const singleStripeAccounts of stripeAccounts.data) {
      if (singleStripeAccounts.id) {
        console.log(singleStripeAccounts.id)
        try {
          const deletedAccount = await stripe.accounts.del(
            singleStripeAccounts.id
          )
        } catch (error) {
        }
      }
    }
    console.log("done for all")
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
}
