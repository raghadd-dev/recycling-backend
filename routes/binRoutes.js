const express = require("express");

const router = express.Router();

const {
    getBins,
    getBinById,
    createBin,
    updateBin,
    getBinStats,
    getBinsForMap
} = require("../controllers/binController");

const { verifyTokenAndAdmin, verifyTokenAndAdminAndDriver } = require("../middleware/verifyToken");

// Get all bins
router.get("/", verifyTokenAndAdminAndDriver, getBins);

// Create new bin
router.post("/", verifyTokenAndAdmin, createBin);

// Get bins statistics
router.get("/stats", verifyTokenAndAdminAndDriver, getBinStats);

// Get bins for map
router.get("/map", verifyTokenAndAdminAndDriver, getBinsForMap);

// Get one bin
router.get("/:id", verifyTokenAndAdminAndDriver, getBinById);

// Update bin
router.put("/:id", verifyTokenAndAdmin, updateBin);

module.exports = router;