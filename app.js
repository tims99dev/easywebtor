const express = require("express")
const bodyParser = require("body-parser")
const fileUpload = require('express-fileupload')
const fs = require("fs")
const parseTorrent = require('parse-torrent')
const mongoose = require("mongoose")
const url = require("url")
const http = require('http')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const passport = require('passport')
const WebTorrent = require('webtorrent')
const WebSocket = require('ws')
const TorentList = require('./model/torrents')
const User = require('./model/users')
const client = new WebTorrent()

let port = process.env.PORT || 80

mongoose.connect(`mongodb+srv://${process.env.DBLOGIN}:${process.env.DBPASS}@cluster-lxzy5.mongodb.net/torrents`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false
})

const app = express()

const server = http.createServer(app)

const wss = new WebSocket.Server({
    server
})

app.use(bodyParser.urlencoded({
    extended: false
}))
app.use(bodyParser.json())
app.use(cors())
app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: './tmp/'
}))
/*
app.get('/torrents', (req, res) => {
    TorentList.find({}, (err, torrents) => {
        res.send(torrents)
    })
})
*/

app.post('/register', function (req, res) {
    const email = req.body.email.toLowerCase()
    const password = req.body.password
    const password2 = req.body.password2

    if (/^(([^<>()\[\]\\.,:\s@"]+(\.[^<>()\[\]\\.,:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/i.test(email) && password.trim() && password2.trim() && password.trim() === password2.trim()) {
        let newUser = new User({
            email: email,
            password: password,
        })

        bcrypt.genSalt(10, function (err, salt) {
            bcrypt.hash(newUser.password, salt, function (err, hash) {
                if (err) {
                    console.log(err)
                }
                newUser.password = hash
                newUser.save(function (err) {
                    if (err) {
                        console.log(err)
                        return
                    } else {
                        res.send('ok')
                    }
                })
            })
        })
    } else {
        res.send('Error.')
    }
})

app.post('/login', function (req, res, next) {
    req.body.email = req.body.email.toLowerCase()
    passport.authenticate('local', {
        successRedirect: '/',
        failureRedirect: '/users/login'
    })(req, res, next)
})

app.post('/torrent', function (req, res) {
    let tr = parseTorrent(fs.readFileSync(req.files.torrent.tempFilePath))
    let torrent = new TorentList({
        name: tr.name,
        magnet: parseTorrent.toMagnetURI(tr)
    })
    torrent.save(function (err, torr) {
        if (err) return handleError(err)
        download(tr.infoHash)
    })
    fs.unlinkSync(req.files.torrent.tempFilePath)
    res.send('Torrent start download')
})

app.post('/magnet', function (req, res) {
    if (req.body.magnet.match(/magnet:\?xt=urn:[a-z0-9]+/i)) {
        let magnet = parseTorrent(req.body.magnet)
        let torrent = new TorentList({
            name: magnet.name,
            magnet: req.body.magnet
        })
        torrent.save(function (err, torr) {
            if (err) return handleError(err)

            download(req.body.magnet)
            res.send('Torrent start download')
        })
    } else {
        res.send('Error: not a magnet')
    }

})

var torrents = []

function download(magnet) {
    client.add(magnet, {
        path: './torrent'
    }, function (torrent) {
        console.dir(`Torrent: ${torrent.infoHash} is start download`)

        torrent.on('download', function () {
            updateTorrInfo(torrent)
        })
        torrent.on('warning', function (err) {
            console.dir(err)
        })
        torrent.on('done', function () {
            console.dir(`Torrent: ${torrent.infoHash} is downloaded`)
            console.dir(torrent.progress)
            updateTorrInfo(torrent)
            //torr.size = torrent.length
            //torr.save()
        })
    })
}

function updateTorrInfo(torrent) {
    let filesTemp = []
    filesTemp = torrent.files.map((e) => {
        return {
            name: e.name,
            size: e.length,
            downloaded: e.downloaded,
            progress: e.progress
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