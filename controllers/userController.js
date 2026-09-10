const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const { User, validateUpdateUser } = require("../models/User"); // 👈 استيراد دالة الفاليدايشن الخاصة بنا
const { cloudinaryRemoveImage, cloudinaryUploudImage } = require("../utils/cloudinary");
const path = require("path");
const fs = require("fs");

// ========================================
// 👥 Get all users with search, role/status filter and pagination
// ========================================
module.exports.getAllUsers = asyncHandler(async (req, res) => {
    const { role, status, search } = req.query;

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Prevent invalid pagination values
    const validPage = page < 1 ? 1 : page;
    const validLimit = limit < 1 ? 10 : limit;

    const skip = (validPage - 1) * validLimit;

    const filter = {};

    // Filter by role
    if (role) {
        filter.role = role;
    }

    // Filter by status
    if (status) {
        filter.status = status;
    }

    // Search by name or email
    if (search) {
        filter.$or = [
            {
                name: {
                    $regex: search,
                    $options: "i"
                }
            },
            {
                email: {
                    $regex: search,
                    $options: "i"
                }
            }
        ];
    }

    // Get total number of users matching the filter (excluding passwords from selection if needed, though countDocuments doesn't select)
    const totalUsers = await User.countDocuments(filter);

    // Get users for current page and exclude password field for security
    const users = await User.find(filter)
        .select("-password")
        .sort({
            createdAt: -1
        })
        .skip(skip)
        .limit(validLimit);

    // Calculate total pages
    const totalPages = Math.ceil(
        totalUsers / validLimit
    );

    res.status(200).json({
        page: validPage,
        limit: validLimit,
        totalUsers,
        totalPages,
        count: users.length,
        users
    });
});

// 👤 1. Get profile data
module.exports.getProfile = asyncHandler(async (req, res) => {
    const userId = req.user._id || req.user.id || req.user.userId;
    const userData = await User.findById(userId).select("-password");
    if (!userData) return res.status(404).json(["User not found"]);
    res.json(userData);
});


