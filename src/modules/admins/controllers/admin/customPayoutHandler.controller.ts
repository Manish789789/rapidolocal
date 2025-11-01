import {
  customePayoutByRBC,
  inquirePayment,
  makeTransferMoneyByRBC,
  saveDriverUnPaidDataToCsvOnWeekEnd,
  sleep,
} from "@/modules/rbcBank/helper";
import fs from "fs";
import { TransferMoneyToDrivers } from "@/modules/paymentGateways/stripe.controller";
import path from "path";
import driversModel from "@/modules/drivers/models/drivers.model";
import driversWithdrawalModel from "@/modules/drivers/models/driversWithdrawal.model";
import { logger } from "@/utils/logger";
import mongoose from "mongoose";
export const customePayoutHandler = async ({ request, body, error }: any) => {
  try {
    const { paymentMethod } = body;
    if (!paymentMethod) {
      return error(400, {
        success: false,
        message: "paymentMethod is required",
      });
    }
    switch (paymentMethod) {
      case "rbc": {
        const res = await customePayoutByRBC(body, error);
        const result = JSON.parse(res?.body || "{}");
        if (res?.statusCode === 200 && result.success) {
          return {
            success: true,
            message: ` ${result.message}`,
            reference: result?.results?.[0]?.payment_id, // if exists
          };
        } else if (res?.statusCode === 200 && !result.success) {
          return {
            success: false,
            message: ` Partial failure. ${result.message}`,
            reference: result?.results?.[0]?.payment_id,
          };
        } else if (res?.statusCode === 500) {
          return {
            success: false,
            message: `All payouts failed. ${result.message}`,
          };
        } else {
          return error(500, {
            success: false,
            message: "RBC payout request failed (unexpected response)",
          });
        }
      }

      case "stripe":
        return await TransferMoneyToDrivers(body, error);

      default:
        return error(400, {
          success: false,
          message: "Unsupported payment method",
        });
    }
  } catch (e: any) {
    return error(500, {
      success: false,
      message: e?.message || "Internal server error",
    });
  }
};
export const payoutbycsv = async ({ }: any) => {
  const filePath = path.join(__dirname, "payout_driver.csv");
  let raw = fs.readFileSync(filePath, "utf-8");

  const rows = raw.split("\n");

  const result = rows.map((row) => row.split(","));
  const filterPaymentId = result.filter((row) => row[5] !== "true");
  const drivers = filterPaymentId.slice(1).map((row) => ({
    driverId: row[0],
    amount: row[4],
  }));
  for (const driver of drivers) {
    const getallDriversData = await driversModel
      .findOne(
        { _id: driver.driverId },
        { bankdetails: 1, fullName: 1, email: 1, phone: 1 } // projection
      )
      .lean();
    // console.log("getallDriversData", getallDriversData);
    // const res: any = await makeTransferMoneyByRBC(
    //   getallDriversData,
    //   driver.amount
    // );
    // // console.log(res, "res");
    // if (res.payment_id && res.status === "PROCESSING") {
    //   await driversModel.findOneAndUpdate(
    //     { _id: driver.driverId },
    //     {
    //       $inc: {
    //         wallet: -driver.amount,
    //         lifeTimeEarning: driver.amount,
    //       },
    //     }
    //   );

    //   await driversWithdrawalModel.create({
    //     driver: driver.driverId,
    //     amount: driver.amount,
    //     txnId: res?.payment_id || "",
    //     txnTime: new Date(),
    //     confirmation_number: res?.confirmation_number || "",
    //     status: res.status === "PROCESSING" ? 1 : 2,
    //   });
    // }
  }
};

