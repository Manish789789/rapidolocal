import * as mongoose from "mongoose";

const CardNavigationsSchema = new mongoose.Schema({
    backgroundColor: {
        type: String,
        default: "#dbeafe",
        trim: true,
    },
    textColor: {
        type: String,
        default: "#1d4ed8",
        trim: true,
    },
    mainHeading: {
        type: String,
        default: "Pre Book your ride and relax!",
        trim: true,
    },
    subHeading: {
        type: String,
        default: "Go anywhere with us!",
        trim: true,
    },
    imageUrl: {
        type: String,
        default: "",
        trim: true,
    },
    navigateUrl: {
        type: String,
        default: "PrivacyPolicy",
        trim: true,
    },
}, { timestamps: true });

export default mongoose.model("cardNavigations", CardNavigationsSchema);
