const router = require("express").Router();

const {getRemainingAdminStats, getDriverDashboardStats, getUserDashboardStats, getLandingPageStats, getAdminReportsDashboard} = require("../controllers/statesController");
const { verifyTokenAndAdmin, verifyTokenAndDriver, verifyToken } = require("../middleware/verifyToken");

// تفعيل المسارات تحت اسم رئيسي واضح ومحمي

router.route("/admin-stats")
    .get(verifyTokenAndAdmin ,getRemainingAdminStats )

router.route("/admin-report")
    .get(verifyTokenAndAdmin ,getAdminReportsDashboard )

router.route("/driver-stats")
    .get(verifyTokenAndDriver ,getDriverDashboardStats )


router.route("/user-stats")
    .get(verifyToken ,getUserDashboardStats )

    router.route("/landing-page")
    .get(getLandingPageStats )

module.exports = router;