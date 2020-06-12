const express = require("express")
const bodyParser = require("body-parser")
const fileUpload = require('express-fileupload')
const fs = require("fs")
const parseTorrent = require('parse-torrent')
const mongoose = require("mongoose")
const url = require("url")
const http = require('http')
const cors = require('cors')
const passport = require('passport')
const cookieSession = require('cookie-session')
const WebTorrent = require('webtorrent')
const WebSocket = require('ws')


const TorrentList = require('./model/torrents')
const User = require('./model/users')

let port = process.env.PORT || 80
process.env.DBLOGIN = 'temp'
process.env.DBPASS = '987654321'
mongoose.connect(`mongodb+srv://${process.env.DBLOGIN}:${process.env.DBPASS}@cluster-lxzy5.mongodb.net/torrents`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false
})

const app = express()

const client = new WebTorrent()

const server = http.createServer(app)

const wss = new WebSocket.Server({
    server
})
app.use(cookieSession({
    name: 'session',
    keys: ['secret'],
}))
require('./config/passport')(passport);
// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

app.use(bodyParser.urlencoded({
    extended: false
}))
app.use(bodyParser.json())
app.use(cors())
app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: './tmp/'
}))

app.use('/torrent', express.static(__dirname + '/torrent'));

let users = require('./routers/user')
app.use('/users', users)

function handleError(error) {
    console.error(error)
}

app.post('/torrent', function (req, res) {
    if (req.files.torrent.mimetype === "application/x-bittorrent") {
        let torrent = parseTorrent(fs.readFileSync(req.files.torrent.tempFilePath))

        download(torrent, req.user)

        fs.unlinkSync(req.files.torrent.tempFilePath)
        res.send('Torrent start download')
    } else {
        res.status(500).send('Error: this file not supported')
    }
})

app.post('/magnet', function (req, res) {
    if (req.body.magnet.match(/magnet:\?xt=urn:[a-z0-9]+/i)) {
        let magnet = parseTorrent(req.body.magnet)

        download(magnet, req.user)
        res.send('Torrent start download')

    } else {
        res.status(500).send('Error: not a magnet')
    }
})

var torrents = []

async function download(torrent, user) {
    if (user) {
        let doc = await User.findById(user.id)
        //doc.torrents.push(torrent.infoHash)
        if (doc.torrents.indexOf(torrent.infoHash) === -1)
            doc.torrents.push(torrent.infoHash);
        doc.save((err) => {
            if (err) return handleError(err)
        })
        /*
        User.updateOne({ id: user.id }, { $push: { torrents: torrent.infoHash } }, (err) => {
            if (err) return handleError(err)
        })
        */
    }
    TorrentList.findOne({ infoHash: torrent.infoHash }, (err, doc) => {
        if (err) return handleError(err)
        if (!doc) {
            client.add(torrent, {
                path: './torrent/' + torrent.infoHash
            }, function (torrent) {
                let dbTorrnet = new TorrentList({
                    name: torrent.name,
                    magnet: parseTorrent.toMagnetURI(torrent),
                    size: torrent.length,
                    infoHash: torrent.infoHash
                })
                dbTorrnet.save(function (err, torr) {
                    if (err) return handleError(err)
                })
                console.dir(`Torrent: ${torrent.infoHash} is start download`)

                torrent.on('download', function () {
                    updateTorrInfo(torrent)
                })
                torrent.on('done', function () {
                    console.dir(`Torrent: ${torrent.infoHash} is downloaded`)
                    console.dir(torrent.progress)
                    updateTorrInfo(torrent)
                    //torr.size = torrent.length
                    //torr.save()
                })
            })
        } else {

        }
    })

}

function updateTorrInfo(torrent) {
    let filesTemp = []
    filesTemp = torrent.files.map((e) => {
        return {
            name: e.name,
            size: e.length,
            downloaded: e.downloaded,
            progress: e.progress,
            path: e.path
        }
    })
    let index = torrents.findIndex(el => el.id === torrent.infoHash)
    index = index === -1 ? torrents.length : index
    torrents[index] = {
        id: torrent.infoHash,
        name: torrent.name,
        length: torrent.length,
        downloaded: torrent.downloaded,
        downloadSpeed: torrent.downloadSpeed,
        progress: torrent.progress,
        files: filesTemp
    }
}

wss.on('connection', function connection(ws, req) {
    console.log("connection ...")
    const parameters = url.parse(req.url, true)

    if (parameters.query.id) {
        ws.id = parameters.query.id
        let timer
        if (wss.clients.size == 1) {
            timer = setTimeout(function tick() {
                wss.clients.forEach(function each(client) {
                    let torr = torrents.find(el => el.id === client.id)
                    if (torr) {
                        ws.send(JSON.stringify(torr))
                        console.dir(torrents)
                        if (torr.progress === 1) {
                            ws.close()
                        }
                    }
                })
                if (wss.clients.size == 0) {
                    clearTimeout(timer)
                }
                timer = setTimeout(tick, 1500)
            }, 2000)
        }

        wss.clients.forEach(function each(client) {
            console.log('Client.ID: ' + client.id)
        })
    } else {
        ws.send("Error connection.")
        ws.close()
    }
})

server.listen(port, function () {
    console.log("Started on PORT " + port)
})