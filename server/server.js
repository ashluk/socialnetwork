const express = require("express");
const app = express();
const compression = require("compression");
const path = require("path");
const db = require("./db");
const ses = require("./ses");
const multer = require("multer");
const uidSafe = require("uid-safe");
const s3 = require("./s3");
//////////SOCKET I:O BOILERPLATE///////////
const server = require("http").Server(app);
const io = require("socket.io")(server, {
    allowRequest: (req, callback) =>
        callback(null, req.headers.referer.startsWith("http://localhost:3000")),
});

const cryptoRandomString = require("crypto-random-string");

const { hash, compare } = require("./bc.js");
const cookieSession = require("cookie-session");

/*app.use(
    cookieSession({
        secret: `I'm always hungry.`,
        maxAge: 1000 * 60 * 60 * 24 * 14,
    })
);*/
const cookieSessionMiddlewear = cookieSession({
    secret: `I'm always hungry.`,
    maxAge: 1000 * 60 * 60 * 24 * 14,
});
app.use(cookieSessionMiddlewear);
io.use(function (socket, next) {
    cookieSessionMiddlewear(socket.request, socket.request.res, next);
});
////////////////CSRF/////////////////
const csurf = require("csurf");
app.use(csurf());
/*app.use(function (req, res, next) {
    res.locals.csrfToken = req.csrfToken();
    next();
}); */

app.use(function (req, res, next) {
    res.cookie("mytoken", req.csrfToken());
    next();
});

app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "client", "public")));

const diskStorage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, __dirname + "/uploads");
    },
    filename: function (req, file, callback) {
        uidSafe(24).then(function (uid) {
            callback(null, uid + path.extname(file.originalname));
        });
    },
});

const uploader = multer({
    storage: diskStorage,
    limits: {
        fileSize: 4000000,
    },
});

////////////////////WELCOME////////////////////////////////
app.get("./welcome", (req, res) => {
    //is going to run if the user puts /welcome in the url bar
    if (req.session.userId) {
        //if the user is logged in they are NOT allowed to see welcome
        //if the user is logged in then redirect to /
        res.redirect("/");
    } else {
        //send back HTML, which will trigger start.js to render welcome in DOM
        res.sendFile(path.join(__dirname, "..", "client", "index.html"));
    }
});

/////////////////REGISTER ROUTE///////////////////////
//app.get("/registration", (req, res) => {});

app.post("/registration", (req, res) => {
    const { first, last, email, password } = req.body;
    // console.log("requested body", req.body);

    hash(password)
        .then((hashedPassword) => {
            db.addUser(first, last, email, hashedPassword)
                .then(({ rows }) => {
                    console.log("rows: ", rows);
                    req.session.userId = rows[0].id;

                    //res.redirect("/welcome");
                    res.json({ success: true });
                })
                .catch((err) => {
                    console.log("registration error", err);
                    /*res.render("registration", {
                        err: true,
                    });*/
                    res.json({ success: false });
                });
        })
        .catch((err) => {
            console.log("error in hash", err);
            /*res.render("registration", {
                err: true,
            });*/
            res.json({ success: false });
        });
});

