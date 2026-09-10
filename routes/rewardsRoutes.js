const express = require("express");

const router = express.Router();

const {
    createReward,
    getRewards,
    updateReward,
    deleteReward
} = require("../controllers/rewardsController");

const {
    verifyToken,
    verifyTokenAndAdmin
} = require("../middleware/verifyToken");


// ========================================
// Reward operations
// ========================================

router.route("/")

    // Admin only
    .post(
        verifyTokenAndAdmin,
        createReward
    )

    // Logged-in users and admins
    .get(
        verifyToken,
        getRewards
    );


// ========================================
// Reward operations by ID
// ========================================

router.route("/:id")

    // Admin only
    .put(
        verifyTokenAndAdmin,
        updateReward
    )

    // Admin only
    .delete(
        verifyTokenAndAdmin,
        deleteReward
    );


module.exports = router;