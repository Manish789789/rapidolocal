import * as mongoose from "mongoose";

const paymentMethodSchema = new mongoose.Schema({
    methodId: {
        type: String,
        required: [true, "Payment method id is missing"],
        trim: true,
    },
    brand: {
        type: String,
        required: [true, "Payment method brand is missing"],
        trim: true,
    },
    cardType: {
        type: String,
        required: [true, "Payment method cardType is missing"],
        trim: true,
    },
    last4: {
        type: String,
        required: [true, "Payment method last4 is missing"],
        trim: true,
    },
});

const BusinessProfilesSchema = new mongoose.Schema({
    companyName: {
        type: String,
        required: [true, "Please enter company name"],
        trim: true,
    },
    workEmail: {
        type: String,
        required: [true, "Please enter work email"],
        trim: true,
    },
    receiptForwardEmail: {
        type: String,
        required: [true, "Please enter receipt forward email"],
        trim: true,
    },
    paymentMethod: paymentMethodSchema,
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users"
    }
},
    { timestamps: true }
);

export default mongoose.model("businessProfiles", BusinessProfilesSchema);
