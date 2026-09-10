const { Route} = require("../models/RouteModel");
const { WasteRequest } = require("../models/WasteRequestModel"); // جدول طلبات البيوت
const Bin = require("../models/Bin");  
const asyncHandler = require("express-async-handler");
const { User } = require("../models/User");
const RewardClaim = require("../models/RewardClaimModel"); 
const mongoose = require("mongoose");
const RewardModel = mongoose.model("Reward");


// =========================================================================
// 📊 3. الـ API الموحدة لجلب إحصائيات باقي الصفحات الست للأدمن دفعة واحدة
// =========================================================================
module.exports.getRemainingAdminStats = asyncHandler(async (req, res) => {
    // 🛡 تأكيد أمني: لمدير النظام فقط
    if (req.user.role !== "admin") {
        return res.status(403).json(["عذراً، هذا الإجراء مخصص لمدير النظام فقط"]);
    }

    // 🗓 إعداد فلتر الشهر الحالي لحسابات النمو والتقارير
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 🚀 تنفيذ كافة الاستعلامات المتقدمة بالتوازي لسرعة خارقة وأداء متزن
    const [
        // أ) صفحة المكافآت
        pointsSpentResult,
        usersPointsResult,
        totalClaimsCount,
        uniqueBeneficiaries,
        averagePointsResult,

        // ب) صفحة السائقين
        totalDrivers,
        availableDrivers,
        offlineDrivers,
        activeRoutes,

        // ج) صفحة الطلبات (WasteRequests)
        completedRequestsCount,
        acceptedRequestsCount,
        pendingRequestsCount,
        rejectedRequestsCount,

        // د) صفحة الحاويات الذكية (Bins)
        totalBinsCount,
        normalBinsCount,
        mediumBinsCount,
        fullBinsCount,

        // هـ) صفحة المسارات (Routes)
        totalRoutesCount,
        completedRoutesCount,
        distanceData,
        durationData,

        // و) صفحة التقارير والرسوم البيانية
        wasteTypeDistribution,
        responseTimeResult,
        regionalDistribution,
        driverPerformance
    ] = await Promise.all([
        // 🎁 1. المكافآت
        RewardClaim.aggregate([{ $group: { _id: null, total: { $sum: "$pointsSpent" } } }]),
        User.aggregate([{ $match: { role: "user" } }, { $group: { _id: null, total: { $sum: "$points" } } }]),
        RewardClaim.countDocuments(),
        RewardClaim.distinct("userId"),
        RewardModel.aggregate([
            { $match: { isActive: true } }, 
            { $group: { _id: null, average: { $avg: "$pointsRequired" } } }
        ]),

        // 🚛 2. السائقين
        User.countDocuments({ role: "driver" }),
        User.countDocuments({ role: "driver", status: "available" }),
        User.countDocuments({ role: "driver", status: "offline" }),
        Route.distinct("driver", { status: "in_progress" }),

        // 📦 3. حالات الطلبات
        WasteRequest.countDocuments({ status: "completed" }),
        WasteRequest.countDocuments({ status: "accepted" }),
        WasteRequest.countDocuments({ status: "pending" }),
        WasteRequest.countDocuments({ status: "rejected" }),

        // 🗑 4. الحاويات الذكية
        Bin.countDocuments(),
        Bin.countDocuments({ fillLevel: { $lt: 50 } }),
        Bin.countDocuments({ fillLevel: { $gte: 50, $lt: 80 } }),
        Bin.countDocuments({ fillLevel: { $gte: 80 } }),

        // 🛣 5. المسارات
        Route.countDocuments(),
        Route.countDocuments({ status: "completed" }),
        Route.aggregate([{ $group: { _id: null, totalDist: { $sum: "$totalDistanceKm" } } }]),
        Route.aggregate([{ $group: { _id: null, totalTime: { $sum: "$estimatedTimeMinutes" } } }]),

        // 📊 6. التقارير المتقدمة والأداء البيئي
        WasteRequest.aggregate([
            { $match: { status: "completed" } },
            { $group: { _id: "$wasteType", totalWeight: { $sum: "$quantity" } } }
        ]),
        WasteRequest.aggregate([
            { $match: { status: "completed" } },
            { $project: { durationHours: { $divide: [ { $subtract: ["$updatedAt", "$createdAt"] }, 1000 * 60 * 60 ] } } },
            { $group: { _id: null, avgResponseTime: { $avg: "$durationHours" } } }
        ]),
        WasteRequest.aggregate([
            { $match: { status: "completed" } },
            { $group: { _id: "$address", totalWeight: { $sum: "$quantity" } } },
            { $project: { regionName: "$_id", totalWeightTon: { $divide: ["$totalWeight", 1000] }, _id: 0 } },
            { $limit: 6 }
        ]),
        WasteRequest.aggregate([
            { $match: { status: "completed", driver: { $ne: null } } },
            { $group: { _id: "$driver", totalTrips: { $sum: 1 }, totalWeightCollected: { $sum: "$quantity" } } },
            { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "driverInfo" } },
            { $unwind: "$driverInfo" },
            { $project: { _id: 0, driverName: "$driverInfo.name", tripsCount: "$totalTrips", weightTon: { $round: [{ $divide: ["$totalWeightCollected", 1000] }, 1] }, achievementRate: { $literal: "95%" } } },
            { $limit: 5 }
        ])
    ]);

    // 🧠 معالجة مصفوفات الـ Aggregate لحماية السيرفر من الـ Crashes
    const totalPointsSpent = pointsSpentResult.length > 0 ? pointsSpentResult[0].total : 0;
    const totalUsersPoints = usersPointsResult.length > 0 ? usersPointsResult[0].total : 0;
    
    const totalDistance = distanceData.length > 0 ? distanceData[0].totalDist : 0;
    const totalDurationMinutes = durationData.length > 0 ? durationData[0].totalTime : 0;

    const totalWeightObj = wasteTypeDistribution.reduce((acc, curr) => acc + curr.totalWeight, 0);
    const totalRecycledTon = (totalWeightObj / 1000).toFixed(1);
    const averageResponseTime = (responseTimeResult.length > 0 ? responseTimeResult[0].avgResponseTime : 2.4).toFixed(1);

    // ✨ الاستجابة الموحدة والأنيقة لباقي صفحات واجهة الفرونت إند
    res.status(200).json({
        success: true,
        message: "تم جلب إحصائيات وأعداد الصفحات المتبقية للمسؤول بنجاح تام",
        data: {
            rewardsPage: {
                distributedPoints: totalPointsSpent + totalUsersPoints,
                recoveredIncentives: totalClaimsCount,
                beneficiariesCount: uniqueBeneficiaries.length,
                averageConsumerPoints: Math.round(averagePointsResult[0]?.average || 0)
            },
            driversPage: {
                totalDrivers,
                availableDrivers,
                inMissionDrivers: activeRoutes.length,
                offlineDrivers
            },
            ordersPage: {
                totalOrders: completedRequestsCount + acceptedRequestsCount + pendingRequestsCount + rejectedRequestsCount,
                completedOrders: completedRequestsCount,
                inProgressOrders: acceptedRequestsCount,
                pendingOrders: pendingRequestsCount,
                cancelledOrders: rejectedRequestsCount
            },
            smartBinsPage: {
                totalBins: totalBinsCount,
                normalBins: normalBinsCount,
                warningBins: mediumBinsCount,
                fullBinsCount: fullBinsCount
            },
            routesPage: {
                totalRoutes: totalRoutesCount,
                activeRoutes,
                completedRoutesToday: completedRoutesCount,
                totalDistanceTodayKm: Math.round(totalDistance),
                totalDurationTodayHours: (totalDurationMinutes / 60).toFixed(1)
            },
            reportsAnalyticsPage: {
                totalWasteWeightTon: parseFloat(totalRecycledTon) || 0,
                averageResponseTimeHours: parseFloat(averageResponseTime),
                wasteTypeDistribution: wasteTypeDistribution.map(item => ({
                    type: item._id,
                    weightKg: item.totalWeight,
                    percentage: ((item.totalWeight / (totalWeightObj || 1)) * 100).toFixed(0)
                })),
                regionalDistributionList: regionalDistribution,
                driverPerformanceList: driverPerformance
            }
        }
    });
});



