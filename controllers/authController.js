const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const { User, validateRegisterUser } = require("../models/User");
const { sendEmail } = require("../utils/email");
const { cloudinaryUploudImage } = require("../utils/cloudinary");


// =======================
// 🔐 Generate Secure OTP
// =======================

// Generate a random 5-digit verification code
const generateCode = () => {
    return crypto.randomInt(10000, 100000).toString();
};


// =======================
// 1. Register
// =======================

module.exports.register = asyncHandler(async (req, res) => {

    req.body = req.body || {};


    // 1. Validate input using Joi
    const { error } = validateRegisterUser({
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        role: req.body.role
    });

    if (error) {
        return res.status(400).json(
            error.details.map(d =>
                d.message.replace(/["]/g, "")
            )
        );
    }


    // 2. Check password confirmation
    if (req.body.password !== req.body.confirmPassword) {
        return res.status(400).json([
            "كلمات المرور غير متطابقة"
        ]);
    }


    const normalizedPhone = String(req.body.phone || "").trim();

    // 3. Check if email or phone already exists
    let user = await User.findOne({
        email: req.body.email
    });

    if (user) {
        return res.status(400).json([
            "البريد الإلكتروني مستخدم مسبقاً"
        ]);
    }

    if (await User.exists({ phone: normalizedPhone })) {
        return res.status(400).json(["رقم الهاتف مستخدم مسبقاً"]);
    }


    // 4. Hash password
    const salt = await bcrypt.genSalt(10);

    const hashedPassword = await bcrypt.hash(
        req.body.password,
        salt
    );


    // 5. Determine role
    const assignedRole = req.body.role || "user";

    if (assignedRole === "driver" &&
        (!req.files?.nationalIdImage || !req.files?.licenseImage || !req.files?.personalImage ||
            !req.body.licenseType || !req.body.licenseNumber || !req.body.expiryDate)) {
        return res.status(400).json(["يرجى إدخال معلومات الرخصة ورفع الوثائق الثلاث المطلوبة"]);
    }


    // User and admin are active immediately; drivers wait for admin approval.
    const userStatus = assignedRole === "driver" ? "pending" : "active";


    // 6. Generate verification code
    const code = generateCode();


    // OTP expires after exactly 5 minutes
    const codeExpires = new Date(
        Date.now() + 5 * 60 * 1000
    );


    // 7. Email content (تم التعديل لطريقة الدمج البسيطة)
    const html = "<div>" +
        "<h4>الرجاء إدخال رمز التحقق في التطبيق</h4>" +
        "<p><b>" + code + "</b></p>" +
        "<p>هذا الرمز صالح لمدة 5 دقائق فقط.</p>" +
        "</div>";


    // 8. Send verification email
    try {

        await sendEmail(
            req.body.email,
            "رمز التحقق",
            html
        );

    } catch (err) {

        console.error(
            "فشل إرسال البريد الإلكتروني:",
            err
        );

        return res.status(500).json({
            message: "فشل إرسال بريد التحقق"
        });
    }


    // 9. Create user
    user = new User({

        name: req.body.name,

        email: req.body.email,

        password: hashedPassword,

        phone: normalizedPhone,

        role: assignedRole,

        status: userStatus,

        verifyCode: code,

        verifyCodeExpires: codeExpires

    });

    if (assignedRole === "driver") {
        user.driverProfile = user.driverProfile || {};
        user.driverProfile.license = {
            type: req.body.licenseType,
            number: req.body.licenseNumber,
            expiryDate: req.body.expiryDate
        };
        user.driverProfile.documents = {};

        try {
            for (const key of ["nationalIdImage", "licenseImage", "personalImage"]) {
                const file = req.files[key][0];
                const localPath = path.join(__dirname, "../images/", file.filename);
                const cloudResult = await cloudinaryUploudImage(localPath);
                user.driverProfile.documents[key] = {
                    url: cloudResult.secure_url,
                    publicId: cloudResult.public_id
                };
                fs.unlinkSync(localPath);
            }
        } catch (uploadError) {
            console.error("فشل رفع وثائق السائق أثناء التسجيل:", uploadError);
            return res.status(500).json({ message: "فشل حفظ وثائق السائق" });
        }
    }


    // 10. Save user
    await user.save();


    // 11. Response
    res.status(201).json({
        message: "تم إرسال رمز التحقق إلى البريد الإلكتروني"
    });

});

module.exports.checkRegistrationEmail = asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!email) {
        return res.status(400).json(["البريد الإلكتروني مطلوب"]);
    }

    const emailExists = await User.exists({ email });
    if (emailExists) {
        return res.status(409).json(["البريد الإلكتروني مستخدم مسبقاً"]);
    }

    return res.status(200).json({ available: true });
});



