const Bin = require("../models/Bin");
const ContactInfo = require("../models/ContactInfoModel");

// ========================================
// Get all bins with search, status filter and pagination
// ========================================
const getBins = async (req, res) => {
    try {
        const { status, search } = req.query;

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

        // Search by bin number or location
        if (search) {
            filter.$or = [
                {
                    binNumber: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    location: {
                        $regex: search,
                        $options: "i"
                    }
                }
            ];
        }

        // Get total number of bins matching the filter
        const totalBins = await Bin.countDocuments(filter);

        // Get bins for current page
        const bins = await Bin.find(filter)
            .sort({
                createdAt: -1
            })
            .skip(skip)
            .limit(validLimit);

        // Calculate total pages
        const totalPages = Math.ceil(
            totalBins / validLimit
        );

        res.status(200).json({
            page: validPage,
            limit: validLimit,
            totalBins,
            totalPages,
            count: bins.length,
            bins
        });

    } catch (error) {
        res.status(500).json({
            message: "فشل في جلب الحاويات",
            error: error.message
        });
    }
};


// ========================================
// Get one bin
// ========================================
const getBinById = async (req, res) => {
    try {
        const bin = await Bin.findById(req.params.id);

        if (!bin) {
            return res.status(404).json({
                message: "الحاوية غير موجودة"
            });
        }

        res.status(200).json(bin);

    } catch (error) {
        res.status(500).json({
            message: "فشل في جلب الحاوية",
            error: error.message
        });
    }
};


// ========================================
// Create new bin
// ========================================
const createBin = async (req, res) => {
    try {
        const { fillLevel, ...otherData } = req.body;

        // Validate fill level
        if (fillLevel === undefined) {
            return res.status(400).json({
                message: "مستوى الامتلاء مطلوب"
            });
        }

        if (fillLevel < 0 || fillLevel > 100) {
            return res.status(400).json({
                message: "يجب أن يكون مستوى الامتلاء بين 0 و 100"
            });
        }
        const contactConfig = await ContactInfo.findOne();
        const currentThreshold = contactConfig ? contactConfig.criticalFillLevelThreshold : 80;
        // Determine status automatically
        let status;

        if (fillLevel <= 30) {
            status = "empty";
        } else if (fillLevel <= currentThreshold) {
            status = "medium";
        } else {
            status = "full";
        }

        const bin = await Bin.create({
            ...otherData,
            fillLevel,
            status
        });

        res.status(201).json({
            message: "تم إنشاء الحاوية بنجاح",
            bin
        });

    } catch (error) {
        res.status(400).json({
            message: "فشل في إنشاء الحاوية",
            error: error.message
        });
    }
};


// ========================================
// Update bin
// ========================================
const updateBin = async (req, res) => {
    try {
        const { fillLevel, status } = req.body;

        // Allow admin to deactivate the bin

        if (status === "inactive") {
            const bin = await Bin.findByIdAndUpdate(
                req.params.id,
                {
                    status: "inactive"
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!bin) {
                return res.status(404).json({
                    message: "الحاوية غير موجودة"
                });
            }

            return res.status(200).json({
                message: "تم تحديث الحاوية بنجاح",
                bin
            });
        }

        // fillLevel is required when setting an active status
        if (fillLevel === undefined) {
            return res.status(400).json({
                message: "مستوى الامتلاء مطلوب"
            });
        }

        // Validate fill level
        if (fillLevel < 0 || fillLevel > 100) {
            return res.status(400).json({
                message: "يجب أن يكون مستوى الامتلاء بين 0 و 100"
            });
        }
        const contactConfig = await ContactInfo.findOne();
        const currentThreshold = contactConfig ? contactConfig.criticalFillLevelThreshold : 80;
        // Determine status automatically
        let newStatus;

        if (fillLevel <= 30) {
            newStatus = "empty";
        } else if (fillLevel <= currentThreshold) {
            newStatus = "medium";
        } else {
            newStatus = "full";
        }

        const bin = await Bin.findByIdAndUpdate(
            req.params.id,
            {
                fillLevel,
                status: newStatus
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!bin) {
            return res.status(404).json({
                message: "الحاوية غير موجودة"
            });
        }

        res.status(200).json({
            message: "تم تحديث الحاوية بنجاح",
            bin
        });

    } catch (error) {
        res.status(400).json({
            message: "فشل في تحديث الحاوية",
            error: error.message
        });
    }
};


// ========================================
// Get bins statistics
// ========================================
const getBinStats = async (req, res) => {
    try {
        const totalBins = await Bin.countDocuments();

        const emptyBins = await Bin.countDocuments({
            status: "empty"
        });

        const mediumBins = await Bin.countDocuments({
            status: "medium"
        });

        const fullBins = await Bin.countDocuments({
            status: "full"
        });

        const inactiveBins = await Bin.countDocuments({
            status: "inactive"
        });

        const fillLevelData = await Bin.aggregate([
            {
                $group: {
                    _id: null,
                    averageFillLevel: {
                        $avg: "$fillLevel"
                    }
                }
            }
        ]);

        const averageFillLevel =
            fillLevelData.length > 0
                ? Math.round(
                    fillLevelData[0].averageFillLevel
                )
                : 0;

        // Calculate percentages
        const emptyPercentage =
            totalBins > 0
                ? Math.round(
                    (emptyBins / totalBins) * 100
                )
                : 0;

        const mediumPercentage =
            totalBins > 0
                ? Math.round(
                    (mediumBins / totalBins) * 100
                )
                : 0;

        const fullPercentage =
            totalBins > 0
                ? Math.round(
                    (fullBins / totalBins) * 100
                )
                : 0;

        const inactivePercentage =
            totalBins > 0
                ? Math.round(
                    (inactiveBins / totalBins) * 100
                )
                : 0;

        res.status(200).json({

            totalBins,

            emptyBins,
            emptyPercentage,

            mediumBins,
            mediumPercentage,

            fullBins,
            fullPercentage,
            inactiveBins,
            inactivePercentage,

            averageFillLevel

        });

    } catch (error)  {
        res.status(500).json({
            message: "فشل في جلب إحصائيات الحاويات",
            error: error.message
        });
    }
};


// ========================================
// Get bins data for map
// ========================================
const getBinsForMap = async (req, res) => {
    try {
        const bins = await Bin.find(
            {},
            {
                binNumber: 1,
                location: 1,
                lat: 1,
                lng: 1,
                fillLevel: 1,
                status: 1
            }
        ).sort({
            createdAt: -1
        });

        res.status(200).json({
            count: bins.length,
            bins
        });

    } catch (error) {
        res.status(500).json({
            message: "فشل في جلب بيانات الحاويات للخريطة",
            error: error.message
        });
    }
};


module.exports = {
    getBins,
    getBinById,
    createBin,
    updateBin,
    getBinStats,
    getBinsForMap
};