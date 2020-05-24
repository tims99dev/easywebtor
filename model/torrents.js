const {
    Schema,
    model
} = require('mongoose')

const schema = new Schema({
    name: String,
    size: {
        type: Number,
        default: 0
    },
    magnet: String,
    date: {
        type: Date,
        default: new Date()
    }
})

module.exports = model('Torent', schema)