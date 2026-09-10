const asyncHandler = require("express-async-handler");
const ContactInfo = require("../models/ContactInfoModel");

// ==========================================
// 🌐 1. جلب معلومات التواصل (للقسم الأيمن بالواجهة - عام للجميع)
// ==========================================
module.exports.getContactInfo = asyncHandler(async (req, res) => {
    let info = await ContactInfo.findOne();
    
    // كمالية ذكية: إذا كانت قاعدة البيانات فارغة تماماً، ننشئ السجل الافتراضي فوراً
    if (!info) {
        info = await ContactInfo.create({});
    }
    
    res.status(200).json({
        success: true,
        data: info
    });
});

// ==========================================
// 🕵️‍♂️ 2. تحديث معلومات التواصل (للأدمن فقط من لوحة التحكم)
// ==========================================
module.exports.updateContactInfo = asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json(["عذراً، هذا الإجراء مخصص لمدير النظام فقط"]);
    }

    const { companyEmail, companyPhone, companyAddress, workHours , criticalFillLevelThreshold } = req.body;

    if (criticalFillLevelThreshold !== undefined) {
        const parsedThreshold = Number(criticalFillLevelThreshold);
        if (!Number.isFinite(parsedThreshold) || parsedThreshold < 50 || parsedThreshold > 95) {
            return res.status(400).json(["نسبة امتلاء الحاوية يجب أن تكون بين 50 و 95%"]);
        }
    }

    let info = await ContactInfo.findOne();
    if (!info) info = await ContactInfo.create({});

    // تحديث الحقول الممررة من الأدمن
    info.companyEmail = companyEmail || info.companyEmail;
    info.companyPhone = companyPhone || info.companyPhone;
    info.companyAddress = companyAddress || info.companyAddress;
    info.workHours = workHours || info.workHours;

    if (criticalFillLevelThreshold !== undefined) {
        info.criticalFillLevelThreshold = Number(criticalFillLevelThreshold);
    }


    await info.save();

    res.status(200).json({
        success: true,
        message: "تم تحديث معلومات التواصل الرسمية بنجاح!",
        data: info
    });
});

// =======================================================
// 🕵️‍♂️ إنشاء سجل معلومات التواصل (محمي ومقيد بسجل واحد فقط)
// =======================================================
module.exports.createContactInfo = asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json(["عذراً، هذا الإجراء مخصص لمدير النظام فقط"]);
    }

    // 🛑 1. الفحص الحاسم: نبحث إن كان هناك سجل منشأ مسبقاً في قاعدة البيانات
    const existingInfo = await ContactInfo.findOne();
    
    // 🛑 2. الحظر الفوري: إذا وُجد السجل، نرفض العملية ونمنع الأدمن من إنشاء سجل ثانٍ
    if (existingInfo) {
        return res.status(400).json([
            "عذراً! معلومات التواصل منشأة بالفعل مسبقاً. لا يمكن إنشاء سجل ثانٍ، يرجى استخدام روت التحديث (Update) للتعديل."
        ]);
    }

    // 3. إذا كانت قاعدة البيانات فارغة تماماً، يسمح السيرفر بالإنشاء لمرة واحدة فقط
    const { companyEmail, companyPhone, companyAddress, workHours, criticalFillLevelThreshold } = req.body;

    const parsedThreshold = criticalFillLevelThreshold !== undefined ? Number(criticalFillLevelThreshold) : 80;
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 50 || parsedThreshold > 95) {
        return res.status(400).json(["نسبة امتلاء الحاوية يجب أن تكون بين 50 و 95%"]);
    }

    const newInfo = await ContactInfo.create({
        companyEmail,
        companyPhone,
        companyAddress,
        workHours,
        criticalFillLevelThreshold: parsedThreshold
    });

    res.status(201).json({
        success: true,
        message: "تم إنشاء السجل الموحد لمعلومات التواصل بنجاح لأول مرة!",
        data: newInfo
    });
});

// =========================================================================
// 🕵️‍♂️ إضافة نوع نفايات جديد بالإنجليزية وتحديد نقاطه (للأدمن فقط)
// =========================================================================
module.exports.addNewWasteTypeDynamic = asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json(["عذراً، هذا الإجراء مخصص لمدير النظام فقط"]);
    }

    const { typeNameEn, pointsPerKg } = req.body || {};

    if (!typeNameEn || !pointsPerKg) {
        return res.status(400).json(["يرجى تزويد اسم النوع بالإنجليزي (typeNameEn) مع تحديد النقاط"]);
    }

    let info = await ContactInfo.findOne();
    if (!info) info = await ContactInfo.create({});

    // 🛑 فحص حاسم: التأكد من عدم تكرار نفس النوع (بتحويل الأحرف لصغيرة)
    const isDuplicate = info.wasteTypesPricing.some(
        item => item.typeNameEn.toLowerCase() === typeNameEn.toLowerCase()
    );
    if (isDuplicate) {
        return res.status(400).json(["عذراً، هذا النوع من النفايات مضاف مسبقاً في النظام"]);
    }

    // ➕ إضافة النوع الجديد بالإنجليزية للمصفوفة المدمجة بأمان
    info.wasteTypesPricing.push({ 
        typeNameEn: typeNameEn.toLowerCase().trim(), 
        pointsPerKg: Number(pointsPerKg) 
    });
    
    await info.save();

    res.status(200).json({
        success: true,
        message: `تم إضافة نوع النفايات الجديد (${typeNameEn}) وتحديد نقاطه بنجاح تام!`,
        data: info.wasteTypesPricing
    });
});

// =========================================================================
// 🕵️‍♂️ تعديل نقاط نوع نفايات موجود مسبقاً (للأدمن فقط)
// =========================================================================
module.exports.updateWasteTypePoints = asyncHandler(async (req, res) => {
    // 1. التأكيد الأمني: التحقق من صلاحيات مدير النظام
    if (req.user.role !== "admin") {
        return res.status(403).json(["عذراً، هذا الإجراء مخصص لمدير النظام فقط"]);
    }

    const { typeNameEn, newPointsPerKg } = req.body || {};

    // التحقق من إدخال المدخلات الأساسية
    if (!typeNameEn || newPointsPerKg === undefined) {
        return res.status(400).json(["يرجى تزويد اسم النوع بالإنجليزي (typeNameEn) والنقاط الجديدة (newPointsPerKg)"]);
    }

    // 2. جلب السجل الموحد من قاعدة البيانات
    let info = await ContactInfo.findOne();
    if (!info) {
        return res.status(404).json(["لم يتم العثور على سجل الإعدادات الأساسي في النظام"]);
    }

    // 3. البحث عن العنصر المطلوب داخل مصفوفة الأسعار
    const targetType = info.wasteTypesPricing.find(
        item => item.typeNameEn.toLowerCase() === typeNameEn.toLowerCase().trim()
    );

    // إذا لم يكن النوع مسجلاً في النظام مسبقاً
    if (!targetType) {
        return res.status(404).json([`عذراً، النوع (${typeNameEn}) غير موجود في النظام لإعادة تسعيره، يمكنك إضافته كنوع جديد`]);
    }

    // 4. تحديث السعر وحفظ التغييرات في المونغو
    targetType.pointsPerKg = Number(newPointsPerKg);
    await info.save();

    res.status(200).json({
        success: true,
        message: `تم تحديث نقاط النوع (${typeNameEn}) بنجاح لتصبح ${newPointsPerKg} نقطة للكيلوغرام!`,
        data: info.wasteTypesPricing
    });
});

