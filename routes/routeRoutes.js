const router = require("express").Router();
const { generateOptimizedRoute, getDriverCurrentRoute, getAdminAllRoutes, getAdminSingleRoute, updateAdminRoute, deleteAdminRoute, completeWaypoint, getDriverTasksTable } = require("../controllers/RouteController");

const { verifyTokenAndAdmin, verifyTokenAndDriver } = require("../middleware/verifyToken");

// =========================================================================
// 👑 مسارات الأدمن (Admin Endpoints)
// =========================================================================

router.route("/")
    .post(verifyTokenAndAdmin, generateOptimizedRoute)       // أي مستخدم مسجل دخول يمكنه إرسال طلب جديد
    .get(verifyTokenAndAdmin, getAdminAllRoutes); // فقط الأدمن يستطيع رؤية جميع الطلبات المرفوعة


// =========================================================================
// 🚚 مسارات السائق (Driver Endpoints)
// =========================================================================

// 🗺️ 2. جلب خريطة الطريق اليومية المرتبة للسائق المسجل حالياً
// المحارسة تضمن: جلب مسار صاحب التوكن الحالي إذا كانت رتبته "سائق"
router.route("/my-route")
    .get(verifyTokenAndDriver , getDriverCurrentRoute)

router.route("/admin/:id")
    .put(verifyTokenAndAdmin, updateAdminRoute)
    .delete(verifyTokenAndAdmin, deleteAdminRoute);

router.route("/driver-task")
    .get(verifyTokenAndDriver , getDriverTasksTable)

router.route("/:id")
    .put(verifyTokenAndDriver,completeWaypoint ) 
    .get(verifyTokenAndAdmin, getAdminSingleRoute)


module.exports = router;
