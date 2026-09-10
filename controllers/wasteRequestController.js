const { WasteRequest, validateCreateWasteRequest, validateUpdateWasteRequest } = require("../models/WasteRequestModel");
const asyncHandler = require("express-async-handler");
const path = require("path");
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai"); // استدعاء حزمة جمناي الرسمية الحديثة
const { cloudinaryUploudImage } = require("../utils/cloudinary"); 
const{RewardClaim} = require("../models/RewardClaimModel")

// تفعيل جمناي بمفتاح الـ API الخاص بكِ المخزن في الـ .env
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// ========================================
// Get all waste requests with status/wasteType filter, search and pagination
// ========================================
module.exports.getWasteRequests = asyncHandler(async (req, res) => {
    const { status, wasteType, search ,driverId} = req.query;

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Prevent invalid pagination values
    const validPage = page < 1 ? 1 : page;
    const validLimit = limit < 1 ? 10 : limit;

    const skip = (validPage - 1) * validLimit;

    const filter = {};

    // Filter by status
    if (status) {
        filter.status = status;
    }

    // Filter by wasteType
    if (wasteType) {
        filter.wasteType = wasteType;
    }
    if (driverId) {
        filter.driverId = wasteType;
    }

    // Search by address or notes
    if (search) {
        filter.$or = [
            {
                address: {
                    $regex: search,
                    $options: "i"
                }
            },
            {
                notes: {
                    $regex: search,
                    $options: "i"
                }
            }
        ];
    }

    // Get total number of waste requests matching the filter
    const totalRequests = await WasteRequest.countDocuments(filter);

    // Get waste requests for current page with populated user and driver info
    const wasteRequests = await WasteRequest.find(filter)
        .populate("user", "name email phone")
        .populate("driver", "name email phone")
        .sort({
            createdAt: -1
        })
        .skip(skip)
        .limit(validLimit);

    // Calculate total pages
    const totalPages = Math.ceil(
        totalRequests / validLimit
    );

    res.status(200).json({
        page: validPage,
        limit: validLimit,
        totalRequests,
        totalPages,
        count: wasteRequests.length,
        wasteRequests
    });
});

// ========================================
// Get single waste request by ID
// ========================================
module.exports.getWasteRequestById = asyncHandler(async (req, res) => {
    const wasteRequest = await WasteRequest.findById(req.params.id)
        .populate("user", "name email phone")
        .populate("driver", "name email phone");

    if (!wasteRequest) {
        return res.status(404).json({ message: "طلب النفايات غير موجود" });
    }

    res.status(200).json(wasteRequest);
});


