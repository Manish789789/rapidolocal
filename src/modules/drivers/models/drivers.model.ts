import { generateRandomNumbers } from "@/utils";
import mongoose from "mongoose";
import { deleteDriverInRedis, driverDetailsSave } from "@/utils/redisHelper";

const newVehicleInfoSchema = new mongoose.Schema({
  vehiclePhotos: {
    front: { type: String, default: "" },
    back: { type: String, default: "" },
    left: { type: String, default: "" },
    right: { type: String, default: "" },
  },
  vehiclePhoto: { type: String, default: "" },
  chooseColor: { type: String, default: "" },
  vehicleMake: { type: String, default: "" },
  vehicleModel: { type: String, default: "" },
  vehicleYear: { type: String, default: "" },
  vehicleNo: { type: String, default: "" },
  serialNo: { type: String, default: "" },
  vehicleExpiryDate: { type: String, default: "" },
  vehicleInsurancePhoto: { type: String, default: "" },
  vehicleInsurancePolicyNo: { type: String, default: "" },
  vehicleInsuranceExpiryDate: { type: String, default: "" },
  vehicleInsepection: { type: String, default: "" },
  lastInspectionDate: { type: String, default: "" },
});

const DriversSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, default: "" },
    phone: { type: String, default: "", trim: true, unique: true },
    email: { type: String, default: "", trim: true },
    gender: { type: String, default: "", trim: true },
    otp: { type: String, default: "" },
    otpExpireAt: { type: Date, default: new Date(Date.now() + 5 * 60 * 1000) },
    missedBookingAt: { type: Date, default: null },
    password: { type: String, default: "" },
    avatar: {
      type: String,
      default: "",
    },
    socket_id: {
      type: String,
      default: null,
    },
    taxProfileForm: {
      registeredName: { type: String, default: "" },
      streetAddress: { type: String, default: "" },
      city: { type: String, default: "" },
      postCode: { type: String, default: "" },
      province: { type: String, default: "" },
      country: { type: String, default: "" },
      notGstRegistered: { type: Boolean, default: false },
      hstGst: { type: String, default: "" },
      disclaimer: { type: Boolean, default: false },
    },
    wallet: {
      type: Number,
      default: 0.0,
    },
    lifeTimeEarning: {
      type: Number,
      default: 0.0,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    rideCount: { type: Number, default: 0 },
    bio: { type: String, default: "" },
    fcmToken: { type: String, default: "" },
    lastLogin: {
      type: Array,
      default: [],
    },
    forgotPasswordOtp: {
      type: String,
      default: "",
    },
    dob: {
      type: Date,
      default: "",
    },
    theme: {
      type: String,
      default: "default",
    },
    mapSetting: {
      mapSound: { type: Boolean, default: false },
      autoArrive: { type: Boolean, default: false },
      autoComplete: { type: Boolean, default: false },
    },
    stopFutureRide: { type: Boolean, default: false },
    autoAcceptJob: { type: Boolean, default: false },
    autoAcceptDistance: { type: Number, default: 6 },
    vehicleInformation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DriversVehicalInformation",
      default: null,
    },
    vehicleInfo: {
      legalAgreement: { type: Boolean, default: false },
      proofOfWork: { type: String, default: "" },
      workEligibilityExpiryDate: { type: String, default: "" },
      vehicleInsepection: { type: String, default: "" },
      lastInspectionDate: { type: String, default: "" },
      sin: { type: String, default: "" },
      licenseNo: { type: String, default: "" },
      licenseExpiryDate: { type: String, default: "" },
      licensePhoto: { type: String, default: "" },
      licenseBackPhoto: { type: String, default: "" },
      vehicleMake: { type: String, default: "" },
      vehicleModel: { type: String, default: "" },
      vehicleYear: { type: String, default: "" },
      vehicleNo: { type: String, default: "" },
      chooseColor: { type: String, default: "" },
      serialNo: { type: String, default: "" },
      signature: { type: String, default: "" },
      vehicleExpiryDate: { type: String, default: "" },
      vehiclePhoto: { type: String, default: "" },
      vehiclePhotos: {
        front: { type: String, default: "" },
        back: { type: String, default: "" },
        left: { type: String, default: "" },
        right: { type: String, default: "" },
      },
      vehicleInsurancePhoto: { type: String, default: "" },
      vehicleInsurancePolicyNo: { type: String, default: "" },
      vehicleInsuranceExpiryDate: { type: String, default: "" },
      isApproved: { type: Boolean, default: false },
      isDocResubmitted: { type: Boolean, default: false },
      rejectedMessages: { type: Array, default: [] },
      backgroundCheck: { type: String, default: "" },
      driverAbstract: { type: String, default: "" },
    },
    // documents: [
    //   {
    //     docType: {
    //       type: String,
    //       enum: ["driverLicense", "vehicleRegistration", "insurance", "permit"],
    //       required: true,
    //     },
    //     verifiedAI: { type: Boolean, default: false },
    //     verifiedAdmin: { type: Boolean, default: false },
    //     status: {
    //       type: String,
    //       enum: ["pending", "approved", "rejected"],
    //       default: "pending",
    //     },
    //     rejectedReason: { type: String, default: "" },
    //     data: {
    //       type: Object,
    //       default: {},
    //     },
    //     uploadedAt: { type: Date, default: Date.now },
    //   },
    // ],
    address: {
      type: {
        address: { type: String, default: "", trim: true },
        city: { type: String, default: "", trim: true },
        state: { type: String, default: "", trim: true },
        postalCode: { type: String, default: "", trim: true },
        country: { type: String, default: "", trim: true },
      },
    },
    bankDetails: {
      type: Object,
      default: {
        bankName: "",
        accountHolderName: "",
        accountNumber: "",
        institutionNumber: "",
        transitNumber: "",
        swiftOrBIC: "",
      },
    },
    paymentDetails: {
      type: {
        stripeAccountID: { type: String, default: "", trim: true },
        accountLink: { type: String, default: "", trim: true },
        status: { type: String, default: "", trim: true },
      },
    },
    uniqueID: { type: String, default: "", trim: true },
    vehicleTypes: [
      { type: mongoose.Schema.Types.ObjectId, ref: "VehicleTypes" },
    ],
    otherVehicleInfo: { type: [newVehicleInfoSchema], default: [] },
    location: {
      type: { type: String, default: "Point" }, // Specify the type as 'Point' for GeoJSON
      coordinates: [Number], // Array of [longitude, latitude] for GeoJSON
      default: {
        coordinates: [],
      },
    },
    locationAngle: {
      type: Array, // Representing the angle or direction in degrees
      default: [],
    },
    heading: {
      type: Number, // Representing the angle or direction in degrees
      default: 0,
    },
    iAmOnline: {
      type: Boolean, // Representing the angle or direction in degrees
      default: false,
    },
    iAmBusy: {
      type: Boolean, // Representing the angle or direction in degrees
      default: false,
    },
    missedBookingCount: {
      type: Number,
      default: 0,
    },
    isDriverUnderPool: {
      type: Boolean, // Representing the angle or direction in degrees
      default: false,
    },
    requestedAt: {
      type: Date,
      default: null,
    },
    otpCheckCount: {
      type: Number,
      default: 0,
    },
    isBlocked: {
      type: Date,
      default: Date.now,
    },
    blockedMessage: {
      type: String,
      default: "",
    },
    isApproved: { type: Number, default: 0 }, // 0 is pending, 1 is requested, 2 is rejected, 3 is approved
    deletedAt: {
      type: Date,
      default: null,
    },
    country: {
      name: {
        type: String,
        required: [true, "Please enter country."],
        trim: true,
      },
      countryCode: {
        type: String,
        required: [true, "Please enter country code."],
        trim: true,
      },
      province: {
        type: String,
        default: "",
        trim: true,
      },
      currencyCode: {
        type: String,
        required: [true, "Please enter currency code."],
        trim: true,
      },
      currencySymbol: {
        type: String,
        required: [true, "Please enter currency symbol."],
        trim: true,
      },
    },
    rating: { type: Number, default: 5 },
    socialAccount: {
      type: Object,
      default: {
        google: null,
        facebook: null,
        apple: null,
        instagram: null,
        linkdin: null,
      },
    },
    approved_zones: [],
    vehicalInformationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DriversVehicalInformation",
      default: null
    },
    device: {
      type: String,
      default: "",
    },
    version: {
      type: String,
      default: "",
    },
    deviceInfo: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

