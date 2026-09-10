const express = require("express");
const router = express.Router();
const { getProfile, updateMyProfile, getAllUsers ,submitDriverDocuments, adminCompleteDriverSignup, adminUpdateUserOrDriver} = require("../controllers/userController");
const { verifyToken, verifyTokenAndAdmin, verifyTokenAndDriver } = require("../middleware/verifyToken"); // حماية التوكن والـ Admin
const photoUpload = require("../middleware/photoUpload");

// 📌 مسار جلب جميع المستخدمين مع الباجينيشن والبحث (مخصص للأدمن فقط)
router.route("/")
    .get(verifyTokenAndAdmin, getAllUsers);

// 📌 مسار موحد لملف الحساب الشخصي (يجلب ويحدث تلقائياً حسب صاحب التوكن)
router.route("/profile")
    .get(verifyToken, getProfile)
    .put(verifyToken, updateMyProfile);
   
  
router.put("/admin/update-profile/:id", verifyTokenAndAdmin, adminUpdateUserOrDriver)

router.put(
    "/admin/complete-signup/:id",
    verifyTokenAndAdmin,
    photoUpload.fields([
        { name: "nationalIdImage", maxCount: 1 },
        { name: "licenseImage", maxCount: 1 },
        { name: "personalImage", maxCount: 1 }
    ]),
    adminCompleteDriverSignup
);

router.put(
    "/driver/complete-signup",
    verifyTokenAndDriver,
    photoUpload.fields([ // 👈 تم التعديل إلى photoUpload لتطابق مشروعكِ تماماً
        { name: "nationalIdImage", maxCount: 1 }, // صورة الهوية
        { name: "licenseImage", maxCount: 1 },    // صورة الرخصة
        { name: "personalImage", maxCount: 1 }    // الصورة الشخصية
    ]),
    submitDriverDocuments
);




module.exports = router;