// =========================================================================
// ♻️ 1. إنشاء طلب استلام نفايات جديد مع فحص مصداقية (النوع والوزن) بالـ AI وحفظ الصورة بالـ DB
// =========================================================================
module.exports.createWasteRequest = asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(404).json({ message: "no image provided" });
    }
    
    req.body = req.body || {}; 
    req.body.user = req.user.id;

    // 💡 تجميع حقول الوقت المنقطة القادمة من الـ form-data لتوافق كائن الـ Joi
    if (req.body["pickupSchedule.date"] || req.body["pickupSchedule.time"]) {
        req.body.pickupSchedule = {
            date: req.body["pickupSchedule.date"],
            time: req.body["pickupSchedule.time"]
        };
        delete req.body["pickupSchedule.date"];
        delete req.body["pickupSchedule.time"];
    }
 

    // أ) تشغيل الـ Joi Validation للتحقق من الحقول النصية والعددية
    const { error } = validateCreateWasteRequest(req.body);
    if (error) {
        return res.status(400).json(error.details.map(d => d.message.replace(/["]/g, "")));
    }

    const { wasteType, quantity } = req.body; 
    
    // جلب وتحديد مسار الصورة المحلي الذي حفظه الـ Multer في مجلد images الخاص بكِ
    
    const imagePath = path.join(__dirname, `../images/${req.file.filename}`);

    try {
        // ب) 🧠 تحويل الصورة المحلية القياسية إلى Base64 لتمريرها لسيرفر جمناي
        if (!fs.existsSync(imagePath)) {
            return res.status(400).json(["فشل العثور على ملف الصورة محلياً على السيرفر"]);
        }
        
        const imageBufferBase64 = fs.readFileSync(imagePath).toString("base64");

        const mediaPart = {
            inlineData: {
                data: imageBufferBase64,
                mimeType: req.file.mimetype || "image/jpeg"
            }
        };

        // ج) صياغة الـ Prompt الهندسي للتحقق من (نوع النفايات + الوزن المختار بالواجهة)
        const promptText = `
        You are an expert AI environmental auditor analyzing a recycling request.
        User's Claims:
        - Waste Type: "${wasteType}"
        - Claimed Weight: "${quantity} kg"
        
        Tasks:
        1. Check if the image matches the selected type ("${wasteType}"). Set "isTypeGenuine" to true if yes, false if completely different.
        2. Check if the visible amount realistically justifies the weight ("${quantity} kg"). Set "isWeightRealistic" to true if realistic, false if severely exaggerated.
        
        Return ONLY a raw JSON object with keys: "isTypeGenuine" (boolean) and "isWeightRealistic" (boolean). No markdown tags like \`\`\`json, no text.
        `;

        // د) 🚀 استدعاء الذكاء الاصطناعي بنموذج فلاش 3.6 الحديث والمستقر من جوجل
        const aiResponse = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: [promptText, mediaPart],
            config: { responseMimeType: 'application/json' }
        });

        const aiAnalysis = JSON.parse(aiResponse.text);

        // 🛑 حسم المصداقية: الرفض الفوري وحذف الملف محلياً في حال كشف غش بالوزن أو النوع
        if (aiAnalysis.isTypeGenuine === false) {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            return res.status(400).json([`فشل التحقق من المصداقية: نوع النفايات المختار (${wasteType}) لا يطابق المواد الظاهرة في الصورة المرفوعة.`]);
        }

        if (aiAnalysis.isWeightRealistic === false) {
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
            return res.status(400).json([`فشل التحقق من المصداقية: الوزن المدخل (${quantity} كغ) مبالغ فيه جداً ولا يتطابق مع حجم الكمية الظاهرة بالصورة.`]);
        }
        


    } catch (aiError) {
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        console.error("Gemini Failure Stack: ", aiError);
        return res.status(500).json({
            message: "حدث خطأ في معالجة طلب جمناي للصورة، يرجى مراجعة تفاصيل اعتراض السيرفر المرفقة",
            googleError: aiError.message 
        });
    }

    // و) التحقق من منطقية الوقت (أن يكون مستقبلياً وبفارق ساعة على الأقل - كودكِ الذكي)
    if (req.body.pickupSchedule && req.body.pickupSchedule.date && req.body.pickupSchedule.time) {
        const [timePart, modifier] = req.body.pickupSchedule.time.split(" ");
        let [hours, minutes] = timePart.split(":");
        
        if (modifier === "PM" && hours !== "12") hours = parseInt(hours, 10) + 12;
        if (modifier === "AM" && hours === "12") hours = "00";

        const inputPickupDate = new Date(req.body.pickupSchedule.date);
        inputPickupDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

        const now = new Date(); 
        const timeDifferenceInHours = (inputPickupDate - now) / (1000 * 60 * 60);

        if (timeDifferenceInHours < 1) {
            return res.status(400).json(["Pickup time must be in the future and at least 1 hour from now"]);
        }
    }

    // ز) حفظ الطلب بشكل نهائي وموثوق ومؤكد المصداقية شامل كائن الـ image المحقون بالـ DB
    const wasteRequest = new WasteRequest(req.body);
    await wasteRequest.save();
    

// استدعاء الموديل ديناميكياً من المونجوس لحل مشكلة عدم التعرف عليه
const mongoose = require("mongoose");
const RewardClaimModel = mongoose.model("RewardClaim");

const pendingRewards = await RewardClaimModel.find({
    userId: req.user.id, 
    status: "waiting_next_pickup",
    associatedRecycleRequestId: null 
});

if (pendingRewards.length > 0) {
    await RewardClaimModel.updateMany(
        { _id: { $in: pendingRewards.map(reward => reward._id) } },
        { $set: { associatedRecycleRequestId: wasteRequest._id } } // تعديل اسم المتغير ليطابق wasteRequest عندك بالسطر 143
    );
}


    // إرجاع المستند النهائي المخزن فعلياً وحقيقياً بقاعدة البيانات للأدمن والواجهة
    res.status(201).json({ 
        success: true,
        message: "تم التحقق من مصداقية طلبك وتطابق النوع والوزن التقديري بواسطة الـ AI بنجاح تام وتم حفظ الصورة بقاعدة البيانات!", 
        wasteRequest ,
        rewards: pendingRewards 
    });
});

