const { Route, validateGenerateRoute } = require("../models/RouteModel");
const { WasteRequest } = require("../models/WasteRequestModel"); // جدول طلبات البيوت
const Bin = require("../models/Bin");       // جدول الحاويات الذكية
const { GoogleGenAI } = require("@google/genai");           // مكتبة جمناي الرسمية الحديثة
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const RewardClaim = require("../models/RewardClaimModel");

// تفعيل جمناي بمفتاح الـ API الخاص بك المخزن في الـ .env
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// =========================================================================
// 🧠 1. توليد وترتيب المسار المشترك (حاويات + طلبات بيوت + مركز التجمع الختامي)
// =========================================================================
module.exports.generateOptimizedRoute = asyncHandler(async (req, res) => {
    if (!ai) {
        return res.status(503).json(["خدمة التخطيط الذكي غير مفعلة: GEMINI_API_KEY مفقود"]);
    }
    req.body = req.body || {};

    // أ) تشغيل الفاليدايشن للتأكد من صحة صيغة المدخلات وموقع السائق قبل المعالجة
    const { error } = validateGenerateRoute(req.body);
    if (error) {
        return res.status(400).json(error.details.map(d => d.message.replace(/["]/g, "")));
    }

    const { driverId, driverLocation, selectedTasks } = req.body;

         // 1️⃣ أولاً: استخراج الـ IDs وفصلها حسب النوع (يجب أن يكون هذا في الأعلى)
    const requestIds = selectedTasks.filter(t => t.type === "WasteRequest").map(t => t.id);
    const binIds = selectedTasks.filter(t => t.type === "Bin" || t.type === "SmartBin").map(t => t.id);

    // 2️⃣ ثانياً: تمرير المتغيرات داخل الاستعلام من قاعدة البيانات
    const [requestsData, binsData] = await Promise.all([
        WasteRequest.find({ 
            _id: { $in: requestIds },
            status: "pending" // جدار الحماية للطلبات المعلقة فقط
        }).select("_id location address wasteType"),
        
        Bin.find({ _id: { $in: binIds } }).select("_id location address binType fillLevel")
    ]);



    // ج) دمج البيانات في مصفوفة موحدة مجهزة للـ AI + حقن مركز التجمع محطة نهائية ثابتة
    const unifiedTasksForAI = [
        ...requestsData.map(r => ({
            id: r._id,
            type: "WasteRequest",
            title: "طلب جمع منزلي (" + r.wasteType + ")",
            location: r.location,
            address: r.address
        })),
        ...binsData.map(b => ({
            id: b._id,
            type: "Bin",
            title: "تفريغ حاوية ذكية " + b.binType + " (امتلاء " + b.fillLevel + "%)",
            location: b.location,
            address: b.address
        })),
        // 📍 حقن مركز التجمع جغرافياً ليدخل في حسبة المسافة والوقت من الـ AI
        {
            id: "666666666666666666666666", // معرف وهمي ثابت للمستودع
            type: "FinalDestination",
            title: "مركز التجمع وإعادة التدوير الرئيسي",
            location: { lat: 36.2625, lng: 37.2110 }, // إحداثيات الشيخ نجار - حلب
            address: "حلب - المنطقة الصناعية بالشيخ نجار"
        }
    ];

// د) صياغة الـ Prompt الهندسي الموجه لـ Gemini مع إلزامية جعل المستودع هو المحطة الأخيرة
    const prompt = 
    "You are an AI logistics expert specializing in route optimization (Traveling Salesperson Problem).\n" +
    "Driver Starting Location: Latitude " + driverLocation.lat + ", Longitude " + driverLocation.lng + "\n" +
    "List of combined pickup tasks to visit (unorganized):\n" +
    JSON.stringify(unifiedTasksForAI, null, 2) + "\n" +
    "CRITICAL INSTRUCTIONS:\n" +
    "1. Calculate the optimal sequential path starting from the driver's coordinates.\n" +
    "2. The task with type \"FinalDestination\" (مركز التجمع وإعادة التدوير الرئيسي) MUST strictly be the absolute LAST stop in the route. Do not put it anywhere else.\n" +
    "3. Calculate the driving distance in Kilometers (Km) FROM THE PREVIOUS STOP for every single item including the FinalDestination.\n" +
    "4. Return ONLY a valid JSON array of objects representing the tasks in their optimized order. Each object must strictly have exactly four keys:\n" +
    "   - \"stopNumber\": sequential integer starting from 1\n" +
    "   - \"taskType\": must be exactly \"WasteRequest\", \"Bin\", or \"FinalDestination\" matching the input type\n" +
    "   - \"taskRef\": the original MongoDB \"_id\" string of that specific task\n" +
    "   - \"distanceFromPreviousKm\": A floating-point number representing the distance from the last location.\n" +
    "5. Do not include markdown tags like `json, do not provide any extra text. Return pure raw JSON array only.";

    let response;
    try {
        response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });
    } catch (error) {
        console.error("Gemini route generation failed:", error);
        return res.status(502).json({ message: "تعذر إنشاء المسار الذكي لأن خدمة التخطيط غير متاحة حاليًا. حاول مرة أخرى." });
    }

    let optimizedWaypoints;
    try {
        optimizedWaypoints = JSON.parse(response.text);
    } catch (error) {
        console.error("Invalid Gemini route response:", error);
        return res.status(502).json({ message: "تعذر إنشاء المسار لأن خدمة التخطيط أعادت نتيجة غير صالحة." });
    }

    // ز) الحسبة الديناميكية الشاملة: جمع المسافات الجزئية (بما فيها مسافة الذهاب للمستودع)
    const calculatedTotalDistance = optimizedWaypoints.reduce((sum, wp) => sum + (wp.distanceFromPreviousKm || 0), 0);
    const finalDistance = Math.round(calculatedTotalDistance * 10) / 10; 

    // ح) حساب وقت القيادة والجمع الفعلي (2.5 دقيقة لكل كم + 10 دقائق تحميل لكل محطة جمع)
    const drivingTime = finalDistance * 2.5;
    // نستثني محطة المستودع من زمن تحميل القمامة التقديري
    const loadingTime = (optimizedWaypoints.length - 1) * 10;

    // ط) حفظ المسار المدمج والمنظم بالكامل في قاعدة البيانات للسائق
    const finalRoute = await Route.create({
        driver: driverId,
        date: new Date().toISOString().split('T')[0], // تاريخ اليوم الحالي بصيغة YYYY-MM-DD
        status: "pending",
        waypoints: optimizedWaypoints,
        totalDistanceKm: finalDistance, // المسافة الحقيقية الديناميكية المجمعة
        estimatedTimeMinutes: Math.round(drivingTime + loadingTime) // الوقت الواقعي المحسوب بالدقائق
    });

    // ي) تحديث الحالات في الجداول الأصلية لحماية البيانات من التكرار حجزاً ميدانياً
    await Promise.all([
        // تحديث طلبات المنازل: نغير الحالة ونربط معها الـ driverId المختار من الأدمن
        WasteRequest.updateMany(
            { _id: { $in: requestIds } }, 
            { $set: { status: "accepted", driver: driverId } } 
        ),
        // تحديث الحاويات الذكية (تظل كما هي لأنها حاوية عامة بالشارع وليست ملكاً لشخص)
        Bin.updateMany(
            { _id: { $in: binIds } }, 
            { $set: { status: "full_pending" } }
        )
    ]);

    // ك) إرجاع النتيجة الناجحة والمكتملة للأدمن
    res.status(201).json({
        success: true,
        message: "تم توليد وتخطيط المسار الميداني بنجاح وترتيب المحطات بواسطة Gemini AI",
        data: finalRoute
    });
});
// =========================================================================
// 🚚 2. جلب المسار اليومي والنشط للسائق (النسخة المستقرة، الحرة، والخالية من الأخطاء كلياً)
// =========================================================================
module.exports.getDriverCurrentRoute = asyncHandler(async (req, res) => {
    const today = new Date().toISOString().split('T')[0]; 

    // 1️⃣ جلب بيانات المسار ككائن JavaScript حُر تماماً عبر .lean() لمنع انهيار السيرفر
    const currentRoute = await Route.findOne({
        driver: req.user.id,
        date: today,
        status: { $in: ["pending", "in_progress"] }
    }).lean() || await Route.findOne({
        driver: req.user.id,
        status: { $in: ["pending", "in_progress"] }
    }).sort({ createdAt: -1 }).lean();

    // التحقق من وجود مسار للسائق اليوم
    if (!currentRoute) {
        return res.status(404).json({ 
            success: false, 
            message: "لا يوجد مسار نشط مجدول لك اليوم بعد. استرح قليلاً!" 
        });
    }

    // 2️⃣ 💡 عزل وحماية: فلترة المصفوفة لحظر التداخل التلقائي لـ FinalDestination من الـ Populate
    const realWaypoints = currentRoute.waypoints.filter(wp => wp.taskType !== "FinalDestination");
    const finalDestinationWaypoint = currentRoute.waypoints.find(wp => wp.taskType === "FinalDestination");
    // 3️⃣ عمل جلب (Populate) يدوي ونظيف للمحطات الحقيقية فقط (البيوت والحاويات)
    const mongoose = require("mongoose");
    const WasteRequestModel = mongoose.model("WasteRequest");
    const BinModel = mongoose.model("Bin");

    const wasteRequestIds = realWaypoints
        .filter(wp => wp.taskType === "WasteRequest")
        .map(wp => wp.taskRef);
    const rewardClaims = wasteRequestIds.length > 0
        ? await RewardClaim.find({ associatedRecycleRequestId: { $in: wasteRequestIds } })
            .populate("rewardId", "title")
            .lean()
        : [];
    const claimsByRequestId = new Map(
        rewardClaims.map(claim => [String(claim.associatedRecycleRequestId), claim])
    );

    for (let wp of realWaypoints) {
        if (wp.taskType === "WasteRequest") {
            // جلب تفاصيل طلب المنزل مع اسم وهاتف العميل يدوياً وبأمان
            wp.taskRef = await WasteRequestModel.findById(wp.taskRef).populate({
                path: "user",
                select: "name phone",
                options: { strictPopulate: false }
            }).lean();
        } else if (wp.taskType === "Bin") {
            // جلب تفاصيل الحاوية الذكية يدوياً
            wp.taskRef = await BinModel.findById(wp.taskRef).lean();
        }
    }

    // 4️⃣ حساب العدادات ديناميكياً (المسافة المتبقية، المحطات المكتملة، والمهام المتبقية)
    let remainingDistance = 0;
    let completedCount = 0;
    const totalWaypoints = currentRoute.waypoints.length;

    currentRoute.waypoints.forEach(wp => {
        if (wp.status === "pending") {
            remainingDistance += wp.distanceFromPreviousKm;
        } else if (wp.status === "completed") {
            completedCount++;
        }
    });

    // 5️⃣ 📈 الحسبة الذكية للواجهة: نسبة التقدم (الدائرة العلوية) وعدد مهام الجمع المتبقية (الكرت التحتاني)
    const progressPercentage = totalWaypoints > 0 ? Math.round((completedCount / totalWaypoints) * 100) : 0;
    // نستثني محطة المستودع الختامية من عداد مهام الجمع ليطابق التصميم بدقة
    const remainingTasksCount = Math.max(0, totalWaypoints - completedCount - 1);

    // 6️⃣ 🧩 بناء مصفوفة المحطات النهائية وحقن تفاصيل مركز التجمع بالشيخ نجار في ذيل القائمة
    const finalWaypointsList = realWaypoints.map(wp => ({
        ...(() => {
            const rewardClaim = claimsByRequestId.get(String(wp.taskRef?._id || wp.taskRef));
            return rewardClaim ? {
                rewardDelivery: {
                    rewardName: rewardClaim.rewardId?.title || "مكافأة",
                    status: rewardClaim.status,
                    statusLabel: rewardClaim.status === "delivered" ? "تم تسليم المكافأة" : rewardClaim.status === "cancelled" ? "المكافأة ملغاة" : "ستُسلّم مع هذا الطلب"
                }
            } : {};
        })(),
        stopNumber: wp.stopNumber,
        waypointId: wp._id,
        taskType: wp.taskType,
        waypointStatus: wp.status,
        distanceFromPreviousKm: wp.distanceFromPreviousKm,
        details: wp.taskRef ? {
            id: wp.taskRef._id,
            address: wp.taskRef.address || wp.taskRef.location,
            coordinates: (wp.taskRef.lat && wp.taskRef.lng) ? { lat: wp.taskRef.lat, lng: wp.taskRef.lng } : wp.taskRef.location,
            wasteOrBinType: wp.taskRef.wasteType || wp.taskRef.binType,
            fillLevel: wp.taskRef.fillLevel !== undefined ? wp.taskRef.fillLevel : null,
            clientName: wp.taskRef.user ? wp.taskRef.user.name : null,
            clientPhone: wp.taskRef.user ? wp.taskRef.user.phone : null
        } : null
    }));

    // إعادة زرع المستودع الرئيسي ككائن عادي وآمن جغرافياً في نهاية مصفوفة الـ Response للفرونت إند
    if (finalDestinationWaypoint) {
        finalWaypointsList.push({
            stopNumber: finalDestinationWaypoint.stopNumber,
            waypointId: finalDestinationWaypoint._id,
            taskType: "FinalDestination",
            waypointStatus: finalDestinationWaypoint.status,
            distanceFromPreviousKm: finalDestinationWaypoint.distanceFromPreviousKm,
            details: {
                id: "666666666666666666666666",
                address: "حلب - المنطقة الصناعية بالشيخ نجار - المستودع المركزي رقم 7",
                coordinates: { lat: 36.2625, lng: 37.2110 },
                wasteOrBinType: "المستودع الرئيسي",
                fillLevel: null,
                clientName: "الإدارة العامة",
                clientPhone: null
            }
        });
    }

    // 7️⃣ إرجاع الاستجابة المتكاملة والخالية من الأخطاء لتغذية الشاشة كاملة
    res.status(200).json({
        success: true,
        data: {
            routeId: currentRoute._id,
            date: currentRoute.date,
            routeStatus: currentRoute.status,
            estimatedTimeMinutes: currentRoute.estimatedTimeMinutes, 
            remainingDistanceKm: Math.round(remainingDistance * 10) / 10, // المسافة التفاعلية المتبقية شاملة المستودع!
            remainingTasks: remainingTasksCount, // عدد كروت المهام المتبقية في الأسفل
            progress: progressPercentage + "%",  // نسبة التقدم الجاهزة للواجهة
            waypoints: finalWaypointsList // المصفوفة الكاملة والمطابقة لواجهتكِ بالتمام والكمال
        }
    });
});




// =========================================================================
// 🚚 3. للسائق: إتمام محطة داخل المسار (مع معرفة النقاط والوزن ديناميكياً)
// =========================================================================
module.exports.completeWaypoint = asyncHandler(async (req, res) => {
    const { waypointId } = req.body;

    if (!waypointId) {
        return res.status(400).json(["معرف المسار ومعرف المحطة مطلوبان لإتمام العملية"]);
    }

    const route = await Route.findById(req.params.id);
    if (!route) {
        return res.status(404).json(["المسار اللوجستي المطلوب غير موجود"]);
    }

    const waypoint = route.waypoints.id(waypointId);
    if (!waypoint) {
        return res.status(404).json(["المحطة المحددة غير موجودة داخل هذا المسار"]);
    }

    if (waypoint.status === "completed") {
        return res.status(400).json(["هذه المحطة تم إنجازها وإتمامها مسبقاً"]);
    }

    // 🚦 أ) تحديث حالة المحطة الفردية الحالية داخل المسار لتصبح مكتملة
    waypoint.status = "completed";

    // 🏁 ب) الفحص الحرج: هل هذه هي المحطة الأخيرة بالكامل؟
    const allWaypointsCompleted = route.waypoints.every(wp => wp.status === "completed");

    if (allWaypointsCompleted) {
        route.status = "completed"; // إغلاق مسار اليوم بالكامل بنجاح 100%
    } else if (route.status === "pending") {
        route.status = "in_progress"; // تفعيل انطلاق الشاحنة ميدانياً تلقائياً
    }

    // ج) 🔄 التحديث المتوازن في الجداول الأصلية وحساب النقاط ديناميكياً
    const mongoose = require("mongoose");
    let pointsAwardedThisTask = 0; // متغير لحمل عدد النقاط الموزعة لعرضها بالاستجابة للفرونت إيند
    
    if (waypoint.taskType === "WasteRequest") {
        const WasteRequestModel = mongoose.model("WasteRequest");
        
        // 1. جلب طلب النفايات الأصلي لمعرفة نوعه ووزنه
        const currentRequest = await WasteRequestModel.findById(waypoint.taskRef);
        
        if (currentRequest && currentRequest.status !== "completed") {
            // 2. 🚀 جلب مصفوفة الأسعار الحية من جدول ContactInfo دون كسر الـ ERD
            const ContactInfoModel = mongoose.model("ContactInfo");
            const contactConfig = await ContactInfoModel.findOne();
            const pricingMatrix = contactConfig ? contactConfig.wasteTypesPricing : [];

            // 3. البحث عن السعر المخصص للنوع المكتوب بالطلب بالإنجليزية (مثل plastic)
            const matchedType = pricingMatrix.find(
                item => item.typeNameEn.toLowerCase() === currentRequest.wasteType.toLowerCase()
            );

            // 🦺 طوق النجاة الحاسم: إذا لم يجد النوع، يعتمد على الأسعار القديمة لمنع الـ Crash
            let pointsPerKg = 50; 
            if (matchedType) {
                pointsPerKg = matchedType.pointsPerKg;
            } else {
                const typeLower = currentRequest.wasteType.toLowerCase();
                if (typeLower === "plastic") pointsPerKg = 50;
                else if (typeLower === "paper") pointsPerKg = 30;
                else if (typeLower === "metal") pointsPerKg = 100;
                else if (typeLower === "glass") pointsPerKg = 20;
            }

            // 4. الحساب الرياضي الصافي للنقاط المكتسبة للطلب
            pointsAwardedThisTask = Number(currentRequest.quantity) * pointsPerKg;

            // 5. تحديث حالة طلب النفايات الأصلي إلى مكتمل
            currentRequest.status = "completed";
            await currentRequest.save();

            // 6. حقن النقاط المكتسبة وتفعيلها في حساب العميل (User) صاحب الطلب
            const UserModel = mongoose.model("User");
            const requestUser = await UserModel.findById(currentRequest.user);
            if (requestUser) {
                requestUser.points += pointsAwardedThisTask;
                await requestUser.save();
            }
        }

        // 🎁 تحديث المكافآت المربوطة بهذا الطلب تلقائياً إلى "تم التسليم"
        const RewardClaim = mongoose.model("RewardClaim");
        await RewardClaim.updateMany(
            { associatedRecycleRequestId: waypoint.taskRef }, 
            { $set: { status: "delivered" } }
        );
        
    } else if (waypoint.taskType === "Bin") {
        const BinModel = mongoose.model("Bin");
        await BinModel.findByIdAndUpdate(waypoint.taskRef, { 
            $set: { status: "empty", fillLevel: 0 } 
        });
    }

    // د) حفظ التغييرات النهائية في جدول خط سير السير الحالي
    await route.save();

    res.status(200).json({
        success: true,
        message: "تم إتمام المحطة بنجاح، وتوزيع النقاط ديناميكياً لحساب العميل وتحديث الحالات بالسحاب أونلاين!",
        data: {
            waypointId: waypoint._id,
            newStatus: waypoint.status,
            routeStatus: route.status,
            pointsAwarded: pointsAwardedThisTask // يرجع للفرونت كم نقطة نزلت بحساب العميل الآن
        }
    });
});




// =========================================================================
// 👑 للأدمن: جلب كافة مسارات الأرشيف (الأحدث أولاً) مع الـ Pagination والفلترة
// =========================================================================
module.exports.getAdminAllRoutes = asyncHandler(async (req, res) => {
    const { date, status, driverId } = req.query;
    
    // 📄 1️⃣ استخراج إعدادات الـ Pagination مع قيم افتراضية حرة
    const page = parseInt(req.query.page) || 1;    
    const limit = parseInt(req.query.limit) || 5;  
    const skip = (page - 1) * limit;                

    // 2️⃣ بناء الفلتر الديناميكي المفتوح لكل التواريخ
    let tableFilter = {};
    
    // فلترة التاريخ: إذا اختار الأدمن تاريخاً نفلتر به، وإذا تركه فارغاً يجلب كل الأرشيف
    if (date) {
        tableFilter.date = date; // صيغة المقارنة المتوقعة YYYY-MM-DD
    }
    
    // فلترة الحالة (معلق، في التنفيذ، مكتمل)
    if (status && status !== "جميع الحالات") {
        tableFilter.status = status;
    }
    
    // فلترة السائق المختار من القائمة المنسدلة بالواجهة
    if (driverId && driverId !== "جميع السائقين") {
        tableFilter.driver = driverId;
    }

    // 3️⃣ 🧮 حساب إجمالي عدد الأسطر المفلترة الكلي المخزن في قاعدة البيانات
    const totalRoutesInDb = await Route.countDocuments(tableFilter);

    // 4️⃣ جلب المسارات المحددة لهذه الصفحة وفرز "الأحدث أولاً" بشكل صارم ومضمون
    const routes = await Route.find(tableFilter)
        .populate({
            path: "driver",
            select: "name phone driverProfile.vehicle.truckNumber",
            options: { strictPopulate: false }
        })
        .sort({ createdAt: -1 }) 
        .skip(skip)   
        .limit(limit) 
        .lean();

    // 5️⃣ معالجة مخرجات أسطر الجدول لتأتي مقربة وجاهزة للواجهة ولرسم الدوائر الملونة
    const formattedTableData = routes.map(route => {
        const tasksCount = route.waypoints ? route.waypoints.filter(wp => wp.taskType !== "FinalDestination").length : 0;
        
        const completedTasks = route.waypoints ? route.waypoints.filter(wp => wp.status === "completed").length : 0;
        const totalWaypointsCount = route.waypoints ? route.waypoints.length : 0;
        const progressPercentage = totalWaypointsCount > 0 ? Math.round((completedTasks / totalWaypointsCount) * 100) : 0;

        const distanceVal = route.totalDistanceKm || 0;
        const timeHoursVal = Math.round(((route.estimatedTimeMinutes || 0) / 60) * 10) / 10;

        return {
            _id: route._id,
            date: route.date, 
            driverName: route.driver ? route.driver.name : "غير معين",
            status: route.status, 
            tasksCount: tasksCount,                         
            distanceKm: distanceVal + " كم",        
            estimatedTime: timeHoursVal + " ساعة", 
            progress: progressPercentage + "%",             
            waypoints: route.waypoints 
        };
    });

    // 6️⃣ إرسال رد الاستجابة الشامل للـ Pagination والجدول دفعة واحدة للفرونت إند
    res.status(200).json({
        success: true,
        pagination: {
            totalItems: totalRoutesInDb,       
            totalPages: Math.ceil(totalRoutesInDb / limit), 
            currentPage: page,                 
            limit: limit                       
        },
        data: formattedTableData 
    });
});



// =========================================================================
// 👑 للأدمن: جلب تفاصيل مسار واحد محدد عبر الـ ID (النسخة المستقرة والمحمية)
// =========================================================================
module.exports.getAdminSingleRoute = asyncHandler(async (req, res) => {
    
    // 1️⃣ جلب المسار ككائن JavaScript حُر تماماً عبر .lean() لمنع انهيار السيرفر وضمان تخطي قيود الحماية
    const route = await Route.findById(req.params.id)
        .populate("driver", "name phone driverProfile.vehicle")
        .lean(); 

    if (!route) {
        return res.status(404).json({
            success: false,
            message: "المسار المطلوب غير موجود"
        });
    }

    // 2️⃣ 💡 عزل وحماية: فلترة المصفوفة لحظر التداخل التلقائي لـ FinalDestination من الـ Populate
    const realWaypoints = route.waypoints.filter(wp => wp.taskType !== "FinalDestination");
    const finalDestinationWaypoint = route.waypoints.find(wp => wp.taskType === "FinalDestination");

    // 3️⃣ عمل جلب (Populate) يدوي ونظيف للمحطات الحقيقية فقط (البيوت والحاويات)
    const mongoose = require("mongoose");
    const WasteRequestModel = mongoose.model("WasteRequest");
    const BinModel = mongoose.model("Bin");
    for (let wp of realWaypoints) {
        if (wp.taskType === "WasteRequest") {
            // جلب تفاصيل طلب المنزل مع اسم وهاتف العميل يدوياً وبأمان
            wp.taskRef = await WasteRequestModel.findById(wp.taskRef).populate({
                path: "user",
                select: "name phone",
                options: { strictPopulate: false }
            }).lean();
        } else if (wp.taskType === "Bin") {
            // جلب تفاصيل الحاوية الذكية يدوياً
            wp.taskRef = await BinModel.findById(wp.taskRef).lean();
        }
    }

    // 4️⃣ 🧩 بناء مصفوفة المحطات النهائية وحقن تفاصيل مركز التجمع بالشيخ نجار في ذيل القائمة
    const finalWaypointsList = realWaypoints.map(wp => ({
        stopNumber: wp.stopNumber,
        waypointId: wp._id,
        taskType: wp.taskType,
        waypointStatus: wp.status,
        distanceFromPreviousKm: wp.distanceFromPreviousKm,
        details: wp.taskRef ? {
            id: wp.taskRef._id,
            address: wp.taskRef.address,
            coordinates: (wp.taskRef.lat && wp.taskRef.lng) ? { lat: wp.taskRef.lat, lng: wp.taskRef.lng } : wp.taskRef.location, 
            wasteOrBinType: wp.taskRef.wasteType || wp.taskRef.binType,
            fillLevel: wp.taskRef.fillLevel !== undefined ? wp.taskRef.fillLevel : null,
            clientName: wp.taskRef.user ? wp.taskRef.user.name : null,
            clientPhone: wp.taskRef.user ? wp.taskRef.user.phone : null
        } : null
    }));

    // إعادة زرع المستودع الرئيسي ككائن عادي وآمن جغرافياً في نهاية مصفوفة الـ Response للأدمن
    if (finalDestinationWaypoint) {
        finalWaypointsList.push({
            stopNumber: finalDestinationWaypoint.stopNumber,
            waypointId: finalDestinationWaypoint._id,
            taskType: "FinalDestination",
            waypointStatus: finalDestinationWaypoint.status,
            distanceFromPreviousKm: finalDestinationWaypoint.distanceFromPreviousKm,
            details: {
                id: "666666666666666666666666",
                address: "حلب - المنطقة الصناعية بالشيخ نجار - المستودع المركزي رقم 7",
                coordinates: { lat: 36.2625, lng: 37.2110 },
                wasteOrBinType: "المستودع الرئيسي",
                fillLevel: null,
                clientName: "الإدارة العامة",
                clientPhone: null
            }
        });
    }

    // استبدال المصفوفة الخام بالمصفوفة المحدثة والمحمية
    route.waypoints = finalWaypointsList;

    // 5️⃣ إرجاع النتيجة المتكاملة والخالية من الأخطاء لتغذية واجهة الأدمن بالتفصيل
    res.status(200).json({
        success: true,
        data: route
    });
});

module.exports.updateAdminRoute = asyncHandler(async (req, res) => {
    const allowedFields = ["driver", "date", "status", "waypoints", "totalDistanceKm", "estimatedTimeMinutes"];
    const updates = Object.fromEntries(
        allowedFields
            .filter((field) => req.body?.[field] !== undefined)
            .map((field) => [field, req.body[field]])
    );

    if (updates.driver && !mongoose.isValidObjectId(updates.driver)) {
        return res.status(400).json(["معرف السائق غير صحيح"]);
    }

    const route = await Route.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    }).populate("driver", "name email phone");

    if (!route) {
        return res.status(404).json(["المسار غير موجود"]);
    }

    res.status(200).json({ success: true, data: route });
});

