import adminsModel from "@/modules/admins/models/admins.model";
import rolesModel from "@/modules/admins/models/roles.model";
import statesModel from "@/modules/countries/models/states.model";
import couponsModel from "@/modules/coupons/models/coupons.model";
import driversModel from "@/modules/drivers/models/drivers.model";
import vehicleTypeModel from "@/modules/drivers/models/vehicleType.model";
import geoAreasModel from "@/modules/geo-areas/models/geoAreas.model";
import pricingModel from "@/modules/pricing/models/pricing.model";
import rideBookingsModel, {
  bookingStatus,
} from "@/modules/ride-bookings/models/rideBookings.model";
import taxesModel from "@/modules/taxes/models/taxes.model";
import usersModel from "@/modules/users/models/users.model";
import { logger } from "@/utils/logger";
import { convertLocalToTimezoneToUTC } from "@/utils/resources";
import moment from "moment";
import mongoose from "mongoose";

export const index = async ({ error, body }: any) => {
  try {
    const now = new Date();
    const { country } = body;
    let startDate: Date = new Date("2000-01-01");
    let endDate: Date = new Date();
    let filterKey = body.filter;
    if (
      typeof body.filter === "object" &&
      body.filter !== null &&
      "from" in body.filter &&
      "to" in body.filter
    ) {
      try {
        const from = body.filter.from?.trim?.();
        const to = body.filter.to?.trim?.();
        if (from) startDate = new Date(from);
        if (to) endDate = new Date(to);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error("Invalid date format in from/to");
        }
        filterKey = "Custom";
        const sameDay = startDate.toDateString() === endDate.toDateString();
        if (sameDay) {
        }
      } catch (e: any) {
        logger.error({ error: e, msg: e.message });
      }
    } else {
      // switch (body.filter) {
      //   case "Today":
      //     startDate = new Date(
      //       now.getFullYear(),
      //       now.getMonth(),
      //       now.getDate()
      //     );
      //     endDate = new Date(); // now
      //     break;
      //   case "6 Month":
      //     startDate = new Date(
      //       now.getFullYear(),
      //       now.getMonth() - 6,
      //       now.getDate()
      //     );
      //     endDate = new Date();
      //     break;
      //   case "1 Year":
      //     startDate = new Date(
      //       now.getFullYear() - 1,
      //       now.getMonth(),
      //       now.getDate()
      //     );
      //     endDate = new Date();
      //     break;
      //   case "All":
      //   default:
      //     startDate = new Date("2000-01-01");
      //     endDate = new Date();
      //     filterKey = "All";
      //     break;
      // }
      switch (body.filter) {
        case "Today": {
          const datestart = convertLocalToTimezoneToUTC(
            new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            country
          );
          startDate = new Date(datestart.utc.iso); // Convert ISO string to Date

          const dateend = convertLocalToTimezoneToUTC(new Date(), country);
          endDate = new Date(dateend.utc.iso);
          break;
        }

        case "6 Month": {
          const datestart = convertLocalToTimezoneToUTC(
            new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
            country
          );
          startDate = new Date(datestart.utc.iso);

          const dateend = convertLocalToTimezoneToUTC(new Date(), country);
          endDate = new Date(dateend.utc.iso);
          break;
        }

        case "1 Year": {
          const datestart = convertLocalToTimezoneToUTC(
            new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
            country
          );
          startDate = new Date(datestart.utc.iso);

          const dateend = convertLocalToTimezoneToUTC(new Date(), country);
          endDate = new Date(dateend.utc.iso);
          break;
        }

        case "All":
        default: {
          const datestart = convertLocalToTimezoneToUTC(
            new Date("2000-01-01"),
            country
          );
          startDate = new Date(datestart.utc.iso);

          const dateend = convertLocalToTimezoneToUTC(new Date(), country);
          endDate = new Date(dateend.utc.iso);
          filterKey = "All";
          break;
        }
      }
    }

    // Fetch earnings/statistics based on filterKey
    const [
      totalRiders,
      totalDrivers,
      totalRides,
      earning,
      rideBookingsEarning,
      rideBookingsStatistics,
    ] = await Promise.all(
      filterKey === "All"
        ? [
          countByDateRange(usersModel, startDate, endDate, country),
          countByDateRange(driversModel, startDate, endDate, country),
          countByDateRange(rideBookingsModel, startDate, endDate, country),
          earnings(rideBookingsModel, startDate, endDate, country),
          allEarningRideBookings(rideBookingsModel, country),
          allStatisticsRideBookings(rideBookingsModel, country),
        ]
        : filterKey === "Today"
          ? [
            countByDateRange(usersModel, startDate, endDate, country),
            countByDateRange(driversModel, startDate, endDate, country),
            countByDateRange(rideBookingsModel, startDate, endDate, country),
            earnings(rideBookingsModel, startDate, endDate, country),
            todayEarningRideBookings(rideBookingsModel, startDate, endDate),
            todayStatisticsRideBookings(rideBookingsModel, startDate, endDate),
          ]
          : filterKey === "6 Month"
            ? [
              countByDateRange(usersModel, startDate, endDate, country),
              countByDateRange(driversModel, startDate, endDate, country),
              countByDateRange(rideBookingsModel, startDate, endDate, country),
              earnings(rideBookingsModel, startDate, endDate, country),
              sixMonthEarningRideBookings(rideBookingsModel, startDate, endDate),
              sixMonthStatisticsRideBookings(
                rideBookingsModel,
                startDate,
                endDate
              ),
            ]
            : filterKey === "1 Year"
              ? [
                countByDateRange(usersModel, startDate, endDate, country),
                countByDateRange(driversModel, startDate, endDate, country),
                countByDateRange(rideBookingsModel, startDate, endDate, country),
                earnings(rideBookingsModel, startDate, endDate, country),
                oneYearEarningRideBookings(rideBookingsModel, startDate, endDate),
                oneYearStatisticsRideBookings(
                  rideBookingsModel,
                  startDate,
                  endDate
                ),
              ]
              : filterKey === "Custom"
                ? [
                  countByDateRange(usersModel, startDate, endDate, country),
                  countByDateRange(driversModel, startDate, endDate, country),
                  countByDateRange(rideBookingsModel, startDate, endDate, country),
                  earnings(rideBookingsModel, startDate, endDate, country),
                  customEarningRideBookings(
                    rideBookingsModel,
                    startDate,
                    endDate,
                    country
                  ),

                  customStatisticsRideBookings(
                    rideBookingsModel,
                    startDate,
                    endDate,
                    country
                  ),
                ]
                : [
                  countByDateRange(usersModel, startDate, endDate, country),
                  countByDateRange(driversModel, startDate, endDate, country),
                  countByDateRange(rideBookingsModel, startDate, endDate, country),
                  earnings(rideBookingsModel, startDate, endDate, country),
                  allEarningRideBookings(rideBookingsModel, country),
                  allStatisticsRideBookings(rideBookingsModel, country),
                ]
    );

    return {
      success: true,
      data: {
        counter: {
          totalRiders,
          totalDrivers,
          totalRides,
          earning,
          totalRentals: 0,
          totalPackages: 0,
        },
        rideBookings: {
          earning: rideBookingsEarning,
          statistics: rideBookingsStatistics,
        },
      },
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

const earnings = async (
  rideBookings: any,
  startDate: Date,
  endDate: Date,
  country?: string
) => {
  return await rideBookings.aggregate([
    {
      $match: {
        tripStatus: bookingStatus.completed,
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
        // ...(country && {
        //   "country.name": {
        //     $regex: country.toLocaleUpperCase(),
        //     $options: "i",
        //   },
        // }),
      },
    },
    {
      $addFields: {
        extraChargesTotal: {
          $sum: {
            $map: {
              input: "$finalBilling.userBilling.extraCharges",
              as: "charge",
              in: "$$charge.charges",
            },
          },
        },
      },
    },
    {
      $addFields: {
        totalIncomingPerRide: {
          $add: [
            "$finalBilling.userBilling.totalAmount",
            { $ifNull: ["$extraChargesTotal", 0] },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        totalIncoming: { $sum: "$totalIncomingPerRide" },
        totalOutgoing: { $sum: "$finalBilling.driverEarning.grandTotal" },
      },
    },
    {
      $project: {
        _id: 0,
        totalIncoming: 1,
        totalOutgoing: 1,
        savings: { $subtract: ["$totalIncoming", "$totalOutgoing"] },
      },
    },
  ]);
};
export async function countByDateRange(
  model: any,
  startAt: Date,
  endAt: Date,
  country?: any
): Promise<number> {
  try {
    const filter: any = {
      createdAt: { $gte: startAt, $lte: endAt },
    };
    const count = await model.countDocuments(filter);
    return count;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    throw e;
  }
}

const allEarningRideBookings = async (rideBookings: any, country?: string) => {
  const match: any = { tripStatus: bookingStatus.completed };

  // if (country) {
  //   match["country.name"] = {
  //     $regex: country.toLocaleUpperCase(),
  //     $options: "i",
  //   };
  // }

  return await rideBookings
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            currencyCode: "$country.currencyCode",
            countryName: {
              $switch: {
                branches: [
                  {
                    case: {
                      $in: [{ $toLower: "$country.name" }, ["ca", "canada"]],
                    },
                    then: "canada",
                  },
                ],
                default: { $toLower: "$country.name" },
              },
            },
          },
          totalGrandTotal: { $sum: "$grandTotal" },
        },
      },
      {
        $project: {
          _id: 0,
          year: "$_id.year",
          currencyCode: "$_id.currencyCode",
          countryName: "$_id.countryName",
          totalGrandTotal: 1,
        },
      },
      { $sort: { year: 1, currencyCode: 1 } },
      { $limit: 6 },
    ])
    .then((response: any) => {
      const colors = [
        "#2563eb",
        "#16a34a",
        "#ea580c",
        "#0891b2",
        "#4f46e5",
        "#c026d3",
        "#db2777",
        "#e11d48",
      ];

      const uniqueCountries = [
        ...new Set(response.map((item: any) => item.countryName)),
      ];

      const previousDates: any = [];
      const categories: any = [];

      for (let i in uniqueCountries) {
        previousDates.push({
          name: uniqueCountries?.[i] || "",
          data: [],
          color: colors?.[i] || "",
        });
      }

      // Last 6 years
      for (let i = 5; i >= 0; i--) {
        const date = moment().subtract(i, "years");
        categories.push(date.format("YYYY"));

        for (let p in previousDates) {
          const filteredData = response.filter(
            (item: any) =>
              item.year == date.format("YYYY") &&
              previousDates[p].name == item.countryName
          );
          previousDates[p].data.push(filteredData?.[0]?.totalGrandTotal || 0);
        }
      }

      return { categories, series: previousDates };
    });
};

