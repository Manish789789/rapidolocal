import * as mongoose from "mongoose";

const PaymentMethodsSchema = new mongoose.Schema({
    methodId: {
        type: String,
        trim: true,
        default: '',
    },
    squareMethodId: {
        type: String,
        trim: true,
        default: '',
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
    isDefault: {
        type: Boolean,
        default: false,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users"
    }
},
    { timestamps: true }
);

export default mongoose.model("paymentMethods", PaymentMethodsSchema);
