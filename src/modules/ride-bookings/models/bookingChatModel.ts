import * as mongoose from "mongoose";

const senderSchema = new mongoose.Schema({
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Drivers",
        default: null,
        required: false,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users",
        default: null,
        required: false,
    },
});

const BookingChatMessagesSchema = new mongoose.Schema(
    {
        chat: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CabBookings",
            required: true,
            index: true,
        },
        sender: senderSchema,
        content: {
            type: String,
            required: true,
        },
        contentType: {
            type: String,
            enum: [
                "message",
                "notification",
                "image",
                "file",
                "doc",
                "audioCall",
                "videoCall",
            ],
            default: "message",
            required: true,
        },
        seenAt: {
            type: Date,
            default: null,
        },
        status: {
            type: String,
            default: 'sent',
        },
    },
    { timestamps: true }
);

export default mongoose.model("BookingChatMessages", BookingChatMessagesSchema);
