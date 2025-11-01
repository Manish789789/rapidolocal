import { WebhooksHelper } from "square";
import { logger } from "@/utils/logger";
import { afterPlaceBooking } from "../ride-bookings/controllers/user-app/rideBookings.controller";
import rideBookingsModel, {
  bookingStatus,
} from "../ride-bookings/models/rideBookings.model";
import driversWalletTransactionModel from "../drivers/models/driversWalletTransaction.model";
import usersModel from "../users/models/users.model";
import { sendToDriverPushNotification } from "../drivers/controllers/admin/pushnotification.controller";
import driversModel from "../drivers/models/drivers.model";
import { SquareClient, SquareEnvironment } from "square";
import { updateBookingInRedis } from "@/utils/redisHelper";
import paymentMethodsModel from "../users/models/paymentMethods.model";
import moment from "moment";
import { jobSendByRedis } from "@/utils/constant";
import { square } from "@turf/turf";
import userWalletTransactionsModel from "../users/models/userWalletTransactions.model";
import { generateRandomNumbers } from "@/utils";
import activityLogsModel from "../activityLogs/models/activityLogs.model";
const isTestMode = process.env.isTestMode === "true" ? true : false;

const client: any = new SquareClient({
  environment: isTestMode
    ? SquareEnvironment.Sandbox
    : SquareEnvironment.Production,
  token: isTestMode
    ? process.env.SQUARE_ACCESS_TOKEN_TEST
    : process.env.SQUARE_ACCESS_TOKEN,
});