// ✏️ تعديل بيانات طلب استلام (يُمنع التعديل قبل الموعد بساعتين)
module.exports.updateWasteRequest = asyncHandler(async (req, res) => {
    req.body = req.body || {};

    // 1. البحث عن الطلب الحالي لرؤية موعده المخزن قبل التعديل
    const existingRequest = await WasteRequest.findById(req.params.id);
    if (!existingRequest) return res.status(404).json({ error: "Waste request not found" });

    // 2. فحص الوقت: إذا كان المستخدم العادي يحاول تعديل موعده (وليس الأدمن)
    if (req.user.role !== "admin") {
        // دمج تاريخ ووقت الاستلام المخزنين
        const [timePart, modifier] = existingRequest.pickupSchedule.time.split(" ");
        let [hours, minutes] = timePart.split(":");
        if (modifier === "PM" && hours !== "12") hours = parseInt(hours, 10) + 12;
        if (modifier === "AM" && hours === "12") hours = "00";

        const pickupDate = new Date(existingRequest.pickupSchedule.date);
        pickupDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

        // حساب الفارق الزمني بالساعات بين الآن وموعد الاستلام
        const timeDifferenceInHours = (pickupDate - new Date()) / (1000 * 60 * 60);

        // إذا كان الوقت المتبقي أقل من ساعتين (2)، يتم رفض التعديل
        if (timeDifferenceInHours < 2) {
            return res.status(400).json({ error: "Cannot update request less than 2 hours before pickup time" });
        }
    }

    // 3. التحقق من المدخلات الجديدة وتحديث البيانات
    const { error } = validateUpdateWasteRequest(req.body);
    if (error) return res.status(400).json(error.details.map(d => d.message.replace(/["]/g, "")));

    const wasteRequest = await WasteRequest.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ message: "Waste request updated successfully", wasteRequest });
});

// 🗑️ حذف طلب استلام (يُمنع الحذف قبل الموعد بساعتين إلا للأدمن)
module.exports.deleteWasteRequest = asyncHandler(async (req, res) => {
    const wasteRequest = await WasteRequest.findById(req.params.id);
    if (!wasteRequest) return res.status(404).json({ error: "Waste request not found" });

    // 1. إذا كان المستخدم العادي يحاول حذف الطلب، نتحقق من شرط الساعتين
    if (req.user.role !== "admin") {
        // دمج التاريخ والوقت المخزنين للحساب
        const [timePart, modifier] = wasteRequest.pickupSchedule.time.split(" ");
        let [hours, minutes] = timePart.split(":");
        if (modifier === "PM" && hours !== "12") hours = parseInt(hours, 10) + 12;
        if (modifier === "AM" && hours === "12") hours = "00";

        const pickupDate = new Date(wasteRequest.pickupSchedule.date);
        pickupDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

        const timeDifferenceInHours = (pickupDate - new Date()) / (1000 * 60 * 60);

        if (timeDifferenceInHours < 2) {
            return res.status(400).json({ error: "Cannot delete request less than 2 hours before pickup time" });
        }
    }

    // 2. تنفيذ الحذف الفعلي (متاح للأدمن دائماً، وللمستخدم إذا كان قبل الموعد بأكثر من ساعتين)
    await WasteRequest.findByIdAndDelete(req.params.id);
    res.json({ message: "Waste request deleted successfully" });
});


// ========================================
// Get current user's waste requests (with pagination too)
// ========================================
module.exports.getMyWasteRequests = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const validPage = page < 1 ? 1 : page;
    const validLimit = limit < 1 ? 10 : limit;
    const skip = (validPage - 1) * validLimit;

    const filter = { user: req.user.id };

    const totalRequests = await WasteRequest.countDocuments(filter);
    const wasteRequests = await WasteRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit);

    const totalPages = Math.ceil(totalRequests / validLimit);

    res.status(200).json({
        page: validPage,
        limit: validLimit,
        totalRequests,
        totalPages,
        count: wasteRequests.length,
        wasteRequests
    });
});