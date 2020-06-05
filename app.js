const express = require("express")
const bodyParser = require("body-parser");
const fileUpload = require('express-fileupload');
const fs = require("fs");
const parseTorrent = require('parse-torrent')
const mongoose = require("mongoose")
const url = require("url")
const http = require('http')
const cors = require('cors')
const TorentList = require('./model/torrents')
const WebTorrent = require('webtorrent')
const WebSocket = require('ws');

const client = new WebTorrent()

let port = process.env.PORT | 80
/*
mongoose.connect(`mongodb+srv://${process.env.DBLOGIN}:${process.env.DBPASS}@cluster-lxzy5.mongodb.net/torrents`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false
})
*/
const app = express();

const server = http.createServer(app);

const wss = new WebSocket.Server({
    server
});

app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json())
app.use(cors())
app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: './tmp/'
}));
/*
app.get('/torrents', (req, res) => {
    TorentList.find({}, (err, torrents) => {
        res.send(torrents)
    })
})
*/
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
})

app.post('/magnet', function (req, res) {
    if (req.body.magnet.match(/magnet:\?xt=urn:[a-z0-9]+/i)) {
        /*
                let magnet = parseTorrent(req.body.magnet)
                let torrent = new TorentList({
                    name: magnet.name,
                    magnet: req.body.magnet
                })
                torrent.save(function (err, torr) {
                    if (err) return handleError(err);
        */
        download(req.body.magnet)
        //   })
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
            let index = torrents.findIndex(el => el.id === torrent.infoHash)
            index = index === -1 ? torrents.length : index
            torrents[index] = {
                id: torrent.infoHash,
                downloaded: torrent.downloaded,
                downloadSpeed: torrent.downloadSpeed,
                progress: torrent.progress,
                ready: false
            }
        })
        torrent.on('warning', function (err) {
            console.dir(err);
        })
        torrent.on('done', function () {
            console.dir(`Torrent: ${torrent.infoHash} is downloaded`)
            console.dir(torrent.progress)
            torrents[torrents.findIndex(el => el.id === torrent.infoHash)] = {
                id: torrent.infoHash,
                downloaded: torrent.downloaded,
                downloadSpeed: 0,
                progress: torrent.progress,
                ready: true
            }
            //torr.size = torrent.length
            //torr.save()
        })
    })
}

wss.on('connection', function connection(ws, req) {
    console.log("connection ...");
    const parameters = url.parse(req.url, true);

    if (parameters.query.id) {
        ws.id = parameters.query.id
        let timer;
        if (wss.clients.size == 1) {
            timer = setTimeout(function tick() {
                wss.clients.forEach(function each(client) {
                    let torrent = torrents.find(el => el.id === client.id)
                    ws.send(JSON.stringify(torrent))
                    console.dir(torrents)
                    if (torrent.ready) {
                        ws.close();
                    }
                })
                if (wss.clients.size == 0) {
                    clearTimeout(timer);
                }
                timer = setTimeout(tick, 1500);
            }, 2000);
        }

        wss.clients.forEach(function each(client) {
            console.log('Client.ID: ' + client.id);
        });
    } else {
        ws.send("Error connection.")
        ws.close();
    }
})

server.listen(port, function () {
    console.log("Started on PORT " + port);
})