export const payoutAllPendingDrivers = async () => {
  try {
    let addDriverWeekTransactions = await driversWithdrawalModel.aggregate([
      {
        $match: {
          status: 0,
          txnId: "",
          txnTime: null,
          confirmation_number: "",
        },
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: "$driver",
          latest: { $first: "$$ROOT" }
        }
      },
      {
        $replaceRoot: { newRoot: "$latest" }
      }
    ]);

    for (const singleAddDriverWeekTransactions of addDriverWeekTransactions) {
      let driverDetails: any = await driversModel
        .findOne(
          { _id: singleAddDriverWeekTransactions.driver },
          { driverDetails: 1, fullName: 1, email: 1, phone: 1, bankDetails: 1 }
        )
        .lean();
      if (driverDetails.bankDetails) {
        let res = await makeTransferMoneyByRBC(
          driverDetails,
          parseFloat(Number(singleAddDriverWeekTransactions.amount).toFixed(2))
        );
        if (res) {
          if (res.status === "PROCESSED" || res.status === "PROCESSING") {
            await driversWithdrawalModel.findOneAndUpdate(
              {
                _id: singleAddDriverWeekTransactions._id,
              },
              {
                $set: {
                  txnId: res?.payment_id || "",
                  txnTime: new Date(),
                  confirmation_number: res?.confirmation_number || "",
                  status: res.status === "PROCESSING" ? 1 : 2,
                },
              },
              {
                sort: { createdAt: -1 },
              }
            );
          }
          if (res.status === "PROCESSED") {
            await driversModel.findOneAndUpdate(
              { _id: driverDetails?._id },
              {
                $inc: {
                  wallet: -(
                    parseFloat(
                      Number(singleAddDriverWeekTransactions.amount).toFixed(2)
                    )
                  ),
                  lifeTimeEarning: (
                    parseFloat(
                      Number(singleAddDriverWeekTransactions.amount).toFixed(2)
                    )
                  ),
                },
              }
            );
          }
        }
      }
    }

    await sleep(45 * 1000);

    let processingTransactions = await driversWithdrawalModel
      .find({ status: 1 })
      .lean();

    for (const singleDriverProcessingTransactions of processingTransactions) {
      let singlePaymentStatus = await inquirePayment(
        singleDriverProcessingTransactions.txnId
      );
      let driverDetails: any = await driversModel
        .findOne({ _id: singleDriverProcessingTransactions.driver })
        .lean();

      switch (singlePaymentStatus.status) {
        case "PROCESSING":
          saveDriverUnPaidDataToCsvOnWeekEnd(
            {
              driverId: String(singleDriverProcessingTransactions.driver),
              fullName: driverDetails.fullName,
              email: driverDetails.email,
              phone: driverDetails.phone,
              amount: (
                parseFloat(
                  Number(singleDriverProcessingTransactions.amount).toFixed(2)
                )
              ),
            },
            "PROCESSING"
          );
          break;

        case "PROCESSED":
          await driversWithdrawalModel.findOneAndUpdate(
            { _id: singleDriverProcessingTransactions?._id },
            {
              status: 2,
            }
          );
          await driversModel.findOneAndUpdate(
            { _id: singleDriverProcessingTransactions?.driver },
            {
              $inc: {
                wallet: -(
                  parseFloat(
                    Number(singleDriverProcessingTransactions.amount).toFixed(2)
                  )
                ),
                lifeTimeEarning: (
                  parseFloat(
                    Number(singleDriverProcessingTransactions.amount).toFixed(2)
                  )
                ),
              },
            }
          );
          saveDriverUnPaidDataToCsvOnWeekEnd(
            {
              driverId: String(singleDriverProcessingTransactions.driver),
              fullName: driverDetails.fullName,
              email: driverDetails.email,
              phone: driverDetails.phone,
              amount: (
                parseFloat(
                  Number(singleDriverProcessingTransactions.amount).toFixed(2)
                )
              ),
            },
            "true"
          );
          break;

        case "FAILED":
          await driversWithdrawalModel.findOneAndDelete({
            _id: singleDriverProcessingTransactions._id,
          });
          saveDriverUnPaidDataToCsvOnWeekEnd(
            {
              driverId: String(singleDriverProcessingTransactions.driver),
              fullName: driverDetails.fullName,
              email: driverDetails.email,
              phone: driverDetails.phone,
              amount: (
                parseFloat(
                  Number(singleDriverProcessingTransactions.amount).toFixed(2)
                )
              ),
            },
            "false"
          );
          break;

        default:
          break;
      }
    }
    return {
      status: "success",
      message: "Successfully Processed all pending Payouts.",
    };
  } catch (e: any) {
    logger.error({ e, msg: e.message });
  }
};

export const createPendingPayout = async () => {
  try {
    console.log("createPendingPayout");
    let data = [
      {
        driver: "67f1321b8e80cca532d26068",
        amount: 264,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "67e9542514af96c1a2c0bf28",
        amount: 274,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "67907125ff6beeb1b7411822",
        amount: 287,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "67e303627548686afc1e1fb2",
        amount: 300,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "68739986642d7370f08dea81",
        amount: 304,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "67786ec1b210323dd56025cd",
        amount: 315,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "682de7b3fc45be0ec52003fe",
        amount: 320,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "68266f3c3faf56568d85fcb3",
        amount: 323,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "687bac1e722febe1b83af666",
        amount: 333,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "6862ce164362c71f72624ee0",
        amount: 335,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "685c36cca6710c2943364fa0",
        amount: 342,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "66aaa88aeb7bfda741dcd932",
        amount: 383,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "66889474d33dbe607cb42c7f",
        amount: 393,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "66a594545e88ea83c7371708",
        amount: 403,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "67b382f3b499328bd128139d",
        amount: 412,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "68421661b22bbdacd0de6899",
        amount: 421,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "664b7fa257c2aecb993f059f",
        amount: 422,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "66c72ff9cd6f872c58ff0e7f",
        amount: 433,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "676089717eef0b17bc9e7a8a",
        amount: 436,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "687d3d9b722febe1b89416a0",
        amount: 448,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "688950fcb5062b9e9fc05b94",
        amount: 578,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "68acdd504e39c69262537025",
        amount: 607,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "68a5d3574e39c69262f1619a",
        amount: 913,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "6800e86cce1fe37f499ee0b7",
        amount: 1129,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
      {
        driver: "67ad3c75f357a35e0dc7ae33",
        amount: 1358,
        txnTime: null,
        txnId: "",
        confirmation_number: "",
        status: 0,
      },
    ];
    await driversWithdrawalModel.insertMany(data);
    console.log("Data inserted successfully");
  } catch (e: any) {
    logger.error({ e, msg: e.message });
  }
};
