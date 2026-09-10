const mongoose = require("mongoose");

const binSchema = new mongoose.Schema(
    {
        binNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        location: {
            type: String,
            required: true,
            trim: true
        },

        lat: {
            type: Number,
            required: true
        },

        lng: {
            type: Number,
            required: true
        },

        fillLevel: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
            default: 0
        },

        status: {
            type: String,
            enum: [
                "empty",
                "medium",
                "full",
                "full_pending", 
                "inactive"
            ],
            default: "empty"
        }
    },
    {
        timestamps: true
    }
);

const Bin = mongoose.model("Bin", binSchema);

module.exports = Bin;