///////////////////LOGIN ROUTE/////////////////////////////
////LOGIN ROUTE
//app.get("/login", (req, res) => {});
app.post("/login", (req, res) => {
    const password = req.body.password;
    const email = req.body.email;
    console.log("email, password", req.body);
    if (email == "") {
        console.log("!email");
        res.json({ success: false });
    } else if (password == "") {
        console.log("!password");
        res.json({ success: false });
    }
    db.passwordCompare(email)
        .then(({ rows }) => {
            console.log("rows id", rows);
            console.log("password, rows", password, rows[0].password);

            compare(password, rows[0].password)
                .then((match) => {
                    if (match === true) {
                        req.session.userId = rows[0].id;
                        //res.redirect("welcome");
                        console.log("matched id");
                        res.json({
                            success: true,
                        });
                    } else {
                        res.json({
                            success: false,
                            error: "password incorrect",
                        });
                    }
                })
                .catch((err) => {
                    console.log("error in compare", err);
                });
        })
        .catch((err) => {
            console.log("error in login", err);
        });
});
///////////////////PASSWORD RESET ROUTE////////////////////
/*app.get("/reset", (req, res) => {

});*/
app.post("/reset", (req, res) => {
    const email = req.body.email;
    const subject = "password reset";
    db.codeCompare(email)
        .then(({ rows }) => {
            if (rows.length) {
                const secretCode = cryptoRandomString({
                    length: 6,
                });
                db.secretCode(secretCode, email).then(() => {
                    ses.sendEmail(email, secretCode, subject);
                    res.json({
                        success: true,
                        alert: "check your email",
                    });
                });
            } else {
                res.json({
                    success: false,
                    error: "no email match",
                });
            }
        })
        .catch((err) => {
            console.log("error in codeCompare", err);
        });
});
app.post("/verify", (req, res) => {
    console.log("in verify route", req.body);
    //console.log("req.session", req.session);
    const email = req.body.email;
    const password = req.body.newpassword;
    const secret = req.body.code;
    db.getSecretCode(email)
        .then(({ rows }) => {
            console.log("rows in verify", rows);
            console.log("secret req.body in verify", req.body.code);

            if (req.body.code == rows[0].secret) {
                req.session.secret = rows[0].secret;
                console.log("matched code");
                console.log("what is password", password);
                hash(password)
                    .then((hashedPassword) => {
                        console.log("hashed", hashedPassword);
                        console.log("rows0email", email);
                        db.newPassword(hashedPassword, email)
                            .then(({ rows }) => {
                                console.log(
                                    "rows in newpassword: ",
                                    rows[0].password
                                );
                                //req.session.userId = rows[0].id;
                                req.session.password = rows[0].password;

                                res.json({
                                    success: true,
                                    alert: "now change your password",
                                });
                            })
                            .catch((err) => {
                                console.log("registration error", err);

                                res.json({ success: false });
                            });
                    })
                    .catch((err) => {
                        console.log("error in hash", err);

                        res.json({ success: false });
                    });
            } else {
                res.json({
                    success: false,
                    error: "code incorrect",
                });
            }
        })
        .catch((err) => {
            console.log("error in verify", err);
            res.json({ success: false });
        });
});
//////////////////////UPLOADER/////////////////////////////////
app.post("/upload", uploader.single("file"), s3.upload, (req, res) => {
    console.log("hit this s3 route", req);
    //const { title, username, description } = req.body;
    const { filename } = req.file;
    //s3.delete(myoldpichere)
    const fullUrl = "https://s3.amazonaws.com/indreamsimages/" + filename;

    console.log("req.session", req.session);
    db.addImages(fullUrl, req.session.userId)
        .then(({ rows }) => {
            res.json({
                imageUrl: rows[0].imageurl,
                success: true,
            });
        })
        .catch((err) => {
            console.log("err in addImages", err);
        });
});
///////////////////////////BIO ROUTE///////////////////////////
app.post("/updatebio", (req, res) => {
    //console.log("i am in the bio editor", req.session);
    console.log("req.body", req.body.bio);
    db.addBio(req.body.bio, req.session.userId)
        .then(({ rows }) => {
            res.json({
                //bio: rows[0].bio,
                success: true,
            });
            console.log("rows in bio upload", rows);
        })
        .catch((err) => {
            console.log("err in addImages", err);
        });
});

///////////////////////GET USER//////////////////////////////
app.get("/user", (req, res) => {
    // console.log("i am in user req session userId", req.session.userId);
    db.getUser(req.session.userId)
        .then(({ rows }) => {
            res.json({ rows });
        })
        .catch((err) => {
            console.log("error in user", err);
            res.json({ success: false });
        });
});
///////////////////////GET OTHER USER//////////////////////////
app.get("/user/:id.json", (req, res) => {
    //console.log("other profile id", req.params.id);
    //console.log("current id", req.session.userId);
    if (req.session.userId == req.params.id) {
        res.json({
            success: false,
        });
    } else {
        db.getUser(req.params.id)
            .then(({ rows }) => {
                res.json(rows);
            })
            .catch((err) => {
                console.log("error in user", err);
                res.json({ success: false });
            });
    }
});
///////////////////FIND PEOPLE////////////////////////
app.get("/users/most-recent", (req, res) => {
    db.mostRecentUser()
        .then(({ rows }) => {
            console.log("rows in most recent", rows);
            res.json({ mostRecent: rows });
        })
        .catch((err) => {
            console.log("error in mostrecent", err);
        });
});
app.get("/users/:val", (req, res) => {
    // console.log("req.params.val", req.params.val);
    db.findUser(req.params.val)
        .then(({ rows }) => {
            console.log("results in users.val", rows);
            res.json({ resultUsers: rows });
        })
        .catch((err) => {
            console.log("error in finduser", err);
        });
});

