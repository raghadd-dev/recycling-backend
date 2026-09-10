const express = require("express");
const router = express.Router();
const {
    createWasteRequest,
    getWasteRequests,
    getWasteRequestById,
    updateWasteRequest,
    deleteWasteRequest,
    getMyWasteRequests
} = require("../controllers/wasteRequestController"); 

// استيراد الـ Middlewares الخاصة بالحماية والتحقق من التوكن والأدوار
const { verifyToken, verifyTokenAndAdmin } = require("../middleware/verifyToken");
const photoUpload = require("../middleware/photoUpload");

// 1️⃣ تاريخ طلباتي للمستخدم الحالي
router.route("/myrequest")
    .get(verifyToken, getMyWasteRequests);

// 2️⃣ العمليات الأساسية على جذر طلبات النفايات
router.route("/")
    .post(verifyToken, photoUpload.single("image"), createWasteRequest)
    .get(verifyTokenAndAdmin, getWasteRequests);

// 3️⃣ العمليات المبنية على معرف الطلب الفردي (ID)
router.route("/:id")
    .get(verifyToken, getWasteRequestById)
    .put(verifyToken, updateWasteRequest)
    .delete(verifyToken, deleteWasteRequest);

module.exports = router;