// =========================================================================
// 👤 🚛 1. للمستخدم أو السائق: تحديث ملفه الشخصي بنفسه (معلومات نصية وباسورد فقط)
// =========================================================================
module.exports.updateMyProfile = asyncHandler(async (req, res) => {
    req.body = req.body || {};

    // 1. تشغيل الفاليدايشن العام للبيانات المرسلة
    const { error } = validateUpdateUser(req.body);
    if (error) {
        return res.status(400).json(error.details.map(d => d.message.replace(/["]/g, "")));
    }

    // 2. الهوية الصافية من التوكن الموحد (لمنع خطأ الـ User not found)
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json(["المستخدم غير موجود في النظام"]);
    }

    // 3. فحص الإيميل الجديد في حال التغيير لمنع تكراره
    if (req.body.email && req.body.email !== user.email) {
        const emailExists = await User.findOne({ email: req.body.email });
        if (emailExists) {
            return res.status(400).json(["البريد الإلكتروني مستخدم مسبقاً"]);
        }
    }

    if (req.body.phone && req.body.phone.trim() !== user.phone) {
        const phoneExists = await User.findOne({ phone: req.body.phone.trim(), _id: { $ne: user._id } });
        if (phoneExists) {
            return res.status(400).json(["رقم الهاتف مستخدم مسبقاً"]);
        }
    }
    
    // 4. تطبيق التعديلات الشخصية النصية الصافية المباشرة
    if (req.body.name) user.name = req.body.name;
    if (req.body.email) user.email = req.body.email;
    if (req.body.phone) user.phone = req.body.phone.trim();
    if (req.body.nationalId) user.nationalId = req.body.nationalId;
    if (req.body.birthDate) user.birthDate = req.body.birthDate;
    if (req.body.address) user.address = req.body.address;

    // 5. 🔐 منطق تغيير كلمة المرور بأمان عند الطلب
    if (req.body.newPassword) {
        if (!req.body.currentPassword) {
            return res.status(400).json(["الرجاء إدخال كلمة المرور الحالية لتغيير كلمة المرور الجديدة"]);
        }
        const isMatch = await bcrypt.compare(req.body.currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json(["كلمة المرور الحالية غير صحيحة"]);
        }

        if (req.body.newPassword !== req.body.confirmPassword) {
            return res.status(400).json(["كلمة المرور الجديدة غير متطابقة مع تأكيد كلمة المرور"]);
        }
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(req.body.newPassword, salt);
    }

    // 6. حفظ التعديلات بأمان في المونغو
    await user.save();
    
    res.status(200).json({
        success: true,
        message: "تم تحديث الملف الشخصي بنجاح",
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    });
});
// =========================================================================
// 🕵️‍♂️ 2. للأدمن فقط: تحديث حقول وحالات المستخدمين أو تخصيص شاحنة السائق (بدون رخصة)
// =========================================================================
module.exports.adminUpdateUserOrDriver = asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json(["هذا الإجراء مخصص لمدير النظام فقط"]);
    }
    req.body = req.body || {};

    // 1. البحث عن الحساب المستهدف عبر الـ ID الممرر بالرابط
    const user = await User.findById(req.params.id);
    if (!user) {
        return res.status(404).json(["المستخدم المستهدف غير موجود في النظام"]);
    }

    // 2. تطبيق التعديلات الإدارية العامة (تعديل الدور، الحظر، شحن النقاط)
    if (req.body.name) user.name = req.body.name;
    if (req.body.email) user.email = req.body.email;
    if (req.body.phone) user.phone = req.body.phone;
    if (req.body.role) user.role = req.body.role;
    if (req.body.status) user.status = req.body.status; // active, pending, rejected
    if (req.body.isBanned !== undefined) user.isBanned = req.body.isBanned;
    if (req.body.points !== undefined) user.points = Number(req.body.points);

    // تغيير الباسورد مباشرة من قبل الأدمن عند الحاجة
    if (req.body.newPassword) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(req.body.newPassword, salt);
    }

    // 3. 🚛 تخصيص تفاصيل الشاحنة فقط إذا كان الحساب "سائق" (تم حذف حقول الرخصة نهائياً)
    if (user.role === "driver") {
        user.driverProfile = user.driverProfile || {};
        user.driverProfile.vehicle = user.driverProfile.vehicle || {};

        if (req.body.truckNumber) user.driverProfile.vehicle.truckNumber = req.body.truckNumber;
        if (req.body.truckType) user.driverProfile.vehicle.truckType = req.body.truckType;
        if (req.body.capacityTon !== undefined) user.driverProfile.vehicle.capacityTon = Number(req.body.capacityTon);
    }

    // 4. حفظ كافة التعديلات بأمان في قاعدة البيانات
    await user.save();

    res.status(200).json({ 
        success: true,
        message: "تم تحديث بيانات الحساب وتفاصيل الشاحنة من قبل الإدارة بنجاح",
        data: user
    });
});


