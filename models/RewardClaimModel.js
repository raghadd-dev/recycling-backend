const mongoose = require("mongoose");

const rewardClaimSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        rewardId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Reward",
            required: true,
        },
        pointsSpent: {
            type: Number,
            required: true,
        },
        status: {
            type: String,
            enum: ["waiting_next_pickup", "delivered", "cancelled"],
            default: "waiting_next_pickup", // الحالة الافتراضية: بانتظار طلب التدوير القادم لشحنها معاً
        },
        // 🔄 لربط المكافأة بطلب إعادة التدوير الذي ستخرج معه (يتم تعبئته لاحقاً عند موافقة الأدمن على طلب التدوير التالي)
        associatedRecycleRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RecycleRequest", 
            default: null
        },
        notes: {
            type: String, // لأي ملاحظات يكتبها اليوزر أثناء الاستبدال
        }
    },
    { timestamps: true }
);



const RewardClaim = mongoose.model("RewardClaim", rewardClaimSchema);
module.exports = RewardClaim;
