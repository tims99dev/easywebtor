const express = require("express")
const bodyParser = require("body-parser");
const fileUpload = require('express-fileupload');
const fs = require("fs");
const parseTorrent = require('parse-torrent')
const mongoose = require("mongoose")
const cors = require('cors')
const TorentList = require('./model/torrents')

mongoose.connect('mongodb+srv://process.env.DBLOGIN:process.env.DBPASS@cluster-lxzy5.mongodb.net/torrents', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false
})

const app = express();

app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json())
app.use(cors())
app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: './tmp/'
}));


var WebTorrent = require('webtorrent')

var client = new WebTorrent()

app.get('torrents', (req, res) => {
    TorentList.find({}, (err, torrents) => {
        res.send(torrents)
    })
})

app.post('/torrent', function (req, res) {
    let tr = parseTorrent(fs.readFileSync(req.files.torrent.tempFilePath))
    let torrent = new TorentList({
        name: tr.name,
        magnet: parseTorrent.toMagnetURI(tr)
    })
    torrent.save(function (err, torr) {
        if (err) return handleError(err)
        // console.log(torr)

        client.add(tr.infoHash, {
            path: './torrent'
        }, function (torrent) {
            torrent.on('download', function (bytes) {

            })
            torrent.on('done', function () {
                torr.size = torrent.length
                torr.save()
            })
        })
    })
    fs.unlinkSync(req.files.torrent.tempFilePath)
})

app.post('/magnet', function (req, res) {
    if (req.body.magnet.match(/magnet:\?xt=urn:[a-z0-9]{20,50}/i)) {
        let magnet = parseTorrent(req.body.magnet)
        let torrent = new TorentList({
            name: magnet.name,
            magnet: req.body.magnet
        })
        torrent.save(function (err, torr) {
            if (err) return handleError(err);
            // console.log(torr)

            client.add(req.body.magnet, {
                path: './torrent'
            }, function (torrent) {
                torrent.on('download', function (bytes) {
                    // console.log('just downloaded: ' + bytes)
                    // console.log('total downloaded: ' + torrent.downloaded)
                    // console.log('download speed: ' + torrent.downloadSpeed)
                    // console.log('progress: ' + torrent.progress)
                })
                torrent.on('done', function () {
                    torr.size = torrent.length
                    torr.save()
                })
            })
        })
    } else {
        res.send('Error: not a magnet')
    }
})

app.listen(3000, function () {
    console.log("Started on PORT 3000");
})