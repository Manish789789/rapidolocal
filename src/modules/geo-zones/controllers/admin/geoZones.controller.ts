import { resources } from "@/utils/resources";
import model from "../../models/geoZones.model";
import rideBookingsModel from "@/modules/ride-bookings/models/rideBookings.model";
import {
  generatePdfFile,
  generateUniquePdfFileName,
  invoicePdfFile,
  rideBookingsPdfFile,
} from "@/utils/invoicePdf";
import fs, { unlink } from "fs";
import path from "path";
export const { index, create, edit, update, deleteItem } = resources(model);

// export const pdfDownloadRideBooking = async ({ error, params, body }: any) => {
//     try {
//         const zone: any = await model.findById(params.id).lean();
//         if (!zone) {
//             return error(404, { success: false, message: "Zone not found" });
//         }

//         const coordinates = zone.geoPoint?.coordinates;
//         if (!coordinates || coordinates.length < 2) {
//             return error(400, {
//                 success: false,
//                 message: "Invalid zone coordinates",
//             });
//         }

//         const [zoneLng, zoneLat] = coordinates;
//         const { from, to } = body;

//         // Validate date inputs
//         if (!from || !to) {
//             return error(400, {
//                 success: false,
//                 message: "Both 'from' and 'to' dates are required",
//             });
//         }

//         // Parse and set date boundaries
//         const fromDate = new Date(from);
//         fromDate.setHours(0, 0, 0, 0); // Start of 'from' date

//         const toDate = new Date(to);
//         toDate.setHours(23, 59, 59, 999); // End of 'to' date

//         const rides = await rideBookingsModel.aggregate([
//             {
//                 $match: {
//                     tripStatus: "completed",
//                     paymentStatus: true,
//                     createdAt: {
//                         $gte: fromDate,
//                         $lte: toDate,
//                     },
//                 },
//             },
//             {
//                 $addFields: {
//                     firstAddress: { $arrayElemAt: ["$tripAddress", 0] },
//                     lastAddress: {
//                         $arrayElemAt: [
//                             "$tripAddress",
//                             { $subtract: [{ $size: "$tripAddress" }, 1] },
//                         ],
//                     },
//                 },
//             },
//             {
//                 $match: {
//                     $or: [
//                         // Match first address (pickup)
//                         {
//                             $and: [
//                                 { "firstAddress.location.latitude": zoneLat },
//                                 { "firstAddress.location.longitude": zoneLng },
//                             ],
//                         },
//                         // Match last address (dropoff)
//                         {
//                             $and: [
//                                 { "lastAddress.location.latitude": zoneLat },
//                                 { "lastAddress.location.longitude": zoneLng },
//                             ],
//                         },
//                     ],
//                 },
//             },

//             // Populate customer details
//             {
//                 $lookup: {
//                     from: "customers",
//                     localField: "customer",
//                     foreignField: "_id",
//                     as: "customerDetails",
//                 },
//             },
//             {
//                 $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true },
//             },

//             // Populate driver details
//             {
//                 $lookup: {
//                     from: "drivers",
//                     localField: "driver",
//                     foreignField: "_id",
//                     as: "driverDetails",
//                 },
//             },
//             {
//                 $unwind: { path: "$driverDetails", preserveNullAndEmptyArrays: true },
//             },

//             // Sort by createdAt descending
//             {
//                 $sort: { createdAt: -1 },
//             },

//             {
//                 $project: {
//                     _id: 1,
//                     orderNo: 1,
//                     tripAddress: 1,
//                     tripStatus: 1,
//                     grandTotal: 1,
//                     paymentStatus: 1,
//                     pickedAt: 1,
//                     dropedAt: 1,
//                     createdAt: 1,
//                     "customerDetails.name": 1,
//                     "customerDetails.phone": 1,
//                     "driverDetails.name": 1,
//                     "driverDetails.phone": 1,
//                     "driverDetails.vehicleNumber": 1,
//                 },
//             },
//         ]);
//         const pdfFilePath = rideBookingsPdfFile(rides, { from, to }, zone.name);
//         const options = {
//             format: "A4",
//             orientation: "portrait",
//             border: {
//                 top: "2cm",
//                 right: "1cm",
//                 bottom: "1mm",
//                 left: "1cm",
//             },
//         };
//         const fileName = generateUniquePdfFileName(name, from, to);
//         const pdfDirectory = path.join(__dirname, "pdfs");
//         if (!fs.existsSync(pdfDirectory)) {
//             fs.mkdirSync(pdfDirectory);
//         }
//         const pdfFilePathe = path.join(pdfDirectory, fileName);
//         // const voice = generatePdfFile(pdfFilePath, pdfFilePathe, options);
//         try {
//             const response: any = await generatePdfFile(
//                 pdfFilePath,
//                 pdfFilePathe,
//                 options
//             );
//             const file = Bun.file(response.filename);
//             const fileBuffer = await file.arrayBuffer();
//             unlink(response.filename, (err) => {
//                 if (err) {
//                     //   logger.error({ error: err, msg: err.message });
//                 }
//             });
//             return new Response(fileBuffer, {
//                 headers: {
//                     "Content-Type": "application/pdf",
//                 },
//             });
//         } catch (e: any) {
//             //   logger.error({ error: e, msg: e.message });
//             return error(400, { success: false, message: "PDF generation failed" });
//         }