// =======================
// 2. Login
// =======================

module.exports.login = asyncHandler(async (req, res) => {

    const {
        email,
        password
    } = req.body;


    // 1. Find user
    const user = await User.findOne({
        email: String(email || '').trim().toLowerCase()
    });


    if (!user) {
        return res.status(400).json([
            "البريد الإلكتروني أو كلمة المرور غير صحيحة"
        ]);
    }
    if (user.isVerifiedRegister==false) {
        return res.status(403).json([
            "يرجى تأكيد حسابك اولا"
        ]);
    }

    // 2. Check password
    const isMatch = await bcrypt.compare(
        password,
        user.password
    );


    if (!isMatch) {
        return res.status(400).json([
            "البريد الإلكتروني أو كلمة المرور غير صحيحة"
        ]);
    }
    

    // 3. Check if banned
    if (user.isBanned) {
        return res.status(403).json([
            "تم حظر حسابك من قبل الإدارة"
        ]);
    }


    if (user.status === "pending") {
        return res.status(403).json([
            user.role === "driver"
                ? "تم إنشاء حسابك، وهو قيد الانتظار حتى توافق الإدارة على طلب السائق"
                : "حسابك قيد الانتظار بانتظار موافقة الإدارة"
        ]);
    }
    // 5. Check rejected status
    if (user.status === "rejected") {
        return res.status(403).json([
            "تم رفض طلب حسابك"
        ]);
    }


    // 6. Generate JWT
    const token = jwt.sign(
        {
            id: user._id.toString(),
            userId: user._id.toString(),
            role: user.role
        },
        process.env.JWT_SECRET
    );


    // 7. Response
    res.json({

        message: "تم تسجيل الدخول بنجاح",

        token,

        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status
        }

    });

});



// =======================
// 3. Logout
// =======================

module.exports.logout = asyncHandler(async (req, res) => {

    res.status(200).json({
        message: "تم تسجيل الخروج بنجاح"
    });

});



// =======================
// 4. Forgot Password
// Send Verification Code
// =======================

module.exports.sendForgotPasswordCode = asyncHandler(
    async (req, res) => {

        // 1. Find user
        const user = await User.findOne({
            email: req.body.email
        });


        if (!user) {
            return res.status(404).json({
                message: "المستخدم غير موجود"
            });
        }


        // 2. Generate OTP
        const code = generateCode();


        // OTP expires after exactly 5 minutes
        const codeExpires = new Date(
            Date.now() + 5 * 60 * 1000
        );


        // 3. Email content (تم التعديل لطريقة الدمج البسيطة)
        const html = "<div>" +
            "<h4>انسخ الرمز أدناه لإعادة تعيين كلمة المرور</h4>" +
            "<p><b>" + code + "</b></p>" +
            "<p>هذا الرمز صالح لمدة 5 دقائق فقط.</p>" +
            "</div>";


        try {

            // 4. Send email
            await sendEmail(
                user.email,
                "إعادة تعيين كلمة المرور",
                html
            );


            // 5. Save OTP
            user.verifyCode = code;

            user.verifyCodeExpires = codeExpires;


            await user.save();


            // 6. Response
            res.status(200).json({
                message: "تم إرسال رمز إعادة التعيين إلى البريد الإلكتروني"
            });

        } catch (err) {

            console.error(
                "فشل إرسال بريد إعادة تعيين كلمة المرور:",
                err
            );

            return res.status(500).json({
                message: "فشل إرسال البريد الإلكتروني"
            });
        }

    }
);



// =======================
// 5. Verify OTP
// =======================

