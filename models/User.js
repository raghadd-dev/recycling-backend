const mongoose = require("mongoose");
const Joi = require("joi"); // استيراد مكتبة Joi

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true,
            unique: true
        },
        password: {
            type: String,
            required: true
        },
        role: {
            type: String,
            enum: ["user", "driver", "admin"],
            default: "user"
        },
        phone : {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ["active", "pending", "rejected"],
            default: "pending"
        },
        isBanned: {
            type: Boolean,
            default: false
        },
        points: {
            type: Number,
            default: 0
        },
        // أضيفي هذا في ملف موديل المستخدم عندكِ:
        verifyCode: { type: String, default: null },
        verifyCodeExpires: { type: Date, default: null },

        // 📍 الحقول الشخصية الإضافية المتوافقة مع واجهة بروفايل السائق
        nationalId: {
            type: String,
            trim: true
        },
        birthDate: {
            type: Date
        },
        address: {
            type: String,
            trim: true
        },
        driverProfile: {
            // أ) رخصة القيادة الموضحة بأول شق في الصورة
            license: {
                number: { type: String, default: "" },      // رقم رخصة القيادة
                type: { type: String, default: "" },        // نوع/فئة الرخصة
                expiryDate: { type: String, default: "" }   // تاريخ انتهاء الرخصة
            },
            // ب) الوثائق الثلاث الموضحة بالشق الثاني من الصورة
            documents: {
                nationalIdImage: { url: { type: String, default: "" }, publicId: { type: String, default: null } }, // صورة الهوية الشخصية
                licenseImage:    { url: { type: String, default: "" }, publicId: { type: String, default: null } }, // صورة رخصة القيادة
                personalImage:   { url: { type: String, default: "" }, publicId: { type: String, default: null } }  // الصورة الشخصية
            },
            // تفاصيل الشاحنة (تُترك للأدمن كما اتفقنا)
            vehicle: {
                truckNumber: { type: String, default: "" },
                truckType: { type: String, default: "" },
                capacityTon: { type: Number, default: 0 },
            }
        },
        
        isVerifiedPassword : {
            type : Boolean ,
            default : false
        },
        isVerifiedRegister : {
            type : Boolean ,
            default : false
        },
    },
    {
        timestamps: true
    }
);

const User = mongoose.model("User", userSchema);

// 📝 Validation عند تسجيل مستخدم جديد
const validateRegisterUser = (obj) => {
    const schema = Joi.object({
        name: Joi.string().trim().min(2).max(100)
            .pattern(/^[a-zA-Z\u0600-\u06FF\s]+$/).required()
            .messages({
                "string.min": "الاسم يجب أن يتكون من حرفين أو أكثر",
                "string.pattern.base": "الاسم يجب أن يحتوي على حروف فقط ولا يمكن أن يتضمن أرقاماً"
            }),
        email: Joi.string().trim().email().required().messages({
            "string.email": "يرجى إدخال بريد إلكتروني بصيغة صحيحة"
        }),
        phone: Joi.string().trim().min(8).max(20).required().messages({
            "string.min": "رقم الهاتف يجب أن يتكون من 8 أرقام أو أكثر"
        }),
        password: Joi.string().trim().min(8)
        // 🛡️ الـ Regex الأمني: حرف كبير، حرف صغير، رقم، ورمز خاص على الأقل
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/).required()
        .messages({
            "string.min": "كلمة المرور الجديدة يجب أن تكون 8 رموز أو أكثر",
            "string.pattern.base": "كلمة المرور ضعيفة! يجب أن تحتوي على حرف كبير (A)، وحرف صغير (a)، ورقم (1)، ورمز خاص واحد على الأقل (مثل @$!%*?&)"
        }),
        confirmPassword: Joi.string().trim().min(6), 
        role: Joi.string().valid("user", "driver", "admin")
    });
    return schema.validate(obj, { abortEarly: false, errors: { wrap: { label: false } } });
};

// ✏️ Validation عند تحديث بيانات الحساب (Update Profile للأدمن والمستخدم والسائق)
// 🔍 دالة التحقق المحدثة للبيانات الشخصية (مع منع الأرقام بالاسم وإلزامية كلمة السر القوية)
const validateUpdateUser = (obj) => {
    const schema = Joi.object({
        name: Joi.string().trim().min(2).max(100)
            .pattern(/^[a-zA-Z\u0600-\u06FF\s]+$/)
            .messages({
                "string.min": "الاسم يجب أن يتكون من حرفين أو أكثر",
                "string.pattern.base": "الاسم يجب أن يحتوي على حروف فقط ولا يمكن أن يتضمن أرقاماً"
            }),
        email: Joi.string().trim().email().messages({
            "string.email": "يرجى إدخال بريد إلكتروني بصيغة صحيحة"
        }),
        phone: Joi.string().trim().min(7).max(20).messages({
            "string.min": "رقم الهاتف يجب أن يتكون من 7 أرقام أو أكثر"
        }),
        nationalId: Joi.string().trim().allow(""),
        birthDate: Joi.string().trim().allow(""),
        address: Joi.string().trim().allow(""),
        
        // 🔐 حقول تغيير كلمة المرور عند الحاجة (تم حقن فحص القوة الحاسم)
        currentPassword: Joi.string().trim().allow(""),
        newPassword: Joi.string().trim().min(8)
            // 🛡️ الـ Regex الأمني: حرف كبير، حرف صغير، رقم، ورمز خاص على الأقل
            .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
            .messages({
                "string.min": "كلمة المرور الجديدة يجب أن تكون 8 رموز أو أكثر",
                "string.pattern.base": "كلمة المرور ضعيفة! يجب أن تحتوي على حرف كبير (A)، وحرف صغير (a)، ورقم (1)، ورمز خاص واحد على الأقل (مثل @$!%*?&)"
            }),
        confirmPassword: Joi.string().trim().allow("")
    }).unknown(true); // تسمح بمرور الحقول الإدارية بدون اعتراض

    return schema.validate(obj);
};


module.exports = {
    User,
    validateRegisterUser,
    validateUpdateUser
};