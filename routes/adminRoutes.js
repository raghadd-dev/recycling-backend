const express = require("express");
const router = express.Router();

const { verifyTokenAndAdmin } = require("../middleware/verifyToken");
const adminController = require("../controllers/adminController");

// 📊 1. لوحة التحكم الرئيسية (Dashboard) - الكروت والجدول والرسم البياني
router.get("/dashboard", verifyTokenAndAdmin, adminController.getAdminDashboardData);

// 👥 2. شاشة إدارة الحسابات الموحدة (تعرض الكل، وتعالج فلاتر المعلقين والبحث)
router.get("/users/all", verifyTokenAndAdmin, adminController.getAdminUsersAndStats);

// 📌 3. مسار التوغل الموحد للحظر والفك (Toggle Ban)
router.put("/toggle-ban/:userId", verifyTokenAndAdmin, adminController.toggleUserBan);

module.exports = router;
