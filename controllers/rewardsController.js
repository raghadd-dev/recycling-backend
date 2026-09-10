const asyncHandler = require("express-async-handler");
const {
    Reward,
    validateCreateReward,
    validateUpdateReward
} = require("../models/RewardModel");

const { User } = require("../models/User");
const RewardClaim = require("../models/RewardClaimModel");


// ========================================
// ➕ Create Reward
// ========================================
module.exports.createReward = asyncHandler(async (req, res) => {

    req.body = req.body || {};

    const { error } = validateCreateReward(req.body);

    if (error) {
        return res.status(400).json(
            error.details.map(d => d.message.replace(/["]/g, ""))
        );
    }

    const reward = new Reward(req.body);

    await reward.save();

    res.status(201).json({
        message: "تم إنشاء المكافأة بنجاح",
        reward
    });
});


// ========================================
// 📋 Get Rewards
// User:
// - reward statistics
// - active rewards
//
// Admin:
// - admin statistics
// - rewards
// ========================================
module.exports.getRewards = asyncHandler(async (req, res) => {

    const { category } = req.query;

    let filter = {};

    // Category filter
    if (category && category !== "all") {
        filter.category = category;
    }


    // ========================================
    // 👑 Admin
    // ========================================
    if (req.user && req.user.role === "admin") {

        const [
            rewards,
            totalPointsDistributed,
            totalClaimedData,
            totalBeneficiaries,
            totalUsers
        ] = await Promise.all([

            Reward.find(filter)
                .sort({ createdAt: -1 }),

            User.aggregate([
                {
                    $group: {
                        _id: null,
                        total: {
                            $sum: "$points"
                        }
                    }
                }
            ]),

            Reward.aggregate([
                {
                    $group: {
                        _id: null,
                        total: {
                            $sum: "$claimedCount"
                        }
                    }
                }
            ]),

            User.countDocuments({
                points: {
                    $gt: 0
                }
            }),

            User.countDocuments()
        ]);


        const totalPoints =
            totalPointsDistributed.length > 0
                ? totalPointsDistributed[0].total
                : 0;

        const totalClaimed =
            totalClaimedData.length > 0
                ? totalClaimedData[0].total
                : 0;

        const averagePoints =
            totalUsers > 0
                ? Math.round(totalPoints / totalUsers)
                : 0;


        return res.status(200).json({

            success: true,

            isAdmin: true,

            stats: {
                totalPointsDistributed: totalPoints,
                totalClaimedCount: totalClaimed,
                beneficiariesCount: totalBeneficiaries,
                consumptionRate: averagePoints
            },

            rewards

        });
    }


    // ========================================
    // 👤 Normal User
    // ========================================

    const userId = req.user._id || req.user.id || req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
        return res.status(404).json({
            message: "المستخدم غير موجود"
        });
    }


    // ========================================
    // Get user's reward claims count
    // ========================================

    const totalRedeemedRewards =
        await RewardClaim.countDocuments({
            userId
        });


    // ========================================
    // Get available rewards count
    // ========================================

    const availableRewards =
        await Reward.countDocuments({
            ...filter,
            isActive: true,
            stock: {
                $gt: 0
            }
        });
    // ========================================
    // Get active rewards list
    // ========================================

    const activeRewards =
        await Reward.find({
            ...filter,
            isActive: true
        })
            .sort({
                pointsRequired: 1
            });


    // ========================================
    // User response
    // ========================================

    return res.status(200).json({

        success: true,

        isAdmin: false,

        stats: {
            currentPoints: user.points,
            totalPointsEarned: null,
            totalRedeemedRewards,
            availableRewards,
        },

        rewards: activeRewards

    });

});


// ========================================
// ✏️ Update Reward
// ========================================
module.exports.updateReward = asyncHandler(async (req, res) => {

    req.body = req.body || {};

    const { error } = validateUpdateReward(req.body);

    if (error) {
        return res.status(400).json(
            error.details.map(d => d.message.replace(/["]/g, ""))
        );
    }


    const reward = await Reward.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
            new: true,
            runValidators: true
        }
    );


    if (!reward) {
        return res.status(404).json({
            error: "المكافأة غير موجودة"
        });
    }


    res.status(200).json({
        message: "تم تحديث المكافأة بنجاح",
        reward
    });

});


// ========================================
// 🗑 Delete Reward
// ========================================
module.exports.deleteReward = asyncHandler(async (req, res) => {

    const reward = await Reward.findById(
        req.params.id
    );


    if (!reward) {
        return res.status(404).json({
            error: "المكافأة غير موجودة"
        });
    }


    await Reward.findByIdAndDelete(
        req.params.id
    );


    res.status(200).json({
        message: "تم حذف المكافأة بنجاح"
    });

});