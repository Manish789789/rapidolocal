import { Parser } from "json2csv";
import fs from "fs/promises";
import BunnyStorage from "bunnycdn-storage";

export const convertJson = async (data: any, selectedFields: any) => {
  const fields = [
    { label: "Booking ID", value: "orderNo" },
    { label: "Trip Address", value: "tripAddress" },
    { label: "First Trip Address", value: "firstTripAddressGeoLocation.coordinates" },
    { label: "Customer", value: "customer" },
    { label: "Driver", value: "driver" },
    { label: "Tip", value: "tip" },
    { label: "Tax(%)", value: "tax.percentage" },
    { label: "Tax", value: "tax.taxTotal" },
    { label: "Grand Total", value: "grandTotal" },
    { label: "Trip Status", value: "tripStatus" },
    { label: "Canceled By", value: "canceledBy" },
    { label: "Canceled Reason", value: "canceledReason" },
    { label: "Payment ID", value: "paymentId" },
    { label: "Payment Method ID", value: "paymentMethodId" },
    { label: "Payment Intent ID", value: "paymentIntentId" },
    { label: "Driver Rating", value: "driverRating.stars" },
    { label: "Picked At", value: "pickedAt" },
    { label: "Dropped At", value: "dropedAt" },
    { label: "Time", value: "time" },
    { label: "Payment Status", value: "paymentStatus" },
    { label: "Payment Step", value: "paymentStep" },
    { label: "Searching Completed", value: "searchingCompleted" },
    { label: "Shared Ride", value: "sharedRide" },
    { label: "Cancelled At", value: "cancelledAt" },
  ];
  const selectedFieldsMapping = fields.filter(field => selectedFields.includes(field.value)).map(field => ({
    label: field.label,
    value: field.value,
  }));

  const opts = { fields: selectedFieldsMapping };
  const filePath = `${Bun.randomUUIDv7("base64url")}-bookings.csv`;
  try {
    const parser = new Parser(opts);
    const csv = parser.parse(data);
    await fs.writeFile(filePath, csv);
    const bunnyStorage = new BunnyStorage(
      process.env.BUNNY_CDN_KEY || "",
      process.env.BUNNY_CDN_ZONE || "",
      process.env.BUNNY_CDN_REGIONE
    );
    const fileBuffer = await fs.readFile(filePath);
    await bunnyStorage.upload(fileBuffer, filePath);
    const expirationTime = 24 * 60 * 60 * 1000; // 24 hours
    const expirationTimestamp = Date.now() + expirationTime;
    const fileUrl = `${process.env.BUNNY_CDN_URL}/${filePath}?Expires=${expirationTimestamp}&AccessKey=${process.env.BUNNY_CDN_PUBLIC_VIEW}`;
    return { success: true, fileUrl };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    try {
      await fs.unlink(filePath);
    } catch (unlinkErr) {
    }
  }
};
