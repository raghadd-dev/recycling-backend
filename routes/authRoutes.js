const express = require("express");

const router = express.Router();

const {
    register,
    checkRegistrationEmail,
    login,
    sendForgotPasswordCode,
    verifyCodeCtrl,
    updatePasswordCtrl,
    createAdminUser
} = require("../controllers/authController");

const { verifyToken, verifyTokenAndAdmin } = require("../middleware/verifyToken");
const photoUpload = require("../middleware/photoUpload");

router.post(
    "/register",
    photoUpload.fields([
        { name: "nationalIdImage", maxCount: 1 },
        { name: "licenseImage", maxCount: 1 },
        { name: "personalImage", maxCount: 1 }
    ]),
    register
);

router.post("/login", login);
router.post("/check-email", checkRegistrationEmail);

// روت مخصص للأدمن لإنشاء مستخدم أو سائق جديد يدوياً في النظام
router.post("/admin/create-user", verifyTokenAndAdmin , createAdminUser);


router.get(
    "/profile",
    verifyToken,
    (req, res) => {
        return res.status(200).json({
            user: req.user
        });
    }
);
router.post("/forgot-password", sendForgotPasswordCode);

router.post("/verify-code", verifyCodeCtrl);

router.post("/update-password", updatePasswordCtrl);


module.exports = router;