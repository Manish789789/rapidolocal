import fs from "fs";
import path from "path";
import { logger } from "@/utils/logger";
import driversModel from "../drivers/models/drivers.model";
import driversWithdrawalModel from "../drivers/models/driversWithdrawal.model";
import mongoose from "mongoose";
import CryptoJS from "crypto-js";

const RBC_CREDENTIALS: any = {
  client_id:
    process.env.isTestMode === "true"
      ? process.env.TEST_RBC_CLIENT_ID
      : process.env.LIVE_RBC_CLIENT_ID,
  client_secret:
    process.env.isTestMode === "true"
      ? process.env.TEST_RBC_CLIENT_SECRET
      : process.env.LIVE_RBC_CLIENT_SECRET,
  OTH_RBC:
    process.env.isTestMode === "true"
      ? "https://ssoa.sterbc.com/as/token.oauth2"
      : "https://ssoa.rbc.com/as/token.oauth2",
  ACC_VALID_RBC:
    process.env.isTestMode === "true"
      ? "https://apigw.istrbc.com/secure/bfs/external-api-simulator/v1/accounts/validation/match"
      : "https://apigw.rbc.com/secure/bfs/external-payments/v1/accounts/validation/match",
  ACC_VALID_RBC_AUTODEPOSIT:
    process.env.isTestMode === "true"
      ? "https://apigw.istrbc.com/secure/bfs/external-payments-simulator/v1/payments?validate=autodeposit"
      : "https://apigw.rbc.com/secure/bfs/external-payments/v1/payments?validate=autodeposit",
  TRANSFER_MONEY_API:
    process.env.isTestMode === "true"
      ? "https://apigw.istrbc.com/secure/bfs/external-api-simulator/v1/payments"
      : "https://apigw.rbc.com/secure/bfs/external-payments/v1/payments",
};

let cachedToken: string | null = null;
let tokenGeneratedAt: number | null = null;

