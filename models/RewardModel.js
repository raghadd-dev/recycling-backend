const mongoose = require("mongoose");
const Joi = require("joi");

const rewardSchema = new mongoose.Schema({
    title: { type: String, required: true },          
    category: { type: String, required: true },       
    pointsRequired: { type: Number, required: true }, 
    stock: { type: Number, default: 0 },         
    claimedCount: { type: Number, default: 9999 },       
    isActive: { type: Boolean, default: true }        
}, { timestamps: true });

const Reward = mongoose.model("Reward", rewardSchema);

// Validation عند إنشاء مكافأة جديدة
const validateCreateReward = (obj) => {
    const schema = Joi.object({
        title: Joi.string().required(),
        category: Joi.string().required(),
        pointsRequired: Joi.number().integer().min(0).required(),
        stock: Joi.number().integer().min(0).required(),
        isActive: Joi.boolean()
    });
    return schema.validate(obj, { abortEarly: false, errors: { wrap: { label: false } } });
};

// ✏️ الـ Validation الجديد الخاص بالتحديث والتعديل
const validateUpdateReward = (obj) => {
    const schema = Joi.object({
        title: Joi.string(),
        category: Joi.string(),
        pointsRequired: Joi.number().integer().min(0),
        stock: Joi.number().integer().min(0),
        isActive: Joi.boolean()
    });
    return schema.validate(obj, { abortEarly: false, errors: { wrap: { label: false } } });
};

module.exports = { 
    Reward, 
    validateCreateReward,
    validateUpdateReward // تصدير الدالة الجديدة
};