DriversSchema.pre("save", async function (this: any, next) {
  let color = [
    "AFCFFD",
    "FCC5B7",
    "ABCFE0",
    "9FDEDA",
    "C7D9A8",
    "BFC5EE",
    "E8BBC1",
    "E1C8CE",
  ];
  this.uniqueID = `DRV${generateRandomNumbers(8)}`;
  var item = color[Math.floor(Math.random() * color.length)];
  this.avatar = `https://ui-avatars.com/api/?background=1E1E1E&color=${item}&name=${this.fullName}`;
  // const salt = await bcrypt.genSalt(10);
  // this.password = await bcrypt.hash(this.password, salt);

  next();
});

DriversSchema.index({ location: "2dsphere" });

DriversSchema.post("findOneAndUpdate", async function (doc) {
  if (doc && doc._id) {
    try {
      if (doc?.deletedAt == null) {
        await driverDetailsSave(doc._id, {
          _id: doc._id.toString(),
          fcmToken: doc?.fcmToken || null,
          vehicleInfo: {
            isApproved: doc?.vehicleInfo?.isApproved || false,
          },
          iAmOnline: doc?.iAmOnline || false,
          missedBookingCount: doc?.missedBookingCount || 0,
          missedBookingAt: doc?.missedBookingAt || null,
          stopFutureRide: doc?.stopFutureRide || false,
          iAmBusy: doc?.iAmBusy || false,
          socket_id: doc?.socket_id || null,
          isDriverUnderPool: doc?.isDriverUnderPool || false,
          autoAcceptJob: doc?.autoAcceptJob || false,
          autoAcceptDistance: doc?.autoAcceptDistance || 6,
          fullName: doc?.fullName || "",
          avatar: doc?.avatar || "",
          phone: doc?.phone || "",
        });
        if (!doc?.iAmOnline) {
          await deleteDriverInRedis(doc._id.toString());
        }
      } else {
        await deleteDriverInRedis(doc._id);
      }
    } catch (err) {
      // Optionally log error
    }
  }
});

