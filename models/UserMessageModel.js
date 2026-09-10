const mongoose = require("mongoose");

const userMessageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: "" },
    subject: { type: String, required: true },
    messageText: { type: String, required: true },
    isRead: { type: Boolean, default: false } // يساعد المسؤول على فرز الرسائل المقروءة وغير المقروءة
}, { timestamps: true });

module.exports = mongoose.model("UserMessage", userMessageSchema);
