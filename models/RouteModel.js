const mongoose = require("mongoose");
const Joi = require("joi");

const routeSchema = new mongoose.Schema(
    {
        driver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User", // يربط بحساب السائق من جدول اليوزر المشترك
            required: true
        },
        date: {
            type: String, // التاريخ بصيغة نصية لسهولة الفلترة اليومية مثل "2026-08-27"
            required: true
        },
        status: {
            type: String,
            enum: ["pending", "in_progress", "completed"],
            default: "pending"
        },
        
        // 🗺️ مصفوفة المحطات الذكية والمدمجة القادمة من القائمتين
      // 🗺️ الشكل الشامل والمثالي لمصفوفة المحطات داخل الـ Route Schema
waypoints: [
    {
        stopNumber: { 
            type: Number, 
            required: true 
        }, // الترتيب اللوجستي من الـ AI (1, 2, 3...)
        
        taskType: { 
            type: String, 
            required: true, 
            enum: ["WasteRequest", "Bin", "FinalDestination"] // نوع الجدول
        },
        
        taskRef: { 
            type: mongoose.Schema.Types.ObjectId, 
            required: true, 
            refPath: "waypoints.taskType" // الربط الديناميكي السحري
        },
        
        // 🚦 الحقل الحرج: حالة هذه المحطة بالذات داخل مشوار اليوم
        status: { 
            type: String, 
            enum: ["pending", "completed"], 
            default: "pending" // افتراضياً تبدأ قيد الانتظار لحين وصول السائق
        },
        
        // 📏 المسافة المحددة من الـ AI من النقطة السابقة إلى هذه النقطة
        distanceFromPreviousKm: { 
            type: Number, 
            default: 0 
        } 
    }
],

        totalDistanceKm: { type: Number, default: 0 },   // إجمالي مسافة المسار (12.4 كم)
        estimatedTimeMinutes: { type: Number, default: 0 } // الوقت الكلي المتوقع للرحلة
    },
    {
        timestamps: true
    }
);

const Route = mongoose.model("Route", routeSchema);

// 🧠 Validation لتوليد المسار الذكي بواسطة الأدمن (تطابق نمط Joi المعتمد)
const validateGenerateRoute = (obj) => {
    const schema = Joi.object({
        // معرف السائق مطلوب ومكتوب بصيغة الـ ID الخاصة بـ MongoDB
        driverId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required()
            .messages({ "string.pattern.base": "معرف السائق غير صحيح" }),
        
        // التحقق من إحداثيات السائق المرسلة من خريطة الأدمن
        driverLocation: Joi.object({
            lat: Joi.number().min(-90).max(90).required(),
            lng: Joi.number().min(-180).max(180).required()
        }).required(),

        // التحقق من مصفوفة القائمتين المدمجة (المهام والحاويات المحددة)
        selectedTasks: Joi.array().items(
            Joi.object({
                id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required()
                    .messages({ "string.pattern.base": "معرف المهمة أو الحاوية غير صحيح" }),
                type: Joi.string().valid("WasteRequest", "Bin").required()
            })
        ).min(1).required() // يجب اختيار مهمة واحدة على الأقل بالواجهة لتخطيط المسار
    });

    return schema.validate(obj, { abortEarly: false, errors: { wrap: { label: false } } });
};



// لا تنسَ إضافة الدالة الجديدة في صيغة التصدير بأسفل الملف:
module.exports = {
    Route ,
    validateGenerateRoute
};