const allStatisticsRideBookings = async (
  rideBookings: any,
  country?: string
) => {
  return await rideBookings
    .aggregate([
      {
        $match: {
          tripStatus: {
            $in: [bookingStatus.completed, bookingStatus.canceled],
          },
        },
      },
      {
        $group: {
          _id: "$tripStatus",
          count: {
            $sum: 1,
          },
        },
      },
    ])
    .then((response: any) => {
      let categories = [bookingStatus.completed, bookingStatus.canceled];
      let series = [];
      for (let st of categories) {
        let filterdData = response.filter(
          (item: any) => item._id == st.toLowerCase()
        );
        series.push(filterdData?.[0]?.count || 0);
      }
      return { categories, series, colors: ["#16a34a", "#dc2626"] };
    });
};

const todayEarningRideBookings = async (
  rideBookings: any,
  startDate?: Date,
  endDate?: Date
) => {
  // console.log(typeof startDate, typeof endDate, "asdfasdfa");
  return await rideBookings
    .aggregate([
      {
        $match: {
          tripStatus: bookingStatus.completed,
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            hourRange: {
              $switch: {
                branches: [
                  {
                    case: { $lt: ["$localHour", 4] },
                    then: "0-4",
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ["$localHour", 4] },
                        { $lt: ["$localHour", 8] },
                      ],
                    },
                    then: "4-8",
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ["$localHour", 8] },
                        { $lt: ["$localHour", 12] },
                      ],
                    },
                    then: "8-12",
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ["$localHour", 12] },
                        { $lt: ["$localHour", 16] },
                      ],
                    },
                    then: "12-16",
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ["$localHour", 16] },
                        { $lt: ["$localHour", 20] },
                      ],
                    },
                    then: "16-20",
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ["$localHour", 20] },
                        { $lt: ["$localHour", 24] },
                      ],
                    },
                    then: "20-24",
                  },
                ],
                default: "unknown",
              },
            },
            currencyCode: "$country.currencyCode",
            countryName: {
              $switch: {
                branches: [
                  {
                    case: {
                      $in: [{ $toLower: "$country.name" }, ["ca", "canada"]],
                    },
                    then: "canada",
                  },
                ],
                default: { $toLower: "$country.name" },
              },
            },
          },
          totalGrandTotal: { $sum: "$grandTotal" },
        },
      },
      {
        $project: {
          _id: 0,
          hourRange: "$_id.hourRange",
          currencyCode: "$_id.currencyCode",
          countryName: "$_id.countryName",
          totalGrandTotal: 1,
        },
      },
      {
        $sort: {
          hourRange: 1,
          currencyCode: 1,
        },
      },
    ])
    .then((response: any) => {
      const colors = [
        "#2563eb",
        "#16a34a",
        "#ea580c",
        "#0891b2",
        "#4f46e5",
        "#c026d3",
        "#db2777",
        "#e11d48",
      ];
      const uniqueCountries = [
        ...new Set(response.map((item: any) => item.countryName)),
      ];

      var previousDates: any = [];
      let categories: any = [];

      for (let i in uniqueCountries) {
        previousDates.push({
          name: uniqueCountries?.[i] || "",
          data: [],
          color: colors?.[i] || "",
        });
      }

      for (let h of ["0-4", "4-8", "8-12", "12-16", "16-20", "20-24"]) {
        categories.push(`${h} hours`);

        for (let p in previousDates) {
          let filterdData = response.filter(
            (item: any) =>
              item.hourRange == h && previousDates[p].name == item.countryName
          );
          previousDates[p].data.push(filterdData?.[0]?.totalGrandTotal || 0);
        }
      }

      return {
        categories,
        series: previousDates,
      };
    });
};