// =========================================================================
// 🚛 الـ API الموحدة والكاملة لإحصائيات تطبيق السائق (جميع الشاشات الـ 4 بالتمام)
// =========================================================================
module.exports.getDriverDashboardStats = asyncHandler(async (req, res) => {
    // 🛡 تأكيد أمني: التحقق من دور السائق أو الأدمن
    if (req.user.role !== "driver" && req.user.role !== "admin") {
        return res.status(403).json(["عذراً، هذا الإجراء مخصص للسائقين فقط"]);
    }

    const driverId = req.user.id;

    // 🚀 تشغيل كافة الاستعلامات بالتوازي لسرعة خارقة وأداء فائق لقاعدة البيانات
    const [
        globalRouteStats,
        activeRouteToday,
        homeRequestsStats,
        totalBins,
        emptyBins,
        fullBins,
        fullPendingBins,
        averageFillResult,
        mediumBinsCount,
        inactiveBinsCount
    ] = await Promise.all([
        
        // 1. استعلام سجل المهام التراكمي (تفكيك الـ waypoints لجميع مسارات السائق)
        Route.aggregate([
            { $match: { driver: new mongoose.Types.ObjectId(driverId) } },
            { $unwind: "$waypoints" },
            {
                $group: {
                    _id: null,
                    totalTasks: { $sum: 1 },
                    completedTasks: { $sum: { $cond: [{ $eq: ["$waypoints.status", "completed"] }, 1, 0] } },
                    pendingTasks: { $sum: { $cond: [{ $eq: ["$waypoints.status", "pending"] }, 1, 0] } },
                    totalEstimatedTime: { $sum: "$estimatedTimeMinutes" }
                }
            }
        ]),

        // 2. استعلام مسار اليوم النشط (حسابات الكروت لصفحة المهام اليومية والمسار الحالي)
        Route.findOne({ driver: driverId, status: { $in: ["pending", "in_progress"] } }).sort({ createdAt: -1 }),

        // 3. استعلام كروت صفحة طلبات المنازل (إجمالي، معلق، مقبول، مكتمل) من جدول WasteRequest
        WasteRequest.aggregate([
            { $match: { driver: new mongoose.Types.ObjectId(driverId) } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                    accepted: { $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] } },
                    completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                    rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } }
                }
            }
        ]),

        // 4. استعلامات صفحة الحاويات الذكية (Bins) العامة بالبرنامج
        Bin.countDocuments(),
        Bin.countDocuments({ status: "empty" }),
        Bin.countDocuments({ status: "full" }),
        Bin.countDocuments({ status: "full_pending" }),
        Bin.aggregate([{ $group: { _id: null, avgFill: { $avg: "$fillLevel" } } }]),
        Bin.countDocuments({ status: "medium" }),
        Bin.countDocuments({ status: "inactive" })
    ]);

    // ==========================================
    // 🧠 1. معالجة وتصفية بيانات سجل المهام بأمان باستخدام [0]
    // ==========================================
    const logStats = globalRouteStats.length > 0 ? globalRouteStats[0] : { totalTasks: 0, completedTasks: 0, pendingTasks: 0, totalEstimatedTime: 0 };
    let averageTimePerTask = 24; 
    if (logStats.totalTasks > 0 && logStats.totalEstimatedTime > 0) {
        averageTimePerTask = Math.round(logStats.totalEstimatedTime / logStats.totalTasks);
    }

    // ==========================================
    // 🧠 2. معالجة حسابات صفحة المسار الحالي والمهام اليومية
    // ==========================================
    let dailyRouteCounters = { totalTasks: 0, completed: 0, remaining: 0, remainingDistanceKm: 0 };
    
    if (activeRouteToday) {
        const totalTasksToday = activeRouteToday.waypoints.length;
        const completedToday = activeRouteToday.waypoints.filter(wp => wp.status === "completed").length;
        const remainingToday = activeRouteToday.waypoints.filter(wp => wp.status === "pending").length;
        
        // حساب المسافة المتبقية للمحطات التي لم تكتمل بعد ديناميكياً
        const remainingDistance = activeRouteToday.waypoints
            .filter(wp => wp.status === "pending")
            .reduce((sum, wp) => sum + (wp.distanceFromPreviousKm || 0), 0);

        dailyRouteCounters = {
            totalTasks: totalTasksToday,
            completed: completedToday,
            remaining: remainingToday,
            remainingDistanceKm: parseFloat(remainingDistance.toFixed(1)) || activeRouteToday.totalDistanceKm
        };
    }

    // ==========================================
    // 🧠 3. معالجة حسابات طلبات المنازل والحاويات بأمان باستخدام [0]
    // ==========================================
    const homeStats = homeRequestsStats.length > 0 ? homeRequestsStats[0] : { total: 0, pending: 0, accepted: 0, completed: 0, rejected: 0 };
    const avgFillLevel = averageFillResult.length > 0 ? Math.round(averageFillResult[0].avgFill) : 0;

    // ✨ إرسال المخرجات مصفوفة ومقسمة لكل واجهة بالملّي
    res.status(200).json({
        success: true,
        message: "تم جلب واحتساب إحصائيات تطبيق السائق بالكامل لجميع الشاشات بنجاح",
        data: {
            mainDashboardAndDailyRoute: {
                coreCards: dailyRouteCounters,
                bottomSummaryWidgets: {
                    binsWidget: {
                        needEmptyCount: fullPendingBins,
                        highLevel: fullBins,
                        mediumLevel: mediumBinsCount,
                        lowLevel: emptyBins
                    },
                    homeRequestsWidget: {
                        pendingCount: homeStats.accepted,
                        completedCount: homeStats.completed
                    }
                }
            },
            taskLogPage: {
                totalTasks: logStats.totalTasks,
                completedTasks: logStats.completedTasks,
                cancelledTasks: homeStats.rejected,
                inProgressTasks: logStats.pendingTasks,
                averageTimePerTask
            },
            homeRequestsPage: {
                totalOrders: homeStats.total,
                pendingOrders: homeStats.pending,
                inProgressOrders: homeStats.accepted,
                completedOrders: homeStats.completed,
                cancelledOrders: homeStats.rejected
            },
            smartBinsPage: {
                totalBins,
                availableBins: emptyBins,
                fullBinsCount: fullBins,
                deliveryPendingBins: fullPendingBins,
                averageFillLevelPercentage: avgFillLevel,
                donutChart: {
                    empty: emptyBins,
                    medium: mediumBinsCount,
                    full: fullBins,
                    inactive: inactiveBinsCount
                }
            }
        }
    });
});

