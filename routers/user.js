const express = require("express")
const bcrypt = require('bcryptjs')
const passport = require('passport')
const path = require('path');
const fs = require("fs")

const User = require('../model/users')
const Torrent = require('../model/torrents')

const router = express.Router();

function handleError(error) {
    console.error(error)
}

const removeDir = function (path) {
    if (fs.existsSync(path)) {
        const files = fs.readdirSync(path)

        if (files.length > 0) {
            files.forEach(function (filename) {
                if (fs.statSync(path + "/" + filename).isDirectory()) {
                    removeDir(path + "/" + filename)
                } else {
                    fs.unlinkSync(path + "/" + filename)
                }
            })
            fs.rmdirSync(path)
        } else {
            fs.rmdirSync(path)
        }
    } else {
        console.log("Directory path not found.")
    }
}

router.get('/torrents', (req, res) => {
    if (req.user) {
        User.findById(req.user.id, (err, user) => {
            if (err) return handleError(err)

            Torrent.find({
                _id: {
                    $in: user.torrents
                }
            }, (err, torrents) => {
                if (err) return handleError(err)

                res.send(torrents)
            })
        })
    } else {
        res.status(500).send('Error login to continue.')
    }
})

router.get('/remove/:id', (req, res) => {
    if (req.user) {
        User.findById(req.user.id, (err, user) => {
            if (err) return handleError(err)

            if (user.torrents.includes(req.params.id)) {
                Torrent.findOneAndRemove({
                    _id: req.params.id
                }, async (err, torrents) => {
                    if (err) return handleError(err)
                    user.torrents = user.torrents.filter(e => e != req.params.id)
                    await user.save()
                    //TODO:remove
                    //fs.rmdirSync(path.join(__dirname, '../torrent/', torrents.infoHash), { recursive: true })
                    removeDir(path.join(__dirname, '../torrent/', torrents.infoHash))
                    res.send({ id: req.params.id })
                })
            } else {
                res.send('Error: not find')
            }
        })
    } else {
        res.status(500).send('Error login to continue.')
    }
})

router.post('/register', function (req, res) {
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
        res.status(500).send('Error.')
    }
})

router.post('/login', function (req, res, next) {
    req.body.email = req.body.email.toLowerCase()

    passport.authenticate('local', {
        failureMessage: true
    }, function (err, user, info) {
        if (err) { return next(err); }
        if (!user) { return res.status(500).send('Error.') }
        req.logIn(user, function (err) {
            console.log(req.user)
            res.send({ id: req.user.id, email: req.user.email })
        });
    })(req, res, next)
})

router.get('/logout', function (req, res) {
    req.logout();
    res.send('ok')
});


module.exports = router