const todayStatisticsRideBookings = async (
  rideBookingsModel?: any,
  startDate?: Date,
  endDate?: Date
) => {
  return await rideBookingsModel
    .aggregate([
      {
        $match: {
          tripStatus: {
            $in: [bookingStatus.completed, bookingStatus.canceled],
          },
          createdAt: {
            $gte: startDate, // Start of today
            $lt: endDate, // Start of tomorrow
          },
        },
      },
      {
        $group: {
          _id: "$tripStatus",
          count: {
            $sum: 1,
          },
        },
      },
    ])
    .then((response: any) => {
      let categories = [bookingStatus.completed, bookingStatus.canceled];
      let series = [];
      for (let st of categories) {
        let filterdData = response.filter(
          (item: any) => item._id == st.toLowerCase()
        );
        series.push(filterdData?.[0]?.count || 0);
      }
      return { categories, series, colors: ["#16a34a", "#dc2626"] };
    });
};

const sixMonthEarningRideBookings = async (
  rideBookings: any,
  startDate?: Date,
  endDate?: Date
) => {
  return await rideBookings
    .aggregate([
      {
        $match: {
          tripStatus: bookingStatus.completed,
          createdAt: {
            $gte: startDate, // From the first day of last month
            $lt: endDate, // To the last day of last month
          },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: "%Y-%m", date: "$createdAt" },
            },
            // currencyCode: "$country.currencyCode",
            // countryName: {
            //   $switch: {
            //     branches: [
            //       {
            //         case: {
            //           $in: [{ $toLower: "$country.name" }, ["ca", "canada"]],
            //         },
            //         then: "canada",
            //       },
            //     ],
            //     default: { $toLower: "$country.name" },
            //   },
            // },
          },
          totalGrandTotal: {
            $sum: "$grandTotal",
          },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id.date",
          currencyCode: "$_id.currencyCode",
          countryName: "$_id.countryName",
          totalGrandTotal: 1,
        },
      },
      {
        $sort: {
          date: 1,
          currencyCode: 1,
        },
      },
      {
        $limit: 6,
      },
    ])
    .then((response: any) => {
      const monthNumbers = [];
      const todayStartDate = moment(startDate).utc();
      const todayEndDate = moment(endDate).utc();

      while (todayStartDate.isSameOrBefore(todayEndDate)) {
        monthNumbers.push(
          `${todayStartDate.year()}-${todayStartDate.month() + 1}`
        ); // +1 because month() returns 0-based index
        todayStartDate.add(1, "month");
      }

      const colors = [
        "#2563eb",
        "#16a34a",
        "#ea580c",
        "#0891b2",
        "#4f46e5",
        "#c026d3",
        "#db2777",
        "#e11d48",
      ];
      const uniqueCountries = [
        ...new Set(response.map((item: any) => item.countryName)),
      ];

      var previousDates: any = [];
      let categories: any = [];

      for (let i in uniqueCountries) {
        previousDates.push({
          name: uniqueCountries?.[i] || "",
          data: [],
          color: colors?.[i] || "",
        });
      }

      // Loop through the last 6 month
      for (let m of monthNumbers) {
        categories.push(m);

        for (let p in previousDates) {
          let filterdData = response.filter(
            (item: any) =>
              item.date == m && previousDates[p].name == item.countryName
          );
          previousDates[p].data.push(filterdData?.[0]?.totalGrandTotal || 0);
        }
      }
      return {
        categories,
        series: previousDates,
      };
    });
};

