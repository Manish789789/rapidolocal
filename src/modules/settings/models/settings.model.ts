import mongoose from "mongoose";

const SettingsSchema = new mongoose.Schema(
  {
    defaultSettings: {
      smsGateway: { type: String, default: "twilio" },
      emailGateway: { type: String, default: "zepto" },
      paymentGateway: { type: String, default: "stripe" },
      paymentPayout: { type: String, default: "stripe" },
      pushNotification: { type: String, default: "firebase" },
      callGateway: { type: String, default: "twilio" },
    },
    rideAllocation: {
      type: Object,
      default: {},
    },
    paymentGateway: {
      stripe: {
        activeMode: {
          type: String,
          enum: ["testMode", "liveMode"],
          default: "testMode",
        },
        countries: [{ type: mongoose.Schema.Types.ObjectId, ref: "Countries" }],
        testMode: {
          publishableKey: { type: String, default: "" },
          secretKey: { type: String, default: "" },
        },
        liveMode: {
          publishableKey: { type: String, default: "" },
          secretKey: { type: String, default: "" },
        },
      },
      squareup: {
        activeMode: {
          type: String,
          enum: ["testMode", "liveMode"],
          default: "testMode",
        },
        countries: [{ type: mongoose.Schema.Types.ObjectId, ref: "Countries" }],
        testMode: {
          accessToken: { type: String, default: "" },
          applicationId: { type: String, default: "" },
          signatureKey: { type: String, default: "" },
        },
        liveMode: {
          accessToken: { type: String, default: "" },
          applicationId: { type: String, default: "" },
          signatureKey: { type: String, default: "" },
        },
      },
    },
    payoutGateway: {
      rcb: {
        activeMode: {
          type: String,
          enum: ["testMode", "liveMode"],
          default: "testMode",
        },
        countries: [{ type: mongoose.Schema.Types.ObjectId, ref: "Countries" }],
        testMode: {
          publicKey: { type: String, default: "" },
          secretKey: { type: String, default: "" },
        },
        liveMode: {
          publicKey: { type: String, default: "" },
          secretKey: { type: String, default: "" },
        },
      },
      stripe: {
        activeMode: {
          type: String,
          enum: ["testMode", "liveMode"],
          default: "testMode",
        },
        countries: [{ type: mongoose.Schema.Types.ObjectId, ref: "Countries" }],
        testMode: {
          publishableKey: { type: String, default: "" },
          secretKey: { type: String, default: "" },
        },
        liveMode: {
          publishableKey: { type: String, default: "" },
          secretKey: { type: String, default: "" },
        },
      },
    },
    emailGateway: {
      zepto: {
        countries: [{ type: mongoose.Schema.Types.ObjectId, ref: "Countries" }],
        apiUrl: { type: String, default: "" },
        mailToken: { type: String, default: "" },
        fromEmail: { type: String, default: `noreply@example.com` },
        fromName: { type: String, default: `Ride sharing Team` },
      },
      smtp: {
        countries: [{ type: mongoose.Schema.Types.ObjectId, ref: "Countries" }],
        host: { type: String, default: "" },
        port: { type: String, default: "" },
        username: { type: String, default: "" },
        password: { type: String, default: "" },
        fromEmail: { type: String, default: `noreply@example.com` },
        fromName: { type: String, default: `Ride sharing Team` },
      },
    },
    smsGateway: {
      twilio: {
        countries: [{ type: mongoose.Schema.Types.ObjectId, ref: "Countries" }],
        accountSid: { type: String, default: "" },
        authToken: { type: String, default: "" },
        fromNumber: { type: String, default: "" },
      },
      msg91: {
        countries: [{ type: mongoose.Schema.Types.ObjectId, ref: "Countries" }],
        authKey: { type: String, default: "" },
        senderId: { type: String, default: "" },
        route: { type: String, default: "4" },
        templateId: { type: String, default: "" },
      },
    },
    callGateway: {
      twilio: {
        countries: [{ type: mongoose.Schema.Types.ObjectId, ref: "Countries" }],
        endpoint: { type: String, default: "" },
        phoneNumbers: [{ type: String, default: "" }],
      },
    },
    pushNotification: {
      firebase: {
        serverKey: { type: String, default: "" },
      },
      aws: {
        accessKeyId: { type: String, default: "" },
        secretAccessKey: { type: String, default: "" },
        region: { type: String, default: "" },
        applicationArn: { type: String, default: "" },
      },
    },
    userAppSettings: {
      type: Object,
      default: {},
    },
    driverAppSettings: {
      type: Object,
      default: {},
    },
    map: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

export default mongoose.model("Settings", SettingsSchema);
