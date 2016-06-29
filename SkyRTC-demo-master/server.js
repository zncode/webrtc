var express = require('express');
var app = express();
var server = require('http').createServer(app);
var SkyRTC = require('skyrtc').listen(server);
var path = require("path");

var port = process.env.PORT || 3000;
server.listen(port);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
	res.sendfile(__dirname + '/index.html');
});

SkyRTC.rtc.on('new_connect', function(socket) {
	console.log('创建新连接:' + socket.id );
});
SkyRTC.rtc.on('register', function(socket) {
	console.log('新用户userid:' + socket.uid  + " socketid:" + socket.id + " sessionid: " + socket.session_id);
});
SkyRTC.rtc.on('remove_peer', function(socket) {
	console.log("用户" + socket.uid + "用户关闭连接:" + socket.id);
});
SkyRTC.rtc.on('bye', function(socket) {
	console.log("用户离开" + socket.uid );
});

SkyRTC.rtc.on('new_peer', function(socket, room) {
	console.log("新用户" + socket.uid + "加入房间" + room);
});

SkyRTC.rtc.on('socket_message', function(socket, msg) {
	console.log("接收到来自" + socket.uid + "的新消息：" + msg);
});

SkyRTC.rtc.on('ice_candidate', function(socket, ice_candidate) {
	console.log("接收到来自" + socket.uid + "的ICE Candidate" + JSON.stringify(ice_candidate));
});

SkyRTC.rtc.on('offer', function(socket, offer) {
	console.log("接收到来自" + socket.uid + "的Offer" + JSON.stringify(offer) );
});

SkyRTC.rtc.on('answer', function(socket, answer) {
	console.log("接收到来自" + socket.uid + "的Answer:" + JSON.stringify(answer) );
});

SkyRTC.rtc.on('error', function(error) {
	console.log("发生错误：" + error.message);
});