const sixMonthStatisticsRideBookings = async (
  rideBookings: any,
  startDate?: Date,
  endDate?: Date
) => {
  return await rideBookings
    .aggregate([
      {
        $match: {
          tripStatus: {
            $in: [bookingStatus.completed, bookingStatus.canceled],
          },
          createdAt: {
            $gte: startDate, // From the first day of last month
            $lt: endDate, // To the last day of last month
          },
        },
      },
      {
        $group: {
          _id: "$tripStatus",
          count: {
            $sum: 1,
          },
        },
      },
    ])
    .then((response: any) => {
      let categories = [bookingStatus.completed, bookingStatus.canceled];
      let series = [];
      for (let st of categories) {
        let filterdData = response.filter(
          (item: any) => item._id == st.toLowerCase()
        );
        series.push(filterdData?.[0]?.count || 0);
      }
      return { categories, series, colors: ["#16a34a", "#dc2626"] };
    });
};

const oneYearEarningRideBookings = async (
  rideBookings: any,
  startDate?: Date,
  endDate?: Date
) => {
  return await rideBookings
    .aggregate([
      {
        $match: {
          tripStatus: bookingStatus.completed,
          createdAt: {
            $gte: startDate, // From the first day of last month
            $lt: endDate, // To the last day of last month
          },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: "%Y-%m", date: "$createdAt" },
            },
            // currencyCode: "$country.currencyCode",
            // countryName: {
            //   $switch: {
            //     branches: [
            //       {
            //         case: {
            //           $in: [{ $toLower: "$country.name" }, ["ca", "canada"]],
            //         },
            //         then: "canada",
            //       },
            //     ],
            //     default: { $toLower: "$country.name" },
            //   },
            // },
          },
          totalGrandTotal: {
            $sum: "$grandTotal",
          },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id.date",
          currencyCode: "$_id.currencyCode",
          countryName: "$_id.countryName",
          totalGrandTotal: 1,
        },
      },
      {
        $sort: {
          date: 1,
          currencyCode: 1,
        },
      },
      {
        $limit: 12,
      },
    ])
    .then((response: any) => {
      const monthNumbers = [];
      const todayStartDate = moment(startDate).utc();
      const todayEndDate = moment(endDate).utc();

      while (todayStartDate.isSameOrBefore(todayEndDate)) {
        monthNumbers.push(
          `${todayStartDate.year()}-${todayStartDate.month() + 1}`
        ); // +1 because month() returns 0-based index
        todayStartDate.add(1, "month");
      }

      const colors = [
        "#2563eb",
        "#16a34a",
        "#ea580c",
        "#0891b2",
        "#4f46e5",
        "#c026d3",
        "#db2777",
        "#e11d48",
      ];
      const uniqueCountries = [
        ...new Set(response.map((item: any) => item.countryName)),
      ];

      var previousDates: any = [];
      let categories: any = [];

      for (let i in uniqueCountries) {
        previousDates.push({
          name: uniqueCountries?.[i] || "",
          data: [],
          color: colors?.[i] || "",
        });
      }

      // Loop through the last 12 month
      for (let m of monthNumbers) {
        categories.push(m);

        for (let p in previousDates) {
          let filterdData = response.filter(
            (item: any) =>
              item.date == m && previousDates[p].name == item.countryName
          );
          previousDates[p].data.push(filterdData?.[0]?.totalGrandTotal || 0);
        }
      }
      return {
        categories,
        series: previousDates,
      };
    });
};

