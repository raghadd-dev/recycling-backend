const router = require("express").Router();


const { getContactInfo, createContactInfo, updateContactInfo, addNewWasteTypeDynamic, updateWasteTypePoints } = require("../controllers/contactInfoController");
// استيراد الـ Middlewares الخاصة بالتحقق والأمان من مشروعكِ
// (تأكدي من مطابقة الأسماء والمسار لمجلد الـ middlewares عندكِ)
const { verifyToken, verifyTokenAndAdmin,  } = require("../middleware/verifyToken"); 


// =========================================================================
// 🌐 1. مسارات معلومات التواصل الثابتة (القسم الأيمن من الواجهة)
// =========================================================================

// أ) جلب معلومات التواصل (عام لجميع الزوار - يغذي الكروت مباشرة)
router.get("/info", getContactInfo);

// ب) إنشاء السجل الموحد لأول مرة (للأدمن فقط - محمي ومقيد بسجل واحد دائم)
router.post("/info", verifyTokenAndAdmin , createContactInfo);

// ج) تحديث وتعديل البيانات الرسمية (للأدمن فقط - لتعديل الهاتف أو الإيميل مستقبلاً)
router.put("/info", verifyTokenAndAdmin, updateContactInfo);

router.post("/info/waste-type", verifyTokenAndAdmin, addNewWasteTypeDynamic);

router.put("/info/waste-type", verifyTokenAndAdmin, updateWasteTypePoints);

module.exports = router;
