const router = require("express").Router();

const { sendNewMessage, getAllUserMessages } = require("../controllers/userMessageController");
const { verifyToken, verifyTokenAndAdmin,  } = require("../middleware/verifyToken"); 

// أ) إرسال رسالة جديدة عبر الفورم (عام لجميع زوار الموقع بدون تسجيل دخول)
router.post("/send", sendNewMessage);

// ب) جلب جميع الرسائل الواردة لقراءتها (للأدمن فقط داخل لوحة التحكم)
router.get("/", verifyTokenAndAdmin ,getAllUserMessages);


module.exports = router;