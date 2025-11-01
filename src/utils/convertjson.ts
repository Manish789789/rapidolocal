import { Parser } from "json2csv";
import fs from "fs/promises";
import BunnyStorage from "bunnycdn-storage";

export const convertJson = async (data: any, selectedFields: any) => {
  // Map Approval Status for consistency
  const mapApprovalStatus = (status: any) => {
    const statusMap: any = {
      0: "Pending",
      1: "Requested",
      2: "Rejected",
      3: "Approved",
    };
    return statusMap[status] || "Unknown"; // Default to "Unknown" if status is unexpected
  };

  // Full field list (potentially contains fields not selected)
  const fields = [
    { label: "Driver ID", value: "uniqueID" },
    { label: "Full Name", value: "fullName" },
    { label: "Email Address", value: "email" },
    { label: "Total Earnings", value: "lifeTimeEarning" },
    { label: "Total Rides", value: "rideCount" },
    { label: "Bio", value: "bio" },
    { label: "State", value: "address.state" },
    { label: "Currency Code", value: "country.currencyCode" },
    { label: "Unique ID", value: "uniqueID" },
    {
      label: "Approval Status",
      value: (row: any) => mapApprovalStatus(row.isApproved),
    },
    { label: "Phone", value: "phone" },
    { label: "Wallet Balance", value: "wallet" },
    { label: "Verified", value: "isVerified" },
    { label: "Date Of Birth", value: "dob" },
    { label: "Blocked", value: "isBlocked" },
    { label: "Rating", value: "rating" },
    { label: "City", value: "address.city" },
    { label: "Country", value: "country.name" },
    { label: "Currency Symbol", value: "country.currencySymbol" },
  ];

  // Filter fields based on selected fields
  const selectedFieldsMapping = fields
    .filter((field) => selectedFields.includes(field.value))
    .map((field) => ({
      label: field.label,
      value: field.value,
    }));

  // CSV generation options
  const opts = { fields: selectedFieldsMapping };
  const filePath = `${Bun.randomUUIDv7("base64url")}-drivers.csv`;

  try {
    // Convert data to CSV
    const parser = new Parser(opts);
    const csv = parser.parse(data);

    // Write the CSV file locally
    await fs.writeFile(filePath, csv);

    // Initialize Bunny CDN Storage
    const bunnyStorage = new BunnyStorage(
      process.env.BUNNY_CDN_KEY || "",
      process.env.BUNNY_CDN_ZONE || "",
      process.env.BUNNY_CDN_REGIONE
    );

    // Read the file buffer
    const fileBuffer = await fs.readFile(filePath);

    // Upload the CSV to Bunny CDN
    await bunnyStorage.upload(fileBuffer, filePath);

    // Generate an expiration timestamp for the file URL
    const expirationTime = 24 * 60 * 60 * 1000; // 24 hours
    const expirationTimestamp = Date.now() + expirationTime;
    const fileUrl = `${process.env.BUNNY_CDN_URL}/${filePath}?Expires=${expirationTimestamp}&AccessKey=${process.env.BUNNY_CDN_PUBLIC_VIEW}`;

    // Return success with the file URL
    return { success: true, fileUrl };
  } catch (err: any) {
    return { success: false, error: err.message };
  } finally {
    // Clean up the local file after processing
    try {
      await fs.unlink(filePath);
    } catch (unlinkErr) {}
  }
};