module.exports.verifyCodeCtrl = asyncHandler(
    async (req, res) => {

        const {
            email,
            verifyCode,
            verify
        } = req.body;


        // 1. Find user
        const user = await User.findOne({
            email
        });


        if (!user) {
            return res.status(404).json({
                message: "المستخدم غير موجود"
            });
        }


        // 2. Check if OTP exists
        if (!user.verifyCode) {
            return res.status(400).json({
                message: "لم يتم العثور على رمز تحقق",
                valid: false
            });
        }


        // 3. Check if expiration date exists
        if (!user.verifyCodeExpires) {
            return res.status(400).json({
                message: "انتهت صلاحية رمز التحقق",
                valid: false
            });
        }


        // 4. Check expiration
        if (user.verifyCodeExpires.getTime() < Date.now()) {

            return res.status(400).json({
                message: "انتهت صلاحية رمز التحقق",
                valid: false
            });

        }


        // 5. Compare OTP
        if (user.verifyCode !== verifyCode) {

            return res.status(400).json({
                message: "رمز التحقق غير صحيح",
                valid: false
            });

        }


        // 6. OTP is correct
        user.verifyCode = "";

        user.verifyCodeExpires = null;


        // 7. Determine verification type
        if (verify === "password") {

        user.isVerifiedPassword = true;

        } else if (verify === "register") {

            user.isVerifiedRegister = true;

        }


        // 8. Save changes
        await user.save();


        // 9. Successful response
        return res.status(200).json({

            name: user.name,

            email: user.email,

            role: user.role,

            message: "رمز التحقق صحيح",

            valid: true

        });

    }
);



// =======================
// 6. Update Password
// =======================

module.exports.updatePasswordCtrl = asyncHandler(
    async (req, res) => {

        const {
            email,
            password
        } = req.body;


        // 1. Find user
        const user = await User.findOne({
            email
        });


        if (!user) {
            return res.status(404).json({
                message: "المستخدم غير موجود"
            });
        }


        // 2. Make sure user verified OTP
        if (!user.isVerifiedPassword) {

            return res.status(401).json({
                message: "المستخدم غير مصرح له بتغيير كلمة المرور"
            });

        }


        // 3. Hash new password
        const hashedPassword = await bcrypt.hash(
            password,
            10
        );


        // 4. Update password
        user.password = hashedPassword;


        // 5. Reset password verification flag
        user.isVerifiedPassword = false;


        // 6. Save
        await user.save();


        // 7. Response
        res.status(200).json({
            message: "تم تحديث كلمة المرور بنجاح"
        });

    }
);



// =========================================================================
// 🕵️‍♂️ للأدمن فقط: إنشاء حساب مستخدم أو سائق جديد يدوياً مع تشفير فوري للباسورد
// =========================================================================
module.exports.createAdminUser = asyncHandler(async (req, res) => {
    req.body = req.body || {};

    // 1. تشغيل الفاليدايشن الاحترافي الخاص بكِ لفحص قوة الباسورد وصحة الاسم والإيميل
    const { error } = validateRegisterUser(req.body);
    if (error) {
        return res.status(400).json(error.details.map(d => d.message.replace(/["]/g, "")));
    }

    const { name, email, password, phone, role } = req.body;

    const normalizedPhone = String(phone || "").trim();

    // 2. التأكد من عدم تكرار البريد الإلكتروني أو رقم الهاتف
    const emailExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (emailExists) {
        return res.status(400).json(["عذراً، البريد الإلكتروني مستخدم مسبقاً في النظام"]);
    }

    if (await User.exists({ phone: normalizedPhone })) {
        return res.status(400).json(["عذراً، رقم الهاتف مستخدم مسبقاً في النظام"]);
    }

    // 3. تشفير كلمة المرور القوية فوراً باستخدام bcrypt لحماية الحساب
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const assignedRole = role || "user";
    
    // الحسابات التي ينشئها الأدمن مفعلة مباشرة بدون انتظار موافقة إضافية.
    const userStatus = "active";

    // 4. حفظ الحساب الجديد في قاعدة البيانات وتفعيل حقل التفعيل تلقائياً (بدون كود OTP)
    const newUser = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        phone: normalizedPhone,
        role: assignedRole,
        status: userStatus,
        isVerifiedRegister: true // الحساب مفعّل تلقائياً لأن الأدمن هو من أنشأه
    });

    // 5. الاستجابة الناجحة والنظيفة للفرونت إيند
    res.status(201).json({
        success: true,
        message: `تم إنشاء حساب ${assignedRole === "driver" ? "السائق" : "المستخدم"} (${name}) بنجاح تّام!`,
        data: {
            id: newUser._id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            status: newUser.status
        }
    });
});
