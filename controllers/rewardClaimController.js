const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const { User } = require("../models/User");
const { Reward } = require("../models/RewardModel");
const RewardClaim = require("../models/RewardClaimModel");


// ==========================================
// 🎁 Claim Reward
// ==========================================
const claimReward = asyncHandler(async (req, res) => {

    const {
        rewardId,
        notes
    } = req.body;

    const userId = req.user._id || req.user.id || req.user.userId;

    if (!mongoose.isValidObjectId(rewardId)) {
        return res.status(400).json(["معرف المكافأة غير صالح، يرجى اختيار المكافأة من القائمة مرة أخرى"]);
    }

    if (!mongoose.isValidObjectId(userId)) {
        return res.status(401).json(["جلسة المستخدم غير صالحة، يرجى تسجيل الدخول من جديد"]);
    }


    // 1. Check reward
    const reward = await Reward.findById(rewardId);

    if (!reward) {
        return res.status(404).json([
            "المكافأة غير موجودة"
        ]);
    }


    // 2. Check if reward is active
    if (!reward.isActive) {
        return res.status(400).json([
            "المكافأة غير متوفرة حالياً"
        ]);
    }


    // 3. Check stock
    if (reward.stock <= 0) {
        return res.status(400).json([
            "المكافأة نفدت من الكمية"
        ]);
    }


    // 4. Get current user
    const user = await User.findById(userId);

    if (!user) {
        return res.status(404).json([
            "المستخدم غير موجود"
        ]);
    }


    // 5. Check points
    if (user.points < reward.pointsRequired) {
        return res.status(400).json([
            "النقاط غير كافية"
        ]);
    }


    // 6. Deduct points
    user.points -= reward.pointsRequired;

    await user.save();


    // 7. Decrease stock
    reward.stock -= 1;

    reward.claimedCount += 1;

    await reward.save();


    // 8. Create reward claim
    const newClaim = new RewardClaim({

        userId,

        rewardId,

        pointsSpent: reward.pointsRequired,

        notes: notes || "",

        status: "waiting_next_pickup"

    });


    await newClaim.save();


    // 9. Response
    res.status(201).json({

        message: "تم طلب المكافأة بنجاح",

        currentPoints: user.points,

        status: newClaim.status,

        claim: newClaim

    });

});



// ==========================================
// 🎁 Get reward claims
//
// Admin:
// Gets all reward claims
//
// User:
// Gets only their own reward claims
// ==========================================
const getAllClaims = asyncHandler(async (req, res) => {

    let claims;


    // ======================================
    // Admin
    // ======================================

    if (req.user.role === "admin") {

        claims = await RewardClaim.find()
            .populate(
                "userId",
                "name email phone"
            )
            .populate(
                "rewardId",
                "title category pointsRequired stock"
            )
            .populate(
                "associatedRecycleRequestId"
            )
            .sort({
                createdAt: -1
            });

    }


    // ======================================
    // Normal user
    // ======================================

    else {

        claims = await RewardClaim.find({
            userId: req.user._id || req.user.id || req.user.userId
        })
            .populate(
                "rewardId",
                "title category pointsRequired"
            )
            .populate(
                "associatedRecycleRequestId"
            )
            .sort({
                createdAt: -1
            });

    }


    // ======================================
    // Response
    // ======================================

    res.status(200).json({

        success: true,

        message:
            req.user.role === "admin"
                ? "تم جلب جميع طلبات المكافآت بنجاح"
                : "تم جلب طلبات المكافآت الخاصة بك بنجاح",

        count: claims.length,

        data: claims

    });

});



// ==========================================
// 🔄 Update reward claim status
// Admin only
// ==========================================
const updateClaimStatus = asyncHandler(async (req, res) => {

    const {
        status
    } = req.body;


    // 1. Validate status
    const allowedStatuses = [
        "waiting_next_pickup",
        "delivered",
        "cancelled"
    ];
    if (!allowedStatuses.includes(status)) {

        return res.status(400).json({
            message: "حالة طلب المكافأة غير صالحة"
        });

    }


    // 2. Find claim
    const claim = await RewardClaim.findById(
        req.params.id
    );


    if (!claim) {

        return res.status(404).json({
            message: "طلب المكافأة غير موجود"
        });

    }


    // 3. Update status
    claim.status = status;


    await claim.save();


    // 4. Response
    res.status(200).json({

        message: "تم تحديث حالة طلب المكافأة بنجاح",

        claim

    });

});



module.exports = {
    claimReward,
    getAllClaims,
    updateClaimStatus
};