// =========================================================================
// 🌐 1. إحصائيات الشاشة الرئيسية العامة للموقع (Landing Page Stats - لجميع الزوار)
// =========================================================================
module.exports.getLandingPageStats = asyncHandler(async (req, res) => {
    const [totalUsers, totalRequests, totalBins, allCompletedWeightResult] = await Promise.all([
        User.countDocuments(),
        WasteRequest.countDocuments(),
        Bin.countDocuments(),
        WasteRequest.aggregate([
            { $match: { status: "completed" } },
            { $group: { _id: null, totalWeight: { $sum: "$quantity" } } }
        ])
    ]);

    const totalWeightKg = allCompletedWeightResult.length > 0 ? allCompletedWeightResult[0].totalWeight : 0;
    const totalRecycledTon = (totalWeightKg / 1000).toFixed(0);

    res.status(200).json({
        success: true,
        message: "تم جلب إحصائيات العامة للموقع بنجاح",
        data: {
            usersCount: totalUsers,
            requestsCount: totalRequests,
            recycledTon: parseFloat(totalRecycledTon) || 0,
            binsCount: totalBins
        }
    });
});

// =========================================================================
// 👤 2. الـ API الموحدة والجبارة: جلب إحصائيات وأعداد جميع واجهات المستخدم (اليوزر)
// =========================================================================
module.exports.getUserDashboardStats = asyncHandler(async (req, res) => {
    // 🛡 تأكيد أمني: التحقق من دور المستخدم العادي
    if (req.user.role !== "user") {
        return res.status(403).json(["عذراً، هذا الإجراء مخصص للمستخدمين فقط"]);
    }

    const userId = req.user.id;

    // 🚀 تشغيل كافة الاستعلامات بالتوازي لسرعة خارقة وأداء فائق لقاعدة البيانات
    const [
        currentUser,
        totalMyRequests,
        pendingMyRequests,
        acceptedMyRequests,
        completedMyRequests,
        rejectedMyRequests,
        myHistoryStatsResult,
        myActiveClaimsCount,
        myDeliveredClaimsCount,
        latestRequestsList
    ] = await Promise.all([
        User.findById(userId, "points"),
        WasteRequest.countDocuments({ user: userId }),
        WasteRequest.countDocuments({ user: userId, status: "pending" }),
        WasteRequest.countDocuments({ user: userId, status: "accepted" }),
        WasteRequest.countDocuments({ user: userId, status: "completed" }),
        WasteRequest.countDocuments({ user: userId, status: "rejected" }),
        WasteRequest.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId), status: "completed" } },
            {
                $group: {
                    _id: null,
                    totalWeight: { $sum: "$quantity" },
                    averageWeight: { $avg: "$quantity" }
                }
            }
        ]),
        RewardClaim.countDocuments({ userId: userId, status: "waiting_next_pickup" }),
        RewardClaim.countDocuments({ userId: userId, status: "delivered" }),
        WasteRequest.find({ user: userId }).sort({ createdAt: -1 }).limit(4)
    ]);

    // 🧠 معالجة مصفوفات الـ Aggregate وتأمين الـ toFixed بأعلى حماية برمجية
    const historyStats = myHistoryStatsResult.length > 0 ? myHistoryStatsResult[0] : { totalWeight: 0, averageWeight: 0 };

    const totalWeight = typeof historyStats.totalWeight === "number" ? historyStats.totalWeight : 0;
    const averageWeight = typeof historyStats.averageWeight === "number" ? historyStats.averageWeight : 0;

    // ✨ الاستجابة الموحدة والأنيقة لجميع شاشات واجهة الفرونت إند لليوزر
    res.status(200).json({
        success: true,
        message: "تم احتساب وجلب جميع إحصائيات وأعداد واجهات المستخدم بنجاح تام",
        data: {
            userDashboardPage: {
                totalRequests: totalMyRequests,
                completedRequests: completedMyRequests,
                recycledWeightKg: parseFloat(totalWeight.toFixed(1)) || 0,
                currentPoints: currentUser?.points || 0,
                monthlyProgress: {
                    pointsThisMonth: 650,
                    nextRewardTarget: 1000
                },
                recentRequests: latestRequestsList.map(req => ({
                    id: req._id,
                    address: req.address,
                    wasteType: req.wasteType,
                    quantity: `${req.quantity} كغ`,
                    date: new Date(req.createdAt).toLocaleDateString("en-GB"),
                    status: req.status
                }))
            },
            orderTrackingPage: {
                totalOrders: totalMyRequests,
                pendingOrders: pendingMyRequests,
                inProgressOrders: acceptedMyRequests,
                completedOrders: completedMyRequests
            },
            recyclingHistoryPage: {
                totalWeightKg: parseFloat(totalWeight.toFixed(1)) || 0,
                totalCompletedOps: completedMyRequests || 0,
                currentPoints: currentUser?.points || 0,
                averageWeightPerOp: parseFloat(averageWeight.toFixed(1)) || 0
            },
            myRewardsSummary: {
                activeClaimsCount: myActiveClaimsCount,
                totalReceivedRewards: myDeliveredClaimsCount
            }
        }
    });
});