DriversSchema.post("updateOne", async function (result) {
  try {
    // 'this' is the query, so get the filter to find the _id
    const filter = this.getFilter();

    if (filter && filter._id) {
      const doc = await this.model.findOne(filter);
      if (doc) {
        if (doc?.deletedAt == null) {
          driverDetailsSave(filter._id, {
            _id: doc._id.toString(),
            fcmToken: doc?.fcmToken || null,
            vehicleInfo: {
              isApproved: doc?.vehicleInfo?.isApproved || false,
            },
            iAmOnline: doc?.iAmOnline || false,
            missedBookingCount: doc?.missedBookingCount || 0,
            missedBookingAt: doc?.missedBookingAt || null,
            stopFutureRide: doc?.stopFutureRide || false,
            iAmBusy: doc?.iAmBusy || false,
            socket_id: doc?.socket_id || null,
            isDriverUnderPool: doc?.isDriverUnderPool || false,
            autoAcceptJob: doc?.autoAcceptJob || false,
            autoAcceptDistance: doc?.autoAcceptDistance || 6,
            fullName: doc?.fullName || "",
            avatar: doc?.avatar || "",
            phone: doc?.phone || "",
          });
          if (!doc?.iAmOnline) {
            deleteDriverInRedis(doc._id.toString()).catch(console.error);
          }
        } else {
          deleteDriverInRedis(filter._id).catch(console.error);
        }
      }
    }
  } catch (err) {
    // Optionally log error
  }
});

// DriversSchema.post("updateOne", async function (result) {
//   try {
//     const filter = this.getFilter();
//     const update = this.getUpdate();

//     if (!filter || !filter._id) return;

//     // Extract updated fields directly from the update operation
//     const updatedFields = {
//       ...((update as any)?.$set || {}),
//       ...((update as any)?.$unset ? Object.keys((update as any).$unset).reduce((acc, key) => ({ ...acc, [key]: undefined }), {}) : {}),
//     };

//     // Only proceed if we have meaningful updates for Redis
//     const redisRelevantFields = [
//       'fcmToken', 'vehicleInfo.isApproved', 'iAmOnline', 'missedBookingCount',
//       'missedBookingAt', 'stopFutureRide', 'iAmBusy', 'socket_id',
//       'isDriverUnderPool', 'fullName', 'avatar', 'phone', 'deletedAt'
//     ];

