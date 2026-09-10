const mongoose = require("mongoose");
const Joi = require("joi");

const wasteRequestSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    wasteType: { type: String,  required: true },
    // حقول الموقع المباشرة المرسلة من الفرونت إند
    address: { type: String, required: true },
    lat: { type: Number, required: true }, // خط العرض
    lng: { type: Number, required: true }, // خط الطول

     // ⚖️ حقل الوزن والكمية (تم إعادته وتثبيته رسمياً في قاعدة البيانات)
     quantity: { type: Number, required: true, min: 1 },
    // التاريخ والوقت
    pickupSchedule: {
        date: { type: Date, required: true },
        time: { type: String, required: true } 
    },

    notes: { type: String, default: "" },
    status: { type: String, enum: ["pending", "accepted", "completed", "rejected"], default: "pending" },
    
    // 🚚 السائق المسؤول عن الرحلة (تم حقنه هندسياً هنا في الـ Schema بشكل سليم)
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    
}, { timestamps: true });

const WasteRequest = mongoose.model("WasteRequest", wasteRequestSchema);

// 🔍 Validation عند الإنشاء (مُصحح ومعدّل بالكامل لحظر تداخل الكود)
const validateCreateWasteRequest = (obj) => {
    const schema = Joi.object({
        user: Joi.string().allow(""),
        wasteType: Joi.string().valid("plastic", "glass", "metal", "paper").required(),
        quantity: Joi.number().min(1).required(),
        address: Joi.string().required(),
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
        pickupSchedule: Joi.object({
            date: Joi.date().required(),
            time: Joi.string().regex(/^(0[0-9]|1[0-2]):[0-5][0-9] (AM|PM)$/).required()
        }).required(),
        notes: Joi.string().allow("").max(500),
        status: Joi.string().valid("pending", "accepted", "completed", "rejected"),
        driver: Joi.string().allow(null, ""), // 👈 التعديل الصحيح للـ Joi: يستقبل الـ ID كـ String عادي
       // يُوضع هذا الحقل داخل الـ wasteRequestSchema حصراً:


    });

    // 💡 إضافة خيارات تنسيق الأخطاء هنا لمنع ظهور علامات التنصيص
    return schema.validate(obj, { 
        abortEarly: false,
        errors: {
            wrap: {
                label: false // إزالة علامات التنصيص حول اسم الحقل
            }
        }
    });
};

// Validation عند التحديث
const validateUpdateWasteRequest = (obj) => {
    const schema = Joi.object({
        user: Joi.string(),
        wasteType: Joi.string().valid("plastic", "glass", "metal", "paper"),
        quantity: Joi.number().min(1),
        address: Joi.string(),
        lat: Joi.number().min(-90).max(90),
        lng: Joi.number().min(-180).max(180),
        pickupSchedule: Joi.object({
            date: Joi.date(),
            time: Joi.string().regex(/^(0[0-9]|1[0-2]):[0-5][0-9] (AM|PM)$/)
        }),
        notes: Joi.string().allow("").max(500),
        status: Joi.string().valid("pending", "accepted", "completed", "rejected"),
        driver: Joi.string().allow(null, "")
    });
    return schema.validate(obj, { abortEarly: false });
};

module.exports = {
    WasteRequest,
    validateCreateWasteRequest,
    validateUpdateWasteRequest
};