export const getAccesstoken = async () => {
  try {
    const EXP = 2 * 60 * 60 * 1000;
    if (
      cachedToken &&
      tokenGeneratedAt &&
      Date.now() - tokenGeneratedAt < EXP
    ) {
      return cachedToken;
    }
    const formBody = new URLSearchParams();
    formBody.append("client_id", RBC_CREDENTIALS.client_id);
    formBody.append("client_secret", RBC_CREDENTIALS.client_secret);
    formBody.append("grant_type", "client_credentials");
    const response = await fetch(RBC_CREDENTIALS.OTH_RBC, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });
    const res = await response.json();
    cachedToken = res?.access_token;
    tokenGeneratedAt = Date.now();
    return cachedToken;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const validateDriverAccount = async (
  account_id: any,
  search_name: any
) => {
  try {
    let myToken = await getAccesstoken();
    if (!myToken) {
      return false;
    }
    const raw = JSON.stringify({
      account_id: `${account_id}`,
      search_name: `${search_name}`,
    });
    const response = await fetch(RBC_CREDENTIALS.ACC_VALID_RBC, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${myToken}`,
        "Content-Type": "application/json",
      },
      body: raw,
    });
    const res = await response.json();
    if (
      res.creditor_account_id_match === "MTCH" &&
      res.creditor_account_name_match === "MTCH"
    ) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
};

export const validateAutoDepositDriverAccount = async (account_id: any) => {
  try {
    // return true
    let myToken = await getAccesstoken();
    if (!myToken) {
      return false;
    }
    const raw = JSON.stringify({
      to_account: {
        id: `${account_id}`,
        id_type: "ACCOUNT_NUMBER",
      },
      payment_type: "INTERAC",
    });
    const response = await fetch(RBC_CREDENTIALS.ACC_VALID_RBC_AUTODEPOSIT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${myToken}`,
        "Content-Type": "application/json",
        "rbc-request-id": Bun.randomUUIDv7(),
      },
      body: raw,
    });
    const res = await response.json();
    if (res.status === "VALID") {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
};

export const makeTransferMoneyByRBC = async (
  singleDriverPaymentDetails: any,
  money: any
) => {
  try {
    let myToken = await getAccesstoken();
    if (!myToken) {
      return false;
    }
    let transferMoney = Number(money).toFixed(2);

    let account_id =
      decryptPassword(
        singleDriverPaymentDetails?.bankDetails?.institutionNumber
      ) +
      "-" +
      decryptPassword(singleDriverPaymentDetails?.bankDetails?.transitNumber) +
      "-" +
      decryptPassword(singleDriverPaymentDetails?.bankDetails?.accountNumber);

    const raw = JSON.stringify({
      amount: transferMoney,
      to_account: {
        id: `${account_id}`,
        id_type: "ACCOUNT_NUMBER",
      },
      from_account: {
        id: "Rapidoride",
        id_type: "ACCOUNT_IDENTIFIER",
      },
      payment_type: "INTERAC",
    });
    const response = await fetch(RBC_CREDENTIALS.TRANSFER_MONEY_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${myToken}`,
        "Content-Type": "application/json",
        "rbc-request-id": Bun.randomUUIDv7(),
      },
      body: raw,
    });
    const res = await response.json();

    if (
      res?.payment_id &&
      (res?.status === "PROCESSED" || res?.status === "PROCESSING")
    ) {
      return {
        payment_id: res?.payment_id,
        status: res?.status,
        confirmation_number: res?.key_values?.confirmation_number,
      };
    }
    return false;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

// export const doPayoutByRBC = async () => {
//   try {
//     let verifiedDrivers = await driversModel
//       .find({
//         "vehicleInfo.isApproved": true,
//         wallet: { $gte: 1 },
//         bankDetails: { $exists: true },
//       })
//       .lean();
//     for (let singleDriverPaymentDetails of verifiedDrivers) {
//       if (singleDriverPaymentDetails?.bankDetails) {
//         let res = await makeTransferMoneyByRBC(
//           singleDriverPaymentDetails,
//           singleDriverPaymentDetails.wallet
//         );
//         if (res) {
//           await driversWithdrawalModel.create({
//             driver: singleDriverPaymentDetails._id,
//             amount: singleDriverPaymentDetails.wallet,
//             txnId: res?.payment_id || "",
//             txnTime: new Date(),
//             confirmation_number: res?.confirmation_number || "",
//             status: res.status === "PROCESSING" ? 1 : 2,
//           });
//           await driversModel.findOneAndUpdate(
//             { _id: singleDriverPaymentDetails._id },
//             {
//               $inc: {
//                 wallet: -singleDriverPaymentDetails.wallet,
//                 lifeTimeEarning: singleDriverPaymentDetails.wallet,
//               },
//             }
//           );
//         }
//       }
//     }
//   } catch (e: any) {
//     logger.error({ error: e, msg: e.message });
//   }
// };

export const customePayoutByRBC = async (body: any, error: any) => {
  const { driverIds = [], amount, BankDetails } = body;

  if (
    !Array.isArray(driverIds) ||
    driverIds.length === 0 ||
    !amount ||
    !BankDetails
  ) {
    return error(400, {
      success: false,
      message: "DriverIds , Bank Details and amount are required.",
    });
  }

  try {
    const verifiedDrivers = await driversModel
      .find({
        "vehicleInfo.isApproved": true,
        bankDetails: { $exists: true },
        _id: {
          $in: driverIds.map((id: any) => new mongoose.Types.ObjectId(id)),
        },
      })
      .lean();

    if (verifiedDrivers.length === 0) {
      return error(400, {
        success: false,
        message: "Driver is not eligible for payout.",
      });
    }

    const results = [];
    for (const driver of verifiedDrivers) {
      try {
        const res = await makeTransferMoneyByRBC(driver, amount);
        if (res) {
          await driversWithdrawalModel.create({
            driver: driver._id,
            amount,
            txnTime: new Date(),
            txnId: res.payment_id || "",
            confirmation_number: res.confirmation_number || "",
            status: res.status === "PROCESSING" ? 1 : 2,
          });
          await driversModel.findOneAndUpdate(
            { _id: driver?._id },
            {
              $inc: {
                wallet: -amount,
                lifeTimeEarning: amount,
              },
            }
          );

          results.push({
            driver: driver._id,
            status: "SUCCESS",
            txnId: res.payment_id,
          });
        } else {
          results.push({
            driver: driver._id,
            status: "FAILED",
            message: "RBC transfer failed",
          });
        }
      } catch (innerErr) {
        results.push({
          driver: driver._id,
          status: "ERROR",
          message: (innerErr as any)?.message || "Internal payout error",
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
  } catch (err: any) {
    return error(500, {
      success: false,
      message: err.message || "Server error during payout processing.",
    });
  }
};

export const inquirePayment = async (transactionId: any) => {
  try {
    let myToken = await getAccesstoken();
    if (!myToken) {
      return false;
    }
    const response = await fetch(
      `${RBC_CREDENTIALS.INQUIRY_TRANSACTION}/${transactionId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${myToken}`,
          "Content-Type": "application/json",
          "rbc-request-id": Bun.randomUUIDv7(),
        },
      }
    );
    const res = await response.json();
    return res.status;
  } catch (error) {
    return false;
  }
};

export const decryptPassword = (encryptStr: any = "ugfuiwgefiu") => {
  try {
    var bytes = CryptoJS.AES.decrypt(
      encryptStr,
      process.env.BODY_ENCRYPTION_KEY_RBC || ""
    );
    var originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText;
  } catch (error) { }
};

export const encryptPassword = (originalStr: any = "hello") => {
  try {
    var ciphertext = CryptoJS.AES.encrypt(
      originalStr,
      process.env.BODY_ENCRYPTION_KEY_RBC || ""
    ).toString();
    return ciphertext;
  } catch (error) { }
};

export const encryptBankDetails = async (details: any) => {
  try {
    const encryptedDetails: any = {};
    for (const [key, value] of Object.entries(details.bankDetails)) {
      encryptedDetails[key] = encryptPassword(value);
    }
    return {
      $set: {
        bankDetails: encryptedDetails,
      },
    };
  } catch (error) { }
};

export const decryptBankDetails = async (details: any) => {
  try {
    const decryptDetails: any = {};
    for (const [key, value] of Object.entries(details)) {
      decryptDetails[key] = decryptPassword(value);
    }
    return { bankDetails: decryptDetails };
  } catch (error) { }
};

export const saveDriverUnPaidDataToCsvOnWeekEnd = (
  payoutData: any,
  payoutStatus: String
) => {
  try {
    const dirPath = path.join(__dirname, "reports");
    const filePath = path.join(dirPath, "payout_driver.csv");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const headers = "driverId,fullName,email,phone,amount,payoutStatus\n";
    const newRow = `${payoutData.driverId},${payoutData.fullName},${payoutData.email},${payoutData.phone},${payoutData.amount},${payoutStatus}\n`;
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      fs.writeFileSync(filePath, headers + newRow, "utf8");
    } else {
      fs.appendFileSync(filePath, newRow, "utf8");
    }
  } catch (error) { }
};

export const saveDriverPayoutCsvOnWeekEnd = (payoutData: any) => {
  try {
    const dirPath = path.join(__dirname, "reports");
    const filePath = path.join(dirPath, "payout_driver_all.csv");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const headers = "driverId,fullName,email,phone,amount\n";
    const newRow = `${payoutData.driverId},${payoutData.fullName},${payoutData.email},${payoutData.phone},${payoutData.amount}\n`;
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      fs.writeFileSync(filePath, headers + newRow, "utf8");
    } else {
      fs.appendFileSync(filePath, newRow, "utf8");
    }
  } catch (error) { }
};

export const saveDriverPayoutMonthly = (payoutData: any, month: any) => {
  try {
    const dirPath = path.join(__dirname, "reports");
    const filePath = path.join(dirPath, `payout_driver_monthly_${month}.csv`);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const headers = "driverId,fullName,email,phone,amount,txnId,createdAt,\n";
    const newRow = `${payoutData.driverId},${payoutData.fullName},${payoutData.email},${payoutData.phone},${payoutData.amount},${payoutData.txnId},${payoutData.createdAt}\n`;
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      fs.writeFileSync(filePath, headers + newRow, "utf8");
    } else {
      fs.appendFileSync(filePath, newRow, "utf8");
    }
  } catch (error) { }
};

export const sleep = (time: number) =>
  new Promise((resolve) => setTimeout(resolve, time));
