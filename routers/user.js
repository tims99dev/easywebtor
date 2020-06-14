const express = require("express")
const bcrypt = require('bcryptjs')
const passport = require('passport')

const User = require('../model/users')
const Torrent = require('../model/torrents')

const router = express.Router();

function handleError(error) {
    console.error(error)
}

router.get('/torrents', (req, res) => {
    if (req.user) {
        User.findById(req.user.id, (err, user) => {
            if (err) return handleError(err)

            Torrent.find({
                infoHash: {
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
            res.send(req.user.email)
        });
    })(req, res, next)
})

router.get('/logout', function (req, res) {
    req.logout();
    res.send('ok')
});


module.exports = router