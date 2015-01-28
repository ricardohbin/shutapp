var
    args = process.argv.slice(2),
    express = require("express"),
    app = express(),
    server = require("http").createServer(app),
    io = require("socket.io").listen(server),
    redis = require("redis").createClient(),
    crypto = require("crypto"),
    fs = require("fs"),
    secretKey = "";

if (args[0] === "live") {
    io.set("log level", 0);
}

//getting the secret key generator
fs.readFile("conf/keys.json", function (err, data) {
    if (err) {
        throw err;
    }
    data = JSON.parse(data); 
    if (typeof data.key !== "undefined") {
        secretKey = data.key;
        console.log("Deep chat runs and runs and runs");
        server.listen(args[0] === 'live' ? 80 : 3000);
    } else {
        throw new Error("Invalid JSON key format....");
    }
});

//function that maintains redis alive
function redisHeartbeat (hash, isFirstBeat) {
    if (isFirstBeat) {
    	redis.set(hash, 1);
    }
    redis.expire(hash, 60 * 5);
}

//configuring express
app.configure(function(){
  app.set("views", __dirname + "/views");
  app.set("view engine", "jade");
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + "/public"));
});

//initial route
app.get("/", function(req, res) {
    res.render("index");
});

//creating token
app.get("/generate", function (req, res) {
    var hash = crypto.createHmac("sha1", secretKey).update(String(new Date()) + req.headers['user-agent'] + req.socket.remoteAddress).digest("hex");
    redisHeartbeat(hash, true);
    res.redirect("/chat/" + hash);
});

//destroying token
app.get("/destroy/:hash", function (req, res) {
    redis.del(req.route.params.hash);
    res.redirect("/");
});

//chat route
app.get("/chat/:hash", function (req, res) {
    var hash = req.route.params.hash;

    //checking redis key existence
    redis.get(hash, function (err, value) {
        if (!value) {
            res.send(404, "Not found in our server");
        } else {
            res.render("chat", {id: hash });
        }
    });

});

io.sockets.on("connection", function (socket) { 
    socket.on("msg", function (hash, txt) {
    	console.log("HIT");
        //renew the redis
        redisHeartbeat(hash, false); 
        socket.in(hash).broadcast.emit("appendMsg", txt);
        socket.in(hash).emit("appendMsg", txt);
    });

    socket.on("room", function (hash) {
    	redisHeartbeat(hash, false);
        socket.join(hash);
    });
});