//     // console.log(voice, "voice");
//     return {
//       success: true,
//       message: "Filtered rides found successfully",
//       count: rides.length,
//       data: voice,
//       rides,
//     };
//   } catch (err: any) {
//     console.error("Error fetching rides:", err);
//     return error(500, {
//       success: false,
//       message: "Something went wrong",
//       error: err.message,
//     });
//   }
// };
export const pdfDownloadRideBooking = async ({ error, params, body }: any) => {
  try {
    // 🟩 1️⃣ Get zone
    const zone: any = await model.findById(params.id).lean();
    if (!zone) {
      return error(404, { success: false, message: "Zone not found" });
    }

    const coordinates = zone.geoPoint?.coordinates;
    if (!coordinates || coordinates.length < 2) {
      return error(400, {
        success: false,
        message: "Invalid zone coordinates",
      });
    }

    const [zoneLng, zoneLat] = coordinates;
    const { from, to } = body;

    // 🟩 2️⃣ Validate date inputs
    if (!from || !to) {
      return error(400, {
        success: false,
        message: "Both 'from' and 'to' dates are required",
      });
    }

    // 🟩 3️⃣ Prepare date range
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    // 🟩 4️⃣ Aggregate rides
    const rides = await rideBookingsModel.aggregate([
      {
        $match: {
          tripStatus: "completed",
          paymentStatus: true,
          createdAt: { $gte: fromDate, $lte: toDate },
        },
      },
      {
        $addFields: {
          firstAddress: { $arrayElemAt: ["$tripAddress", 0] },
          lastAddress: {
            $arrayElemAt: [
              "$tripAddress",
              { $subtract: [{ $size: "$tripAddress" }, 1] },
            ],
          },
        },
      },
      {
        $match: {
          $or: [
            {
              $and: [
                { "firstAddress.location.latitude": zoneLat },
                { "firstAddress.location.longitude": zoneLng },
              ],
            },
            {
              $and: [
                { "lastAddress.location.latitude": zoneLat },
                { "lastAddress.location.longitude": zoneLng },
              ],
            },
          ],
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customerDetails",
        },
      },
      {
        $unwind: { path: "$customerDetails", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driver",
          foreignField: "_id",
          as: "driverDetails",
        },
      },
      { $unwind: { path: "$driverDetails", preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          _id: 1,
          orderNo: 1,
          tripAddress: 1,
          tripStatus: 1,
          grandTotal: 1,
          paymentStatus: 1,
          pickedAt: 1,
          dropedAt: 1,
          createdAt: 1,
          "customerDetails.name": 1,
          "customerDetails.phone": 1,
          "driverDetails.name": 1,
          "driverDetails.phone": 1,
          "driverDetails.vehicleNumber": 1,
        },
      },
    ]);

    // 🟩 5️⃣ Generate PDF
    const pdfHtml = rideBookingsPdfFile(rides, { from, to }, zone.name);
    console.log(pdfHtml);
    const options = {
      format: "A4",
      orientation: "portrait",
      border: { top: "2cm", right: "1cm", bottom: "1mm", left: "1cm" },
    };
    const fileName = generateUniquePdfFileName(zone.name, from, to);
    const pdfDirectory = path.join(__dirname, "pdfs");
    if (!fs.existsSync(pdfDirectory)) fs.mkdirSync(pdfDirectory);
    const pdfFilePath = path.join(pdfDirectory, fileName);
    const response: any = await generatePdfFile(pdfHtml, pdfFilePath, options);
    const file = Bun.file(response.filename);
    const fileBuffer = await file.arrayBuffer();
    unlink(response.filename, (err) => {
      if (err) console.error("Failed to remove temp PDF:", err.message);
    });
    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/pdf",
      },
    });
  } catch (err: any) {
    console.error("Error generating PDF:", err);
    return error(500, {
      success: false,
      message: "Something went wrong",
      error: err.message,
    });
  }
};