const oneYearStatisticsRideBookings = async (
  rideBookings: any,
  startDate?: Date,
  endDate?: Date
) => {
  return await rideBookings
    .aggregate([
      {
        $match: {
          tripStatus: {
            $in: [bookingStatus.completed, bookingStatus.canceled],
          },
          createdAt: {
            $gte: startDate, // From the first day of last month
            $lt: endDate, // To the last day of last month
          },
        },
      },
      {
        $group: {
          _id: "$tripStatus",
          count: {
            $sum: 1,
          },
        },
      },
    ])
    .then((response: any) => {
      let categories = [bookingStatus.completed, bookingStatus.canceled];
      let series = [];
      for (let st of categories) {
        let filterdData = response.filter(
          (item: any) => item._id == st.toLowerCase()
        );
        series.push(filterdData?.[0]?.count || 0);
      }
      return { categories, series, colors: ["#16a34a", "#dc2626"] };
    });
};

export const searchOnSystem = async ({ error, body }: any) => {
  try {
    const { keyword } = body;

    let memberSectionFilterQuery: any = {
      $or: [
        { fullName: { $regex: keyword, $options: "i" } },
        { email: { $regex: keyword, $options: "i" } },
        { phone: { $regex: keyword, $options: "i" } },
      ],
    };
    let serviceSectionFilterQuery: any = {
      $or: [
        { orderNo: { $regex: keyword, $options: "i" } },
        { paymentMethodId: { $regex: keyword, $options: "i" } },
      ],
    };
    let usefulSectionFilterQuery: any = {
      $or: [{ name: { $regex: keyword, $options: "i" } }],
    };
    let couponSectionFilterQuery: any = {
      $or: [{ code: { $regex: keyword, $options: "i" } }],
    };
    if (mongoose.Types.ObjectId.isValid(keyword)) {
      memberSectionFilterQuery.$or.push({ _id: keyword });
      serviceSectionFilterQuery.$or.push({ _id: keyword });
      usefulSectionFilterQuery.$or.push({ _id: keyword });
      couponSectionFilterQuery.$or.push({ _id: keyword });
    }

    const [
      usersData,
      driversData,
      staffData,
      rideBookingData,
      couponsData,
      vehicleTypesData,
      geoAreasData,
      taxesData,
      pricingData,
      rolesData,
    ] = await Promise.all([
      usersModel
        .find(memberSectionFilterQuery)
        .select("fullName email phone avatar")
        .lean(),
      driversModel
        .find(memberSectionFilterQuery)
        .select("fullName email phone avatar")
        .lean(),
      adminsModel
        .find(memberSectionFilterQuery)
        .select("fullName email phone avatar")
        .lean(),

      rideBookingsModel
        .find(serviceSectionFilterQuery)
        .select("orderNo paymentMethodId")
        .lean(),

      couponsModel.find(couponSectionFilterQuery).select("code").lean(),
      vehicleTypeModel.find(usefulSectionFilterQuery).select("name").lean(),
      vehicleTypeModel.find(usefulSectionFilterQuery).select("name").lean(),
      geoAreasModel.find(usefulSectionFilterQuery).select("name").lean(),
      taxesModel.find(usefulSectionFilterQuery).select("name").lean(),
      pricingModel.find(usefulSectionFilterQuery).select("name").lean(),
      rolesModel.find(usefulSectionFilterQuery).select("name").lean(),
    ]);

    return {
      success: true,
      data: {
        usersData,
        driversData,
        staffData,
        rideBookingData,
        couponsData,
        vehicleTypesData,
        geoAreasData,
        taxesData,
        pricingData,
        rolesData,
      },
    };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};

const customEarningRideBookings = async (
  rideBookings: any,
  startDate: any,
  endDate: any,
  country?: string
) => {
  return await rideBookings
    .aggregate([
      {
        $match: {
          tripStatus: bookingStatus.completed,
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            day: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            // currencyCode: "$country.currencyCode",
            // countryName: {
            //   $switch: {
            //     branches: [
            //       {
            //         case: {
            //           $in: [{ $toLower: "$country.name" }, ["ca", "canada"]],
            //         },
            //         then: "canada",
            //       },
            //     ],
            //     default: { $toLower: "$country.name" },
            //   },
            // },
          },
          totalGrandTotal: {
            $sum: "$grandTotal",
          },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id.day",
          currencyCode: "$_id.currencyCode",
          countryName: "$_id.countryName",
          totalGrandTotal: 1,
        },
      },
      {
        $sort: {
          date: 1,
          currencyCode: 1,
        },
      },
    ])
    .then((response: any) => {
      const dayCursor = moment(startDate);
      const end = moment(endDate);

      const categories: string[] = [];

      while (dayCursor.isSameOrBefore(end, "day")) {
        categories.push(dayCursor.format("YYYY-MM-DD"));
        dayCursor.add(1, "day");
      }

      // Unique countries
      const uniqueCountries = [
        ...new Set(response.map((item: any) => item.countryName)),
      ];

      const colors = [
        "#2563eb",
        "#16a34a",
        "#ea580c",
        "#0891b2",
        "#4f46e5",
        "#c026d3",
        "#db2777",
        "#e11d48",
      ];

      // Build series for each country
      const series: any[] = [];

      for (let i in uniqueCountries) {
        const country = uniqueCountries[i];

        const countryData = response.filter(
          (item: any) => item.countryName === country
        );

        const data = categories.map((dateStr) => {
          const match = countryData.find((item: any) => item.date === dateStr);
          return match?.totalGrandTotal || 0;
        });

        series.push({
          name: country,
          data,
          color: colors[i] || "",
        });
      }

      return {
        startDate: moment(startDate).format("YYYY-MM-DD"),
        endDate: moment(endDate).format("YYYY-MM-DD"),
        categories, // all dates
        series, // actual daily totals per country
      };
    });
};

const customStatisticsRideBookings = async (
  rideBookings: any,
  startDate: any,
  endDate: any,
  country?: string
) => {
  return await rideBookings
    .aggregate([
      {
        $match: {
          tripStatus: {
            $in: [bookingStatus.completed, bookingStatus.canceled],
          },
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
        },
      },
      {
        $group: {
          _id: "$tripStatus",
          count: {
            $sum: 1,
          },
        },
      },
    ])
    .then((response: any) => {
      const categories = [bookingStatus.completed, bookingStatus.canceled];
      const colors = ["#16a34a", "#dc2626"];

      const series = categories.map((status) => {
        const match = response.find((item: any) => item._id === status);
        return match?.count || 0;
      });

      return {
        categories,
        series,
        colors,
      };
    });
};