// =========================================================================
// 🕵️‍♂️ لوحة التقارير الحقيقية: تغذية كروت وشارتات الصفحة ديناميكياً 100% وبدون داتا وهمية
// =========================================================================
module.exports.getAdminReportsDashboard = asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") {
        return res.status(403).json(["عذراً، هذا الإجراء مخصص لمدير النظام فقط"]);
    }

    // 🔍 1. استقبال الفلاتر العليا الحركية من واجهة الفرونت إيند عبر الرابط (Query Params)
    const { region, wasteType, startDate, endDate, period = "month" } = req.query;

    // ⏱️ 2. بناء النطاق الزمني الفعلي للبحث بناءً على الفلاتر المدخلة
    let start = new Date();
    let end = new Date();

    if (startDate && endDate) {
        start = new Date(startDate);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // لتضمين نهاية اليوم الأخير كاملاً
    } else {
        // إذا لم يرسلوا تواريخ محددة، نعتمد على أزرار التبديل الجانبية (يوم، أسبوع، شهر، سنة)
        if (period === "day") {
            start.setHours(0, 0, 0, 0);
        } else if (period === "week") {
            start.setDate(start.getDate() - 7);
            start.setHours(0, 0, 0, 0);
        } else if (period === "year") {
            start.setMonth(0, 1);
            start.setHours(0, 0, 0, 0);
        } else {
            // الافتراضي (شهر): من بداية الشهر الحالي
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
        }
    }

    // 📊 3. بناء كائن استعلام الفرز لطلبات التدوير المكتملة وحقن الفلاتر حياً
    let matchQuery = {
        status: "completed",
        createdAt: { $gte: start, $lte: end }
    };

    if (wasteType) matchQuery.wasteType = wasteType.toLowerCase().trim();
    if (region) matchQuery.address = { $regex: region, $options: "i" }; // فلترة حركية حسب المنطقة المحددة بالواجهة

    // 🚀 4. تشغيل استعلامات الـ Aggregate التوازية المتقدمة لجمع الأرقام الصافية من المستندات الحقيقية
    const [
        cardsAndSummaryData,
        wasteTypeDistribution,
        timelineData,
        regionDistribution,
        driversPerformance,
        responseTimeData,
        activeUsersCount
    ] = await Promise.all([
        // أ) حساب إجمالي الأوزان بالكيلو وإجمالي عدد الطلبات الحقيقية المطابقة للفلاتر
        WasteRequest.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalWeightKg: { $sum: "$quantity" },
                    totalOrdersCount: { $sum: 1 }
                }
            }
        ]),

        // ب) شارت الدائرة الأيسر: تجميع الأوزان الحقيقية والنسب المئوية لكل نوع نفايات مسجل
        WasteRequest.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: "$wasteType",
                    weight: { $sum: "$quantity" },
                    count: { $sum: 1 }
                }
            }
        ]),

        // ج) الشارت المركزي الأوسط: فرز كميات الأوزان وعدد الطلبات الحقيقية حسب التواريخ (الأيام أو الشهور)
        WasteRequest.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: { $dateToString: { format: period === "year" ? "%Y-%m" : "%m-%d", date: "$createdAt" } },
                    weightKg: { $sum: "$quantity" },
                    ordersCount: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]),

        // د) شارت التوزيع الجغرافي بالوسط: فرز أوزان النفايات الحقيقية المجمعة حسب الحي أو المنطقة
        WasteRequest.aggregate([
            { $match: matchQuery },
            { $group: { _id: "$address", weightKg: { $sum: "$quantity" } } },
            { $sort: { weightKg: -1 } }
        ]),

        // هـ) جدول أداء السائقين الحقيقي: جلب أسماء السائقين الفعليين وعدد رحلاتهم المكتملة من قاعدة البيانات
        Route.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end } } },
            {
                $group: {
                    _id: "$driver",
                    totalTrips: { $sum: 1 },
                    completedRoutes: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } }
                }
            },
            {
                $lookup: {
                    from: "users", // اسم كوليكشن المستخدمين في قاعدة البيانات
                    localField: "_id",
                    foreignField: "_id",
                    as: "driverInfo"
                }
            },
            { $unwind: { path: "$driverInfo", preserveNullAndEmptyArrays: true } }
        ]),

        // و) حساب متوسط وقت الاستجابة الحقيقي بالدقائق والساعات (الفارق الزمني الفعلي بين تاريخ إنشاء الطلب وتاريخ إتمامه)
        WasteRequest.aggregate([
            { $match: { status: "completed", updatedAt: { $exists: true }, createdAt: { $gte: start, $lte: end } } },
            {
                $project: {
                    diffInHours: { $divide: [{ $subtract: ["$updatedAt", "$createdAt"] }, 1000 * 60 * 60] }
                }
            },
            {
                $group: {
                    _id: null,
                    avgResponseHours: { $avg: "$diffInHours" }
                }
            }
        ]),

        // ز) عد المستخدمين النشطين الفعليين المسجلين بالنظام حالياً
        User.countDocuments({ status: "active" })
    ]);

    // 🧠 5. الفرز والحسابات الرياضية الصافية وتحويل الأرقام التراكمية لأطنان حقيقية
    const stats = cardsAndSummaryData.length > 0 ? cardsAndSummaryData[0] : { totalWeightKg: 0, totalOrdersCount: 0 };
    
    // تحويل الكيلوغرام الحقيقي إلى أطنان بدقة (مثال: 28400 كغ تصبح 28.4 طن)
    const totalTons = stats.totalWeightKg > 0 ? (stats.totalWeightKg / 1000).toFixed(1) : "0.0";

    // حساب متوسط وقت الاستجابة الصافي من المستندات بدون فرضيات ثابتة
    const realAvgHours = responseTimeData.length > 0 ? responseTimeData[0].avgResponseHours : 0;
    const finalResponseTimeText = realAvgHours > 0 ? `${realAvgHours.toFixed(1)} ساعة` : "قيد الحساب";

    // صياغة مصفوفة شارت الدائرة الأيسر لنسب أنواع النفايات الحقيقية
    let pieChart = wasteTypeDistribution.map(item => {
        const percentageValue = stats.totalWeightKg > 0 ? Math.round((item.weight / stats.totalWeightKg) * 100) : 0;
        return {
            type: item._id,
            label: item._id === "plastic" ? "بلاستيك" : item._id === "paper" ? "ورق" : item._id === "metal" ? "معادن" : item._id === "glass" ? "زجاج" : item._id,
            tons: (item.weight / 1000).toFixed(1),
            percentage: `${percentageValue}%`
        };
    });

    // صياغة جدول أداء السائقين الفعليين المسجلين في المونغو عبر رحلاتهم ومساراتهم الحقيقية
    let driversTable = driversPerformance.map(d => {
        const completionRate = d.totalTrips > 0 ? Math.round((d.completedRoutes / d.totalTrips) * 100) : 0;
        return {
            driverId: d._id,
            driverName: d.driverInfo ? d.driverInfo.name : "سائق غير معروف",
            tripsCount: d.totalTrips || 0,
            achievementRate: `${completionRate}%`
        };
    });

    // جلب عدد الرحلات الكلية المسجلة للمسارات المكتملة في النظام
    const realCompletedTripsCount = await Route.countDocuments({ status: "completed", createdAt: { $gte: start, $lte: end } });

    // ✨ 6. إرسال كائن الاستجابة الصافي والخالي من أي بيانات افتراضية لتغذية الواجهة بالكامل
    res.status(200).json({
        success: true,
        message: "تم توليد وتجميع كافة تقارير صفحة الإحصائيات البيئية حقيقياً 100% بنجاح",
        data: {
            // الكروت الخمسة العلوية الصافية
            cards: {
                totalRecycledWeight: `${totalTons} طن`,                 // كرت 1
                totalOrders: stats.totalOrdersCount || 0,               // كرت 2
                totalRecycleOperations: stats.totalOrdersCount || 0,    // كرت 3 (عدد عمليات الاستلام الناجحة)
                activeUsers: activeUsersCount || 0,                     // كرت 4
                totalTrips: realCompletedTripsCount || 0                 // كرت 5 (عدد الرحلات المسجلة حقيقياً)
            },
            // الرسوم البيانية والجداول السفلية المستخرجة ديناميكياً
            chartsAndTables: {
                wasteTypePieChart: pieChart, // شارت الدائرة الأيسر الحقيقي
                
                // الشارت المركزي العمودي والمنحنى المزدوج بالأوسط
                timelineAnalytics: timelineData.map(t => ({
                    dateLabel: t._id,
                    tons: (t.weightKg / 1000).toFixed(1), // الأعمدة الخضراء بالطن
                    orders: t.ordersCount                 // المنحنى العلوي للطلبات
                })),

                // شارت التوزيع الجغرافي بالأوسط (النفايات حسب الحي بالطن)
                regionDistribution: regionDistribution.map(r => ({
                    regionName: r._id || "منطقة غير محددة",
                    tons: (r.weightKg / 1000).toFixed(1)
                })),

                // جدول أداء السائقين الفعليين (اليسار السفلي)
                driversPerformanceTable: driversTable,

                // ملخص التقرير الرقمي الصافي (اليمين السفلي) الموازي بالملي للكروت
                reportSummarySideList: {
                    totalWeight: `${totalTons} طن`,
                    totalOperations: stats.totalOrdersCount || 0,
                    totalOrdersCount: stats.totalOrdersCount || 0,
                    totalActiveUsers: activeUsersCount || 0,
                    totalTripsCount: realCompletedTripsCount || 0,
                    averageResponseTime: finalResponseTimeText // متوسط وقت الاستجابة الفعلي التلقائي من التايم ستامب
                }
            }
        }
    });
});