////////////FRIEND REQUESTING/////////////////////
app.get("/friendshipstatus/:id", (req, res) => {
    console.log("req.params.id HELLO", req.params.id);
    console.log("req.session.id HELLO", req.session.userId);
    const loggedInUser = req.session.userId;
    const otherUser = req.params.id;
    db.checkFriendship(loggedInUser, otherUser)
        .then(({ rows }) => {
            if (rows[0] == undefined) {
                res.json({ buttonText: "REQUEST FRIENDSHIP" });
            } else if (rows[0].accepted) {
                res.json({ buttonText: "END FRIENDSHIP" });
            } else if (
                rows[0].accepted == false &&
                rows[0].sender_id == loggedInUser
            ) {
                res.json({ buttonText: "CANCEL REQUEST" });
            } else if (
                rows[0].accepted == false &&
                rows[0].sender_id == otherUser
            ) {
                res.json({ buttonText: "ACCEPT REQUEST" });
            }
            //if rows [0] if acceppted = true end friendship
            // if accepted = false
            //check in here what we recieved back from db

            console.log("rows in friendshipstatus", rows[0]);
        })
        .catch((err) => {
            console.log("error in friendshipstatus", err);
        });
});
app.post("/requestfriendship/:id", (req, res) => {
    const loggedInUser = req.session.userId;
    const otherUser = req.params.id;
    console.log("i was requested in friendship SERVER");
    db.requestFriendship(otherUser, loggedInUser)
        .then(() => {
            res.json({
                success: true,
            });
        })
        .catch((err) => {
            console.log("err in req friendship", err);
        });
});
app.post("/endfriendship/:id", (req, res) => {
    const loggedInUser = req.session.userId;
    const otherUser = req.params.id;
    db.endFriendship(loggedInUser, otherUser)
        .then(() => {
            res.json({ success: true });
        })
        .catch((err) => {
            console.log("err in end friendship", err);
        });
});
app.post("/cancelrequest/:id", (req, res) => {
    const loggedInUser = req.session.userId;
    const otherUser = req.params.id;
    db.cancelRequest(loggedInUser, otherUser)
        .then(() => {
            res.json({ success: true });
        })
        .catch((err) => {
            console.log("err in cancelRequest", err);
        });
});
app.post("/acceptrequest/:id", (req, res) => {
    const loggedInUser = req.session.userId;
    const otherUser = req.params.id;
    db.acceptRequest(loggedInUser, otherUser)
        .then(() => {
            res.json({ success: true });
        })
        .catch((err) => {
            console.log("err in acceptRequest", err);
        });
});
///////////////////REDUX FRIENDS///////////////////////

app.get("/getfriends", (req, res) => {
    const loggedInUser = req.session.userId;
    db.getFriends(loggedInUser)
        .then((data) => {
            console.log("get friends rows", data.rows);
            res.json(data.rows);
        })
        .catch((err) => {
            console.log("err in getFriends", err);
        });
});
//////////////DELETEACCOUNT/////////////////
app.get("/delete", (req, res) => {
    console.log("about to delete", req.session.userId);
    db.chatDelete(req.session.userId)
        .then(() => {
            db.friendshipDelete(req.session.userId)
                .then(() => {
                    db.userDelete(req.session.userId).then(() => {
                        db.resetDelete(req.session.userId)
                            .then(() => {
                                req.session.userId = undefined;
                                res.json({ success: true });
                            })
                            .catch((err) =>
                                console.log("error in userDelete", err)
                            );
                    });
                })
                .catch((err) => console.log("error in friendshipDelete", err));
        })
        .catch((err) => console.log("error in chatDelete", err));
});

///////////////////LOGOUT/////////////////////
app.get("/logout", (req, res) => {
    req.session = undefined;
    res.redirect("/welcome");
});

///////THIS ROUTE SHOULD ALWAYS GO AT THE BOTTOM BEFORE APP.LISTEN//////////
app.get("*", function (req, res) {
    // runs if the user goes to literally any route except /welcome
    console.log("req.session.userId", req.session.userId);
    if (!req.session.userId && req.url != "/welcome") {
        // if the user is NOT logged in, redirect them to /welcome, which is the only page
        // they're allowed to see
        //console.log("can yous ee me");
        res.redirect("/welcome");
    } else {
        // this runs if the user is logged in
        // in which case send back the HTML, after which start js kicks in and renders our p tag...
        res.sendFile(path.join(__dirname, "..", "client", "index.html"));
    }
});

server.listen(process.env.PORT || 3001, function () {
    console.log("I'm listening.");
});
///////////////////CHAT////////////////////////////

io.on("connection", function (socket) {
    //console.log("socket with id connected", socket.id);
    if (!socket.request.session.userId) {
        return socket.disconnect(true);
    }
    const socketId = socket.id;
    const userId = socket.request.session.userId;

    console.log("userid in sockets", userId);

    db.getLastTenMessages()
        .then((result) => {
            console.log("result.rows", result.rows);
            socket.emit("chatMessages", result.rows.reverse());
        })
        .catch((err) => {
            console.log("error in getLastTen", err);
        });

    socket.on("my amazing chat message", (msg) => {
        console.log("message inside of amazing chat", msg);

        db.newMessage(msg, userId)
            .then((result) => {
                console.log("results in new message", result.rows[0].id);
                db.getMessageSender(userId)
                    .then(({ rows }) => {
                        console.log("rows in getMessageSender", rows);

                        io.emit("chatMessage", {
                            id: result.rows[0].id,
                            message: msg,
                            senderId: userId,
                            created_at: rows[0].created_at,
                            first: rows[0].first,
                            last: rows[0].last,
                            imageurl: rows[0].imageurl,
                        });
                    })
                    .catch((err) => {
                        console.log("error in getMessageSender", err);
                    });
            })
            .catch((err) => {
                console.log("error in newMessage", err);
            });
        //send the message to all the connected clients
        //need two things before sending message to clients
        //1 add to the db
        //2 is find out information (i.e name and image) of user who sent the message
        //done with another db query
        io.sockets.emit("sending back to client", msg);
    });
    socket.on("disconnect", () => {
        console.log(`Socket with if ${socket.id} just disconnected`);
    });

    console.log("socket id", socket.id);
});