// =========================================================================
// 🚛 👤 خاص بالسائق: إرسال معلومات القيادة والوثائق الـ 3 للمراجعة من الإدارة
// =========================================================================
module.exports.submitDriverDocuments = asyncHandler(async (req, res) => {
    req.body = req.body || {};

    // 1. التوثيق من التوكن والتأكد أن المستخدم الحالي هو "سائق"
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);
    
    if (!user || user.role !== "driver") {
        return res.status(403).json(["عذراً، هذا الإجراء مخصص لملفات السائقين فقط"]);
    }

    const { licenseNumber, licenseType, expiryDate } = req.body;

    // 2. التحقق من تعبئة المدخلات النصية للرخصة
    if (!licenseNumber || !licenseType || !expiryDate) {
        return res.status(400).json(["يرجى إدخال رقم الرخصة، الفئة، وتاريخ الانتهاء لاستكمال الطلب"]);
    }

    // 3. التحقق من أن الفرونت إيند أرسل الصور الثلاث المطلوبة بالواجهة
    if (!req.files || !req.files.nationalIdImage || !req.files.licenseImage || !req.files.personalImage) {
        return res.status(400).json(["يرجى رفع الوثائق الثلاث المطلوبة كاملة (صورة الهوية، صورة الرخصة، والصورة الشخصية)"]);
    }

    // تهيئة كائن ملف السائق المتداخل لمنع الـ Null Pointer Crash
    user.driverProfile = user.driverProfile || {};
    user.driverProfile.license = user.driverProfile.license || {};
    user.driverProfile.documents = user.driverProfile.documents || {};

    // 4. حفظ بيانات الرخصة النصية القادمة من الحقول العلوية
    user.driverProfile.license.number = licenseNumber;
    user.driverProfile.license.type = licenseType;
    user.driverProfile.license.expiryDate = expiryDate;

    // 5. 🚀 معالجة ورفع الملفات الثلاثة إلى Cloudinary وحذف التالف تلقائياً من المجلد المحلي
    try {
        const filesKeys = ['nationalIdImage', 'licenseImage', 'personalImage'];
        
        for (const key of filesKeys) {
            const file = req.files[key][0];
            const localPath = path.join(__dirname, "../images/", file.filename);

            // مسح الصورة القديمة من كلاوديناري إن وجدت
            if (user.driverProfile.documents[key]?.publicId) {
                await cloudinaryRemoveImage(user.driverProfile.documents[key].publicId);
            }

            // رفع الصورة الجديدة وتخزين الرابط أونلاين
            const cloudResult = await cloudinaryUploudImage(localPath);
            user.driverProfile.documents[key] = {
                url: cloudResult.secure_url,
                publicId: cloudResult.public_id
            };

            // حذف الملف المؤقت فوراً من الهارد ديسك المحلي لراحة الـ Localhost
            fs.unlinkSync(localPath);
        }

        // يبقى السائق قيد الانتظار حتى يراجعه الأدمن ويوافق عليه.
        user.status = "pending";
        await user.save();

        res.status(200).json({
            success: true,
            message: "تم إرسال معلومات القيادة والوثائق الثلاث بنجاح، الحساب الآن قيد المراجعة من قِبل الإدارة!",
            data: user.driverProfile
        });

    } catch (uploadError) {
        console.error("خطأ أثناء رفع وثائق السائق:", uploadError);
        return res.status(500).json(["حدث خطأ في السيرفر أثناء معالجة ورفع الصور، يرجى المحاولة لاحقاً"]);
    }
});

module.exports.adminCompleteDriverSignup = asyncHandler(async (req, res) => {
    req.body = req.body || {};
    const user = await User.findById(req.params.id);

    if (!user || user.role !== "driver") {
        return res.status(404).json(["السائق غير موجود"]);
    }

    const { licenseNumber, licenseType, expiryDate } = req.body;
    if (!licenseNumber || !licenseType || !expiryDate) {
        return res.status(400).json(["يرجى إدخال رقم الرخصة، الفئة، وتاريخ الانتهاء"]);
    }

    if (!req.files || !req.files.nationalIdImage || !req.files.licenseImage || !req.files.personalImage) {
        return res.status(400).json(["يرجى رفع الوثائق الثلاث المطلوبة كاملة"]);
    }

    user.driverProfile = user.driverProfile || {};
    user.driverProfile.license = user.driverProfile.license || {};
    user.driverProfile.documents = user.driverProfile.documents || {};
    user.driverProfile.license.number = licenseNumber;
    user.driverProfile.license.type = licenseType;
    user.driverProfile.license.expiryDate = expiryDate;

    try {
        for (const key of ["nationalIdImage", "licenseImage", "personalImage"]) {
            const file = req.files[key][0];
            const localPath = path.join(__dirname, "../images/", file.filename);

            if (user.driverProfile.documents[key]?.publicId) {
                await cloudinaryRemoveImage(user.driverProfile.documents[key].publicId);
            }

            const cloudResult = await cloudinaryUploudImage(localPath);
            user.driverProfile.documents[key] = {
                url: cloudResult.secure_url,
                publicId: cloudResult.public_id
            };
            fs.unlinkSync(localPath);
        }

        user.status = "active";
        await user.save();
        res.status(200).json({ success: true, message: "تم حفظ وثائق السائق بنجاح", data: user.driverProfile });
    } catch (uploadError) {
        console.error("خطأ أثناء رفع وثائق السائق من الأدمن:", uploadError);
        return res.status(500).json(["حدث خطأ في السيرفر أثناء رفع وثائق السائق"]);
    }
});