//     const hasRelevantUpdates = redisRelevantFields.some(field =>
//       updatedFields.hasOwnProperty(field) || updatedFields.hasOwnProperty(field.split('.')[0])
//     );

//     if (!hasRelevantUpdates) return;

//     // Prepare payload for Redis with only the updated fields
//     const redisPayload: any = {
//       _id: filter._id.toString(),
//     };

//     // console.log("Updated fields:", updatedFields);
//     // console.log("Preparing Redis payload:", redisPayload);

//     // Add only the fields that were actually updated
//     if (updatedFields.fcmToken !== undefined) redisPayload.fcmToken = updatedFields.fcmToken;
//     if (updatedFields['vehicleInfo.isApproved'] !== undefined || updatedFields.vehicleInfo?.isApproved !== undefined) {
//       redisPayload.vehicleInfo = {
//         isApproved: updatedFields['vehicleInfo.isApproved'] ?? updatedFields.vehicleInfo?.isApproved ?? false
//       };
//     }
//     if (updatedFields.iAmOnline !== undefined) redisPayload.iAmOnline = updatedFields.iAmOnline;
//     if (updatedFields.missedBookingCount !== undefined) redisPayload.missedBookingCount = updatedFields.missedBookingCount;
//     if (updatedFields.missedBookingAt !== undefined) redisPayload.missedBookingAt = updatedFields.missedBookingAt;
//     if (updatedFields.stopFutureRide !== undefined) redisPayload.stopFutureRide = updatedFields.stopFutureRide;
//     if (updatedFields.iAmBusy !== undefined) redisPayload.iAmBusy = updatedFields.iAmBusy;
//     if (updatedFields.socket_id !== undefined) redisPayload.socket_id = updatedFields.socket_id;
//     if (updatedFields.isDriverUnderPool !== undefined) redisPayload.isDriverUnderPool = updatedFields.isDriverUnderPool;
//     if (updatedFields.fullName !== undefined) redisPayload.fullName = updatedFields.fullName;
//     if (updatedFields.avatar !== undefined) redisPayload.avatar = updatedFields.avatar;
//     if (updatedFields.phone !== undefined) redisPayload.phone = updatedFields.phone;

//     // Handle driver going offline or being deleted
//     if (updatedFields.iAmOnline === false || updatedFields.deletedAt !== undefined) {
//       deleteDriverInRedis(filter._id.toString()).catch(console.error);
//     } else {
//       // Fire & forget Redis writes to avoid blocking the update operation
//       driverDetailsSave(filter._id.toString(), redisPayload).catch(console.error);
//     }
//   } catch (err) {
//     console.error("Post-update error:", err);
//   }
// });

DriversSchema.post("updateMany", async function (result) {
  try {
    // 'this' is the query, so get the filter to find the _id(s)
    const filter = this.getFilter();

    // Find all matching documents
    const docs = await this.model.find(filter);
    for (const doc of docs) {
      if (doc?.deletedAt == null) {
        await driverDetailsSave(doc._id, {
          _id: doc._id.toString(),
          fcmToken: doc?.fcmToken || null,
          vehicleInfo: {
            isApproved: doc?.vehicleInfo?.isApproved || false,
          },
          iAmOnline: doc?.iAmOnline || false,
          missedBookingCount: doc?.missedBookingCount || 0,
          missedBookingAt: doc?.missedBookingAt || null,
          stopFutureRide: doc?.stopFutureRide || false,
          iAmBusy: doc?.iAmBusy || false,
          socket_id: doc?.socket_id || null,
          isDriverUnderPool: doc?.isDriverUnderPool || false,
          autoAcceptJob: doc?.autoAcceptJob || false,
          autoAcceptDistance: doc?.autoAcceptDistance || 6,
          fullName: doc?.fullName || "",
          avatar: doc?.avatar || "",
          phone: doc?.phone || "",
        });
        if (!doc?.iAmOnline) {
          await deleteDriverInRedis(doc._id.toString());
        }
      } else {
        await deleteDriverInRedis(doc._id);
      }
    }
  } catch (err) {
    // Optionally log error
  }
});

export default mongoose.models?.Drivers ||
  mongoose.model("Drivers", DriversSchema);