export const squareWebhook = async ({ request, body, error }: any) => {
  try {
    const NOTIFICATION_URL = isTestMode
      ? process.env.NOTIFICATION_URL_TEST
      : process.env.NOTIFICATION_URL;
    const SIGNATURE_KEY = isTestMode
      ? process.env.SQUARE_SIGNATURE_KEY_TEST
      : process.env.SQUARE_SIGNATURE_KEY;
    async function isFromSquare(signature: any, bodyy: any) {
      return await WebhooksHelper.verifySignature({
        requestBody: JSON.stringify(bodyy),
        signatureHeader: signature,
        signatureKey: SIGNATURE_KEY || "",
        notificationUrl: NOTIFICATION_URL || "",
      });
    }
    if (
      await isFromSquare(
        JSON.parse(JSON.stringify(request.headers))[
        "x-square-hmacsha256-signature"
        ],
        body
      )
    ) {
      const event = body;
      switch (event.type) {
        case "payment.created":
          const chargeSucceededCreated = event.data;
          const parsedChargeSucceededCreated = JSON.parse(
            chargeSucceededCreated.object.payment.note
          );
          const amountChargeCreated =
            event.data.object.payment.amount_money.amount;
          let paymentSuccessMetaDataCreated = {
            user: parsedChargeSucceededCreated.user,
            type: parsedChargeSucceededCreated.type,
            orderId: parsedChargeSucceededCreated.orderId,
          };
          if (["APPROVED"].includes(event.data.object.payment.status)) {
            if (paymentSuccessMetaDataCreated.type === "WalletAdd") {
              await usersModel.updateOne(
                { _id: paymentSuccessMetaDataCreated.user._id },
                {
                  $inc: { wallet: amountChargeCreated / 100 },
                }
              );
              await userWalletTransactionsModel.create({
                amount: amountChargeCreated / 100,
                description: "Added money in wallet by user",
                trxType: "Credit",
                trxId: `WLT${generateRandomNumbers(6)}`,
                user: paymentSuccessMetaDataCreated.user._id,
              });
              await activityLogsModel.create({
                title: "Added money in wallet by user",
                description: "Pay by Square",
                user: paymentSuccessMetaDataCreated.user._id,
              });
            } else if (paymentSuccessMetaDataCreated.type === "tip") {
              let orderDetails: any = await rideBookingsModel
                .findOne({ _id: paymentSuccessMetaDataCreated.orderId })
                .populate("customer")
                .lean();
              if (
                orderDetails.tip <= 0 &&
                orderDetails.tipStatus !== "Success"
              ) {
                await rideBookingsModel.updateOne(
                  { _id: paymentSuccessMetaDataCreated.orderId },
                  {
                    tip: amountChargeCreated / 100,
                    "finalBilling.driverEarning.tips":
                      amountChargeCreated / 100,
                    "finalBilling.userBilling.tip": amountChargeCreated / 100,
                    $inc: {
                      "finalBilling.userBilling.totalAmount":
                        amountChargeCreated / 100,
                      "finalBilling.driverEarning.grandTotal":
                        amountChargeCreated / 100,
                    },
                    $push: {
                      "finalBilling.pricing": {
                        name: "Tip",
                        price: amountChargeCreated / 100,
                      },
                    },
                    tipStatus: "Success",
                    forceUpdateInDB: true,
                  }
                );

                await driversModel.updateOne(
                  { _id: orderDetails?.driver },
                  {
                    $inc: { wallet: amountChargeCreated / 100 },
                  }
                );

                sendToDriverPushNotification(orderDetails?.driver, {
                  notification: {
                    title: `You received tip $${amountChargeCreated / 100}`,
                    body: "",
                  },
                  data: {
                    notificationType: "tipRecived",
                    bookingId: paymentSuccessMetaDataCreated.orderId,
                  },
                });

                await driversWalletTransactionModel.create({
                  description: "tip received",
                  amount: amountChargeCreated / 100,
                  trxType: "Credit",
                  driver: orderDetails.driver,
                  bookingId: orderDetails?._id,
                });
              }
            } else if (
              paymentSuccessMetaDataCreated.type === "Other Charges Deduction"
            ) {
            } else {
              await rideBookingsModel.findByIdAndUpdate(
                paymentSuccessMetaDataCreated.orderId,
                {
                  paymentStatus: true,
                  paymentStep: "succeeded",
                  forceUpdateInDB: true,
                }
              );
              let orderDetails = await rideBookingsModel
                .findOne({ _id: paymentSuccessMetaDataCreated.orderId })
                .populate("customer")
                .lean();
              await afterPlaceBooking(orderDetails);
            }
          }
          break;

        case "payment.updated":
          const chargeSucceeded = event.data;
          const amountCharge = event.data.object.payment.amount_money.amount;
          const parsedChargeSucceeded = JSON.parse(
            chargeSucceeded.object.payment.note
          );
          let paymentSuccessMetaData = {
            user: parsedChargeSucceeded.user,
            type: parsedChargeSucceeded.type,
            orderId: parsedChargeSucceeded.orderId,
          };
          // console.log(event.data.object.payment.version, paymentSuccessMetaData.type, event.data.object.payment.status, paymentSuccessMetaData.type)
          if (event.data.object.payment.version === 2) {
            if (["COMPLETED"].includes(event.data.object.payment.status)) {
              if (paymentSuccessMetaData.type === "WalletAdd") {
                // await usersModel.updateOne(
                //   { _id: paymentSuccessMetaData.user._id },
                //   {
                //     $inc: { wallet: amountCharge / 100 },
                //   }
                // );
              } else if (paymentSuccessMetaData.type === "tip") {
                // let orderDetails: any = await rideBookingsModel
                //   .findOne({ _id: paymentSuccessMetaData.orderId })
                //   .populate("customer")
                //   .lean();
                // if (orderDetails.tip <= 0 && orderDetails.tipStatus !== "Success") {
                //   await rideBookingsModel.updateOne(
                //     { _id: paymentSuccessMetaData.orderId },
                //     {
                //       tip: amountCharge / 100,
                //       "finalBilling.driverEarning.tips": amountCharge / 100,
                //       "finalBilling.userBilling.tip": amountCharge / 100,
                //       $inc: {
                //         "finalBilling.userBilling.totalAmount":
                //           amountCharge / 100,
                //         "finalBilling.driverEarning.grandTotal":
                //           amountCharge / 100,
                //       },
                //       $push: {
                //         "finalBilling.pricing": {
                //           name: "Tip",
                //           price: amountCharge / 100,
                //         },
                //       },
                //       tipStatus: "Success",
                //       forceUpdateInDB: true
                //     }
                //   );
                //   await driversModel.updateOne(
                //     { _id: orderDetails.driver },
                //     {
                //       $inc: { wallet: amountCharge / 100 },
                //     }
                //   );
                //   sendToDriverPushNotification(String(orderDetails.driver), {
                //     notification: {
                //       title: `You received tip $${amountCharge / 100}`,
                //       body: "",
                //     },
                //     data: {
                //       notificationType: "tipRecived",
                //       bookingId: paymentSuccessMetaData.orderId,
                //     },
                //   });
                //   await driversWalletTransactionModel.create({
                //     description: "tip received",
                //     amount: amountCharge / 100,
                //     trxType: "Credit",
                //     driver: orderDetails.driver,
                //   });
                // }
              } else if (
                paymentSuccessMetaData.type === "Other Charges Deduction"
              ) {
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
            } else if (["FAILED"].includes(event.data.object.payment.status)) {
              if (paymentSuccessMetaData.type === "WalletAdd") {
              } else if (paymentSuccessMetaData.type === "tip") {
                await rideBookingsModel.updateOne(
                  { _id: paymentSuccessMetaData.orderId },
                  {
                    tipStatus: "Failed",
                  }
                );
              } else if (
                paymentSuccessMetaData.type === "Other Charges Deduction"
              ) {
              } else {
                if (jobSendByRedis) {
                  await updateBookingInRedis(paymentSuccessMetaData.orderId, {
                    paymentStatus: false,
                    tripStatus: bookingStatus.canceled,
                    paymentStep: "failed",
                    cancelledAt: new Date(),
                  });
                } else {
                  await rideBookingsModel.findByIdAndUpdate(
                    paymentSuccessMetaData.orderId,
                    {
                      paymentStatus: false,
                      tripStatus: bookingStatus.canceled,
                      paymentStep: "failed",
                      cancelledAt: new Date(),
                    }
                  );
                }
              }
            } else if (
              ["APPROVED"].includes(event.data.object.payment.status)
            ) {
              if (paymentSuccessMetaData.type === "WalletAdd") {
              } else if (paymentSuccessMetaData.type === "tip") {
              } else if (
                paymentSuccessMetaData.type === "Other Charges Deduction"
              ) {
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
            }
          }
          break;

        case "payment.failed":
          break;

        case "payment.refunded":
          break;

        case "customer.created":
          break;

        case "order.created":
          break;

        case "order.updated":
          break;

        case "card.created":
          break;

        default:
          break;
      }
      return { success: true, message: "Shortcuts fetched successfully" };
    } else {
      return error(400, { success: false, message: "failed" });
    }
  } catch (e) {
    return error(400, { success: false, message: "failed" });
  }
};

export const attachSquarePaymentMethod = async ({ request, body }: any) => {
  try {
    let { squareCustomerId, testSquareCustomerId } =
      request.user?.extraFields || {};
    let customerId = isTestMode ? testSquareCustomerId : squareCustomerId;
    let paymentMethod: any = {};
    if (typeof customerId == "undefined" || customerId?.length == 0) {
      const customer = await client.customers.create({
        emailAddress: request.user.email,
        givenName: request.user.fullName,
      });
      await usersModel.updateOne(
        { _id: request?.user?._id },
        {
          extraFields: {
            ...(request.user?.extraFields || {}),
            testSquareCustomerId: isTestMode
              ? customer?.customer?.id
              : testSquareCustomerId,
            squareCustomerId: !isTestMode
              ? customer?.customer?.id
              : squareCustomerId,
          },
        }
      );
      customerId = customer?.customer?.id;
    }

    paymentMethod = await client.cards.create({
      idempotencyKey: Bun.randomUUIDv7(),
      sourceId: body.squareMethodId,
      card: {
        customerId: customerId,
      },
    });

    // try {
    //     paymentMethod = await client.cards.create({
    //         idempotencyKey: uuidv4(),
    //         sourceId: body.squareMethodId,
    //         verificationToken:req?.body?.verificationToken,
    //         card: {
    //             customerId: customerId,
    //         }
    //     });
    // } catch (e) {
    //     return body.squareMethodId
    // }

    const cardId = paymentMethod?.card?.id;
    if (!cardId) {
      logger.error({
        error: "Square card ID is missing from response.",
        msg: "Square card ID is missing from response.",
      });
      return false;
    }
    return cardId;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const createSquarePayment = async (
  request: any,
  amount: any,
  paymentMethodId: any,
  type = "WalletAdd",
  orderId = "0",
  autoComplete: Boolean = false,
  customerDetails: any = null,
  userId: any = null
) => {
  try {
    let customerId;
    if (!customerDetails) {
      let { squareCustomerId, testSquareCustomerId } =
        request.user?.extraFields || {};
      customerId = isTestMode ? testSquareCustomerId : squareCustomerId;
      if (!customerId) {
        const customer = await client.customers.create({
          emailAddress: request.user.email,
          givenName: request.user.fullName,
        });
        await usersModel.updateOne(
          { _id: request?.user?._id },
          {
            extraFields: {
              ...(request.user?.extraFields || {}),
              testSquareCustomerId: isTestMode
                ? customer?.customer?.id
                : testSquareCustomerId,
              squareCustomerId: !isTestMode
                ? customer?.customer?.id
                : squareCustomerId,
            },
          }
        );
        customerId = customer?.customer?.id;
      }
    } else {
      let { squareCustomerId, testSquareCustomerId } = customerDetails || {};
      customerId = isTestMode ? testSquareCustomerId : squareCustomerId;
      if (!customerId) {
        return false;
      }
    }
    let paymentIntent: any = {};
    let intentData: any = {
      sourceId: paymentMethodId,
      idempotencyKey: Bun.randomUUIDv7(),
      amountMoney: {
        amount: BigInt(amount),
        currency: "CAD",
      },
      customerId: customerId,
      autocomplete: autoComplete,
      note: JSON.stringify({
        user: { _id: userId ? String(userId) : String(request?.user?._id) },
        type: type,
        orderId: String(orderId),
      }),
    };
    paymentIntent = await client.payments.create(intentData);
    if (
      ["COMPLETED", "APPROVED", "PENDING"].includes(
        paymentIntent.payment.status
      )
    ) {
      return paymentIntent;
    } else {
      return false;
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const squarePaymentList = async () => {
  try {
    const list = await client.payments.list();
    return list;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const squarePaymentStatus = async (paymentId: any) => {
  try {
    if (!paymentId) {
      logger.error({
        error: "Payment Status: No paymentId provided",
        msg: "Payment Status: No paymentId provided",
      });
      return false;
    }
    const getStatus = await client.payments.get({
      paymentId: paymentId,
    });
    return getStatus;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const squareCompletePayment = async (paymentId: any, amount?: any) => {
  try {
    if (!paymentId) {
      logger.error({
        error: "Payment completion failed: No paymentId provided",
        msg: "Payment completion failed: No paymentId provided",
      });
      return false;
    }
    if (!amount) {
      const complete = await client.payments.complete({
        paymentId: paymentId,
      });
    } else {
      const partialCapture = await client.payments.update({
        paymentId: paymentId,
        idempotencyKey: Bun.randomUUIDv7(),
        payment: {
          amountMoney: {
            amount: BigInt(amount),
            currency: "CAD",
          },
        },
      });
      const complete = await client.payments.complete({
        paymentId: paymentId,
      });
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const squareCancelPayment = async (paymentId: any) => {
  try {
    if (!paymentId) {
      logger.error({
        error: "'Payment cancellation failed: No paymentId provided'",
        msg: "Payment cancellation failed: No paymentId provided",
      });
      return false;
    }
    const cancel = await client.payments.cancel({
      paymentId: paymentId,
    });
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};
export const handleSquareRefund = async (paymentId: string, amount: number) => {
  try {
    if (!paymentId || !amount) {
      return { status: "error", message: "Missing paymentId or amount" };
    }

    // Validate amount is positive
    if (amount <= 0) {
      return { status: "error", message: "Amount must be greater than 0" };
    }
    const key = Bun.randomUUIDv7();
    const result = await client.refunds.refundPayment({
      idempotencyKey: key,
      amountMoney: {
        amount: amount * 100,
        currency: "CAD",
      },
      paymentId: paymentId,
      reason: "Waiting charges refunded",
    });

    return {
      status: "success",
      message: "Refund processed successfully",
      data: result,
    };
  } catch (error: any) {
    // console.log("Square Refund Error:", error);

    // Handle specific Square API errors
    let errorMessage = "Square API error";
    if (error.errors && error.errors.length > 0) {
      errorMessage = error.errors[0].detail || error.errors[0].code;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      status: "error",
      message: errorMessage,
      error,
    };
  }
};
export const autoDeductMoneyFromSquare = async (
  userId: string,
  amount: number
) => {
  try {
    const userDetails = await usersModel.findOne({ _id: userId }).lean();
    const { squareCustomerId, testSquareCustomerId } =
      userDetails?.extraFields || {};
    const isTest = process.env.NODE_ENV !== "production";

    let customerId = isTest ? testSquareCustomerId : squareCustomerId;

    // Create Square customer if not exists
    if (!customerId) {
      const { customer: customer } = await client.customers.create({
        emailAddress: userDetails?.email,
        givenName: userDetails?.fullName,
      });

      await usersModel.updateOne(
        { _id: userId },
        {
          $set: {
            "extraFields.squareCustomerId": isTest
              ? squareCustomerId
              : customer?.id,
            "extraFields.testSquareCustomerId": isTest
              ? customer?.id
              : testSquareCustomerId,
          },
        }
      );
      customerId = customer?.id;
    }
    const defaultPayment = await paymentMethodsModel
      .findOne({ user: userId })
      .lean();
    const lastCompletedBooking = await rideBookingsModel
      .findOne({
        customer: userId,
        paymentStatus: true,
        tripStatus: bookingStatus.completed,
      })
      .sort({ createdAt: -1 })
      .lean();

    let cardId = "";
    if (defaultPayment?.squareMethodId) {
      cardId = defaultPayment.squareMethodId;
    } else if (lastCompletedBooking?.paymentMethodId) {
      cardId = lastCompletedBooking.paymentMethodId;
    }

    if (!cardId) return false;

    const amountInCents = Math.round(amount * 100);
    const { payment: payment } = await client.payments.create({
      sourceId: cardId,
      idempotencyKey: Bun.randomUUIDv7(),
      amountMoney: {
        amount: BigInt(amountInCents),
        currency: "CAD",
      },
      customerId: customerId,
      autocomplete: true,
      note: JSON.stringify({
        user: { _id: userId },
        type: "WalletAdd",
        orderId: "0",
      }),
    });

    if (payment?.status === "COMPLETED") {
      return payment;
    } else {
      return false;
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};
// export const TransferMoneyToUser = async (userId: string, amount: number) => {
//   try {
//     const userDetails = await usersModel.findOne({ _id: userId }).lean();
//     const { squareCustomerId, testSquareCustomerId } =
//       userDetails?.extraFields || {};
//     const isTest = process.env.NODE_ENV !== "production";

//     let customerId = isTest ? testSquareCustomerId : squareCustomerId;

//     if (!customerId) {
//       const { customer: customer } = await client.customers.create({
//         emailAddress: userDetails?.email,
//         givenName: userDetails?.fullName,
//       });

//       await usersModel.updateOne(
//         { _id: userId },
//         {
//           $set: {
//             "extraFields.squareCustomerId": isTest
//               ? squareCustomerId
//               : customer?.id,
//             "extraFields.testSquareCustomerId": isTest
//               ? customer?.id
//               : testSquareCustomerId,
//           },
//         }
//       );
//       customerId = customer?.id;
//     }
//     const defaultPayment = await paymentMethodsModel
//       .findOne({ user: userId })
//       .lean();
//     const lastCompletedBooking = await rideBookingsModel
//       .findOne({
//         customer: userId,
//         paymentStatus: true,
//         tripStatus: bookingStatus.completed,
//       })
//       .sort({ createdAt: -1 })
//       .lean();

//     let cardId = "";
//     if (defaultPayment?.squareMethodId) {
//       cardId = defaultPayment.squareMethodId;
//     } else if (lastCompletedBooking?.paymentMethodId) {
//       cardId = lastCompletedBooking.paymentMethodId;
//     }

//     if (!cardId) return false;

//     const amountInCents = Math.round(amount * 100);
//     const { payment: payment } = await client.payments.create({
//       sourceId: cardId,
//       idempotencyKey: Bun.randomUUIDv7(),
//       amountMoney: {
//         amount: BigInt(amountInCents),
//         currency: "CAD",
//       },
//       customerId: customerId,
//       autocomplete: true,
//       note: JSON.stringify({
//         user: { _id: userId },
//         type: "WalletAdd",
//         orderId: "0",
//       }),
//     });
//     console.log(payment, "dfadfasdfasdf");
//     if (payment?.status === "COMPLETED") {
//       return payment;
//     } else {
//       return false;
//     }
//   } catch (e: any) {
//     logger.error({ error: e, msg: e.message });
//     return false;
//   }
// };
export const RefundMoneyToUserBySquare = async (
  userId: string,
  amount: number
) => {
  try {
    const previousPayment = await paymentMethodsModel
      .findOne(
        { user: userId },
        { squareMethodId: 1 },
        { sort: { createdAt: -1 } }
      )
      .lean();
    if (!previousPayment) {
      return { success: false, message: "No payment method found for user" };
    }
    const lastCompletedBooking = await rideBookingsModel
      .findOne({
        customer: userId,
        paymentStatus: true,
        tripStatus: bookingStatus.completed,
      })
      .sort({ createdAt: -1 })
      .lean();
    let paymentId = "";
    if (lastCompletedBooking?.paymentIntentId) {
      paymentId = lastCompletedBooking.paymentIntentId;
    } else {
      return { success: false, message: "No previous payment found for user" };
    }
    if (!paymentId) {
      return { success: false, message: "No previous payment found for user" };
    }
    const amountInCents = Math.round(amount * 100);
    const idempotencyKey = Bun.randomUUIDv7();
    const refundResponse = await client.refunds.refundPayment({
      idempotencyKey: idempotencyKey,
      amountMoney: {
        amount: BigInt(amountInCents),
        currency: "CAD",
      },
      paymentId: paymentId,
    });
    if (
      refundResponse?.refund?.status === "PENDING" ||
      refundResponse?.refund?.status === "COMPLETED"
    ) {
      return { success: true, message: "Refund successful" };
    } else {
      return { success: false, message: "Refund failed" };
    }
  } catch (error) {
    return { success: false, message: "Refund failed", error: error };
  }
};
