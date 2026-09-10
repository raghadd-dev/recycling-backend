const express = require("express");

const router = express.Router();

const {
    claimReward,
    getAllClaims,
    updateClaimStatus
} = require("../controllers/rewardClaimController");

const {
    verifyToken,
    verifyTokenAndAdmin
} = require("../middleware/verifyToken");


// ==========================================
// Claim reward
// ==========================================
router.post(
    "/claim",
    verifyToken,
    claimReward
);


// ==========================================
// Get claims
//
// User:
// own claims
//
// Admin:
// all claims
// ==========================================
router.get(
    "/",
    verifyToken,
    getAllClaims
);


// ==========================================
// Admin update claim status
// ==========================================
router.put(
    "/:id/status",
    verifyTokenAndAdmin,
    updateClaimStatus
);


module.exports = router;