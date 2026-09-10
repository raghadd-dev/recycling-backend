const asyncHandler = require("express-async-handler");
const UserMessage = require("../models/UserMessageModel");

// ==========================================
// 📩 1. إرسال رسالة جديدة (للفورم الأيسر بالواجهة - عام لجميع الزوار)
// ==========================================
module.exports.sendNewMessage = asyncHandler(async (req, res) => {
    const { name, email, phone, subject, messageText } = req.body;

    // حسم المدخلات: التحقق من تعبئة الحقول الإلزامية في التصميم
    if (!name || !email || !subject || !messageText) {
        return res.status(400).json(["جميع الحقول الأساسية (الاسم، البريد، الموضوع، نص الرسالة) مطلوبة"]);
    }

    // إنشاء وحفظ الرسالة الجديدة في جدولها المستقل
    const newMessage = new UserMessage({
        name,
        email,
        phone: phone || "",
        subject,
        messageText
    });

    await newMessage.save();

    res.status(201).json({
        success: true,
        message: "تم إرسال رسالتك بنجاح! سيتواصل معك فريقنا في أقرب وقت."
    });
});

// ==========================================
// 🕵️‍♂️ 2. جلب جميع الرسائل الواردة (للأدمن فقط لقراءتها بمجلد صندوق الوارد)
// ==========================================
module.exports.getAllUserMessages = asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json(["عذراً، هذا الإجراء مخصص لمدير النظام فقط"]);
    }

    // جلب الرسائل مرتبة من الأحدث إلى الأقدم
    const messages = await UserMessage.find().sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        count: messages.length,
        data: messages
    });
});