module.exports.deleteAdminRoute = asyncHandler(async (req, res) => {
    const route = await Route.findByIdAndDelete(req.params.id);

    if (!route) {
        return res.status(404).json(["المسار غير موجود"]);
    }

    res.status(200).json({ success: true, message: "تم حذف المسار بنجاح" });
});




// =========================================================================
// 🚛 👤 جلب جدول سجل المهام الكامل للسائق مع تفعيل الفلاتر الثلاثة (نسخة صافية بدون وقت)
// =========================================================================
module.exports.getDriverTasksTable = asyncHandler(async (req, res) => {
    // 🛡️ تأكيد أمني: التحقق من دور السائق
    if (req.user.role !== "driver") {
        return res.status(403).json(["عذراً، هذا الإجراء مخصص للسائقين فقط"]);
    }

    const driverId = req.user.id;

    // 🔍 1. استقبال الفلاتر الثلاثة القادمة من واجهة الفرونت إيند عبر الرابط (Query Params)
    const { status, taskType, address } = req.query;

    // 🚀 2. جلب السجل الكامل للمسارات التاريخية الخاصة بالسائق مع الـ Populate
    const allRoutesList = await Route.find({ driver: driverId }).sort({ createdAt: -1 });

    let flatTableRows = [];

    // 📝 3. تفكيك وبناء أسطر الجدول وتطبيق الفلاتر البرمجية بدقة
    for (const route of allRoutesList) {
        if (route.waypoints && route.waypoints.length > 0) {
            for (const [index, wp] of route.waypoints.entries()) {
                
                let dynamicTypeKey = wp.taskType; // WasteRequest or Bin
                let dynamicTitle = "";
                let dynamicAddress = wp.address || "";

                if (wp.taskType === "WasteRequest") {
                    wp.taskRef = await WasteRequest.findById(wp.taskRef).lean();
                } else if (wp.taskType === "Bin") {
                    wp.taskRef = await Bin.findById(wp.taskRef).lean();
                }

                // تشكيل العناوين والأنواع حركيّاً بناءً على المستند المربوط
                if (wp.taskType === "WasteRequest" && wp.taskRef) {
                    dynamicTitle = `استلام من منزل (${wp.taskRef.wasteType || "مختلط"})`;
                    dynamicAddress = wp.taskRef.address || dynamicAddress;
                } else if (wp.taskType === "Bin" && wp.taskRef) {
                    dynamicTitle = `تفريغ حاوية ذكية (امتلاء ${wp.taskRef.fillLevel || 0}%)`;
                    dynamicAddress = wp.taskRef.location || dynamicAddress;
                } else if (wp.taskType === "FinalDestination") {
                    dynamicTitle = "مركز التجمع وإعادة التدوير الرئيسي";
                } else {
                    dynamicTitle = wp.taskType === "WasteRequest" ? "استلام من منزل" : "تفريغ حاوية ذكية";
                }

                // 🚦 منطق تطبيق الفلاتر الثلاثة الحركية (إذا تم إرسال فلتر، نتحقق منه)
                
                // 1. فلتر الحالات (completed, cancelled, pending, in_progress)
                if (status && wp.status !== status) continue;

                // 2. فلتر أنواع المهام (WasteRequest, Bin)
                if (taskType && dynamicTypeKey !== taskType) continue;

                // 3. فلتر المناطق والعناوين (البحث الجزئي بالحي أو الشارع)
                if (address && !dynamicAddress.toLowerCase().includes(address.toLowerCase().trim())) continue;

                // ج) حقن السجل المطابق للفلاتر داخل مصفوفة الجدول الصافية بالملّي
                flatTableRows.push({
                    id: wp._id,
                    taskRefId: wp.taskRef ? wp.taskRef._id : null,
                    taskNumber: `#${String(index + 1).padStart(3, '0')}`, // رقم تتابعي للمهمة
                    taskType: dynamicTitle,
                    address: dynamicAddress,
                    lat: wp.taskRef?.lat ?? null,
                    lng: wp.taskRef?.lng ?? null,
                    date: route.date || new Date(route.createdAt).toLocaleDateString("en-GB"),
                    status: wp.status
                });
            }
        }
    }

    // ✨ الاستجابة النظيفة والصافية لجدول السائق المفلتر
    res.status(200).json({
        success: true,
        message: "تم جلب جدول سجل المهام وتطبيق الفلاتر اللوجستية بنجاح تّام",
        count: flatTableRows.length,
        tableTasks: flatTableRows
    });
});
