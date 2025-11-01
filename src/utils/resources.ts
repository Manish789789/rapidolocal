import { create } from "./../modules/users/controllers/user-app/paymentMethod.controller";
import mongoose from "mongoose";
import mediaModel from "@/modules/media/models/media.model";

import { logger } from "./logger";
const BunnyStorage = require("bunnycdn-storage").default;

const isFloat = (n: any) => Number(n) === n && n % 1 !== 0;

export const pagination = async (
  body: any,
  model: any,
  populate: any = false
) => {
  try {
    var limit = typeof body?.perPage == "undefined" ? 10 : body?.perPage;
    var page = typeof body?.page == "undefined" ? 1 : body?.page;
    var keyword = typeof body?.keyword == "undefined" ? false : body?.keyword;
    var sort = typeof body?.sort == "undefined" ? "date_desc" : body?.sort;
    var filter = typeof body?.filter == "undefined" ? [] : body?.filter;
    var selectedField =
      typeof body?.selectedField == "undefined" ? {} : body?.selectedField;
    let search = filter.length != 0 ? filter : {};
    let populated =
      typeof body?.populate == "undefined" ? populate : body?.populate;
    if (keyword) {
      search.name = { $regex: keyword, $options: "i" };
    }
    var sortBy: any = { createdAt: -1 };
    if (
      body.country &&
      ["Drivers", "Users", "RideBookings"].includes(model.modelName)
    ) {
      filter["country.name"] = {
        $regex: body.country.toLocaleUpperCase(),
        $options: "i",
      };
    }
    if (sort == "date_asc") {
      sortBy = { createdAt: 1 };
    } else if (sort == "date_desc") {
      sortBy = { createdAt: -1 };
    } else if (sort == "title_desc") {
      sortBy = { name: -1 };
    } else if (sort == "title_asc") {
      sortBy = { name: 1 };
    } else {
      sortBy = sort;
    }

    let select = "";
    let size = Object.keys(selectedField).length;

    await model.schema.eachPath(function (path: any) {
      if (size == 0) {
        select += ` ${path}`;
      } else if (typeof selectedField[path] != "undefined") {
        select += ` ${path}`;
      }
    });

    var total = await model.find(search).countDocuments();
    var skips = limit * (page - 1);
    var lists = [];
    if (populated) {
      lists = await model
        .find(search)
        .select(select)
        .populate(populated)
        .sort(sortBy)
        .skip(skips)
        .limit(limit)
        .lean()
        .exec();
    } else {
      lists = await model
        .find(search)
        .select(select)
        .sort(sortBy)
        .skip(skips)
        .limit(limit)
        .lean()
        .exec();
    }
    var totalPages: string | any = parseInt(total) / limit;
    return {
      pages: isFloat(totalPages) ? parseInt(totalPages) + 1 : totalPages,
      total: total,
      currentPage: page,
      lists,
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return [];
  }
};

// export const pagination = async (
//   body: any,
//   model: any,
//   populate: any = false
// ) => {
//   try {
//     const limit = typeof body?.perPage === "undefined" ? 10 : body?.perPage;
//     const page = typeof body?.page === "undefined" ? 1 : body?.page;
//     const keyword = typeof body?.keyword === "undefined" ? false : body?.keyword;
//     const sort = typeof body?.sort === "undefined" ? "date_desc" : body?.sort;
//     const filter = typeof body?.filter === "undefined" ? {} : body?.filter;
//     const selectedField = typeof body?.selectedField === "undefined" ? {} : body?.selectedField;
//     let search = Object.keys(filter).length !== 0 ? filter : {};
//     let populated = typeof body?.populate === "undefined" ? populate : body?.populate;

//     if (keyword) {
//       search.name = { $regex: keyword, $options: "i" };
//     }

//     let sortBy: any = { createdAt: -1 };
//     if (sort === "date_asc") sortBy = { createdAt: 1 };
//     else if (sort === "date_desc") sortBy = { createdAt: -1 };
//     else if (sort === "title_desc") sortBy = { name: -1 };
//     else if (sort === "title_asc") sortBy = { name: 1 };
//     else sortBy = sort;

//     // Build projection
//     let projection: any = {};
//     const size = Object.keys(selectedField).length;
//     await model.schema.eachPath(function (path: any) {
//       if (size === 0) {
//         projection[path] = 1;
//       } else if (typeof selectedField[path] !== "undefined") {
//         projection[path] = 1;
//       }
//     });

//     // Aggregation pipeline
//     const pipeline: any[] = [
//       { $match: search },
//       { $sort: sortBy },
//       { $project: projection },

//     ];

//     // Populate logic for string-based population
//     if (Array.isArray(populated)) {
//       for (const popField of populated) {
//         const schemaPath = model.schema.path(popField);
//         if (schemaPath && schemaPath.options && schemaPath.options.ref) {
//           pipeline.push({
//             $lookup: {
//               from: mongoose.model(schemaPath.options.ref).collection.name,
//               localField: popField,
//               foreignField: "_id",
//               as: popField,
//             },
//           });
//           pipeline.push({
//             $unwind: {
//               path: `$${popField}`,
//               preserveNullAndEmptyArrays: true,
//             },
//           });
//         }
//       }
//     }

//     // Pagination
//     pipeline.push({ $skip: limit * (page - 1) });
//     pipeline.push({ $limit: limit });

//     // Get total count
//     const totalPipeline = [{ $match: search }, { $count: "total" }];
//     const totalResult = await model.aggregate(totalPipeline).exec();
//     const total = totalResult[0]?.total || 0;

//     // Get paginated results
//     const lists = await model.aggregate(pipeline).exec();

//     const totalPages = parseInt(total) / limit;
//     return {
//       pages: isFloat(totalPages) ? (totalPages) + 1 : totalPages,
//       total,
//       currentPage: page,
//       lists,
//     };
//   } catch (e: any) {
//      logger.error({ error: e, msg: e.message });
//     return [];
//   }
// };
export const resources = (model: any) => {
  let returnResouce = {
    index: async ({ body, error }: any) => {
      try {
        return {
          success: true,
          data: await pagination(body, model),
        };
      } catch (errorData: any) {
        return error(400, {
          success: false,
          message: errorData?.message || "",
        });
      }
    },
    create: async ({ body, error }: any) => {
      await model.create(body);
      return { success: true, message: "Information successfully added" };
    },

    edit: async ({ params, query, body, error }: any) => {
      let item = null;
      if (!mongoose.isValidObjectId(params.id)) {
        return error(404, { success: false, message: "Invalid request" });
      }

      if (typeof query.populate != "undefined") {
        // let splitPopulate = req.query.populate.split(',')
        item = await model.findById(params.id).populate(query.populate);
      } else {
        item = await model.findById(params.id);
      }

      if (!item) {
        return error(404, {
          success: false,
          message: `No item found for id ${params.id}`,
        });
      }
      return { success: true, data: item };
    },

    editBySlug: async ({ params, error }: any) => {
      const item = await model.findOne({ slug: params.slug });

      if (!item) {
        return error(404, {
          success: false,
          message: `No item found for slug ${params.slug}`,
        });
      }
      return { success: true, data: item };
    },
    update: async ({ body, params }: any) => {
      await model.updateOne(
        {
          _id: params.id,
        },
        { $set: body }
      );

      return { success: true, message: "Information successfully updated" };
    },
    deleteItem: async ({ params, error }: any) => {
      const item: any = await model.findById(params.id).lean();

      if (!item) {
        return error(404, {
          success: false,
          message: `No item found for id ${params.id}`,
        });
      }
      await model.findOneAndDelete({ _id: params.id });
      return { success: true, message: "Item successfully removed", data: {} };
    },
    multiDeleteItem: async ({ body, error }: any) => {
      try {
        let ids = body.ids;
        // if (req.user.role == '63971a4dbbb1680f334beed3' || req.user._id.toString() == item?.owner.toString()) {

        for (let id of ids) {
          const item: any = await model.findById(id).lean();

          if (!item) {
            return error(404, {
              success: false,
              message: `No item found for id ${id}`,
            });
          }
          await model.findOneAndDelete({ _id: id });
        }

        // } else {

        //   return next({
        //     message: `Permission denied`,
        //     statusCode: 404,
        //   });
        // }
      } catch (e) { }

      return { success: true, message: "Items successfully removed", data: {} };
    },
  };
  return returnResouce;
};

export const mediaResources = (populate: any = null) => {
  const bunnyStorage: any = new BunnyStorage(
    process.env.BUNNY_CDN_KEY || "",
    process.env.BUNNY_CDN_ZONE || "",
    process.env.BUNNY_CDN_REGIONE || ""
  );
  return {
    index: async ({ body, error }: any) => {
      try {
        return {
          success: true,
          data: await pagination(body, mediaModel),
        };
      } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        error(500, {
          success: false,
          message: e?.message || "",
        });
      }
    },
    uploadAndCreateMedia: async ({ request, body, error }: any) => {
      try {
        const { file } = body;
        const arrayBuffer = await file.arrayBuffer();
        const newFileName = `${Bun.randomUUIDv7("base64url")}-${file.name}`;
        await bunnyStorage.upload(Buffer.from(arrayBuffer), newFileName);
        const thumbnailUrl = `${process.env.BUNNY_CDN_URL}/${newFileName}?AccessKey=${process.env.BUNNY_CDN_PUBLIC_VIEW}`;

        await mediaModel.create({
          name: newFileName,
          fileName: newFileName,
          size: file.size,
          type: file.type,
          thumbnailUrl,
          storageBucket: {
            bucketName: "ride-sharing",
            fileKey: newFileName,
          },
        });
        return {
          success: true,
          data: {
            description: "test",
            fileLink: thumbnailUrl,
          },
          message: "File successfully uploaded",
        };
      } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, {
          success: false,
          data: "",
          message: "Uploading error",
        });
      }
    },
    multiDeleteItem: async ({ body, error }: any) => {
      try {
        let ids = body.ids;
        for (let id of ids) {
          const item: any = await mediaModel
            .findById(id)
            .select("storageBucket.fileKey")
            .lean();
          if (!item) {
            return error(404, {
              message: `No item found for id ${id}`,
              success: false,
            });
          }

          await mediaModel.findOneAndDelete({ _id: id });
          bunnyStorage
            .delete(item.storageBucket.fileKey)
            .catch((err: any) => { });
        }
      } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(500, { success: false, message: "Something is wrong" });
      }
      return { success: true, message: "Items successfully removed", data: {} };
    },
    deleteByLinks: async ({ body, error }: any) => {
      try {
        for (let link of body.links) {
          const item: any = await mediaModel
            .findOne({ thumbnailUrl: link })
            .select("storageBucket.fileKey thumbnailUrl")
            .lean();
          if (!item) {
            return error(404, {
              success: false,
              message: `No item found for id ${link}`,
            });
          }
          bunnyStorage
            .delete(item.storageBucket.fileKey)
            .catch((err: any) => { });
          await mediaModel.findOneAndDelete({ _id: item._id });
        }
      } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(500, { success: false, message: "Something is wrong" });
      }
      return { success: true, message: "Items successfully removed" };
    },
  };
};
export function convertLocalToTimezoneToUTC(
  localTime: Date | string,
  targetTimezone: string
): any {
  // Convert input to Date object if it's a string
  const date: Date =
    localTime instanceof Date ? localTime : new Date(localTime);

  // Validate the date
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date provided");
  }

  // Extract the date/time components (these are the digits we want to preserve)
  const year: number = date.getFullYear();
  const month: number = date.getMonth() + 1; // JavaScript months are 0-indexed
  const day: number = date.getDate();
  const hours: number = date.getHours();
  const minutes: number = date.getMinutes();
  const seconds: number = date.getSeconds();

  // Helper function to pad numbers
  const pad = (num: number): string => num.toString().padStart(2, "0");

  // Create the time string preserving the exact digits
  const timeString: string = `${year}-${pad(month)}-${pad(day)} ${pad(
    hours
  )}:${pad(minutes)}:${pad(seconds)}`;

  // Create a date string in ISO format for the target timezone
  // This represents the SAME digits but in the target timezone
  const isoDateString: string = `${year}-${pad(month)}-${pad(day)}T${pad(
    hours
  )}:${pad(minutes)}:${pad(seconds)}`;

  // Get the offset of the target timezone at this specific date/time
  // We need to create a formatter for the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: targetTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Create a temporary UTC date with our digits
  const tempUTC: Date = new Date(
    Date.UTC(year, month - 1, day, hours, minutes, seconds)
  );

  // Format this date in the target timezone to see what it would display as
  const formattedInTarget: string = formatter.format(tempUTC);

  // Now we need to find the offset for the target timezone
  // We'll use a different approach: create the date and calculate offset

  // Get offset by comparing UTC time with target timezone time
  const offsetFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: targetTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  });

  // Get the offset string
  const partsArray = offsetFormatter.formatToParts(tempUTC);
  let offsetStr = "";

  for (const part of partsArray) {
    if (part.type === "timeZoneName") {
      offsetStr = part.value;
      break;
    }
  }

  // Parse offset (e.g., "GMT-3:30", "GMT+5:30", "GMT-5")
  let offsetMinutes = 0;
  const offsetMatch = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);

  if (offsetMatch) {
    const sign = offsetMatch[1] === "+" ? -1 : 1; // Note: inverted for our calculation
    const offsetHours = parseInt(offsetMatch[2]);
    const offsetMins = offsetMatch[3] ? parseInt(offsetMatch[3]) : 0;
    offsetMinutes = sign * (offsetHours * 60 + offsetMins);
  }

  // Create UTC date: take our time digits and adjust by the offset
  const utcDate: Date = new Date(
    Date.UTC(year, month - 1, day, hours, minutes, seconds)
  );

  // Adjust by timezone offset to get actual UTC
  utcDate.setMinutes(utcDate.getMinutes() + offsetMinutes);

  return {
    original: {
      dateString: timeString,
      time: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    },
    interpretedInTimezone: {
      timezone: targetTimezone,
      dateTime: `${timeString} ${targetTimezone}`,
    },
    utc: {
      iso: utcDate.toISOString(),
      formatted: utcDate.toUTCString(),
    },
  };
}
